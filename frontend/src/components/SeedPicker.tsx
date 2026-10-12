import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  MagnifyingGlass,
  Plus,
  X,
} from "@phosphor-icons/react";
import { searchEntities } from "../api";
import {
  categoryLabel,
  type Category,
  type Entity,
  type Level,
} from "../types";
import { Dialog } from "./Dialog";

export function SeedPicker({
  initial,
  level,
  initialIntention,
  onClose,
  onDiscover,
}: {
  initial: Entity[];
  level: Level;
  initialIntention: string;
  onClose: () => void;
  onDiscover: (seeds: Entity[], intention: string) => void;
}) {
  const [seeds, setSeeds] = useState(initial);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("artist");
  const [results, setResults] = useState<Entity[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [intention, setIntention] = useState(initialIntention);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    setError("");
    setSearching(false);
    if (query.trim().length < 2) return;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const entities = await searchEntities(
          query.trim(),
          category,
          controller.signal,
        );
        if (!controller.signal.aborted) setResults(entities);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Search is unavailable.",
          );
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, category]);
  return (
    <Dialog
      title="Your starting point"
      onClose={onClose}
      className="seed-dialog"
    >
      <p className="dialog-intro">
        Pick 3–5 artists, films or books you love. We’ll find the connections
        between them.
      </p>
      <div className="draft-seeds" aria-label="Selected interests">
        {seeds.map((seed) => (
          <button
            className="seed-chip"
            key={seed.id}
            onClick={() =>
              setSeeds(seeds.filter((item) => item.id !== seed.id))
            }
            aria-label={`Remove ${seed.name}`}
          >
            {seed.name}
            <X size={14} />
          </button>
        ))}
        {!seeds.length && (
          <span className="muted">Your interests will appear here.</span>
        )}
      </div>
      <div className="category-switch" aria-label="Search category">
        {(["artist", "movie", "book"] as Category[]).map((value) => (
          <button
            key={value}
            aria-pressed={category === value}
            onClick={() => setCategory(value)}
          >
            {categoryLabel[value]}
            {value === "movie" || value === "book" ? "s" : ""}
          </button>
        ))}
      </div>
      <label className="search-field">
        <MagnifyingGlass size={20} />
        <input
          ref={inputRef}
          autoFocus
          maxLength={120}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${category === "artist" ? "an artist" : category === "movie" ? "a film" : "a book"}…`}
          aria-label="Search your interests"
        />
      </label>
      <div className="search-results" aria-live="polite" aria-busy={searching}>
        {searching ? (
          <p className="muted">Searching the catalog…</p>
        ) : error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : results.length ? (
          results.map((entity) => {
            const added = seeds.some((seed) => seed.id === entity.id);
            return (
              <button
                key={entity.id}
                className="search-result"
                disabled={added || seeds.length >= 5}
                onClick={() => {
                  setSeeds([...seeds, entity]);
                  setQuery("");
                  // Keep typing the next interest without reaching for the mouse.
                  inputRef.current?.focus();
                }}
              >
                <span>
                  <strong>{entity.name}</strong>
                  <small>{categoryLabel[entity.category]}</small>
                </span>
                {added ? <Check size={20} /> : <Plus size={20} />}
              </button>
            );
          })
        ) : query.trim().length >= 2 ? (
          <p className="muted">
            No matches. Try a different title or category.
          </p>
        ) : (
          <p className="muted">
            Try David Bowie, Spirited Away or a favourite book.
          </p>
        )}
      </div>
      <label className="intention-field">
        Something in mind?{" "}
        <span className="muted">Optional · uses the experience planner</span>
        <textarea
          value={intention}
          onChange={(event) => setIntention(event.target.value)}
          maxLength={600}
          rows={2}
          placeholder="A quiet evening with something unfamiliar…"
        />
      </label>
      <div className="dialog-footer">
        <span className="muted">
          {seeds.length} of 5 interests · {level}
        </span>
        <button
          className="primary-button"
          disabled={seeds.length < 3 || intention.trim().length === 1}
          onClick={() => onDiscover(seeds, intention)}
        >
          Build my system <ArrowRight size={22} />
        </button>
      </div>
    </Dialog>
  );
}
