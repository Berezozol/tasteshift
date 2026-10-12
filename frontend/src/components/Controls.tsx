import { Plus } from "@phosphor-icons/react";
import { LEVELS, type Entity, type Level } from "../types";

export function StartingPoint({
  seeds,
  isPreview,
  busy,
  onEdit,
}: {
  seeds: Entity[];
  isPreview: boolean;
  busy: boolean;
  onEdit: () => void;
}) {
  return (
    <section
      className="starting-point"
      id="starting-point"
      aria-label="Your starting point"
    >
      <div className="seed-heading">
        <span className="eyebrow">Your seeds</span>
        <span className="data-label">
          {isPreview ? "Preview · sample system" : "Live · Qloo"}
        </span>
      </div>
      <div className="seed-row">
        <div className="seed-chips">
          {seeds.map((seed) => (
            <button
              className="seed-chip"
              key={seed.id}
              onClick={onEdit}
              disabled={busy}
            >
              {seed.name}
            </button>
          ))}
        </div>
        <button className="edit-seeds" onClick={onEdit} disabled={busy}>
          {isPreview ? "Make it yours" : "Edit interests"}
          <Plus size={15} />
        </button>
      </div>
    </section>
  );
}

export function LevelSelector({
  level,
  busy,
  onChange,
}: {
  level: Level;
  busy: boolean;
  onChange: (level: Level) => void;
}) {
  return (
    <section className="exploration" aria-label="Exploration distance">
      <span className="exploration-title">Choose how far to explore</span>
      <div
        className="level-selector"
        role="group"
        aria-label="Exploration level"
      >
        {LEVELS.map((value) => (
          <button
            key={value}
            aria-pressed={level === value}
            disabled={busy}
            onClick={() => {
              if (value !== level) onChange(value);
            }}
          >
            <span className="level-dot" aria-hidden="true" />
            <span>{value[0].toUpperCase() + value.slice(1)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
