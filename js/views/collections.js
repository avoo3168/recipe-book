import * as store from "../store.js";
import * as github from "../github.js";
import { h, toast, isSafeUrl, tintFor } from "../ui.js";
import { renderCard } from "./list.js";

const recipeCount = (n) => `${n} ${n === 1 ? "recipe" : "recipes"}`;

function notConnectedToast() {
  toast("Connect this device to GitHub in Settings to change collections.");
}

// Shows a toast if a background save fails; the store reloads the real data.
function reportFailure(promise) {
  promise.catch((error) => toast(`Couldn't save: ${error.message}`));
}

// 2×2 mosaic of the newest recipes' photos (or letter tiles), like Instagram's saved collections.
function cover(collection) {
  const recipes = collection.recipeIds.map((id) => store.getRecipe(id)).filter(Boolean).slice(0, 4);
  if (!recipes.length) return h("div", { class: "collection-cover is-empty", "aria-hidden": "true" }, "No recipes yet");
  return h("div", { class: `collection-cover count-${recipes.length}`, "aria-hidden": "true" },
    recipes.map((r) =>
      r.image && isSafeUrl(r.image)
        ? h("img", { src: store.photoSrc(r.image), alt: "", loading: "lazy" })
        : h("div", { class: `cover-tile ${tintFor(r.category)}` }, r.name.charAt(0))));
}

function newCollectionForm(onCreated) {
  const input = h("input", { type: "text", placeholder: "e.g. Angela's Favorites", "aria-label": "New collection name", autocomplete: "off" });
  return h("form", {
    class: "new-collection",
    onsubmit: (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return input.focus();
      if (!github.isConnected()) return notConnectedToast();
      const { id, done } = store.createCollection(name);
      reportFailure(done);
      input.value = "";
      onCreated(id, name);
    },
  }, input, h("button", { type: "submit", class: "btn btn-primary" }, "Create"));
}

// ---------- All collections ----------

export function mountAll(container) {
  const render = () => {
    const collections = store.getCollections();
    container.replaceChildren(
      h("section", { "aria-labelledby": "collections-heading" },
        h("div", { class: "page-header" },
          h("div", {},
            h("h2", { id: "collections-heading", tabindex: "-1" }, "Collections"),
            h("p", { class: "count" }, `${collections.length} ${collections.length === 1 ? "collection" : "collections"}`))),
        newCollectionForm((id, name) => toast(`Created "${name}". Open a recipe and tap Save to add to it.`)),
        collections.length
          ? h("ul", { class: "grid collection-grid" },
              collections.map((c) =>
                h("li", { class: "card" },
                  h("a", { href: `#/collection/${encodeURIComponent(c.id)}`, class: "card-link" },
                    cover(c),
                    h("div", { class: "card-body" },
                      h("h3", { class: "card-title" }, c.name),
                      h("p", { class: "card-meta" }, recipeCount(c.recipeIds.length)))))))
          : h("p", { class: "empty" }, "No collections yet. Create one above, then use the Save button on any recipe to add it.")));
  };
  render();
  return { title: "Collections", onData: render };
}

// ---------- One collection ----------

