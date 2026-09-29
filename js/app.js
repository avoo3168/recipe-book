import { csvToObjects } from "./csv.js";

const DATA_URL = "data/recipes.csv";
const LIST_SEPARATOR = "|";

const state = {
  recipes: [],
  query: "",
  category: "All",
  listScrollY: 0,
};

const view = document.getElementById("view");
const searchInput = document.getElementById("search");

// ---------- DOM helper ----------

// h("div", { class: "x", onclick: fn }, child, "text", ...)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}

// ---------- Data ----------

function splitList(value) {
  return value
    .split(LIST_SEPARATOR)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeRecipe(row) {
  const prepMinutes = toNumber(row.prep_minutes);
  const cookMinutes = toNumber(row.cook_minutes);
  return {
    id: row.id || slugify(row.name || ""),
    name: row.name || "Untitled recipe",
    category: row.category || "Uncategorized",
    servings: toNumber(row.servings),
    prepMinutes,
    cookMinutes,
    totalMinutes: prepMinutes + cookMinutes,
    tags: splitList(row.tags || ""),
    ingredients: splitList(row.ingredients || ""),
    instructions: splitList(row.instructions || ""),
    notes: row.notes || "",
    source: row.source || "",
    image: row.image || "",
  };
}

async function loadRecipes() {
  const response = await fetch(DATA_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${DATA_URL} (HTTP ${response.status}).`);
  const rows = csvToObjects(await response.text());
  return rows.map(normalizeRecipe).filter((r) => r.id);
}

// ---------- Formatting ----------

function formatMinutes(total) {
  if (!total) return "";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function isSafeUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url, location.href).protocol);
  } catch {
    return false;
  }
}

// Stable tint per category so cards without photos still look distinct.
function tintFor(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `tint-${hash % 5}`;
}

// ---------- List view ----------

function matchesQuery(recipe, query) {
  if (!query) return true;
  const haystack = [recipe.name, recipe.category, ...recipe.tags, ...recipe.ingredients]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

function filteredRecipes() {
  return state.recipes
    .filter((r) => state.category === "All" || r.category === state.category)
    .filter((r) => matchesQuery(r, state.query))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderCategoryChips() {
  const categories = ["All", ...new Set(state.recipes.map((r) => r.category))].sort((a, b) =>
    a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)
  );
  return h(
    "div",
    { class: "chips", role: "group", "aria-label": "Filter by category" },
    categories.map((category) =>
      h(
        "button",
        {
          type: "button",
          class: "chip",
          "aria-pressed": String(category === state.category),
          onclick: () => {
            state.category = category;
            renderList();
          },
        },
        category
      )
    )
  );
}

function renderCard(recipe) {
  const time = formatMinutes(recipe.totalMinutes);
  const media = recipe.image && isSafeUrl(recipe.image)
    ? h("img", { class: "card-media", src: recipe.image, alt: "", loading: "lazy" })
    : h("div", { class: `card-media card-placeholder ${tintFor(recipe.category)}`, "aria-hidden": "true" },
        recipe.name.charAt(0));

  return h(
    "li",
    { class: "card" },
    h(
      "a",
      { href: `#/recipe/${encodeURIComponent(recipe.id)}`, class: "card-link" },
      media,
      h(
        "div",
        { class: "card-body" },
        h("p", { class: "card-category" }, recipe.category),
        h("h3", { class: "card-title" }, recipe.name),
        h(
          "p",
          { class: "card-meta" },
          [time, recipe.servings && `Serves ${recipe.servings}`].filter(Boolean).join(" · ")
        )
      )
    )
  );
}

function renderList() {
  const recipes = filteredRecipes();
  const total = state.recipes.length;

  const results = recipes.length
    ? h("ul", { class: "grid" }, recipes.map(renderCard))
    : h("p", { class: "empty" }, "No recipes match your search.");

  view.replaceChildren(
    h(
      "section",
      { class: "list-view", "aria-labelledby": "list-heading" },
      h(
        "div",
        { class: "list-header" },
        h("h2", { id: "list-heading", tabindex: "-1" }, "All recipes"),
        h("p", { class: "count", "aria-live": "polite" },
          recipes.length === total ? `${total} recipes` : `${recipes.length} of ${total} recipes`)
      ),
      renderCategoryChips(),
      results
    )
  );
}

