import { useEffect, useState, type RefObject } from "react";

const reducedQuery = "(prefers-reduced-motion: reduce)";

/** Animation is off when paused by the user, reduced by the OS, or the tab is hidden. */
export function useMotion() {
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [reduced, setReduced] = useState(
    () => window.matchMedia(reducedQuery).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(reducedQuery);
    const onMotion = () => setReduced(query.matches);
    const onVisibility = () => setHidden(document.hidden);
    query.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      query.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return {
    paused,
    setPaused,
    reduced,
    motionOff: paused || reduced || hidden,
  };
}

/** Subtle mouse parallax through the --parallax-x/y custom properties. */
export function useParallax(
  ref: RefObject<HTMLElement | null>,
  disabled: boolean,
) {
  useEffect(() => {
    const workspace = ref.current;
    if (!workspace || disabled) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = workspace.getBoundingClientRect();
        workspace.style.setProperty(
          "--parallax-x",
          `${((event.clientX - rect.left) / rect.width - 0.5) * 8}px`,
        );
        workspace.style.setProperty(
          "--parallax-y",
          `${((event.clientY - rect.top) / rect.height - 0.5) * 8}px`,
        );
      });
    };
    const reset = () => {
      workspace.style.setProperty("--parallax-x", "0px");
      workspace.style.setProperty("--parallax-y", "0px");
    };
    workspace.addEventListener("pointermove", move);
    workspace.addEventListener("pointerleave", reset);
    return () => {
      cancelAnimationFrame(frame);
      workspace.removeEventListener("pointermove", move);
      workspace.removeEventListener("pointerleave", reset);
      reset();
    };
  }, [ref, disabled]);
}
