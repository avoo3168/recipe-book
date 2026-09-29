// Light / dark appearance. "system" follows the device setting; "light" and "dark" override it.
// The choice is remembered per browser. A small inline script in index.html applies it
// before the page paints, so there's no flash of the wrong theme.

const STORAGE_KEY = "recipe-book:theme";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function effectiveTheme() {
  const preference = getThemePreference();
  return preference === "system" ? (systemDark.matches ? "dark" : "light") : preference;
}

const listeners = new Set();
export function onThemeChange(listener) {
  listeners.add(listener);
}

function apply() {
  const preference = getThemePreference();
  if (preference === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = preference;
  listeners.forEach((listener) => listener(effectiveTheme()));
}

export function setThemePreference(preference) {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {}
  apply();
}

export function toggleTheme() {
  setThemePreference(effectiveTheme() === "dark" ? "light" : "dark");
}

systemDark.addEventListener("change", apply);
