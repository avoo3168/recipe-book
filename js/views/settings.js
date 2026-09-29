import * as store from "../store.js";
import * as github from "../github.js";
import { h, toast } from "../ui.js";
import { getThemePreference, setThemePreference, onThemeChange } from "../theme.js";

const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

// Keep the Appearance menu in step with the header's light/dark button.
onThemeChange(() => {
  const select = document.getElementById("settings-appearance");
  if (select) select.value = getThemePreference();
});

function appearanceSection() {
  const select = h("select", { id: "settings-appearance", onchange: (e) => setThemePreference(e.target.value) },
    [["system", "Match this device"], ["light", "Light"], ["dark", "Dark"]].map(([value, label]) =>
      h("option", { value, selected: value === getThemePreference() }, label)));
  return h("div", { class: "recipe-form" },
    h("fieldset", {},
      h("legend", {}, "Appearance"),
      field("Theme", select, "Remembered on this device. The moon/sun button in the header switches it too.")));
}

// Lists saved on GitHub, with buttons to switch this device to one or delete it.
function groceryListsSection(onSwitch) {
  const body = h("div", {}, h("p", { class: "hint" }, "Loading lists…"));
  const section = h("div", { class: "recipe-form" },
    h("fieldset", {},
      h("legend", {}, "Your grocery lists"),
      body));

  const render = async () => {
    let names;
    try {
      names = await store.listGroceryLists();
    } catch (error) {
      body.replaceChildren(h("p", { class: "form-status is-error" }, error.message));
      return;
    }
    const current = store.currentGroceryList();
    if (!names.includes(current)) names = [current, ...names];

    body.replaceChildren(
      h("p", { class: "hint" }, "A list is saved to GitHub the first time something is added to it."),
      h("ul", { class: "list-manager" },
        names.map((name) => {
          const inUse = name === current;
          return h("li", {},
            h("span", { class: "list-name" }, name),
            inUse && h("span", { class: "badge-new" }, "Used on this device"),
            h("span", { class: "spacer" }),
            !inUse && h("button", {
              type: "button", class: "btn btn-quiet btn-small",
              onclick: async () => {
                github.saveSettings({ ...github.getSettings(), groceryList: name });
                await store.loadGrocery();
                toast(`This device now uses the "${name}" grocery list.`);
                onSwitch();
              },
            }, "Use on this device"),
            h("button", {
              type: "button", class: "btn btn-danger btn-small", disabled: inUse,
              title: inUse ? "Switch this device to another list before deleting this one" : null,
              onclick: async (event) => {
                if (!confirm(`Delete the "${name}" grocery list and everything on it? Other devices using it will start a new, empty list with the same name.`)) return;
                event.target.disabled = true;
                try {
                  await store.deleteGroceryList(name);
                  toast(`Deleted the "${name}" grocery list.`);
                  render();
                } catch (error) {
                  toast(`Couldn't delete: ${error.message}`);
                  event.target.disabled = false;
                }
              },
            }, "Delete"));
        })),
      h("p", { class: "hint" }, "To delete the list this device uses, switch to another list first. To start a new list, type a new name under Grocery list above and save."));
  };

  render();
  return section;
}

function field(label, control, hint) {
  control.id ||= `settings-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return h("div", { class: "field" },
    h("label", { for: control.id }, label),
    control,
    hint && h("p", { class: "hint" }, hint));
}

export function mount(container) {
  const settings = github.getSettings();
  const hasToken = Boolean(settings.token);

  const owner = h("input", { type: "text", value: settings.owner, autocomplete: "off", spellcheck: "false" });
  const repo = h("input", { type: "text", value: settings.repo, autocomplete: "off", spellcheck: "false" });
  const branch = h("input", { type: "text", value: settings.branch, autocomplete: "off", spellcheck: "false" });
  const token = h("input", {
    type: "password", autocomplete: "off", spellcheck: "false",
    placeholder: hasToken ? "A key is saved on this device — leave blank to keep it" : "github_pat_…",
  });
  const groceryList = h("input", { type: "text", value: settings.groceryList, autocomplete: "off" });
  const status = h("div", { class: "form-status", role: "status" });
  const saveButton = h("button", { type: "submit", class: "btn btn-primary" }, "Save and test connection");

  const showStatus = (message, kind) => {
    status.className = `form-status is-${kind}`;
    status.textContent = message;
  };

  const form = h("form", {
    class: "recipe-form",
    onsubmit: async (event) => {
      event.preventDefault();
      const next = {
        owner: owner.value.trim(),
        repo: repo.value.trim(),
        branch: branch.value.trim() || "main",
        token: token.value.trim() || settings.token,
        groceryList: groceryList.value.trim() || "main",
      };
      if (!next.owner || !next.repo || !next.token) {
        showStatus("Fill in your GitHub username, repository name, and access key.", "error");
        return;
      }
      saveButton.disabled = true;
      showStatus("Checking…", "info");
      try {
        github.saveSettings(next);
        await github.testConnection();
        showStatus(`Connected to ${next.owner}/${next.repo}. This device can now save recipes and sync the grocery list.`, "success");
        token.value = "";
        token.placeholder = "A key is saved on this device — leave blank to keep it";
        await Promise.all([store.load(), store.loadGrocery()]);
      } catch (error) {
        showStatus(error.message, "error");
      } finally {
        saveButton.disabled = false;
      }
    },
  },
    h("fieldset", {},
      h("legend", {}, "Repository"),
      field("GitHub username", owner),
      field("Repository name", repo),
      field("Branch", branch, "Usually main or master. Corrected automatically when you test the connection.")),
    h("fieldset", {},
      h("legend", {}, "Access key"),
      field("Personal access token", token, "Stored only in this browser. It's never added to the site or the repository.")),
    h("fieldset", {},
      h("legend", {}, "Grocery list"),
      field("List name", groceryList, "Devices with the same list name share one grocery list. Use a different name, such as your partner's, for a separate list.")),
    status,
    h("div", { class: "form-actions" },
      saveButton,
      hasToken && h("button", {
        type: "button", class: "btn btn-danger",
        onclick: async () => {
          github.saveSettings({ ...github.getSettings(), token: "" });
          toast("This device is disconnected from GitHub.");
          await Promise.all([store.load(), store.loadGrocery()]);
          mount(container);
        },
      }, "Disconnect this device")));

  container.replaceChildren(
    h("section", { class: "form-page" },
      h("h2", { tabindex: "-1" }, "Settings"),
      h("p", {}, "Connecting a device to GitHub lets it save recipes and sync the grocery list. Anyone can view the site; only connected devices can change it."),
      h("details", { class: "help", open: !hasToken },
        h("summary", {}, "How to create an access key"),
        h("ol", {},
          h("li", {}, "Open ", h("a", { href: TOKEN_URL, target: "_blank", rel: "noopener" }, "GitHub → New fine-grained token"), " (sign in if asked)."),
          h("li", {}, "Give it a name like ", h("em", {}, "Recipe Book"), " and choose an expiration. When it expires, you'll make a new one here."),
          h("li", {}, "Under ", h("strong", {}, "Repository access"), ", choose ", h("strong", {}, "Only select repositories"), " and pick your recipe book repository."),
          h("li", {}, "Under ", h("strong", {}, "Permissions → Repository permissions"), ", set ", h("strong", {}, "Contents"), " to ", h("strong", {}, "Read and write"), "."),
          h("li", {}, "Click ", h("strong", {}, "Generate token"), ", copy it, and paste it below. GitHub only shows it once."))),
      form,
      github.isConnected() && groceryListsSection(() => mount(container)),
      appearanceSection())
  );

  return { title: "Settings" };
}
