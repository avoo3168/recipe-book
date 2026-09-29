# Recipe Book

A personal recipe book that runs as a static site on GitHub Pages. It has no build step and no dependencies. Recipes are read from `data/recipes.csv` each time the page loads.

## Project layout

```
index.html          Page shell (header, search, main view)
css/styles.css      All styling; colors are CSS variables at the top
js/app.js           Loads the CSV, renders the list and recipe pages, handles routing
js/csv.js           CSV parser (quoted fields, commas and line breaks inside quotes)
data/recipes.csv    Your recipes
.nojekyll           Tells GitHub Pages to serve files as-is
```

Pages use hash URLs, so every recipe has a link you can share or bookmark:

- `#/` shows the recipe list
- `#/recipe/<id>` shows one recipe

## Adding recipes

Add one row per recipe to `data/recipes.csv`. Keep the header row unchanged.

| Column | Required | Notes |
| --- | --- | --- |
| `id` | yes | Unique, URL-friendly, e.g. `banana-bread`. Don't change it once shared, or old links break. |
| `name` | yes | Recipe title |
| `category` | | Used for the filter chips, e.g. `Dinner`, `Baking` |
| `servings` | | Number |
| `prep_minutes`, `cook_minutes` | | Numbers; total time is calculated |
| `tags` | | Separated by `\|`, e.g. `quick\|vegetarian` |
| `ingredients` | | One ingredient per item, separated by `\|` |
| `instructions` | | One step per item, separated by `\|` |
| `notes` | | Free text |
| `source` | | A URL (http/https) |
| `image` | | Image URL. Leave blank for a colored placeholder. |

If a field contains a comma, wrap it in double quotes. To include a double quote inside a quoted field, type it twice (`""`). Excel and Google Sheets handle both automatically when you save as CSV. The same applies to `|`: it always marks the start of a new item, so don't use it inside an item.

## Previewing locally

Browsers don't let a page read a CSV file when it's opened straight from disk, so the site needs to be served over HTTP. Pick one:

- **VS Code:** install the *Live Server* extension, right-click `index.html`, and choose **Open with Live Server**.
- **Python:** run `python -m http.server 8000` in this folder, then open <http://localhost:8000>.

## Publishing on GitHub Pages

1. Create a repository on GitHub and push this folder to it.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. The site will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

After editing `recipes.csv`, commit and push; the site updates on its own.
