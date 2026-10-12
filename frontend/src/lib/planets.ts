import { categoryLabel, type Entity } from "../types";

const planetAssets = [
  "planet-violet",
  "planet-ice",
  "planet-rust",
  "planet-moon",
  "planet-ocean",
  "planet-jupiter",
];
// [x %, y %, size px] for the six orbit slots.
export const positions = [
  [42, 20, 132],
  [82, 32, 112],
  [12, 39, 90],
  [19, 70, 90],
  [48, 83, 148],
  [78, 66, 156],
];
export const assetFor = (index: number) =>
  `/assets/${planetAssets[index % planetAssets.length]}.webp`;
export const webSearchUrl = (entity: Entity) =>
  `https://www.google.com/search?${new URLSearchParams({ q: `${entity.name} ${categoryLabel[entity.category]}` })}`;
