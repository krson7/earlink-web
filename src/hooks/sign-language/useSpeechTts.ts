"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { isCompleteKoreanSyllable } from "@/lib/sign-language/utils";

export function useSpeechTts() {
  const [ttsEnabled, setTtsEnabled] =
    useState(true);

  const ttsEnabledRef = useRef(true);
  const lastSpokenComposedRef =
    useRef("");

  const pickKoreanVoice =
    useCallback(
      (): SpeechSynthesisVoice | null => {
        if (
          !("speechSynthesis" in window)
        ) {
          return null;
        }

        const koreanVoices =
          window.speechSynthesis
            .getVoices()
            .filter((voice) =>
              voice.lang.startsWith("ko"),
            );

        return (
          koreanVoices.find(
            (voice) =>
              voice.localService,
          ) ??
          koreanVoices[0] ??
          null
        );
      },
      [],
    );

  const speak = useCallback(
    (text: string): void => {
      if (
        !ttsEnabledRef.current ||
        !text ||
        !("speechSynthesis" in window)
      ) {
        return;
      }

      window.speechSynthesis.cancel();

      const utterance =
        new SpeechSynthesisUtterance(
          text,
        );

      utterance.lang = "ko-KR";

      const voice =
        pickKoreanVoice();

      if (voice) {
        utterance.voice = voice;
      }

      window.speechSynthesis.speak(
        utterance,
      );
    },
    [pickKoreanVoice],
  );

  const handleComposedText =
    useCallback(
      (nextText: string): void => {
        if (
          !nextText ||
          nextText ===
            lastSpokenComposedRef.current
        ) {
          return;
        }

        const completed = [
          ...nextText,
        ].filter(
          isCompleteKoreanSyllable,
        );

        const previousCompleted = [
          ...lastSpokenComposedRef.current,
        ].filter(
          isCompleteKoreanSyllable,
        );

        if (
          completed.length >
          previousCompleted.length
        ) {
          speak(
            completed[
              completed.length - 1
            ],
          );
        }

        lastSpokenComposedRef.current =
          nextText;
      },
      [speak],
    );

  const resetSpeechTracking =
    useCallback((): void => {
      lastSpokenComposedRef.current =
        "";
    }, []);

  const cancelSpeech =
    useCallback((): void => {
      if (
        "speechSynthesis" in window
      ) {
        window.speechSynthesis.cancel();
      }
    }, []);

  const toggleTts =
    useCallback((): void => {
      setTtsEnabled((previous) => {
        const next = !previous;

        ttsEnabledRef.current = next;

        if (!next) {
          cancelSpeech();
        }

        return next;
      });
    }, [cancelSpeech]);

  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, [cancelSpeech]);

  return {
    ttsEnabled,
    handleComposedText,
    resetSpeechTracking,
    cancelSpeech,
    toggleTts,
  };
}