import { useEffect, useRef, useState } from "react";
import { createDiscovery } from "../api";
import type { Discovery, Entity, Level } from "../types";

interface Callbacks {
  onStart: () => void;
  onSuccess: (result: Discovery) => void;
  onError: (message: string) => void;
}

/**
 * Builds live discoveries. A retried request keeps its Idempotency-Key until the
 * input changes, so a lost response replays the saved result instead of a new one.
 */
export function useDiscovery({ onStart, onSuccess, onError }: Callbacks) {
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [seeds, setSeeds] = useState<Entity[]>([]);
  const [level, setLevel] = useState<Level>("experimental");
  const [intention, setIntention] = useState("");
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const requestKey = useRef<{ input: string; key: string } | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  async function discover(
    nextSeeds: Entity[],
    nextLevel: Level,
    nextIntention: string,
  ) {
    if (nextSeeds.length < 3 || pendingRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    pendingRef.current = true;
    const input = JSON.stringify({
      seeds: nextSeeds.map((seed) => seed.id),
      level: nextLevel,
      intention: nextIntention.trim(),
    });
    if (requestKey.current?.input !== input)
      requestKey.current = { input, key: crypto.randomUUID() };
    onStart();
    setBusy(true);
    retryRef.current = () => {
      void discover(nextSeeds, nextLevel, nextIntention);
    };
    try {
      const result = await createDiscovery(
        nextSeeds,
        nextLevel,
        nextIntention,
        requestKey.current!.key,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setDiscovery(result);
      setSeeds(nextSeeds);
      setLevel(result.level);
      setIntention(nextIntention);
      requestKey.current = null;
      retryRef.current = null;
      onSuccess(result);
    } catch (error) {
      if (!controller.signal.aborted)
        onError(
          error instanceof Error
            ? error.message
            : "Could not build your system.",
        );
    } finally {
      pendingRef.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return {
    discovery,
    seeds,
    level,
    setLevel,
    intention,
    busy,
    discover,
    retry: retryRef,
  };
}
