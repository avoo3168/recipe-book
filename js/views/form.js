import * as store from "../store.js";
import * as github from "../github.js";
import { h, toast, isSafeUrl } from "../ui.js";
import { UNITS, parseQuantity, parseIngredientLine, formatQuantity } from "../units.js";

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

const PHOTO_MAX_SIZE = 1600; // pixels on the longest side
const PHOTO_QUALITY = 0.82;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Shrinks a photo from the camera roll to a web-friendly JPEG (usually 200–400 KB)
// and returns it as base64 for uploading, plus a URL for previewing it.
async function preparePhoto(file) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await loadImage(file);
  }
  const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(source.width, source.height));
  const canvas = h("canvas", { width: Math.round(source.width * scale), height: Math.round(source.height * scale) });
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff"; // transparent PNGs get a white background instead of black
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't convert the photo."))), "image/jpeg", PHOTO_QUALITY));
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { base64, previewUrl: URL.createObjectURL(blob) };
}

// "Photo: [link] or [Upload photo]" with a preview. read() returns
// { image, photo }: the link or already-uploaded path to keep, and any new photo to upload.
function photoField(existingImage, onBusy) {
  const uploaded = existingImage?.startsWith(store.PHOTO_DIR) ? existingImage : "";
  let keepUploaded = Boolean(uploaded);
  let photo = null;
  let error = "";

  const link = h("input", { type: "url", id: nextId("field"), placeholder: "https://…", value: uploaded ? "" : existingImage ?? "" });
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  const preview = h("img", { class: "photo-preview", alt: "Photo preview", hidden: true });
  const status = h("p", { class: "hint", role: "status" });
  const removeButton = h("button", {
    type: "button", class: "btn btn-quiet btn-small", hidden: true,
    onclick: () => {
      photo = null;
      keepUploaded = false;
      link.value = "";
      file.value = "";
      refresh();
    },
  }, "Remove photo");

  function refresh() {
    const typed = link.value.trim();
    const src = photo?.previewUrl || (typed && isSafeUrl(typed) ? typed : "") || (keepUploaded ? store.photoSrc(uploaded) : "");
    preview.hidden = !src;
    if (src && preview.getAttribute("src") !== src) preview.src = src;
    removeButton.hidden = !src;
    status.textContent = error || (photo ? "This photo will be uploaded when you save." : "");
    status.classList.toggle("is-error", Boolean(error));
  }

  preview.addEventListener("error", () => (preview.hidden = true));
  link.addEventListener("input", () => {
    if (link.value.trim()) {
      photo = null;
      keepUploaded = false;
    }
    error = "";
    refresh();
  });
  file.addEventListener("change", async () => {
    const chosen = file.files[0];
    if (!chosen) return;
    error = "";
    status.textContent = "Preparing photo…";
    onBusy(true);
    try {
      photo = await preparePhoto(chosen);
      link.value = "";
      keepUploaded = false;
    } catch {
      error = "That file couldn't be read as a photo. Try a JPEG or PNG.";
    } finally {
      onBusy(false);
      refresh();
    }
  });
  refresh();

  const element = h("div", { class: "field" },
    h("label", { for: link.id }, "Photo"),
    h("div", { class: "photo-row" },
      link,
      h("span", { class: "photo-or" }, "or"),
      h("button", { type: "button", class: "btn btn-quiet", onclick: () => file.click() }, "Upload photo"),
      file),
    h("div", { class: "photo-preview-row" }, preview, removeButton),
    status,
    h("p", { class: "hint" }, "Paste the address of a photo online, or upload one from this device."));

  return {
    element,
    read: () => ({ image: link.value.trim() || (keepUploaded ? uploaded : ""), photo }),
  };
}

function field(label, control, hint) {
  const id = control.id || (control.id = nextId("field"));
  const hintEl = hint && h("p", { class: "hint", id: `${id}-hint` }, hint);
  if (hintEl) control.setAttribute("aria-describedby", hintEl.id);
  return h("div", { class: "field" }, h("label", { for: id }, label), control, hintEl);
}

function unitSelect(selected = "") {
  const units = UNITS.includes(selected) ? UNITS : [...UNITS, selected];
  return h("select", { class: "ing-unit", "aria-label": "Unit" },
    units.map((unit) => h("option", { value: unit, selected: unit === selected }, unit || "—")));
}

