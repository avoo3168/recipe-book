// All recipe and grocery data: loading, lookups, and saving back to GitHub.
//
// Data is kept as raw CSV rows so that saving rewrites files faithfully, including any
// extra columns added by hand in a spreadsheet. Views get friendlier objects from the getters.

import { readCsv, toCsv } from "./csv.js";
import * as github from "./github.js";
import { parseQuantity, formatIngredient, mergeAmounts } from "./units.js";

export const AISLES = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery", "Pantry", "Baking",
  "Spices", "Canned & Jarred", "Frozen", "Beverages", "Household", "Other",
];

// Grocery lists live on their own branch so frequent check-offs don't clutter the
// main history or trigger a GitHub Pages rebuild each time.
const GROCERY_BRANCH = "grocery-lists";

const FILES = {
  recipes: "data/recipes.csv",
  ingredients: "data/ingredients.csv",
  recipeIngredients: "data/recipe_ingredients.csv",
};

const COLUMNS = {
  recipes: ["id", "name", "category", "servings", "prep_minutes", "cook_minutes", "tags", "instructions", "notes", "source", "image"],
  ingredients: ["id", "name", "plural", "aisle"],
  recipeIngredients: ["recipe_id", "position", "quantity", "unit", "ingredient_id", "note"],
  grocery: ["id", "ingredient_id", "name", "quantity", "unit", "recipe_id", "checked", "added"],
};

// ---------- Events ----------

const events = new EventTarget();
// "data" fires when recipes/ingredients change, "grocery" when the grocery list changes.
export function on(type, listener) {
  events.addEventListener(type, listener);
}
function emit(type) {
  events.dispatchEvent(new Event(type));
}

// ---------- Helpers ----------

