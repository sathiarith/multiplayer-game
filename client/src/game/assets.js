import { ANIMS } from "./animation.js";
import { buildLevel } from "../../../shared/map.js";

export async function loadLevel(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load map: HTTP ${res.status}`);
  return buildLevel(await res.json());
}

// Resolves once the image has loaded (images load asynchronously).
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src; // set last: loading starts as soon as src is assigned
  });
}

// { idle: <img or null>, run: <img or null> }. A sheet that fails to load
// becomes null, and the renderer draws a placeholder for it.
export async function loadSheets(baseUrl = "/sprites/") {
  const entries = await Promise.all(
    Object.entries(ANIMS).map(async ([name, a]) => {
      try {
        return [name, await loadImage(`${baseUrl}${a.file}`)];
      } catch {
        return [name, null];
      }
    }),
  );
  const sheets = Object.fromEntries(entries);

  if (Object.values(sheets).includes(null)) {
    console.warn(
      "Some sprite sheets are missing, so placeholders will be drawn. " +
        "See CREDITS.md for where to download them.",
    );
  }
  return sheets;
}
