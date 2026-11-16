"use client";

import { useCallback, useEffect, useRef } from "react";

/*
 * 받은 메시지를 소리로 읽어 준다 (브라우저 speechSynthesis, ko-KR).
 *
 * hold(true)인 동안(마이크로 듣는 중)에는 읽지 않고 모아 두었다가
 * hold(false)가 되면 이어서 읽는다. 내 마이크가 읽는 소리를 듣지 않게 하기 위함.
 */
export function useSpeechOutput() {
  const holdRef = useRef(false);
  const pendingRef = useRef<string[]>([]);
  const speakingRef = useRef<string | null>(null);

  const speakNow = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.onstart = () => { speakingRef.current = text; };
    utterance.onend = () => { if (speakingRef.current === text) speakingRef.current = null; };
    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((text: string) => {
    if (holdRef.current) {
      pendingRef.current.push(text);
      return;
    }
    speakNow(text);
  }, [speakNow]);

  const hold = useCallback((held: boolean) => {
    if (holdRef.current === held) return;
    holdRef.current = held;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (held) {
      // 읽던 문장은 듣기가 끝난 뒤 처음부터 다시 읽는다.
      const interrupted = speakingRef.current;
      speakingRef.current = null;
      window.speechSynthesis.cancel();
      if (interrupted) pendingRef.current.unshift(interrupted);
      return;
    }

    const queued = pendingRef.current;
    pendingRef.current = [];
    for (const text of queued) speakNow(text);
  }, [speakNow]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return { speak, hold };
}