export function slugify(text) {
  return String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function uniqueId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

function numberText(n) {
  return n == null || !Number.isFinite(n) ? "" : String(+n.toFixed(4));
}

function toQuantity(text) {
  const q = parseQuantity(text);
  return Number.isFinite(q) ? q : null;
}

function toMinutes(text) {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const normalizeName = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const singular = (text) => text.replace(/(?:es|s)$/, "");

function parseTable(text, key) {
  const { columns, rows } = readCsv(text || "");
  return { columns: [...COLUMNS[key], ...columns.filter((c) => c && !COLUMNS[key].includes(c))], rows };
}

const serializeTable = (table) => toCsv(table.columns, table.rows);

// ---------- Recipes and ingredients ----------

const db = {
  recipes: parseTable("", "recipes"),
  ingredients: parseTable("", "ingredients"),
  recipeIngredients: parseTable("", "recipeIngredients"),
};
let ingredientIndex = new Map();
let loadWarning = "";

function setTables([recipes, ingredients, recipeIngredients]) {
  db.recipes = parseTable(recipes, "recipes");
  db.ingredients = parseTable(ingredients, "ingredients");
  db.recipeIngredients = parseTable(recipeIngredients, "recipeIngredients");
  ingredientIndex = new Map(db.ingredients.rows.map((row) => [row.id, row]));
}

async function readSiteFile(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (response.status === 404) return "";
  if (!response.ok) throw new Error(`Couldn't load ${path} (HTTP ${response.status}).`);
  return response.text();
}

// When connected, read straight from GitHub so saves show up immediately instead of
// waiting a minute for GitHub Pages to republish.
async function readRepoFiles(paths) {
  const { branch } = github.getSettings();
  const head = await github.getHead(branch);
  if (!head) throw new Error(`Couldn't find a branch named "${branch}" on GitHub.`);
  return Promise.all(paths.map(async (path) => (await github.readFile(path, head)) ?? ""));
}

export async function load() {
  const paths = Object.values(FILES);
  let texts = null;
  loadWarning = "";
  if (github.isConnected()) {
    try {
      texts = await readRepoFiles(paths);
    } catch (error) {
      loadWarning = `${error.message} Showing the published copy of your recipes instead.`;
    }
  }
  texts ??= await Promise.all(paths.map(readSiteFile));
  setTables(texts);
  emit("data");
}

export function getLoadWarning() {
  return loadWarning;
}

function ingredientFor(id) {
  return ingredientIndex.get(id) ?? { id, name: id.replace(/-/g, " "), plural: "", aisle: "Other" };
}

function toRecipe(row) {
  const prepMinutes = toMinutes(row.prep_minutes);
  const cookMinutes = toMinutes(row.cook_minutes);
  return {
    id: row.id,
    name: row.name || "Untitled recipe",
    category: row.category || "Uncategorized",
    servings: toQuantity(row.servings),
    prepMinutes,
    cookMinutes,
    totalMinutes: prepMinutes + cookMinutes,
    tags: (row.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
    instructions: (row.instructions || "").split("\n").map((s) => s.trim()).filter(Boolean),
    notes: row.notes || "",
    source: row.source || "",
    image: row.image || "",
    ingredients: db.recipeIngredients.rows
      .filter((r) => r.recipe_id === row.id)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((r) => ({
        quantity: toQuantity(r.quantity),
        unit: r.unit,
        note: r.note,
        ingredient: ingredientFor(r.ingredient_id),
      })),
  };
}

export function getRecipes() {
  return db.recipes.rows.filter((row) => row.id).map(toRecipe);
}

export function getRecipe(id) {
  const row = db.recipes.rows.find((r) => r.id === id);
  return row ? toRecipe(row) : null;
}

export function getCategories() {
  return [...new Set(db.recipes.rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function getIngredients() {
  return [...db.ingredients.rows].sort((a, b) => a.name.localeCompare(b.name));
}

// Matches by name or plural, ignoring case and a trailing "s"/"es".
export function findIngredient(name, rows = db.ingredients.rows) {
  const wanted = normalizeName(name);
  if (!wanted) return null;
  return (
    rows.find((r) => normalizeName(r.name) === wanted || (r.plural && normalizeName(r.plural) === wanted)) ??
    rows.find((r) => singular(normalizeName(r.name)) === singular(wanted)) ??
    null
  );
}

// form: { name, category, servings, prepMinutes, cookMinutes, tags[], instructions[], notes, source, image,
//         ingredients: [{ quantity, unit, name, note, aisle, plural }] }
// Returns the recipe's id. Existing recipes keep their id even if renamed, so links don't break.
export async function saveRecipe(form, existingId = null) {
  const paths = Object.values(FILES);
  let savedId = existingId;

  const texts = await github.commitFiles({
    branch: github.getSettings().branch,
    paths,
    message: `${existingId ? "Update" : "Add"} recipe: ${form.name}`,
    update: ([recipesText, ingredientsText, linksText]) => {
      const recipes = parseTable(recipesText, "recipes");
      const ingredients = parseTable(ingredientsText, "ingredients");
      const links = parseTable(linksText, "recipeIngredients");

      savedId = existingId ?? uniqueId(slugify(form.name) || "recipe", new Set(recipes.rows.map((r) => r.id)));
      const index = recipes.rows.findIndex((r) => r.id === savedId);
      const row = {
        ...(recipes.rows[index] ?? {}),
        id: savedId,
        name: form.name,
        category: form.category,
        servings: numberText(form.servings),
        prep_minutes: numberText(form.prepMinutes),
        cook_minutes: numberText(form.cookMinutes),
        tags: form.tags.join(", "),
        instructions: form.instructions.join("\n"),
        notes: form.notes,
        source: form.source,
        image: form.image,
      };
      if (index >= 0) recipes.rows[index] = row;
      else recipes.rows.push(row);

      const ingredientIds = new Set(ingredients.rows.map((r) => r.id));
      const newLinks = form.ingredients.map((item, i) => {
        let ingredient = findIngredient(item.name, ingredients.rows);
        if (!ingredient) {
          ingredient = {
            id: uniqueId(slugify(item.name) || "ingredient", ingredientIds),
            name: item.name.trim(),
            plural: (item.plural || "").trim(),
            aisle: item.aisle || "Other",
          };
          ingredientIds.add(ingredient.id);
          ingredients.rows.push(ingredient);
        }
        return {
          recipe_id: savedId,
          position: String(i + 1),
          quantity: numberText(item.quantity),
          unit: item.unit,
          ingredient_id: ingredient.id,
          note: item.note,
        };
      });
      ingredients.rows.sort((a, b) => a.id.localeCompare(b.id));
      links.rows = links.rows.filter((r) => r.recipe_id !== savedId).concat(newLinks);

      return [serializeTable(recipes), serializeTable(ingredients), serializeTable(links)];
    },
  });

  setTables(texts);
  emit("data");
  return savedId;
}

export async function deleteRecipe(id) {
  const recipe = getRecipe(id);
  const texts = await github.commitFiles({
    branch: github.getSettings().branch,
    paths: Object.values(FILES),
    message: `Delete recipe: ${recipe?.name ?? id}`,
    update: ([recipesText, , linksText]) => {
      const recipes = parseTable(recipesText, "recipes");
      const links = parseTable(linksText, "recipeIngredients");
      recipes.rows = recipes.rows.filter((r) => r.id !== id);
      links.rows = links.rows.filter((r) => r.recipe_id !== id);
      return [serializeTable(recipes), null, serializeTable(links)];
    },
  });
  setTables(texts);
  emit("data");
}

// One row per recipe with ingredients written out as text — easy to import into
// Google Sheets, Notion, or paste into a document.
export function exportCsv() {
  const columns = ["Name", "Category", "Servings", "Prep minutes", "Cook minutes", "Tags", "Ingredients", "Instructions", "Notes", "Source", "Image"];
  const rows = getRecipes()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({
      Name: r.name,
      Category: r.category,
      Servings: numberText(r.servings),
      "Prep minutes": r.prepMinutes || "",
      "Cook minutes": r.cookMinutes || "",
      Tags: r.tags.join(", "),
      Ingredients: r.ingredients.map((item) => formatIngredient(item)).join("\n"),
      Instructions: r.instructions.map((step, i) => `${i + 1}. ${step}`).join("\n"),
      Notes: r.notes,
      Source: r.source,
      Image: r.image,
    }));
  return toCsv(columns, rows);
}

// ---------- Grocery list ----------
//
// Changes are recorded as operations ("add these", "check these", ...). They apply to the
// screen immediately, are kept in localStorage until saved, and are replayed on top of
// the latest file from GitHub when saving, so two devices editing at once both win.

let groceryBase = []; // last version read from or saved to GitHub
let pendingOps = []; // changes made on this device that aren't on GitHub yet
let groceryStatus = "synced"; // "synced" | "saving" | "error" | "local"
let groceryError = "";
let syncing = false;
let syncTimer = null;
let groceryVersion = 0;

function groceryListId() {
  return slugify(github.getSettings().groceryList) || "main";
}
const groceryPath = () => `grocery/${groceryListId()}.csv`;
const cacheKey = (id = groceryListId()) => `recipe-book:grocery:${id}`;

export const currentGroceryList = groceryListId;

// Names of the grocery lists saved on GitHub.
export async function listGroceryLists() {
  const entries = await github.listDirectory("grocery", GROCERY_BRANCH);
  return entries
    .filter((e) => e.type === "file" && e.name.endsWith(".csv"))
    .map((e) => e.name.slice(0, -4))
    .sort((a, b) => a.localeCompare(b));
}

export async function deleteGroceryList(name) {
  const id = slugify(name);
  await github.commitFiles({
    branch: GROCERY_BRANCH,
    // The README keeps the branch from ever being empty, which Git can't represent.
    paths: [`grocery/${id}.csv`, "README.md"],
    message: `Delete grocery list: ${id}`,
    update: ([, readme]) => [
      github.DELETE,
      readme ?? "This branch holds the Recipe Book's grocery lists, one CSV per list in grocery/.\n",
    ],
  });
  try {
    localStorage.removeItem(cacheKey(id));
  } catch {}
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(cacheKey()) || "{}");
  } catch {
    return {};
  }
}

function writeCache() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({ base: groceryBase, pending: pendingOps }));
  } catch {}
}

