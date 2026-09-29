// US kitchen units. Quantities are stored as plain decimals (0.5, 1.25); these helpers
// parse what people type, format amounts for display, and merge amounts for the grocery list.

// "" means a plain count: "2 bell peppers".
export const UNITS = [
  "", "tsp", "tbsp", "cup", "fl oz", "pint", "quart", "gallon", "oz", "lb",
  "pinch", "dash", "clove", "can", "jar", "package", "bunch", "head", "slice", "stick", "sprig", "piece",
];

const VOLUME_IN_TSP = { tsp: 1, tbsp: 3, "fl oz": 6, cup: 48, pint: 96, quart: 192, gallon: 768 };
const WEIGHT_IN_OZ = { oz: 1, lb: 16 };
const ABBREVIATED = new Set(["tsp", "tbsp", "fl oz", "oz", "lb"]);

const UNIT_ALIASES = new Map(
  Object.entries({
    tsp: ["teaspoon", "teaspoons", "tsp", "tsps", "tsp."],
    tbsp: ["tablespoon", "tablespoons", "tbsp", "tbsps", "tbsp.", "tbs", "tbl"],
    cup: ["cup", "cups", "c", "c."],
    "fl oz": ["fl oz", "fl. oz.", "fl oz.", "fluid ounce", "fluid ounces"],
    pint: ["pint", "pints", "pt", "pt."],
    quart: ["quart", "quarts", "qt", "qt."],
    gallon: ["gallon", "gallons", "gal", "gal."],
    oz: ["ounce", "ounces", "oz", "oz."],
    lb: ["pound", "pounds", "lb", "lbs", "lb.", "lbs."],
    pinch: ["pinch", "pinches"],
    dash: ["dash", "dashes"],
    clove: ["clove", "cloves"],
    can: ["can", "cans"],
    jar: ["jar", "jars"],
    package: ["package", "packages", "pkg", "pkgs", "pkg."],
    bunch: ["bunch", "bunches"],
    head: ["head", "heads"],
    slice: ["slice", "slices"],
    stick: ["stick", "sticks"],
    sprig: ["sprig", "sprigs"],
    piece: ["piece", "pieces"],
  }).flatMap(([unit, aliases]) => aliases.map((alias) => [alias, unit]))
);

// ---------- Parsing ----------

const UNICODE_FRACTIONS = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
  "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅕": "1/5", "⅙": "1/6",
};

