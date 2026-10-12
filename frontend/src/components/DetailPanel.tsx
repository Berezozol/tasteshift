import type { Ref } from "react";
import { ArrowRight, BookmarkSimple } from "@phosphor-icons/react";
import { categoryLabel, type Pick } from "../types";

export function DetailPanel({
  panelRef,
  selected,
  isPreview,
  isSaved,
  limitedCoverage,
  busy,
  feedbackBusy,
  error,
  notice,
  onRetry,
  onExplore,
  onSave,
  onChooseInterests,
}: {
  panelRef: Ref<HTMLElement>;
  selected: Pick | undefined;
  isPreview: boolean;
  isSaved: boolean;
  limitedCoverage: boolean;
  busy: boolean;
  feedbackBusy: boolean;
  error: string;
  notice: string;
  onRetry: (() => void) | null;
  onExplore: () => void;
  onSave: () => void;
  onChooseInterests: () => void;
}) {
  return (
    <aside
      ref={panelRef}
      className="detail-panel"
      aria-label="Selected discovery"
    >
      {selected ? (
        <div className="detail-content" key={selected.entity.id}>
          <span className="eyebrow category-eyebrow">
            {categoryLabel[selected.entity.category]}
          </span>
          <h1 className={selected.entity.name.length > 18 ? "long-title" : ""}>
            {selected.entity.name}
          </h1>
          <p className="pick-subtitle">
            {isPreview && selected.entity.id === "sample-portishead"
              ? "A darker turn from familiar sounds."
              : selected.entity.description
                ? selected.entity.description
                : "A new corner of your taste."}
          </p>
          <section className="reason">
            <h2 className="eyebrow">Why this appeared</h2>
            <p>
              {isPreview
                ? "Sample pick — choose your interests."
                : selected.explanation}
            </p>
          </section>
          <button
            className="primary-button explore-button"
            onClick={onExplore}
            disabled={busy}
          >
            Explore this pick
            <ArrowRight size={26} weight="light" />
          </button>
          <button
            className="save-pick"
            onClick={onSave}
            disabled={feedbackBusy || isSaved || busy}
          >
            <BookmarkSimple size={25} weight={isSaved ? "fill" : "light"} />
            {isSaved ? "Saved" : feedbackBusy ? "Saving…" : "Save"}
          </button>
          {limitedCoverage && (
            <p className="coverage-note">
              Some categories have limited exploration data. Picks may stay the
              same across levels.
            </p>
          )}
        </div>
      ) : (
        <div className="empty-detail">
          <span className="eyebrow">A little further</span>
          <h1>Something new is out there.</h1>
          <button className="primary-button" onClick={onChooseInterests}>
            Choose your interests
            <ArrowRight size={22} />
          </button>
        </div>
      )}
      {(error || notice) && (
        <div className="status-message" aria-live="polite">
          {error ? (
            <>
              <p role="alert">{error}</p>
              {onRetry && !busy && (
                <button className="text-button" onClick={onRetry}>
                  Try again
                  <ArrowRight size={16} />
                </button>
              )}
            </>
          ) : (
            <p>{notice}</p>
          )}
        </div>
      )}
    </aside>
  );
}
