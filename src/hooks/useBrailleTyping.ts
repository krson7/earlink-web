"use client";

import { useEffect, useRef } from "react";
import type { KeyboardSnapshot } from "@/lib/earlink-keyboard-protocol";

const IDLE_MS = 5000;
const HEARTBEAT_MS = 2000;

/** Only physical keyboard edits count as typing. Periodic BLE syncs do not. */
export function useBrailleTyping({ enabled, snapshot, publish }: {
  enabled: boolean;
  snapshot: KeyboardSnapshot | null;
  publish: (active: boolean) => boolean;
}) {
  const activity = useRef({ signature: "", active: false, editedAt: 0, publishedAt: 0 });

  useEffect(() => {
    if (!enabled) return;
    const state = activity.current;
    const signature = snapshot ? `${snapshot.bootId}:${snapshot.cells.join(",")}` : "";
    const changed = signature !== state.signature;
    state.signature = signature;

    if (!snapshot?.cells.length || snapshot.requestId) {
      if (state.active) publish(false);
      state.active = false;
      return;
    }
    if (!changed) return;
    state.editedAt = Date.now();
    if (!state.active || state.editedAt - state.publishedAt >= HEARTBEAT_MS) {
      publish(true);
      state.publishedAt = state.editedAt;
    }
    state.active = true;
  }, [enabled, snapshot, publish]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const state = activity.current;
      if (!state.active) return;
      const now = Date.now();
      if (now - state.editedAt >= IDLE_MS) {
        publish(false);
        state.active = false;
      } else if (now - state.publishedAt >= HEARTBEAT_MS) {
        publish(true);
        state.publishedAt = now;
      }
    }, 500);
    return () => {
      window.clearInterval(timer);
      if (activity.current.active) publish(false);
      activity.current = { signature: "", active: false, editedAt: 0, publishedAt: 0 };
    };
  }, [enabled, publish]);
}