export function mountOne(container, { id }) {
  let editing = false;

  const render = () => {
    const collection = store.getCollection(id);
    if (!collection) {
      container.replaceChildren(h("section", {},
        h("a", { href: "#/collections", class: "back" }, "← Collections"),
        h("h2", { tabindex: "-1" }, "Collection not found"),
        h("p", {}, "It may have been deleted.")));
      return;
    }
    const recipes = collection.recipeIds.map((rid) => store.getRecipe(rid)).filter(Boolean);

    const header = editing ? editForm(collection) : h("div", { class: "page-header" },
      h("div", {},
        h("h2", { tabindex: "-1" }, collection.name),
        collection.description && h("p", { class: "collection-description" }, collection.description),
        h("p", { class: "count" }, recipeCount(recipes.length))),
      h("div", { class: "toolbar" },
        h("button", {
          type: "button", class: "btn btn-quiet",
          onclick: () => {
            if (!github.isConnected()) return notConnectedToast();
            editing = true;
            render();
            container.querySelector(".collection-edit input")?.focus();
          },
        }, "Edit")));

    container.replaceChildren(
      h("section", {},
        h("a", { href: "#/collections", class: "back" }, "← Collections"),
        header,
        recipes.length
          ? h("ul", { class: "grid" }, recipes.map((recipe) => {
              const card = renderCard(recipe);
              card.append(h("button", {
                type: "button", class: "icon-btn card-remove",
                "aria-label": `Remove ${recipe.name} from ${collection.name}`, title: "Remove from collection",
                onclick: () => {
                  if (!github.isConnected()) return notConnectedToast();
                  reportFailure(store.setRecipeInCollection(collection.id, recipe.id, false));
                  toast(`Removed "${recipe.name}" from ${collection.name}.`);
                },
              }, "✕"));
              return card;
            }))
          : h("p", { class: "empty" }, "Nothing saved here yet. Open a recipe and tap ", h("strong", {}, "Save"), " to add it.")));
  };

  function editForm(collection) {
    const name = h("input", { type: "text", value: collection.name, "aria-label": "Collection name", autocomplete: "off" });
    const description = h("textarea", { rows: "2", placeholder: "Description (optional)", "aria-label": "Description" });
    description.value = collection.description;
    return h("form", {
      class: "collection-edit recipe-form",
      onsubmit: (event) => {
        event.preventDefault();
        if (!name.value.trim()) return name.focus();
        reportFailure(store.updateCollection(collection.id, { name: name.value.trim(), description: description.value.trim() }));
        editing = false;
        render();
      },
    },
      name,
      description,
      h("div", { class: "form-actions" },
        h("button", { type: "submit", class: "btn btn-primary" }, "Save"),
        h("button", { type: "button", class: "btn btn-quiet", onclick: () => { editing = false; render(); } }, "Cancel"),
        h("span", { class: "spacer" }),
        h("button", {
          type: "button", class: "btn btn-danger",
          onclick: () => {
            if (!confirm(`Delete the "${collection.name}" collection? The recipes in it won't be deleted.`)) return;
            reportFailure(store.deleteCollection(collection.id));
            toast(`Deleted "${collection.name}".`);
            location.hash = "#/collections";
          },
        }, "Delete collection")));
  }

  render();
  return { title: store.getCollection(id)?.name ?? "Collection", onData: () => !editing && render() };
}

// ---------- "Save to collection" panel on a recipe page ----------

export function savePanel(recipe, onClose) {
  const list = h("ul", { class: "save-list" });

  const renderList = () => {
    const collections = store.getCollections();
    list.replaceChildren(...(collections.length
      ? collections.map((c) => {
          const checkboxId = `save-${c.id}`;
          return h("li", {},
            h("input", {
              type: "checkbox", id: checkboxId, checked: c.recipeIds.includes(recipe.id),
              onchange: (event) => {
                if (!github.isConnected()) {
                  event.target.checked = !event.target.checked;
                  return notConnectedToast();
                }
                reportFailure(store.setRecipeInCollection(c.id, recipe.id, event.target.checked));
              },
            }),
            h("label", { for: checkboxId }, c.name, h("span", { class: "save-count" }, recipeCount(c.recipeIds.length))));
        })
      : [h("li", { class: "hint" }, "No collections yet. Create your first one below.")]));
  };
  renderList();

  const panel = h("div", { class: "save-panel no-print", role: "group", "aria-label": "Save to collection" },
    h("div", { class: "save-panel-header" },
      h("strong", {}, "Save to collection"),
      h("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: onClose }, "✕")),
    list,
    newCollectionFormFor(recipe));

  panel.refresh = renderList;
  return panel;
}

// Like newCollectionForm, but also saves this recipe into the new collection.
function newCollectionFormFor(recipe) {
  const input = h("input", { type: "text", id: "save-new-collection", placeholder: "New collection, e.g. Angela's Favorites", "aria-label": "New collection name", autocomplete: "off" });
  return h("form", {
    class: "new-collection",
    onsubmit: (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return input.focus();
      if (!github.isConnected()) return notConnectedToast();
      reportFailure(store.createCollection(name, recipe.id).done);
      toast(`Saved to "${name}".`);
      input.value = "";
    },
  }, input, h("button", { type: "submit", class: "btn btn-quiet" }, "Create"));
}