// ---------- Detail view ----------

function metaItem(label, value) {
  if (!value) return null;
  return h("div", { class: "meta-item" }, h("dt", {}, label), h("dd", {}, value));
}

function renderDetail(id) {
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) {
    view.replaceChildren(
      h("section", { class: "detail" },
        h("a", { href: "#/", class: "back" }, "← All recipes"),
        h("h2", { tabindex: "-1" }, "Recipe not found"),
        h("p", {}, "That recipe isn't in the CSV. It may have been renamed or removed."))
    );
    return;
  }

  document.title = `${recipe.name} · Recipe Book`;

  view.replaceChildren(
    h(
      "article",
      { class: "detail" },
      h("a", { href: "#/", class: "back" }, "← All recipes"),
      h(
        "header",
        { class: "detail-header" },
        h("p", { class: "card-category" }, recipe.category),
        h("h2", { class: "detail-title", tabindex: "-1" }, recipe.name),
        recipe.tags.length > 0 &&
          h("ul", { class: "tags", "aria-label": "Tags" }, recipe.tags.map((t) => h("li", {}, t))),
        h(
          "dl",
          { class: "meta" },
          metaItem("Prep", formatMinutes(recipe.prepMinutes)),
          metaItem("Cook", formatMinutes(recipe.cookMinutes)),
          metaItem("Total", formatMinutes(recipe.totalMinutes)),
          metaItem("Serves", recipe.servings ? String(recipe.servings) : "")
        )
      ),
      recipe.image && isSafeUrl(recipe.image) &&
        h("img", { class: "detail-image", src: recipe.image, alt: recipe.name }),
      h(
        "div",
        { class: "detail-columns" },
        h(
          "section",
          { class: "ingredients", "aria-labelledby": "ingredients-heading" },
          h("h3", { id: "ingredients-heading" }, "Ingredients"),
          h("ul", {}, recipe.ingredients.map((item) => h("li", {}, item)))
        ),
        h(
          "section",
          { class: "instructions", "aria-labelledby": "instructions-heading" },
          h("h3", { id: "instructions-heading" }, "Instructions"),
          h("ol", {}, recipe.instructions.map((step) => h("li", {}, step)))
        )
      ),
      recipe.notes &&
        h("aside", { class: "notes" }, h("h3", {}, "Notes"), h("p", {}, recipe.notes)),
      recipe.source && isSafeUrl(recipe.source) &&
        h("p", { class: "source" },
          "Source: ",
          h("a", { href: recipe.source, target: "_blank", rel: "noopener" }, new URL(recipe.source).hostname))
    )
  );
}

// ---------- Routing ----------

function currentRoute() {
  const match = location.hash.match(/^#\/recipe\/(.+)$/);
  return match ? { name: "detail", id: decodeURIComponent(match[1]) } : { name: "list" };
}

let previousRoute = null;

function route() {
  const next = currentRoute();

  if (previousRoute?.name === "list" && next.name === "detail") state.listScrollY = window.scrollY;

  document.body.dataset.view = next.name;
  if (next.name === "detail") {
    renderDetail(next.id);
    window.scrollTo(0, 0);
  } else {
    document.title = "Recipe Book";
    renderList();
    window.scrollTo(0, previousRoute?.name === "detail" ? state.listScrollY : 0);
  }

  // Move focus to the new heading for keyboard and screen-reader users, but not on first load.
  if (previousRoute) view.querySelector("h2")?.focus({ preventScroll: true });
  previousRoute = next;
}

// ---------- Startup ----------

function showError(message) {
  view.replaceChildren(
    h("div", { class: "error", role: "alert" },
      h("h2", {}, "Couldn't load recipes"),
      h("p", {}, message),
      location.protocol === "file:" &&
        h("p", {}, "Browsers block reading the CSV when a page is opened straight from disk. Open the site through GitHub Pages, or run a local server (see README)."))
  );
}

searchInput.addEventListener("input", () => {
  state.query = searchInput.value.trim();
  if (currentRoute().name !== "list") location.hash = "#/";
  else renderList();
});

document.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (event.key === "/" && !typing) {
    event.preventDefault();
    searchInput.focus();
  }
});

window.addEventListener("hashchange", route);

try {
  state.recipes = await loadRecipes();
  route();
} catch (error) {
  showError(error.message);
}
