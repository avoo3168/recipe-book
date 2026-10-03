# Recipe Book

A personal recipe book that runs as a static site on GitHub Pages. It has no build step and no dependencies. Recipes are stored as CSV files in this repository. The site can add and edit recipes and keep a grocery list synced across devices by saving changes back to the repository through GitHub's API.

## Features

- Browse, search (by name, tag, or ingredient), and filter by category
- Recipe pages with ½×–3× scaling
- **Add / edit / delete recipes** from the site. Ingredient names autocomplete from your master list, new ones are added automatically, and you can paste a whole ingredient list at once.
- **Grocery list**: add a whole recipe or single ingredients. The same ingredient from different recipes is combined ("2 bell peppers"), US units are converted and summed (1 cup + 4 tbsp → 1¼ cups), and items are grouped by store aisle. Syncs across connected devices.
- **Collections**: save recipes into named groups (like "Angela's Favorites") with the Save button on any recipe; browse them from the Collections row at the top of the recipes page
- **Print / Save as PDF** for one recipe, or **Print all** for the whole book (one recipe per page)
- **Export CSV**: one row per recipe with ingredients written out, for Google Sheets, Notion, or a document
- **Light / dark mode**: follows your device, or pick one with the moon/sun button in the header (remembered per device)

## Project layout

```
index.html                  Page shell (header, navigation)
css/styles.css              All styling; colors are CSS variables at the top
js/app.js                   Router and startup
js/store.js                 Loads/saves recipes, ingredients, and the grocery list
js/github.js                GitHub API: reading files and saving commits
js/units.js                 US units: parsing amounts, fractions, merging for the grocery list
js/csv.js                   CSV reader/writer
js/ui.js                    Small DOM helpers
js/views/*.js               One file per page (list, recipe, form, grocery, settings, print)
data/recipes.csv            One row per recipe
data/ingredients.csv        Master ingredient list
data/recipe_ingredients.csv Which ingredients (and how much) each recipe uses
data/recipe-photos/         Photos uploaded from the site (resized to 1600px, JPEG)
data/collections.csv        One row per collection; `recipes` lists recipe ids, comma-separated
.nojekyll                   Tells GitHub Pages to serve files as-is
```

Page addresses: `#/` (list), `#/recipe/<id>`, `#/new`, `#/edit/<id>`, `#/grocery`, `#/settings`, `#/print-all`.

## Data format

The data is split into three linked tables so ingredients can be counted and combined. All three open in Excel or Google Sheets and import into Notion.

**`data/recipes.csv`**: one row per recipe

| Column | Notes |
| --- | --- |
| `id` | Unique, URL-friendly (e.g. `banana-bread`). Set automatically; keep it stable so links keep working. |
| `name`, `category` | |
| `servings`, `prep_minutes`, `cook_minutes` | Numbers |
| `tags` | Comma-separated: `quick, vegetarian` |
| `instructions` | One step per line (a multi-line cell) |
| `notes`, `source` | Free text / URL |
| `image` | A photo URL, or `data/recipe-photos/<file>.jpg` for photos uploaded from the site |

**`data/ingredients.csv`**: every ingredient once

| Column | Notes |
| --- | --- |
| `id` | e.g. `bell-pepper` |
| `name` | e.g. `bell pepper` |
| `plural` | Optional, e.g. `bell peppers`. Used for "2 bell peppers" and to match pasted text. |
| `aisle` | Groups the grocery list: Produce, Meat & Seafood, Dairy & Eggs, Bakery, Pantry, Baking, Spices, Canned & Jarred, Frozen, Beverages, Household, Other |

**`data/recipe_ingredients.csv`**: one row per ingredient per recipe

| Column | Notes |
| --- | --- |
| `recipe_id`, `ingredient_id` | Links to the two tables above |
| `position` | Order in the recipe |
| `quantity` | Decimal (`0.5`, `1.25`); blank for "to taste" |
| `unit` | Blank for a count, or one of: tsp, tbsp, cup, fl oz, pint, quart, gallon, oz, lb, pinch, dash, clove, can, jar, package, bunch, head, slice, stick, sprig, piece |
| `note` | Preparation, e.g. `diced` |

You can edit these files by hand too; extra columns you add are kept when the site saves.

**Grocery lists** are stored in `grocery/<list name>.csv` on a separate branch called `grocery-lists`, created automatically on first use. Keeping them off `main` means checking items off doesn't clutter your recipe history or trigger a site rebuild on every tap.

## Connecting a device (to save recipes and sync the grocery list)

Anyone can view the site. To make changes, each device needs a GitHub access key, entered once in **Settings** (gear icon). The key is stored only in that browser.

1. Go to <https://github.com/settings/personal-access-tokens/new>.
2. Name it (e.g. *Recipe Book*) and pick an expiration.
3. **Repository access** → *Only select repositories* → this repository.
4. **Permissions → Repository permissions → Contents** → *Read and write*.
5. Generate, copy, and paste it into the site's Settings page.

Every save is a normal commit, so any change can be viewed or undone from the repository's history on GitHub.

### A second person's grocery list

In Settings, **List name** picks which grocery list the device uses. Devices with the same name share one list; setting a different name (e.g. `sam`) on another person's device gives them their own list. Their device also needs an access key. The simplest option is a second key made from your account using the steps above, so you can revoke it separately.

To delete a list you no longer need, open **Settings → Your grocery lists**. You can't delete the list the device is currently using, so switch it to another list first.

## Previewing locally

Browsers don't let a page read files when it's opened straight from disk, so serve it over HTTP:

- **VS Code:** install the *Live Server* extension, right-click `index.html` → **Open with Live Server**.
- **Python:** `python -m http.server 8000`, then open <http://localhost:8000>.

## Publishing on GitHub Pages

1. Create a public repository on GitHub and push this folder to it.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, choose your branch (`main` or `master`) and `/ (root)`, and save.
3. The site will be live at `https://<username>.github.io/<repo-name>/` within a minute or two.

On `*.github.io` addresses, the Settings page fills in the username and repository name for you.
