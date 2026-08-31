"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useCameraStream } from "@/hooks/sign-language/useCameraStream";
import { useHandTracking } from "@/hooks/sign-language/useHandTracking";
import { useSignLanguageSocket } from "@/hooks/sign-language/useSignLanguageSocket";

import { getErrorMessage } from "@/lib/sign-language/utils";

import type {
  JamoMessage,
  UseSignLanguageCameraParams,
} from "@/types/sign-language";

export function useSignLanguageCamera({
  roomCode,
  participantId,
  onSendText,
}: UseSignLanguageCameraParams) {
  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const onSendTextRef =
    useRef(onSendText);

  const [status, setStatus] =
    useState("준비 중");

  const [
    connected,
    setConnected,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    currentJamo,
    setCurrentJamo,
  ] = useState<string | null>(
    null,
  );

  const [
    recognizedText,
    setRecognizedText,
  ] = useState("");

  const [
    confidence,
    setConfidence,
  ] = useState(0);

  useEffect(() => {
    onSendTextRef.current =
      onSendText;
  }, [onSendText]);

  const handleJamoMessage =
    useCallback(
      (
        message: JamoMessage,
      ): void => {
        const nextText =
          message.composed ?? "";

        setCurrentJamo(
          message.current ?? null,
        );

        setRecognizedText(
          nextText,
        );

        setConfidence(
          message.confidence ?? 0,
        );
      },
      [],
    );

  const {
    startConnectionSession,
    stopConnectionSession,
    sendHand,
    sendReset,
  } = useSignLanguageSocket({
    roomCode,
    participantId,
    setStatus,
    setConnected,
    setErrorMessage,
    onJamoMessage:
      handleJamoMessage,
  });

  const {
    initializeHandTracking,
    startDetection,
    stopHandTracking,
    resetDetectionVideoTime,
  } = useHandTracking({
    videoRef,
    canvasRef,
    onHandDetected: sendHand,
  });

  const {
    switchCameraRef,
    facing,
    canFlipCamera,
    startCamera,
    stopCamera,
  } = useCameraStream({
    videoRef,
    canvasRef,
    onCameraStarted:
      resetDetectionVideoTime,
  });

  useEffect(() => {
    let disposed = false;

    setCurrentJamo(null);
    setRecognizedText("");
    setConfidence(0);

    async function initialize():
      Promise<void> {
      try {
        const normalizedRoomCode =
          roomCode
            .trim()
            .toUpperCase();

        if (
          !normalizedRoomCode ||
          !Number.isInteger(
            participantId,
          ) ||
          participantId <= 0
        ) {
          throw new Error(
            "대화방에 참여한 후 지문자 기능을 사용할 수 있습니다.",
          );
        }

        if (
          !navigator
            .mediaDevices
            ?.getUserMedia
        ) {
          throw new Error(
            "현재 브라우저에서는 카메라 API를 사용할 수 없습니다.",
          );
        }

        setStatus(
          "MediaPipe 모델 로딩 중",
        );

        const handTrackingReady =
          await initializeHandTracking();

        if (
          disposed ||
          !handTrackingReady
        ) {
          return;
        }

        setStatus(
          "카메라 여는 중",
        );

        const cameraStarted =
          await startCamera(
            "user",
          );

        if (
          disposed ||
          !cameraStarted
        ) {
          return;
        }

        startConnectionSession();

        startDetection();
      } catch (error) {
        if (disposed) {
          return;
        }

        console.error(error);

        setConnected(false);

        setStatus(
          "초기화 실패",
        );

        setErrorMessage(
          getErrorMessage(
            error,
          ),
        );
      }
    }

    void initialize();

    return () => {
      disposed = true;

      stopHandTracking();
      stopConnectionSession();
      stopCamera();
    };
  }, [
    initializeHandTracking,
    participantId,
    roomCode,
    startCamera,
    startConnectionSession,
    startDetection,
    stopCamera,
    stopConnectionSession,
    stopHandTracking,
  ]);

  const sendRecognizedText =
    useCallback((): void => {
      const text =
        recognizedText.trim();

      if (!text) {
        return;
      }

      const sent =
        onSendTextRef.current(
          text,
        );

      if (!sent) {
        return;
      }

      if (sendReset()) {
        setStatus(
          "새 문장 인식 상태 초기화 중",
        );
      } else {
        setErrorMessage(
          "지문자 서버에 연결되어 있지 않아 인식 상태를 초기화하지 못했습니다.",
        );
      }

      setRecognizedText("");
      setCurrentJamo(null);
      setConfidence(0);
    }, [
      recognizedText,
      sendReset,
    ]);

  return {
    videoRef,
    canvasRef,
    switchCameraRef,
    status,
    connected,
    errorMessage,
    currentJamo,
    recognizedText,
    confidence,
    facing,
    canFlipCamera,
    sendRecognizedText,
  };
}