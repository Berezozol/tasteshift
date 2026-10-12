import { useRef, useState } from "react";
import { BookmarkSimple, Pause, Play } from "@phosphor-icons/react";
import { sendFeedback } from "./api";
import { DetailPanel } from "./components/DetailPanel";
import { LevelSelector, StartingPoint } from "./components/Controls";
import { OrbitSystem } from "./components/OrbitSystem";
import { PickDialog } from "./components/PickDialog";
import { SavedDialog } from "./components/SavedDialog";
import { SeedPicker } from "./components/SeedPicker";
import { useDiscovery } from "./hooks/useDiscovery";
import { useMotion, useParallax } from "./hooks/useMotion";
import { useSavedPicks } from "./hooks/useSavedPicks";
import { previewPicks, previewSeeds } from "./preview";
import type { Feedback, Pick } from "./types";

export function App() {
  const [selectedId, setSelectedId] = useState(previewPicks[0].entity.id);
  const [picker, setPicker] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const workspaceRef = useRef<HTMLElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const motion = useMotion();
  useParallax(workspaceRef, motion.motionOff);
  const { saved, save, isSaved } = useSavedPicks();
  const live = useDiscovery({
    onStart: () => {
      setPicker(false);
      setError("");
      setNotice("");
    },
    onSuccess: (result) => {
      setSelectedId(result.items[0]?.entity.id || "");
      setDetailOpen(false);
    },
    onError: setError,
  });
  const { discovery, level, busy } = live;
  const isPreview = !discovery;
  const picks = discovery ? discovery.items : previewPicks;
  const selected =
    picks.find((pick) => pick.entity.id === selectedId) || picks[0];
  const selectedIndex = selected ? Math.max(0, picks.indexOf(selected)) : 0;
  const selectedSaved = !!selected && isSaved(selected.entity.id);

  function select(pick: Pick) {
    setSelectedId(pick.entity.id);
    setNotice("");
    if (window.matchMedia("(max-width: 850px)").matches)
      detailRef.current?.scrollIntoView({
        behavior: motion.motionOff ? "instant" : "smooth",
        block: "start",
      });
  }

  async function feedback(action: Feedback) {
    if (!selected || feedbackBusy) return;
    setFeedbackBusy(true);
    setError("");
    try {
      if (discovery)
        await sendFeedback(discovery.id, selected.entity.id, action);
      if (action === "save") {
        const stored = save({
          pick: selected,
          discoveryId: discovery?.id || null,
          preview: isPreview,
        });
        setNotice(
          !stored
            ? "Saved for this visit. Device storage is unavailable."
            : isPreview
              ? "Sample pick saved on this device."
              : "Saved to your discoveries.",
        );
      } else
        setNotice(
          action === "not_for_me"
            ? "Noted. This will shape your next discovery."
            : "Noted. Next time we’ll look for something new.",
        );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save your feedback.",
      );
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <div className="app-shell" data-motion-off={motion.motionOff}>
      <a className="skip-link" href="#starting-point">
        Skip to controls
      </a>
      <header className="brand-header">
        <a
          href="#"
          className="wordmark"
          aria-label="TasteShift home"
          onClick={(event) => {
            event.preventDefault();
            setDetailOpen(false);
            setSavedOpen(false);
          }}
        >
          TasteShift
        </a>
      </header>
      <nav className="top-actions" aria-label="Your discoveries">
        <button className="saved-button" onClick={() => setSavedOpen(true)}>
          Saved
          {saved.length > 0 && (
            <span className="saved-count">{saved.length}</span>
          )}
          <BookmarkSimple size={21} weight="light" />
        </button>
        <button
          className="icon-button motion-toggle"
          onClick={() => motion.setPaused(!motion.paused)}
          aria-label={motion.paused ? "Resume animations" : "Pause animations"}
          aria-pressed={motion.paused}
          disabled={motion.reduced}
          title={
            motion.reduced
              ? "Reduced motion is enabled on your device"
              : motion.paused
                ? "Resume animations"
                : "Pause animations"
          }
        >
          {motion.paused || motion.reduced ? (
            <Play size={17} />
          ) : (
            <Pause size={17} />
          )}
        </button>
      </nav>
      <main
        className="workspace"
        ref={workspaceRef}
        aria-label="Your discovery system"
        aria-busy={busy}
      >
        <div className="space-backdrop" aria-hidden="true" />
        <OrbitSystem
          picks={picks}
          level={level}
          selectedId={selected?.entity.id}
          busy={busy}
          empty={!!discovery && picks.length === 0}
          onSelect={select}
          onEditInterests={() => setPicker(true)}
        />
        <StartingPoint
          seeds={isPreview ? previewSeeds : live.seeds}
          isPreview={isPreview}
          busy={busy}
          onEdit={() => setPicker(true)}
        />
        <LevelSelector
          level={level}
          busy={busy}
          onChange={(value) => {
            if (isPreview) live.setLevel(value);
            else void live.discover(live.seeds, value, live.intention);
          }}
        />
      </main>
      <DetailPanel
        panelRef={detailRef}
        selected={selected}
        isPreview={isPreview}
        isSaved={selectedSaved}
        limitedCoverage={
          !!discovery?.coverage.some((item) => !item.exploration_supported)
        }
        busy={busy}
        feedbackBusy={feedbackBusy}
        error={error}
        notice={notice}
        onRetry={live.retry.current}
        onExplore={() => setDetailOpen(true)}
        onSave={() => void feedback("save")}
        onChooseInterests={() => setPicker(true)}
      />
      {picker && (
        <SeedPicker
          initial={live.seeds}
          level={level}
          initialIntention={live.intention}
          onClose={() => setPicker(false)}
          onDiscover={(draft, text) => void live.discover(draft, level, text)}
        />
      )}
      {savedOpen && (
        <SavedDialog saved={saved} onClose={() => setSavedOpen(false)} />
      )}
      {detailOpen && selected && (
        <PickDialog
          pick={selected}
          index={selectedIndex}
          isPreview={isPreview}
          agent={discovery?.agent}
          feedbackBusy={feedbackBusy}
          error={error}
          notice={notice}
          onFeedback={(action) => void feedback(action)}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}
