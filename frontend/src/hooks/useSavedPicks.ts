import { useState } from "react";
import type { SavedPick } from "../types";

const savedKey = "tasteshift.saved.v1";
const limit = 100;

function readSaved(): SavedPick[] {
  try {
    const raw = JSON.parse(localStorage.getItem(savedKey) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (value) =>
          value &&
          typeof value.preview === "boolean" &&
          (value.discoveryId === null ||
            typeof value.discoveryId === "string") &&
          typeof value.pick?.entity?.id === "string" &&
          typeof value.pick.entity.name === "string" &&
          ["artist", "movie", "book"].includes(value.pick.entity.category) &&
          typeof value.pick.explanation === "string" &&
          Array.isArray(value.pick.shared_tags),
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Saved picks kept on this device. `save` reports whether storage persisted them. */
export function useSavedPicks() {
  const [saved, setSaved] = useState<SavedPick[]>(readSaved);
  function save(entry: SavedPick): boolean {
    const next = [
      entry,
      ...saved.filter((item) => item.pick.entity.id !== entry.pick.entity.id),
    ].slice(0, limit);
    setSaved(next);
    try {
      localStorage.setItem(savedKey, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }
  const isSaved = (entityId: string) =>
    saved.some((item) => item.pick.entity.id === entityId);
  return { saved, save, isSaved };
}