function ingredientRow(data = {}) {
  const qty = h("input", {
    class: "ing-qty", type: "text", inputmode: "decimal", placeholder: "Qty", "aria-label": "Quantity",
    value: data.quantity != null ? formatQuantity(data.quantity) : "",
  });
  const unit = unitSelect(data.unit ?? "");
  const name = h("input", {
    class: "ing-name", type: "text", list: "ingredient-options", placeholder: "Ingredient", "aria-label": "Ingredient",
    autocomplete: "off", value: data.name ?? "",
  });
  const note = h("input", { class: "ing-note", type: "text", placeholder: "Note, e.g. diced", "aria-label": "Note", value: data.note ?? "" });

  const aisle = h("select", { class: "ing-aisle", "aria-label": "Aisle for new ingredient" },
    store.AISLES.map((a) => h("option", { value: a, selected: a === "Other" }, a)));
  const plural = h("input", { class: "ing-plural", type: "text", placeholder: "Plural (optional)", "aria-label": "Plural name for new ingredient" });
  const newInfo = h("div", { class: "ing-new", hidden: true },
    h("span", { class: "badge-new" }, "New ingredient"),
    h("label", {}, "Aisle ", aisle),
    plural);
  const error = h("p", { class: "ing-error", role: "alert", hidden: true });

  const row = h("li", { class: "ing-row" },
    h("div", { class: "ing-main" },
      qty, unit, name, note,
      h("button", {
        type: "button", class: "icon-btn", "aria-label": "Remove ingredient", title: "Remove",
        onclick: () => {
          const list = row.parentElement;
          row.remove();
          list.querySelector(".ing-name")?.focus();
        },
      }, "✕")),
    newInfo,
    error);

  const refreshNew = () => {
    const typed = name.value.trim();
    newInfo.hidden = !typed || Boolean(store.findIngredient(typed));
  };
  name.addEventListener("input", refreshNew);
  refreshNew();

  row.read = () => ({
    quantityText: qty.value.trim(),
    quantity: parseQuantity(qty.value),
    unit: unit.value,
    name: name.value.trim(),
    note: note.value.trim(),
    aisle: aisle.value,
    plural: plural.value.trim(),
  });
  row.showError = (message) => {
    error.textContent = message;
    error.hidden = !message;
    row.classList.toggle("has-error", Boolean(message));
  };
  row.focusFirst = () => qty.focus();
  return row;
}

