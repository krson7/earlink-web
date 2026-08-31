"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import type { RefObject } from "react";

import {
  DETECT_INTERVAL_MS,
  HAND_MODEL_URL,
  WASM_URL,
} from "@/lib/sign-language/constants";

import type {
  DrawingUtilsInstance,
  HandLandmarkerInstance,
  HandLandmarkerResult,
  Landmark,
} from "@/types/sign-language";

type UseHandTrackingParams = {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;

  onHandDetected: (
    hand: Landmark[] | null,
    timestamp: number,
  ) => void;
};

export function useHandTracking({
  videoRef,
  canvasRef,
  onHandDetected,
}: UseHandTrackingParams) {
  const landmarkerRef =
    useRef<HandLandmarkerInstance | null>(
      null,
    );

  const drawingUtilsRef =
    useRef<DrawingUtilsInstance | null>(
      null,
    );

  const handConnectionsRef =
    useRef<unknown>(null);

  const animationFrameRef =
    useRef<number | null>(null);

  const lastVideoTimeRef =
    useRef(-1);

  const lastDetectTimeRef =
    useRef(0);

  const generationRef =
    useRef(0);

  const onHandDetectedRef =
    useRef(onHandDetected);

  useEffect(() => {
    onHandDetectedRef.current =
      onHandDetected;
  }, [onHandDetected]);

  const resetDetectionVideoTime =
    useCallback((): void => {
      lastVideoTimeRef.current = -1;
    }, []);

  const findRightHand =
    useCallback(
      (
        result: HandLandmarkerResult,
      ): Landmark[] | null => {
        const handedness =
          result.handedness ??
          result.handednesses ??
          [];

        let rightHand:
          | Landmark[]
          | null = null;

        result.landmarks.forEach(
          (hand, index) => {
            const category =
              handedness[index]?.[0];

            const handName =
              category?.categoryName ??
              category?.displayName;

            if (
              handName !== "Left"
            ) {
              rightHand = hand;
            }
          },
        );

        return rightHand;
      },
      [],
    );

  const drawHands =
    useCallback(
      (
        result: HandLandmarkerResult,
      ): void => {
        const canvas =
          canvasRef.current;

        const drawingUtils =
          drawingUtilsRef.current;

        if (
          !canvas ||
          !drawingUtils
        ) {
          return;
        }

        const context =
          canvas.getContext("2d");

        if (!context) {
          return;
        }

        context.clearRect(
          0,
          0,
          canvas.width,
          canvas.height,
        );

        result.landmarks.forEach(
          (hand, index) => {
            const handedness =
              result.handedness ??
              result.handednesses ??
              [];

            const handName =
              handedness[
                index
              ]?.[0]?.categoryName ??
              handedness[
                index
              ]?.[0]?.displayName;

            const color =
              handName === "Left"
                ? "#60a5fa"
                : "#f97316";

            drawingUtils.drawConnectors(
              hand,
              handConnectionsRef.current,
              {
                color,
                lineWidth: 2,
              },
            );

            drawingUtils.drawLandmarks(
              hand,
              {
                color,
                radius: 3,
              },
            );
          },
        );
      },
      [canvasRef],
    );

  const stopDetection =
    useCallback((): void => {
      if (
        animationFrameRef.current !==
        null
      ) {
        window.cancelAnimationFrame(
          animationFrameRef.current,
        );
      }

      animationFrameRef.current =
        null;
    }, []);

  const stopHandTracking =
    useCallback((): void => {
      generationRef.current += 1;

      stopDetection();

      landmarkerRef.current?.close();

      landmarkerRef.current = null;
      drawingUtilsRef.current = null;
      handConnectionsRef.current =
        null;
    }, [stopDetection]);

  const initializeHandTracking =
    useCallback(
      async (): Promise<boolean> => {
        const generation =
          generationRef.current + 1;

        generationRef.current =
          generation;

        stopDetection();

        landmarkerRef.current?.close();

        landmarkerRef.current = null;
        drawingUtilsRef.current =
          null;
        handConnectionsRef.current =
          null;

        lastVideoTimeRef.current =
          -1;

        lastDetectTimeRef.current =
          0;

        const {
          FilesetResolver,
          HandLandmarker,
          DrawingUtils,
        } = await import(
          "@mediapipe/tasks-vision"
        );

        const vision =
          await FilesetResolver.forVisionTasks(
            WASM_URL,
          );

        let landmarker:
          | HandLandmarkerInstance
          | null = null;

        let lastError:
          unknown = null;

        for (
          const delegate of [
            "GPU",
            "CPU",
          ] as const
        ) {
          try {
            landmarker =
              (await HandLandmarker.createFromOptions(
                vision,
                {
                  baseOptions: {
                    modelAssetPath:
                      HAND_MODEL_URL,

                    delegate,
                  },

                  runningMode:
                    "VIDEO",

                  numHands: 2,
                },
              )) as unknown as
                HandLandmarkerInstance;

            break;
          } catch (error) {
            lastError = error;

            console.warn(
              `HandLandmarker ${delegate} 초기화 실패`,
              error,
            );
          }
        }

        if (!landmarker) {
          throw (
            lastError instanceof Error
              ? lastError
              : new Error(
                  "MediaPipe 모델을 초기화하지 못했습니다.",
                )
          );
        }

        if (
          generation !==
          generationRef.current
        ) {
          landmarker.close();

          return false;
        }

        landmarkerRef.current =
          landmarker;

        handConnectionsRef.current =
          HandLandmarker.HAND_CONNECTIONS;

        const canvas =
          canvasRef.current;

        if (!canvas) {
          throw new Error(
            "캔버스를 찾을 수 없습니다.",
          );
        }

        const context =
          canvas.getContext("2d");

        if (!context) {
          throw new Error(
            "캔버스 Context를 만들 수 없습니다.",
          );
        }

        drawingUtilsRef.current =
          new DrawingUtils(
            context,
          ) as unknown as
            DrawingUtilsInstance;

        return true;
      },
      [
        canvasRef,
        stopDetection,
      ],
    );

  const startDetection =
    useCallback((): void => {
      stopDetection();

      function detectionLoop(
        now: number,
      ): void {
        animationFrameRef.current =
          window.requestAnimationFrame(
            detectionLoop,
          );

        const video =
          videoRef.current;

        const landmarker =
          landmarkerRef.current;

        if (
          !video ||
          !landmarker
        ) {
          return;
        }

        if (
          video.readyState <
          HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
          return;
        }

        if (
          video.currentTime ===
          lastVideoTimeRef.current
        ) {
          return;
        }

        if (
          now -
            lastDetectTimeRef.current <
          DETECT_INTERVAL_MS
        ) {
          return;
        }

        lastVideoTimeRef.current =
          video.currentTime;

        lastDetectTimeRef.current =
          now;

        const timestamp =
          Math.round(
            performance.now(),
          );

        try {
          const result =
            landmarker.detectForVideo(
              video,
              timestamp,
            );

          drawHands(result);

          const rightHand =
            findRightHand(result);

          onHandDetectedRef.current(
            rightHand,
            timestamp,
          );
        } catch (error) {
          console.error(
            "손 감지 실패:",
            error,
          );
        }
      }

      animationFrameRef.current =
        window.requestAnimationFrame(
          detectionLoop,
        );
    }, [
      drawHands,
      findRightHand,
      stopDetection,
      videoRef,
    ]);

  useEffect(() => {
    return () => {
      stopHandTracking();
    };
  }, [stopHandTracking]);

  return {
    initializeHandTracking,
    startDetection,
    stopHandTracking,
    resetDetectionVideoTime,
  };
}