function normalizeFractions(text) {
  return text
    .replace(/[½⅓⅔¼¾⅛⅜⅝⅞⅕⅙]/g, (glyph) => ` ${UNICODE_FRACTIONS[glyph]}`)
    .replace(/⁄/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

// A number as people write it: "1 1/2", "1/2", "1.5", ".5", "2".
const NUMBER = String.raw`(?:\d+ \d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`;
const QUANTITY = new RegExp(`^(${NUMBER})(?:\\s*(?:-|–|to)\\s*(${NUMBER}))?`);

function numberValue(token) {
  const mixed = token.match(/^(\d+) (\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = token.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(token);
}

// Returns a number, null for blank input, or NaN if it can't be read.
// Ranges like "2-3" use the larger number, so the grocery list buys enough.
export function parseQuantity(text) {
  const normalized = normalizeFractions(String(text ?? ""));
  if (!normalized) return null;
  const match = normalized.match(QUANTITY);
  if (!match || match[0].length !== normalized.length) return NaN;
  const value = numberValue(match[2] ?? match[1]);
  return Number.isFinite(value) && value > 0 ? value : NaN;
}

function matchUnit(text) {
  const words = text.match(/^(\S+)(?: (\S+))?/);
  if (!words) return null;
  const candidates = words[2] ? [`${words[1]} ${words[2]}`, words[1]] : [words[1]];
  for (const candidate of candidates) {
    const unit = candidate === "T" ? "tbsp" : candidate === "t" ? "tsp" : UNIT_ALIASES.get(candidate.toLowerCase());
    if (unit !== undefined) return { unit, rest: text.slice(candidate.length).trim() };
  }
  return null;
}

// "1 1/2 cups all-purpose flour, sifted" → { quantity: 1.5, unit: "cup", name: "all-purpose flour", note: "sifted" }
export function parseIngredientLine(line) {
  let rest = normalizeFractions(line.replace(/^\s*(?:[-*•·▢□☐]|\[ ?\])\s*/, ""));
  const notes = [];

  const takeParenthetical = () => {
    const paren = rest.match(/^\(([^)]*)\)\s*/);
    if (paren) {
      notes.push(paren[1].trim());
      rest = rest.slice(paren[0].length);
    }
  };

  let quantity = null;
  const qty = rest.match(QUANTITY);
  if (qty) {
    quantity = numberValue(qty[2] ?? qty[1]);
    rest = rest.slice(qty[0].length).trim();
  }
  takeParenthetical();

  let unit = "";
  const unitMatch = matchUnit(rest);
  if (unitMatch && (quantity != null || unitMatch.unit === "pinch" || unitMatch.unit === "dash")) {
    unit = unitMatch.unit;
    rest = unitMatch.rest.replace(/^of\s+/i, "");
  }
  takeParenthetical();

  const comma = rest.indexOf(",");
  if (comma >= 0) {
    notes.push(rest.slice(comma + 1).trim());
    rest = rest.slice(0, comma);
  }

  return {
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    unit,
    name: rest.trim(),
    note: notes.filter(Boolean).join(", "),
  };
}

// ---------- Formatting ----------

const FRACTIONS = [
  [0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
  [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""],
];

// 1.5 → "1½". Rounds to the nearest kitchen fraction; tiny amounts stay decimal.
export function formatQuantity(n) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n < 0.115) return String(+n.toFixed(2));
  let whole = Math.floor(n);
  const rest = n - whole;
  const [value, glyph] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  if (value === 1) whole += 1;
  return whole ? `${whole}${glyph}` : glyph;
}

export function unitLabel(unit, quantity) {
  if (!unit || ABBREVIATED.has(unit) || quantity == null || quantity <= 1) return unit;
  return /(s|x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

export function describeAmount(quantity, unit) {
  return [formatQuantity(quantity), unitLabel(unit, quantity)].filter(Boolean).join(" ");
}

// { quantity: 2, unit: "", ingredient: { name: "bell pepper", plural: "bell peppers" }, note: "sliced" }
// → "2 bell peppers, sliced"
export function formatIngredient({ quantity, unit, ingredient, note }, factor = 1) {
  const q = quantity == null ? null : quantity * factor;
  const usePlural = ingredient.plural && (unit ? true : q > 1);
  const text = [describeAmount(q, unit), usePlural ? ingredient.plural : ingredient.name].filter(Boolean).join(" ");
  return note ? `${text}, ${note}` : text;
}

// ---------- Merging ----------

function bestVolume(tsp) {
  if (tsp >= 12) return { quantity: tsp / 48, unit: "cup" };
  if (tsp >= 3) return { quantity: tsp / 3, unit: "tbsp" };
  return { quantity: tsp, unit: "tsp" };
}

function bestWeight(oz) {
  return oz >= 16 ? { quantity: oz / 16, unit: "lb" } : { quantity: oz, unit: "oz" };
}

// Combines amounts of one ingredient: same units add up, US volumes and weights
// convert to a common unit, and anything else (e.g. "1 can" + "2 cups") stays separate.
// Unmeasured entries ("salt, to taste") are dropped when a measured amount exists.
export function mergeAmounts(entries) {
  const measured = entries.filter((e) => e.quantity != null);
  if (!measured.length) return [{ quantity: null, unit: "" }];

  const total = (list, scale = () => 1) => list.reduce((sum, e) => sum + e.quantity * scale(e), 0);
  const units = new Set(measured.map((e) => e.unit));
  if (units.size === 1) return [{ quantity: total(measured), unit: measured[0].unit }];

  const isVolume = (e) => Object.hasOwn(VOLUME_IN_TSP, e.unit);
  const isWeight = (e) => Object.hasOwn(WEIGHT_IN_OZ, e.unit);
  const result = [];

  const volume = measured.filter(isVolume);
  if (volume.length) result.push(bestVolume(total(volume, (e) => VOLUME_IN_TSP[e.unit])));

  const weight = measured.filter(isWeight);
  if (weight.length) result.push(bestWeight(total(weight, (e) => WEIGHT_IN_OZ[e.unit])));

  const other = new Map();
  for (const e of measured.filter((e) => !isVolume(e) && !isWeight(e))) {
    other.set(e.unit, (other.get(e.unit) ?? 0) + e.quantity);
  }
  for (const [unit, quantity] of other) result.push({ quantity, unit });

  return result;
}
