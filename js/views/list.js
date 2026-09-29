import * as store from "../store.js";
import { h, formatMinutes, isSafeUrl, tintFor, downloadFile } from "../ui.js";

let category = "All";

function matchesQuery(recipe, query) {
  if (!query) return true;
  const haystack = [recipe.name, recipe.category, ...recipe.tags, ...recipe.ingredients.map((i) => i.ingredient.name)]
    .join(" ")
    .toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

function renderCard(recipe) {
  const time = formatMinutes(recipe.totalMinutes);
  const media =
    recipe.image && isSafeUrl(recipe.image)
      ? h("img", { class: "card-media", src: recipe.image, alt: "", loading: "lazy" })
      : h("div", { class: `card-media card-placeholder ${tintFor(recipe.category)}`, "aria-hidden": "true" }, recipe.name.charAt(0));

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
        h("p", { class: "eyebrow" }, recipe.category),
        h("h3", { class: "card-title" }, recipe.name),
        h("p", { class: "card-meta" }, [time, recipe.servings && `Serves ${recipe.servings}`].filter(Boolean).join(" · "))
      )
    )
  );
}

export function mount(container) {
  const render = () => {
    const query = document.getElementById("search").value.trim();
    const all = store.getRecipes();
    const categories = ["All", ...store.getCategories()];
    if (!categories.includes(category)) category = "All";

    const recipes = all
      .filter((r) => category === "All" || r.category === category)
      .filter((r) => matchesQuery(r, query))
      .sort((a, b) => a.name.localeCompare(b.name));

    const results = recipes.length
      ? h("ul", { class: "grid" }, recipes.map(renderCard))
      : h("div", { class: "empty" },
          all.length
            ? h("p", {}, "No recipes match your search.")
            : [h("p", {}, "Your recipe book is empty."), h("a", { href: "#/new", class: "btn btn-primary" }, "Add your first recipe")]);

    container.replaceChildren(
      h(
        "section",
        { "aria-labelledby": "list-heading" },
        h(
          "div",
          { class: "page-header" },
          h("div", {},
            h("h2", { id: "list-heading", tabindex: "-1" }, "All recipes"),
            h("p", { class: "count", "aria-live": "polite" },
              recipes.length === all.length ? `${all.length} recipes` : `${recipes.length} of ${all.length} recipes`)
          ),
          h(
            "div",
            { class: "toolbar" },
            h("a", { href: "#/print-all", class: "btn btn-quiet" }, "Print all"),
            h("button", {
              type: "button",
              class: "btn btn-quiet",
              onclick: () => downloadFile("recipes-export.csv", store.exportCsv()),
            }, "Export CSV")
          )
        ),
        h(
          "div",
          { class: "chips", role: "group", "aria-label": "Filter by category" },
          categories.map((c) =>
            h("button", {
              type: "button",
              class: "chip",
              "aria-pressed": String(c === category),
              onclick: () => { category = c; render(); },
            }, c)
          )
        ),
        results
      )
    );
  };

  render();
  return { title: "Recipe Book", onData: render, onSearch: render };
}
