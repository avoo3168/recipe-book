import * as store from "../store.js";
import * as github from "../github.js";
import { h } from "../ui.js";
import { UNITS, parseQuantity, describeAmount, formatIngredient } from "../units.js";

function label(group) {
  if (group.amounts.length === 1) {
    const [{ quantity, unit }] = group.amounts;
    return formatIngredient({ quantity, unit, ingredient: group.ingredient });
  }
  // Amounts that couldn't be combined, e.g. "1 can + 2 cups black beans".
  const name = group.ingredient.plural || group.ingredient.name;
  return `${group.amounts.map((a) => describeAmount(a.quantity, a.unit)).join(" + ")} ${name}`;
}

function itemRow(group) {
  const checkboxId = `grocery-${group.key.replace(/[^a-z0-9_-]/gi, "_")}`;
  return h("li", { class: `grocery-item${group.checked ? " is-checked" : ""}` },
    h("input", {
      type: "checkbox", id: checkboxId, checked: group.checked, "data-key": group.key,
      onchange: (event) => store.setGroceryChecked(group.ids, event.target.checked),
    }),
    h("label", { for: checkboxId },
      h("span", { class: "grocery-name" }, label(group)),
      group.recipes.length > 0 && h("span", { class: "grocery-from" }, `For ${group.recipes.join(", ")}`)),
    h("button", {
      type: "button", class: "icon-btn", "data-key": `remove-${group.key}`,
      "aria-label": `Remove ${group.ingredient.name}`, title: "Remove",
      onclick: () => store.removeGroceryItems(group.ids),
    }, "✕"));
}

function statusLine() {
  const { status, error } = store.getGroceryStatus();
  if (!github.isConnected()) {
    return h("p", { class: "sync-status is-local" },
      "Saved on this device only. ", h("a", { href: "#/settings" }, "Connect GitHub"), " to sync across devices.");
  }
  const text = { synced: "Synced", saving: "Saving…", error: `Not synced yet — will retry. ${error}` }[status] ?? "";
  return h("p", { class: `sync-status is-${status}`, "aria-live": "polite" }, text);
}

function addForm() {
  const qty = h("input", { type: "text", inputmode: "decimal", placeholder: "Qty", "aria-label": "Quantity", class: "ing-qty" });
  const unit = h("select", { "aria-label": "Unit", class: "ing-unit" }, UNITS.map((u) => h("option", { value: u }, u || "—")));
  const name = h("input", {
    type: "text", list: "ingredient-options", placeholder: "Add an item, e.g. paper towels",
    "aria-label": "Item", class: "ing-name", autocomplete: "off", required: true,
  });
  const error = h("p", { class: "ing-error", role: "alert", hidden: true });

  return h("form", {
    class: "grocery-add",
    onsubmit: (event) => {
      event.preventDefault();
      const quantity = parseQuantity(qty.value);
      if (!name.value.trim()) return name.focus();
      if (Number.isNaN(quantity)) {
        error.textContent = "Enter an amount like 2 or 1 1/2, or leave it blank.";
        error.hidden = false;
        return qty.focus();
      }
      error.hidden = true;
      const match = store.findIngredient(name.value);
      store.addToGrocery([{ ingredientId: match?.id, name: name.value, quantity, unit: unit.value }]);
      qty.value = "";
      unit.value = "";
      name.value = "";
      qty.focus();
    },
  },
    h("div", { class: "grocery-add-fields" }, qty, unit, name, h("button", { type: "submit", class: "btn btn-primary" }, "Add")),
    error);
}

export function mount(container) {
  const header = h("div", { class: "page-header" });
  const list = h("div", { class: "grocery-list" });

  const renderHeader = () => {
    header.replaceChildren(
      h("div", {}, h("h2", { tabindex: "-1" }, "Grocery list"), statusLine()));
  };

  const renderList = () => {
    // Keep keyboard focus on the same item across re-renders.
    const focusedKey = document.activeElement?.dataset?.key;
    const groups = store.getGroceryGroups();
    const toBuy = groups.filter((g) => !g.checked);
    const done = groups.filter((g) => g.checked);

    if (!groups.length) {
      list.replaceChildren(h("p", { class: "empty" },
        "Your list is empty. Open a recipe and choose ", h("strong", {}, "Add all to grocery list"), ", or add items above."));
      return;
    }

    const byAisle = new Map(store.AISLES.map((a) => [a, []]));
    for (const g of toBuy) {
      const aisle = byAisle.has(g.ingredient.aisle) ? g.ingredient.aisle : "Other";
      byAisle.get(aisle).push(g);
    }
    const sortByName = (a, b) => a.ingredient.name.localeCompare(b.ingredient.name);

    // Unlike h(), replaceChildren would print a skipped `false` as text, so filter those out.
    list.replaceChildren(...[
      ...[...byAisle].filter(([, items]) => items.length).map(([aisle, items]) =>
        h("section", { class: "aisle" },
          h("h3", {}, aisle),
          h("ul", {}, items.sort(sortByName).map(itemRow)))),
      toBuy.length === 0 && h("p", { class: "all-done" }, "Everything's checked off."),
      done.length > 0 &&
        h("section", { class: "aisle is-done" },
          h("h3", {}, `Checked off (${done.length})`),
          h("ul", {}, done.sort(sortByName).map(itemRow))),
      h("div", { class: "toolbar grocery-actions" },
        done.length > 0 &&
          h("button", { type: "button", class: "btn btn-quiet", onclick: () => store.clearCheckedGrocery() }, "Remove checked items"),
        h("button", {
          type: "button", class: "btn btn-danger",
          onclick: () => confirm("Clear the whole grocery list?") && store.clearGrocery(),
        }, "Clear list")),
    ].filter(Boolean));

    if (focusedKey) list.querySelector(`[data-key="${CSS.escape(focusedKey)}"]`)?.focus();
  };

  container.replaceChildren(h("section", { class: "grocery-page" }, header, addForm(), list));
  renderHeader();
  renderList();
  store.refreshGrocery();

  return {
    title: "Grocery list",
    onGrocery: () => { renderHeader(); renderList(); },
    onData: renderList,
  };
}
