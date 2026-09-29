import * as store from "../store.js";
import * as github from "../github.js";
import { h, toast, formatMinutes, isSafeUrl, searchFor } from "../ui.js";
import { formatIngredient, formatQuantity } from "../units.js";

const SCALES = [[0.5, "½×"], [1, "1×"], [2, "2×"], [3, "3×"]];
let scale = 1;
let scaledRecipeId = null;

function metaItem(label, value) {
  return value ? h("div", { class: "meta-item" }, h("dt", {}, label), h("dd", {}, value)) : null;
}

function addToGrocery(recipe, items, factor) {
  store.addToGrocery(
    items.map((item) => ({
      ingredientId: item.ingredient.id,
      quantity: item.quantity == null ? null : item.quantity * factor,
      unit: item.unit,
      recipeId: recipe.id,
    }))
  );
  const what = items.length === 1 ? formatIngredient(items[0], factor) : `${items.length} ingredients`;
  toast(github.isConnected()
    ? `Added ${what} to your grocery list.`
    : `Added ${what} to the grocery list on this device. Connect GitHub in Settings to sync it.`);
}

// Shared with the "print all" view. `interactive` adds the controls that don't belong on paper.
export function renderRecipe(recipe, { interactive = false, factor = 1, onScale } = {}) {
  const servings = recipe.servings ? formatQuantity(recipe.servings * factor) : "";

  return h(
    "article",
    { class: "recipe" },
    interactive && h("a", { href: "#/", class: "back no-print" }, "← All recipes"),
    h(
      "header",
      { class: "recipe-header" },
      h("p", { class: "eyebrow" }, recipe.category),
      h("h2", { class: "recipe-title", tabindex: "-1" }, recipe.name),
      recipe.tags.length > 0 &&
        h("ul", { class: "tags", "aria-label": "Tags" },
          recipe.tags.map((tag) =>
            h("li", {}, interactive
              ? h("button", { type: "button", class: "tag", onclick: () => searchFor(tag), title: `Show recipes tagged ${tag}` }, tag)
              : h("span", { class: "tag" }, tag)))),
      h(
        "div",
        { class: "recipe-meta-row" },
        h("dl", { class: "meta" },
          metaItem("Prep", formatMinutes(recipe.prepMinutes)),
          metaItem("Cook", formatMinutes(recipe.cookMinutes)),
          metaItem("Total", formatMinutes(recipe.totalMinutes)),
          metaItem("Serves", servings)),
        interactive &&
          h("div", { class: "toolbar no-print" },
            h("a", { href: `#/edit/${encodeURIComponent(recipe.id)}`, class: "btn btn-quiet" }, "Edit"),
            h("button", { type: "button", class: "btn btn-quiet", onclick: () => window.print() }, "Print / Save PDF"))
      )
    ),
    recipe.image && isSafeUrl(recipe.image) && h("img", { class: "recipe-image", src: recipe.image, alt: "" }),
    h(
      "div",
      { class: "recipe-columns" },
      h(
        "section",
        { class: "ingredients", "aria-labelledby": `ingredients-${recipe.id}` },
        h("div", { class: "ingredients-header" },
          h("h3", { id: `ingredients-${recipe.id}` }, "Ingredients"),
          interactive &&
            h("div", { class: "scale no-print", role: "group", "aria-label": "Scale recipe" },
              SCALES.map(([value, label]) =>
                h("button", {
                  type: "button",
                  class: "scale-btn",
                  "aria-pressed": String(value === factor),
                  "aria-label": `${label.replace("×", "")} times`,
                  onclick: () => onScale(value),
                }, label))),
          !interactive && factor !== 1 && h("p", { class: "scale-note" }, `Scaled ${factor}×`)),
        h("ul", { class: "ingredient-list" },
          recipe.ingredients.map((item) =>
            h("li", {},
              h("span", {}, formatIngredient(item, factor)),
              interactive &&
                h("button", {
                  type: "button",
                  class: "icon-btn add-one no-print",
                  "aria-label": `Add ${item.ingredient.name} to grocery list`,
                  title: "Add to grocery list",
                  onclick: () => addToGrocery(recipe, [item], factor),
                }, "+")))),
        interactive && recipe.ingredients.length > 0 &&
          h("button", {
            type: "button",
            class: "btn btn-primary btn-block no-print",
            onclick: () => addToGrocery(recipe, recipe.ingredients, factor),
          }, "Add all to grocery list")
      ),
      h(
        "section",
        { class: "instructions", "aria-labelledby": `instructions-${recipe.id}` },
        h("h3", { id: `instructions-${recipe.id}` }, "Instructions"),
        h("ol", {}, recipe.instructions.map((step) => h("li", {}, step)))
      )
    ),
    recipe.notes && h("aside", { class: "notes" }, h("h3", {}, "Notes"), h("p", {}, recipe.notes)),
    recipe.source && isSafeUrl(recipe.source) &&
      h("p", { class: "source" }, "Source: ",
        h("a", { href: recipe.source, target: "_blank", rel: "noopener" }, new URL(recipe.source).hostname))
  );
}

export function mount(container, { id }) {
  if (scaledRecipeId !== id) {
    scale = 1;
    scaledRecipeId = id;
  }

  const render = () => {
    const recipe = store.getRecipe(id);
    if (!recipe) {
      container.replaceChildren(
        h("section", {},
          h("a", { href: "#/", class: "back" }, "← All recipes"),
          h("h2", { tabindex: "-1" }, "Recipe not found"),
          h("p", {}, "That recipe isn't in the recipe book. It may have been renamed or deleted."))
      );
      return;
    }
    container.replaceChildren(
      renderRecipe(recipe, {
        interactive: true,
        factor: scale,
        onScale: (value) => {
          scale = value;
          render();
          container.querySelector(`.scale-btn[aria-pressed="true"]`)?.focus();
        },
      })
    );
  };

  render();
  return { title: store.getRecipe(id)?.name ?? "Recipe not found", onData: render };
}
