import type { CSSProperties } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { assetFor, positions } from "../lib/planets";
import { LEVELS, categoryLabel, type Level, type Pick } from "../types";

export function OrbitSystem({
  picks,
  level,
  selectedId,
  busy,
  empty,
  onSelect,
  onEditInterests,
}: {
  picks: Pick[];
  level: Level;
  selectedId: string | undefined;
  busy: boolean;
  empty: boolean;
  onSelect: (pick: Pick) => void;
  onEditInterests: () => void;
}) {
  // Wilder levels push planets slightly further from the sun.
  const expansion = [0.92, 0.96, 1, 1.04][LEVELS.indexOf(level)];
  return (
    <div className="system" data-level={level}>
      <img
        className="orbit-lines"
        src="/assets/orbits.webp"
        alt=""
        draggable="false"
      />
      <div className="sun">
        <img src="/assets/sun.webp" alt="" draggable="false" />
        <span>Your taste</span>
      </div>
      <div className="planets" aria-label="Discoveries">
        {picks.slice(0, 6).map((pick, index) => {
          const [x, y, size] = positions[index];
          const isSelected = selectedId === pick.entity.id;
          const style = {
            "--x": `${50 + (x - 50) * expansion}%`,
            "--y": `${48 + (y - 48) * expansion}%`,
            "--planet-size": `${size}px`,
            "--delay": `${index * 90}ms`,
            "--float-delay": `${-index * 2}s`,
          } as CSSProperties;
          return (
            <button
              className={`planet ${isSelected ? "is-selected" : ""} ${index < 2 ? "label-above" : ""}`}
              style={style}
              key={pick.entity.id}
              aria-pressed={isSelected}
              aria-label={`Select ${pick.entity.name}, ${categoryLabel[pick.entity.category]}`}
              title={pick.entity.name}
              onClick={() => onSelect(pick)}
            >
              <span className="planet-body">
                <img src={assetFor(index)} alt="" draggable="false" />
              </span>
              <span className="planet-name">{pick.entity.name}</span>
              <span className="mobile-category">
                {categoryLabel[pick.entity.category]}
              </span>
            </button>
          );
        })}
      </div>
      <span className="orbit-caption">
        Further from familiar. <ArrowRight size={20} weight="light" />
      </span>
      {busy && (
        <div className="loading-state" role="status">
          <span>Finding your next orbit…</span>
          <small>Connecting your interests. This can take a moment.</small>
        </div>
      )}
      {!busy && empty && (
        <div className="loading-state">
          <span>No discoveries this time.</span>
          <small>Try different interests or another exploration level.</small>
          <button className="text-button" onClick={onEditInterests}>
            Edit my interests
          </button>
        </div>
      )}
    </div>
  );
}
