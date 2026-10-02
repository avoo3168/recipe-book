// Reads and writes files in the site's GitHub repository through the GitHub REST API.
// Connection settings (including the access key) live in this browser's localStorage only.

const API = "https://api.github.com";
const STORAGE_KEY = "recipe-book:github";

export class GitHubError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// On https://<owner>.github.io/<repo>/ the owner and repo can be read from the address.
function guessFromAddress() {
  const host = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!host) return { owner: "", repo: "" };
  const firstSegment = location.pathname.split("/").filter(Boolean)[0];
  return {
    owner: host[1],
    repo: firstSegment && !firstSegment.includes(".") ? firstSegment : location.hostname,
  };
}

export function getSettings() {
  const defaults = { ...guessFromAddress(), branch: "main", token: "", groceryList: "main" };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    throw new Error("This browser won't let the site save settings. Private browsing mode can cause this.");
  }
}

export function isConnected() {
  const { owner, repo, token } = getSettings();
  return Boolean(owner && repo && token);
}

function describeError(status, detail) {
  if (status === 401) return "GitHub rejected the access key. It may be mistyped or expired. You can create a new one in Settings.";
  if (status === 403) return `GitHub refused the request${detail ? ` (${detail})` : ""}. Check that the key has "Contents: Read and write" permission for this repository.`;
  if (status === 404) return "GitHub couldn't find that repository. Check the username and repository name in Settings, and that the key was given access to this repository.";
  return `GitHub error ${status}${detail ? `: ${detail}` : ""}`;
}

async function request(path, { method = "GET", body, raw = false } = {}) {
  const { owner, repo, token } = getSettings();
  let response;
  try {
    response = await fetch(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`, {
      method,
      cache: "no-store",
      headers: {
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GitHubError("Couldn't reach GitHub. Check your internet connection.", 0);
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).message || "";
    } catch {}
    throw new GitHubError(describeError(response.status, detail), response.status);
  }
  return raw ? response.text() : response.json();
}

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

// Latest commit SHA on a branch, or null if the branch doesn't exist yet.
export async function getHead(branch) {
  try {
    return (await request(`/git/ref/heads/${encodePath(branch)}`)).object.sha;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

// File contents at a commit or branch, or null if the file doesn't exist.
export async function readFile(path, ref) {
  try {
    return await request(`/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, { raw: true });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

// Entries ({ name, type, ... }) in a folder, or [] if the folder or branch doesn't exist.
export async function listDirectory(path, ref) {
  try {
    const entries = await request(`/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    if (error.status === 404) return [];
    throw error;
  }
}

// Confirms the settings point at a repository and branch the key can read.
// If the branch setting doesn't exist, switches to the repository's default branch.
export async function testConnection() {
  const repo = await request("");
  const settings = getSettings();
  if (await getHead(settings.branch)) return;
  if (repo.default_branch && (await getHead(repo.default_branch))) {
    saveSettings({ ...settings, branch: repo.default_branch });
    return;
  }
  throw new GitHubError(`The repository has no branch named "${settings.branch}".`, 404);
}

// Return this from a commitFiles `update` to delete that file.
export const DELETE = Symbol("delete");

// Uploads binary data (e.g. a photo) once, returning its blob SHA for use in a commit.
const uploadedBlobs = new WeakMap();
async function blobSha(binary) {
  if (!uploadedBlobs.has(binary)) {
    const blob = await request("/git/blobs", { method: "POST", body: { content: binary.base64, encoding: "base64" } });
    uploadedBlobs.set(binary, blob.sha);
  }
  return uploadedBlobs.get(binary);
}

// Saves several files in a single commit.
//
// `update` receives the current text of each path (null if missing) and returns the new
// content for each: a string, { base64 } for binary files such as photos, null to leave
// it unchanged, or DELETE to remove it. If another device saved in the meantime, the
// latest files are re-read and `update` runs again, so changes are never overwritten.
// A branch that doesn't exist yet is created with only these files in it.
// Resolves to the resulting content of each path.
export async function commitFiles({ branch, paths, message, update }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await getHead(branch);
    const current = await Promise.all(paths.map((path) => (head ? readFile(path, head) : null)));
    const next = await update(current);
    const changed = paths
      .map((path, i) => ({ path, content: next[i] }))
      .filter((file, i) => (file.content === DELETE ? current[i] != null : file.content != null && file.content !== current[i]));
    const entries = await Promise.all(changed.map(async ({ path, content }) => {
      if (content === DELETE) return { path, mode: "100644", type: "blob", sha: null };
      if (typeof content === "object") return { path, mode: "100644", type: "blob", sha: await blobSha(content) };
      return { path, mode: "100644", type: "blob", content };
    }));

    const result = paths.map((_, i) => (next[i] === DELETE ? null : next[i] ?? current[i]));
    if (!changed.length) return result;

    const baseTree = head ? (await request(`/git/commits/${head}`)).tree.sha : undefined;
    const tree = await request("/git/trees", {
      method: "POST",
      body: { base_tree: baseTree, tree: entries },
    });
    const commit = await request("/git/commits", {
      method: "POST",
      body: { message, tree: tree.sha, parents: head ? [head] : [] },
    });

    try {
      if (head) {
        await request(`/git/refs/heads/${encodePath(branch)}`, { method: "PATCH", body: { sha: commit.sha, force: false } });
      } else {
        await request("/git/refs", { method: "POST", body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
      }
      return result;
    } catch (error) {
      // 422: someone else moved the branch first. Start over from the new latest version.
      if (error.status !== 422 && error.status !== 409) throw error;
    }
  }
  throw new GitHubError("Couldn't save because the data kept changing on another device. Please try again.", 409);
}
