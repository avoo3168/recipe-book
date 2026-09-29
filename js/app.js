import * as store from "./store.js";
import { h } from "./ui.js";
import * as listView from "./views/list.js";
import * as recipeView from "./views/recipe.js";
import * as formView from "./views/form.js";
import * as groceryView from "./views/grocery.js";
import * as settingsView from "./views/settings.js";
import * as printView from "./views/print.js";

const view = document.getElementById("view");
const searchInput = document.getElementById("search");

// [pattern, view, nav section, params from match]
const ROUTES = [
  [/^#\/recipe\/(.+)$/, recipeView, "list", (m) => ({ id: decodeURIComponent(m[1]) })],
  [/^#\/edit\/(.+)$/, formView, "new", (m) => ({ id: decodeURIComponent(m[1]) })],
  [/^#\/new$/, formView, "new"],
  [/^#\/grocery$/, groceryView, "grocery"],
  [/^#\/settings$/, settingsView, "settings"],
  [/^#\/print-all$/, printView, "list"],
];

function matchRoute(hash) {
  for (const [pattern, module, nav, params = () => ({})] of ROUTES) {
    const match = hash.match(pattern);
    if (match) return { module, nav, params: params(match) };
  }
  return { module: listView, nav: "list", params: {} };
}

let current = null; // what the mounted view returned: { title, onData?, onGrocery?, onSearch? }
let currentModule = null;
let listScrollY = 0;

function route() {
  const next = matchRoute(location.hash);
  if (currentModule === listView) listScrollY = window.scrollY;
  const returningToList = next.module === listView && currentModule !== null && currentModule !== listView;
  const firstRender = currentModule === null;

  currentModule = next.module;
  document.body.dataset.view = next.nav;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === next.nav) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  current = next.module.mount(view, next.params) ?? {};
  document.title = current.title && current.title !== "Recipe Book" ? `${current.title} · Recipe Book` : "Recipe Book";
  window.scrollTo(0, returningToList ? listScrollY : 0);

  // Move focus to the new heading for keyboard and screen-reader users, but not on first load.
  if (!firstRender) view.querySelector("h2")?.focus({ preventScroll: true });
}

function renderWarning() {
  const message = store.getLoadWarning();
  const banner = document.getElementById("load-warning");
  banner.hidden = !message;
  banner.replaceChildren(message ? h("span", {}, message, " ", h("a", { href: "#/settings" }, "Check Settings")) : "");
}

function updateDatalists() {
  document.getElementById("ingredient-options").replaceChildren(
    ...store.getIngredients().map((i) => h("option", { value: i.name })));
  document.getElementById("category-options").replaceChildren(
    ...store.getCategories().map((c) => h("option", { value: c })));
}

function updateGroceryBadge() {
  const badge = document.getElementById("grocery-count");
  const count = store.getGroceryGroups().filter((g) => !g.checked).length;
  badge.textContent = count;
  badge.hidden = count === 0;
  badge.setAttribute("aria-label", `${count} items to buy`);
}

store.on("data", () => {
  updateDatalists();
  renderWarning();
  updateGroceryBadge();
  current?.onData?.();
});

store.on("grocery", () => {
  updateGroceryBadge();
  current?.onGrocery?.();
});

searchInput.addEventListener("input", () => {
  if (currentModule !== listView) location.hash = "#/";
  else current?.onSearch?.();
});

document.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (event.key === "/" && !typing) {
    event.preventDefault();
    searchInput.focus();
  }
});

// Pick up grocery changes made on another device when coming back to this tab.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") store.refreshGrocery();
});

window.addEventListener("hashchange", route);

try {
  await store.load();
  route();
  store.loadGrocery();
} catch (error) {
  view.replaceChildren(
    h("div", { class: "banner banner-error", role: "alert" },
      h("h2", {}, "Couldn't load recipes"),
      h("p", {}, error.message),
      location.protocol === "file:" &&
        h("p", {}, "Browsers block reading the recipe files when the page is opened straight from disk. Open the site through GitHub Pages, or preview it with a local server (see README).")));
}