export function mount(container, { id } = {}) {
  const existing = id ? store.getRecipe(id) : null;
  if (id && !existing) {
    container.replaceChildren(h("section", {},
      h("a", { href: "#/", class: "back" }, "← All recipes"),
      h("h2", { tabindex: "-1" }, "Recipe not found")));
    return { title: "Recipe not found" };
  }

  const connected = github.isConnected();
  const r = existing ?? { tags: [], instructions: [], ingredients: [] };

  const nameInput = h("input", { type: "text", required: true, value: r.name ?? "", autocomplete: "off" });
  const categoryInput = h("input", { type: "text", list: "category-options", value: existing?.category ?? "", autocomplete: "off" });
  const servingsInput = h("input", { type: "number", min: "0", step: "any", inputmode: "decimal", value: r.servings ?? "" });
  const prepInput = h("input", { type: "number", min: "0", step: "1", inputmode: "numeric", value: r.prepMinutes || "" });
  const cookInput = h("input", { type: "number", min: "0", step: "1", inputmode: "numeric", value: r.cookMinutes || "" });
  const tagsInput = h("input", { type: "text", value: r.tags.join(", "), autocomplete: "off" });
  const instructionsInput = h("textarea", { rows: "8" });
  instructionsInput.value = r.instructions.join("\n");
  const notesInput = h("textarea", { rows: "3" });
  notesInput.value = r.notes ?? "";
  const sourceInput = h("input", { type: "url", value: r.source ?? "", placeholder: "https://…" });
  // Saving waits while a chosen photo is still being prepared.
  const photoInput = photoField(r.image, (busy) => (saveButton.disabled = busy || !connected));

  const rows = h("ol", { class: "ing-rows" });
  const initial = r.ingredients.length
    ? r.ingredients.map((i) => ({ quantity: i.quantity, unit: i.unit, name: i.ingredient.name, note: i.note }))
    : [{}, {}, {}];
  initial.forEach((data) => rows.append(ingredientRow(data)));

  const addRow = () => {
    const row = ingredientRow();
    rows.append(row);
    row.focusFirst();
  };

  const pasteBox = h("textarea", { rows: "6", placeholder: "2 cups all-purpose flour\n1 tsp salt\n3 cloves garlic, minced" });
  const pastePanel = h("details", { class: "paste" },
    h("summary", {}, "Paste a list of ingredients"),
    field("One ingredient per line", pasteBox, "Amounts and units are filled in for you. Check the rows before saving."),
    h("button", {
      type: "button", class: "btn btn-quiet",
      onclick: () => {
        const lines = pasteBox.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return;
        // Drop untouched blank rows so pasted items don't end up after them.
        [...rows.children].forEach((row) => {
          const v = row.read();
          if (!v.quantityText && !v.name && !v.note) row.remove();
        });
        for (const line of lines) {
          const parsed = parseIngredientLine(line);
          const match = store.findIngredient(parsed.name);
          rows.append(ingredientRow({ ...parsed, name: match ? match.name : parsed.name }));
        }
        pasteBox.value = "";
        pastePanel.open = false;
        toast(`Added ${lines.length} ingredient${lines.length === 1 ? "" : "s"}. Check them over below.`);
      },
    }, "Add to ingredients"));

  const formError = h("div", { class: "form-error", role: "alert", hidden: true });
  const saveButton = h("button", { type: "submit", class: "btn btn-primary", disabled: !connected }, existing ? "Save changes" : "Save recipe");

  const deleteButton = existing && h("button", {
    type: "button", class: "btn btn-danger", disabled: !connected,
    onclick: async () => {
      if (!confirm(`Delete "${existing.name}"? You can still recover it later from the GitHub history.`)) return;
      deleteButton.disabled = true;
      try {
        await store.deleteRecipe(existing.id);
        toast(`Deleted "${existing.name}".`);
        location.hash = "#/";
      } catch (error) {
        showFormError(error.message);
        deleteButton.disabled = false;
      }
    },
  }, "Delete recipe");

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = !message;
    if (message) formError.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function collect() {
    let firstInvalid = null;
    const flag = (el) => (firstInvalid ??= el);

    const name = nameInput.value.trim();
    if (!name) flag(nameInput);

    const ingredients = [];
    for (const row of rows.children) {
      const v = row.read();
      const empty = !v.quantityText && !v.name && !v.note;
      let message = "";
      if (empty) { row.showError(""); continue; }
      if (!v.name) message = "Enter an ingredient name.";
      else if (Number.isNaN(v.quantity)) message = "Enter an amount like 2, 1/2, 1 1/2 or 0.5 — or leave it blank.";
      row.showError(message);
      if (message) flag(row.querySelector(v.name ? ".ing-qty" : ".ing-name"));
      else ingredients.push(v);
    }

    if (firstInvalid) {
      showFormError(name ? "Some ingredients need fixing." : "Give the recipe a name.");
      firstInvalid.focus();
      return null;
    }

    const num = (input) => (input.value === "" ? null : Number(input.value));
    return {
      name,
      category: categoryInput.value.trim(),
      servings: num(servingsInput),
      prepMinutes: num(prepInput),
      cookMinutes: num(cookInput),
      tags: [...new Set(tagsInput.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))],
      // Strip numbering like "1." or "Step 2:" so pasted instructions don't get numbered twice.
      instructions: instructionsInput.value.split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:step\s*)?\d+\s*[.):-]\s*/i, "").trim())
        .filter(Boolean),
      notes: notesInput.value.trim(),
      source: sourceInput.value.trim(),
      ...photoInput.read(),
      ingredients,
    };
  }

  const form = h("form", {
    class: "recipe-form", novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      showFormError("");
      const data = collect();
      if (!data) return;
      saveButton.disabled = true;
      saveButton.textContent = "Saving…";
      try {
        const savedId = await store.saveRecipe(data, existing?.id);
        toast("Recipe saved.");
        location.hash = `#/recipe/${encodeURIComponent(savedId)}`;
      } catch (error) {
        showFormError(`Couldn't save: ${error.message}`);
        saveButton.disabled = false;
        saveButton.textContent = existing ? "Save changes" : "Save recipe";
      }
    },
  },
    h("fieldset", {},
      h("legend", {}, "Basics"),
      field("Recipe name", nameInput),
      h("div", { class: "field-row" },
        field("Category", categoryInput, "e.g. Dinner, Baking"),
        field("Servings", servingsInput),
        field("Prep (minutes)", prepInput),
        field("Cook (minutes)", cookInput)),
      field("Tags", tagsInput, "Separate with commas, e.g. quick, vegetarian")),
    h("fieldset", {},
      h("legend", {}, "Ingredients"),
      h("p", { class: "hint" }, "Start typing to pick from your ingredient list. Anything new is added to the list when you save."),
      h("div", { class: "ing-labels", "aria-hidden": "true" },
        h("span", {}, "Qty"), h("span", {}, "Unit"), h("span", {}, "Ingredient"), h("span", {}, "Note")),
      rows,
      h("button", { type: "button", class: "btn btn-quiet", onclick: addRow }, "+ Add ingredient"),
      pastePanel),
    h("fieldset", {},
      h("legend", {}, "Instructions"),
      field("Steps", instructionsInput, "One step per line. They're numbered for you.")),
    h("fieldset", {},
      h("legend", {}, "Extras"),
      field("Notes", notesInput),
      field("Source link", sourceInput),
      photoInput.element),
    formError,
    h("div", { class: "form-actions" },
      saveButton,
      h("a", { href: existing ? `#/recipe/${encodeURIComponent(existing.id)}` : "#/", class: "btn btn-quiet" }, "Cancel"),
      deleteButton && h("span", { class: "spacer" }),
      deleteButton));

  container.replaceChildren(
    h("section", { class: "form-page" },
      h("a", { href: existing ? `#/recipe/${encodeURIComponent(existing.id)}` : "#/", class: "back" }, "← Back"),
      h("h2", { tabindex: "-1" }, existing ? `Edit ${existing.name}` : "Add a recipe"),
      !connected &&
        h("div", { class: "banner" },
          "To save recipes, connect this device to GitHub first. ",
          h("a", { href: "#/settings" }, "Open Settings")),
      form)
  );

  return { title: existing ? `Edit ${existing.name}` : "Add a recipe" };
}
