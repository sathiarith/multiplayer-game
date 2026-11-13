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

// Item pictures by item code, each with the size to draw it on the map.
// Like the character sheets, they come from the Tiny Swords pack and are
// not in git: a missing one is left out, and the game draws a colored dot.
export const ITEM_SPRITES = {
  // The coin is small inside a large, mostly empty picture, so draw it bigger.
  gold_coin: { src: "/sprites/items/gold_coin.png", size: 64 },
  meat: { src: "/sprites/items/meat.png", size: 32 },
  wood: { src: "/sprites/items/wood.png", size: 32 },
};

export async function loadItemImages(sources = ITEM_SPRITES) {
  const entries = await Promise.all(
    Object.entries(sources).map(async ([code, { src, size }]) => [
      code,
      { image: await loadImage(src).catch(() => null), size },
    ]),
  );
  return Object.fromEntries(entries.filter(([, sprite]) => sprite.image));
}

// Monster animations by monster type: a strip of square frames for each.
// Like the other art, they come from the Tiny Swords pack and are not in git:
// without an idle strip, the game draws a placeholder.
export const MONSTER_SPRITES = {
  goblin: {
    idle: "/sprites/monsters/Torch_Goblin_Idle.png",
    attack: "/sprites/monsters/Torch_Goblin_Attack.png",
    size: 96, // drawn size on the map, in pixels
  },
};

export async function loadMonsterImages(sources = MONSTER_SPRITES) {
  const entries = await Promise.all(
    Object.entries(sources).map(async ([type, { idle, attack, size }]) => {
      const [idleImage, attackImage] = await Promise.all([
        loadImage(idle).catch(() => null),
        loadImage(attack).catch(() => null),
      ]);
      return [
        type,
        { idle: idleImage, attack: attackImage ?? idleImage, size },
      ];
    }),
  );
  return Object.fromEntries(entries.filter(([, sprite]) => sprite.idle));
}
