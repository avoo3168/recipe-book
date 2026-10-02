// Small DOM and formatting helpers shared by the views.

// h("div", { class: "x", onclick: fn }, child, "text", ...)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = value;
    else if (key === "value") el.value = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false || child === "") continue;
    el.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return el;
}

export function formatMinutes(total) {
  if (!total) return "";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export function isSafeUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url, location.href).protocol);
  } catch {
    return false;
  }
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3500);
}

export function downloadFile(filename, text, type = "text/csv") {
  // The BOM makes Excel read the file as UTF-8 so fractions like ½ survive.
  const url = URL.createObjectURL(new Blob(["﻿", text], { type: `${type};charset=utf-8` }));
  const link = h("a", { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Stable tint per category so cards without photos still look distinct.
export function tintFor(text) {
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `tint-${hash % 5}`;
}

export function clearSearch() {
  const search = document.getElementById("search");
  if (!search.value) return;
  search.value = "";
  search.dispatchEvent(new Event("input"));
}

export function searchFor(text) {
  const search = document.getElementById("search");
  search.value = text;
  location.hash = "#/";
  search.dispatchEvent(new Event("input"));
}