function applyOps(rows, ops) {
  let result = rows.map((r) => ({ ...r }));
  for (const op of ops) {
    const ids = new Set(op.ids ?? []);
    if (op.type === "add") result.push(...op.rows.map((r) => ({ ...r })));
    else if (op.type === "check") result.forEach((r) => { if (ids.has(r.id)) r.checked = op.checked ? "true" : ""; });
    else if (op.type === "remove") result = result.filter((r) => !ids.has(r.id));
    else if (op.type === "clearChecked") result = result.filter((r) => r.checked !== "true");
    else if (op.type === "clearAll") result = [];
  }
  return result;
}

export async function loadGrocery() {
  const cache = readCache();
  groceryBase = cache.base ?? [];
  pendingOps = cache.pending ?? [];
  groceryStatus = github.isConnected() ? "synced" : "local";
  emit("grocery");
  if (!github.isConnected()) return;
  if (pendingOps.length) await syncGrocery();
  else await refreshGrocery();
}

// Pulls changes made on other devices. Skipped while this device has unsaved changes.
export async function refreshGrocery() {
  if (!github.isConnected() || syncing || pendingOps.length) return;
  const version = ++groceryVersion;
  try {
    const text = await github.readFile(groceryPath(), GROCERY_BRANCH);
    if (version !== groceryVersion || pendingOps.length) return;
    groceryBase = parseTable(text ?? "", "grocery").rows;
    groceryStatus = "synced";
  } catch (error) {
    groceryStatus = "error";
    groceryError = error.message;
  }
  writeCache();
  emit("grocery");
}

