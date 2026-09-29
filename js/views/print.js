import * as store from "../store.js";
import { h } from "../ui.js";
import { renderRecipe } from "./recipe.js";

// Every recipe on its own page, for printing or saving the whole book as one PDF.
export function mount(container) {
  const render = () => {
    const recipes = store.getRecipes().sort((a, b) => a.name.localeCompare(b.name));
    container.replaceChildren(
      h("section", { class: "print-all" },
        h("div", { class: "print-toolbar no-print" },
          h("a", { href: "#/", class: "back" }, "← All recipes"),
          h("h2", { tabindex: "-1" }, `Print all recipes (${recipes.length})`),
          h("p", {}, "Each recipe starts on a new page. To make a PDF, choose ", h("strong", {}, "Save as PDF"), " as the printer."),
          h("button", { type: "button", class: "btn btn-primary", onclick: () => window.print() }, "Print / Save PDF")),
        recipes.map((recipe) => h("div", { class: "print-page" }, renderRecipe(recipe))))
    );
  };
  render();
  return { title: "Recipe Book — all recipes", onData: render };
}
