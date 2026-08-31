"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { RefObject } from "react";

import type { FacingMode } from "@/types/sign-language";

type UseCameraStreamParams = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onCameraStarted?: () => void;
};

export function useCameraStream({
  videoRef,
  canvasRef,
  onCameraStarted,
}: UseCameraStreamParams) {
  const streamRef =
    useRef<MediaStream | null>(null);

  const facingRef =
    useRef<FacingMode>("user");

  const switchCameraRef =
    useRef<
      (() => Promise<void>) | null
    >(null);

  const generationRef = useRef(0);

  const [facing, setFacing] =
    useState<FacingMode>("user");

  const [
    canFlipCamera,
    setCanFlipCamera,
  ] = useState(false);

  const stopStreamTracks =
    useCallback((): void => {
      streamRef.current
        ?.getTracks()
        .forEach((track) =>
          track.stop(),
        );

      streamRef.current = null;
    }, []);

  const stopCamera =
    useCallback((): void => {
      generationRef.current += 1;
      stopStreamTracks();
    }, [stopStreamTracks]);

  const startCamera =
    useCallback(
      async (
        nextFacing: FacingMode,
      ): Promise<boolean> => {
        const video =
          videoRef.current;

        const canvas =
          canvasRef.current;

        if (!video || !canvas) {
          throw new Error(
            "카메라 화면을 찾을 수 없습니다.",
          );
        }

        const generation =
          generationRef.current + 1;

        generationRef.current =
          generation;

        stopStreamTracks();

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: false,

              video: {
                facingMode: {
                  ideal: nextFacing,
                },

                width: {
                  ideal: 640,
                },

                height: {
                  ideal: 480,
                },
              },
            },
          );

        if (
          generation !==
          generationRef.current
        ) {
          stream
            .getTracks()
            .forEach((track) =>
              track.stop(),
            );

          return false;
        }

        streamRef.current = stream;
        video.srcObject = stream;

        await video.play();

        if (
          generation !==
          generationRef.current
        ) {
          return false;
        }

        canvas.width =
          video.videoWidth || 640;

        canvas.height =
          video.videoHeight || 480;

        facingRef.current =
          nextFacing;

        setFacing(nextFacing);

        onCameraStarted?.();

        const devices =
          await navigator.mediaDevices.enumerateDevices();

        const cameras =
          devices.filter(
            (device) =>
              device.kind ===
              "videoinput",
          );

        setCanFlipCamera(
          cameras.length >= 2,
        );

        return true;
      },
      [
        canvasRef,
        onCameraStarted,
        stopStreamTracks,
        videoRef,
      ],
    );

  const switchCamera =
    useCallback(async (): Promise<void> => {
      const nextFacing: FacingMode =
        facingRef.current === "user"
          ? "environment"
          : "user";

      await startCamera(nextFacing);
    }, [startCamera]);

  useEffect(() => {
    switchCameraRef.current =
      switchCamera;

    return () => {
      switchCameraRef.current = null;
    };
  }, [switchCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    switchCameraRef,
    facing,
    canFlipCamera,
    startCamera,
    stopCamera,
  };
}