async function syncGrocery() {
  clearTimeout(syncTimer);
  if (syncing || !pendingOps.length || !github.isConnected()) return;
  syncing = true;
  groceryVersion++;
  const ops = pendingOps.slice();
  groceryStatus = "saving";
  emit("grocery");

  try {
    const [text] = await github.commitFiles({
      branch: GROCERY_BRANCH,
      paths: [groceryPath()],
      message: "Update grocery list",
      update: ([current]) => {
        const table = parseTable(current ?? "", "grocery");
        table.rows = applyOps(table.rows, ops);
        return [serializeTable(table)];
      },
    });
    groceryBase = parseTable(text ?? "", "grocery").rows;
    pendingOps = pendingOps.slice(ops.length);
    groceryStatus = pendingOps.length ? "saving" : "synced";
  } catch (error) {
    groceryStatus = "error";
    groceryError = error.message;
    syncTimer = setTimeout(syncGrocery, 15000);
  } finally {
    syncing = false;
    writeCache();
    emit("grocery");
    if (pendingOps.length && groceryStatus !== "error") syncTimer = setTimeout(syncGrocery, 500);
  }
}

function queueGrocery(op) {
  pendingOps.push(op);
  writeCache();
  if (github.isConnected()) {
    groceryStatus = "saving";
    clearTimeout(syncTimer);
    // Short delay so a burst of taps (checking off several items) becomes one save.
    syncTimer = setTimeout(syncGrocery, 1500);
  }
  emit("grocery");
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// items: [{ ingredientId?, name?, quantity, unit, recipeId? }]
export function addToGrocery(items) {
  const added = new Date().toISOString();
  queueGrocery({
    type: "add",
    rows: items.map((item) => ({
      id: newId(),
      ingredient_id: item.ingredientId || "",
      name: item.ingredientId ? "" : (item.name || "").trim(),
      quantity: numberText(item.quantity),
      unit: item.unit || "",
      recipe_id: item.recipeId || "",
      checked: "",
      added,
    })),
  });
}

export const setGroceryChecked = (ids, checked) => queueGrocery({ type: "check", ids, checked });
export const removeGroceryItems = (ids) => queueGrocery({ type: "remove", ids });
export const clearCheckedGrocery = () => queueGrocery({ type: "clearChecked" });
export const clearGrocery = () => queueGrocery({ type: "clearAll" });

export function getGroceryStatus() {
  return { status: groceryStatus, error: groceryError, pending: pendingOps.length };
}

// Items grouped by ingredient, with amounts merged across recipes.
export function getGroceryGroups() {
  const groups = new Map();
  for (const row of applyOps(groceryBase, pendingOps)) {
    const key = row.ingredient_id || `name:${normalizeName(row.name)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        ingredient: row.ingredient_id
          ? ingredientFor(row.ingredient_id)
          : { id: "", name: row.name, plural: "", aisle: "Other" },
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }

  const recipeName = (id) => db.recipes.rows.find((r) => r.id === id)?.name;
  return [...groups.values()].map((group) => ({
    key: group.key,
    ingredient: group.ingredient,
    ids: group.rows.map((r) => r.id),
    checked: group.rows.every((r) => r.checked === "true"),
    amounts: mergeAmounts(group.rows.map((r) => ({ quantity: toQuantity(r.quantity), unit: r.unit }))),
    recipes: [...new Set(group.rows.map((r) => r.recipe_id).filter(Boolean))].map(recipeName).filter(Boolean),
  }));
}
