"use client";

import { useEffect, useRef } from "react";
import type { KeyboardSnapshot } from "@/lib/earlink-keyboard-protocol";
import { decodeKoreanBraille } from "@/lib/korean-braille-input";

const HEARTBEAT_MS = 2000;

/** Share the keyboard user's draft separately from the screen user's composer. */
export function useBrailleTyping({ enabled, snapshot, publish }: {
  enabled: boolean;
  snapshot: KeyboardSnapshot | null;
  publish: (active: boolean, content?: string) => boolean;
}) {
  const activity = useRef({ signature: "", active: false, content: "", publishedAt: 0 });

  useEffect(() => {
    if (!enabled) return;
    const state = activity.current;
    const signature = snapshot ? `${snapshot.bootId}:${snapshot.cells.join(",")}:${Boolean(snapshot.requestId)}` : "";
    const changed = signature !== state.signature;
    state.signature = signature;

    if (!snapshot?.cells.length || snapshot.requestId) {
      if (state.active) publish(false);
      state.active = false;
      state.content = "";
      return;
    }
    if (!changed) return;
    state.content = decodeKoreanBraille(snapshot.cells).text;
    publish(true, state.content);
    state.publishedAt = Date.now();
    state.active = true;
  }, [enabled, snapshot, publish]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const state = activity.current;
      // Keep a paused draft visible until it is sent, erased or disconnected.
      if (state.active && Date.now() - state.publishedAt >= HEARTBEAT_MS) {
        publish(true, state.content);
        state.publishedAt = Date.now();
      }
    }, 500);
    return () => {
      window.clearInterval(timer);
      if (activity.current.active) publish(false);
      activity.current = { signature: "", active: false, content: "", publishedAt: 0 };
    };
  }, [enabled, publish]);
}
