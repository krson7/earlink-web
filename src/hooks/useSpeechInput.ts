"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * 마이크로 말한 내용을 글자로 바꾼다 (브라우저 SpeechRecognition, ko-KR).
 * 인식 중인 문장은 onText로 계속 넘겨주고, 전송은 사용자가 직접 한다.
 */

type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }>>;

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionConstructor = new () => Recognition;

function getRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

const subscribeToNothing = () => () => undefined;
const readSupport = () => getRecognition() !== null;
const readServerSupport = () => false;

function errorMessage(code: string): string | null {
  if (code === "aborted" || code === "no-speech") return null;
  if (code === "not-allowed" || code === "service-not-allowed") return "마이크 권한을 허용해 주세요.";
  if (code === "network") return "음성 인식 서버에 연결하지 못했어요.";
  return "음성을 인식하지 못했어요. 다시 말해 주세요.";
}

export function useSpeechInput(onText: (text: string) => void) {
  const supported = useSyncExternalStore(subscribeToNothing, readSupport, readServerSupport);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const start = useCallback(() => {
    const Recognition = getRecognition();
    if (!Recognition || recognitionRef.current) return;

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      let text = "";
      for (let index = 0; index < event.results.length; index += 1) {
        text += event.results[index][0]?.transcript ?? "";
      }
      onTextRef.current(text.trim());
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      setError(errorMessage(event.error));
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = recognition;
    setError(null);
    setListening(true);

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError("음성 인식을 시작하지 못했어요.");
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // 전송 직후처럼 늦게 도착한 결과를 버려야 할 때 사용한다.
  const cancel = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.abort();
    }
    setListening(false);
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  return { supported, listening, error, start, stop, cancel };
}
