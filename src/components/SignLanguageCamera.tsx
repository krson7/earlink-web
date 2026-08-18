"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

const MP_VERSION = "0.10.35";

const WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;

const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/" +
  "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const WS_MAX_BUFFERED =
  64 * 1024;

const DETECT_INTERVAL_MS = 66;
const MAX_RECONNECT_ATTEMPTS = 5;

const FASTAPI_WS_BASE_URL =
  process.env
    .NEXT_PUBLIC_FASTAPI_WS_BASE_URL ??
  "ws://localhost:8000";

type FacingMode =
  | "user"
  | "environment";

type Landmark = {
  x: number;
  y: number;
  z?: number;
};

type HandednessCategory = {
  categoryName?: string;
  displayName?: string;
};

type HandLandmarkerResult = {
  landmarks: Landmark[][];
  handedness?: HandednessCategory[][];
  handednesses?: HandednessCategory[][];
};

type HandLandmarkerInstance = {
  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number,
  ): HandLandmarkerResult;

  close(): void;
};

type DrawingUtilsInstance = {
  drawConnectors(
    landmarks: Landmark[],
    connections: unknown,
    style: {
      color: string;
      lineWidth: number;
    },
  ): void;

  drawLandmarks(
    landmarks: Landmark[],
    style: {
      color: string;
      radius: number;
    },
  ): void;
};

type JamoMessage = {
  type: "jamo";
  current: string | null;
  composed: string;
  confidence: number | null;
};

type EchoMessage = {
  type: "echo";
  frame_id: number;
  t: number;
  n_dims: number;
};

type ErrorMessage = {
  type: "error";
  code: string;
  detail: string;
};

type ResetCompleteMessage = {
  type: "reset_complete";
};

type ServerMessage =
  | JamoMessage
  | EchoMessage
  | ErrorMessage
  | ResetCompleteMessage;

type SignLanguageCameraProps = {
  roomCode: string;
  participantId: number;
  chatConnected: boolean;
  chatErrorMessage: string;
  onSendText: (
    text: string,
  ) => boolean;
};

function EarLinkSendMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
      className="h-6 w-6"
    >
      <circle
        cx="23"
        cy="31"
        r="6"
        stroke="currentColor"
        strokeWidth="4"
      />

      <circle
        cx="41"
        cy="31"
        r="6"
        stroke="currentColor"
        strokeWidth="4"
      />
    </svg>
  );
}

function isCompleteKoreanSyllable(
  character: string,
): boolean {
  const code =
    character.codePointAt(0);

  if (code === undefined) {
    return false;
  }

  return (
    code >= 0xac00 &&
    code <= 0xd7a3
  );
}

function getErrorMessage(
  error: unknown,
): string {
  if (
    !(error instanceof DOMException)
  ) {
    return error instanceof Error
      ? error.message
      : "알 수 없는 오류가 발생했습니다.";
  }

  switch (error.name) {
    case "NotAllowedError":
      return (
        "카메라 권한이 거부되었습니다. " +
        "브라우저에서 카메라를 허용해 주세요."
      );

    case "NotReadableError":
    case "AbortError":
      return (
        "카메라를 시작할 수 없습니다. " +
        "카메라를 사용하는 다른 앱을 종료해 주세요."
      );

    case "NotFoundError":
      return "사용 가능한 카메라를 찾지 못했습니다.";

    default:
      return error.message;
  }
}

export default function SignLanguageCamera({
  roomCode,
  participantId,
  chatConnected,
  chatErrorMessage,
  onSendText,
}: SignLanguageCameraProps) {
  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );

  const canvasRef =
    useRef<HTMLCanvasElement | null>(
      null,
    );

  const streamRef =
    useRef<MediaStream | null>(
      null,
    );

  const webSocketRef =
    useRef<WebSocket | null>(
      null,
    );

  const animationFrameRef =
    useRef<number | null>(
      null,
    );

  const reconnectTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const landmarkerRef =
    useRef<
      HandLandmarkerInstance | null
    >(null);

  const drawingUtilsRef =
    useRef<
      DrawingUtilsInstance | null
    >(null);

  const handConnectionsRef =
    useRef<unknown>(null);

  const facingRef =
    useRef<FacingMode>("user");

  const switchCameraRef =
    useRef<
      (() => Promise<void>) | null
    >(null);

  const onSendTextRef =
    useRef(onSendText);

  const ttsEnabledRef =
    useRef(true);

  const lastSpokenComposedRef =
    useRef("");

  const [status, setStatus] =
    useState("준비 중");

  const [
    connected,
    setConnected,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    currentJamo,
    setCurrentJamo,
  ] =
    useState<string | null>(
      null,
    );

  const [
    recognizedText,
    setRecognizedText,
  ] =
    useState("");

  const [
    confidence,
    setConfidence,
  ] =
    useState(0);

  const [facing, setFacing] =
    useState<FacingMode>(
      "user",
    );

  const [
    canFlipCamera,
    setCanFlipCamera,
  ] =
    useState(false);

  const [
    ttsEnabled,
    setTtsEnabled,
  ] =
    useState(true);

  useEffect(() => {
    onSendTextRef.current =
      onSendText;
  }, [onSendText]);

  useEffect(() => {
    let disposed = false;
    let reconnectDelay = 500;
    let reconnectBlocked = false;
    let reconnectAttempts = 0;

    let lastVideoTime = -1;
    let lastDetectTime = 0;
    let frameId = 0;

    setCurrentJamo(null);
    setRecognizedText("");
    setConfidence(0);

    lastSpokenComposedRef.current =
      "";

    function pickKoreanVoice():
      SpeechSynthesisVoice | null {
      if (
        !(
          "speechSynthesis" in
          window
        )
      ) {
        return null;
      }

      const koreanVoices =
        window.speechSynthesis
          .getVoices()
          .filter((voice) =>
            voice.lang.startsWith(
              "ko",
            ),
          );

      return (
        koreanVoices.find(
          (voice) =>
            voice.localService,
        ) ??
        koreanVoices[0] ??
        null
      );
    }

    function speak(
      text: string,
    ): void {
      if (
        !ttsEnabledRef.current ||
        !text ||
        !(
          "speechSynthesis" in
          window
        )
      ) {
        return;
      }

      window.speechSynthesis
        .cancel();

      const utterance =
        new SpeechSynthesisUtterance(
          text,
        );

      utterance.lang =
        "ko-KR";

      const voice =
        pickKoreanVoice();

      if (voice) {
        utterance.voice =
          voice;
      }

      window.speechSynthesis
        .speak(utterance);
    }

    function handleJamoMessage(
      message: JamoMessage,
    ): void {
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

      if (
        nextText &&
        nextText !==
          lastSpokenComposedRef
            .current
      ) {
        const completed = [
          ...nextText,
        ].filter(
          isCompleteKoreanSyllable,
        );

        const previousCompleted = [
          ...lastSpokenComposedRef
            .current,
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
      }
    }

    function handleServerError(
      message: ErrorMessage,
    ): void {
      console.error(
        "지문자 서버 오류:",
        message.code,
        message.detail,
      );

      setErrorMessage(
        message.detail,
      );

      setStatus(
        "지문자 인식 오류",
      );

      if (
        message.code ===
          "MODEL_UNAVAILABLE" ||
        message.code ===
          "MODEL_LOCK_UNAVAILABLE"
      ) {
        reconnectBlocked = true;
      }
    }

    function connectWebSocket():
      void {
      if (
        disposed ||
        reconnectBlocked
      ) {
        return;
      }

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
        setConnected(false);

        setStatus(
          "참가자 정보 없음",
        );

        setErrorMessage(
          "대화방에 참여한 후 지문자 기능을 사용할 수 있습니다.",
        );

        reconnectBlocked =
          true;

        return;
      }

      const currentSocket =
        webSocketRef.current;

      if (
        currentSocket &&
        (
          currentSocket
            .readyState ===
            WebSocket.OPEN ||
          currentSocket
            .readyState ===
            WebSocket.CONNECTING
        )
      ) {
        return;
      }

      const baseUrl =
        FASTAPI_WS_BASE_URL
          .replace(
            /\/+$/,
            "",
          );

      const translateWebSocketUrl =
        `${baseUrl}/ws/translate/` +
        `${encodeURIComponent(
          normalizedRoomCode,
        )}/` +
        `${participantId}`;

      setStatus(
        "FastAPI 서버 연결 중",
      );

      const socket =
        new WebSocket(
          translateWebSocketUrl,
        );

      webSocketRef.current =
        socket;

      socket.onopen = () => {
        reconnectDelay = 500;
        reconnectAttempts = 0;

        setConnected(true);

        setStatus(
          "FastAPI 서버 연결됨",
        );

        setErrorMessage("");
      };

      socket.onmessage = (
        event,
      ) => {
        let message:
          ServerMessage;

        try {
          message =
            JSON.parse(
              event.data,
            ) as ServerMessage;
        } catch {
          console.warn(
            "서버 메시지를 JSON으로 해석하지 못했습니다.",
          );

          return;
        }

        switch (message.type) {
          case "jamo":
            handleJamoMessage(
              message,
            );
            break;

          case "error":
            handleServerError(
              message,
            );
            break;

          case "reset_complete":
            setStatus(
              "새 문장 인식 준비 완료",
            );

            setErrorMessage("");
            break;

          case "echo":
            break;

          default:
            break;
        }
      };

      socket.onclose = (
        event: CloseEvent,
      ) => {
        if (
          webSocketRef.current ===
          socket
        ) {
          webSocketRef.current =
            null;
        }

        setConnected(false);

        if (disposed) {
          return;
        }

        if (
          event.code === 1008
        ) {
          reconnectBlocked =
            true;

          setStatus(
            "참가자 확인 실패",
          );

          setErrorMessage(
            event.reason ||
              "해당 대화방의 참가자 정보를 확인할 수 없습니다.",
          );

          return;
        }

        if (
          reconnectBlocked
        ) {
          setStatus(
            "지문자 기능 사용 불가",
          );

          if (event.reason) {
            setErrorMessage(
              event.reason,
            );
          }

          return;
        }

        setStatus(
          event.code === 1011
            ? "서버 오류 · 재연결 중"
            : "FastAPI 서버 재연결 중",
        );

        if (
          reconnectAttempts >=
          MAX_RECONNECT_ATTEMPTS
        ) {
          reconnectBlocked =
            true;

          setStatus(
            "지문자 서버 연결 실패",
          );

          setErrorMessage(
            "지문자 서버에 여러 번 연결하지 못했습니다. FastAPI 서버 상태를 확인해 주세요.",
          );

          return;
        }

        reconnectAttempts +=
          1;

        reconnectTimerRef.current =
          setTimeout(() => {
            reconnectTimerRef.current =
              null;

            connectWebSocket();
          }, reconnectDelay);

        reconnectDelay =
          Math.min(
            reconnectDelay * 2,
            8000,
          );
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          // 이미 닫힌 경우 무시한다.
        }
      };
    }

    async function startCamera(
      nextFacing:
        FacingMode,
    ): Promise<void> {
      const video =
        videoRef.current;

      const canvas =
        canvasRef.current;

      if (
        !video ||
        !canvas
      ) {
        throw new Error(
          "카메라 화면을 찾을 수 없습니다.",
        );
      }

      streamRef.current
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop(),
        );

      const stream =
        await navigator
          .mediaDevices
          .getUserMedia({
            audio: false,

            video: {
              facingMode: {
                ideal:
                  nextFacing,
              },

              width: {
                ideal: 640,
              },

              height: {
                ideal: 480,
              },
            },
          });

      if (disposed) {
        stream
          .getTracks()
          .forEach(
            (track) =>
              track.stop(),
          );

        return;
      }

      streamRef.current =
        stream;

      video.srcObject =
        stream;

      await video.play();

      canvas.width =
        video.videoWidth ||
        640;

      canvas.height =
        video.videoHeight ||
        480;

      facingRef.current =
        nextFacing;

      setFacing(
        nextFacing,
      );

      lastVideoTime = -1;

      const devices =
        await navigator
          .mediaDevices
          .enumerateDevices();

      const cameras =
        devices.filter(
          (device) =>
            device.kind ===
            "videoinput",
        );

      setCanFlipCamera(
        cameras.length >= 2,
      );
    }

    switchCameraRef.current =
      async () => {
        try {
          setErrorMessage("");

          const nextFacing:
            FacingMode =
            facingRef.current ===
            "user"
              ? "environment"
              : "user";

          await startCamera(
            nextFacing,
          );
        } catch (error) {
          setErrorMessage(
            getErrorMessage(
              error,
            ),
          );
        }
      };

    function findRightHand(
      result:
        HandLandmarkerResult,
    ): Landmark[] | null {
      const handedness =
        result.handedness ??
        result.handednesses ??
        [];

      let rightHand:
        Landmark[] | null =
        null;

      result.landmarks.forEach(
        (hand, index) => {
          const category =
            handedness[index]?.[0];

          const handName =
            category
              ?.categoryName ??
            category
              ?.displayName;

          if (
            handName !==
            "Left"
          ) {
            rightHand = hand;
          }
        },
      );

      return rightHand;
    }

    function drawHands(
      result:
        HandLandmarkerResult,
    ): void {
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
        canvas.getContext(
          "2d",
        );

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
            handedness[index]?.[0]
              ?.categoryName ??
            handedness[index]?.[0]
              ?.displayName;

          const color =
            handName ===
            "Left"
              ? "#60a5fa"
              : "#f97316";

          drawingUtils
            .drawConnectors(
              hand,
              handConnectionsRef
                .current,
              {
                color,
                lineWidth: 2,
              },
            );

          drawingUtils
            .drawLandmarks(
              hand,
              {
                color,
                radius: 3,
              },
            );
        },
      );
    }

    function sendHand(
      hand: Landmark[] | null,
      timestamp: number,
    ): void {
      const socket =
        webSocketRef.current;

      if (
        !socket ||
        socket.readyState !==
          WebSocket.OPEN
      ) {
        return;
      }

      if (
        socket.bufferedAmount >
        WS_MAX_BUFFERED
      ) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: "hand",

          frame_id:
            ++frameId,

          t: timestamp,

          hand: hand
            ? hand.map(
                (point) => [
                  Math.round(
                    point.x *
                      10000,
                  ) / 10000,

                  Math.round(
                    point.y *
                      10000,
                  ) / 10000,
                ],
              )
            : null,
        }),
      );
    }

    function detectionLoop(
      now: number,
    ): void {
      animationFrameRef.current =
        window
          .requestAnimationFrame(
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
        HTMLMediaElement
          .HAVE_CURRENT_DATA
      ) {
        return;
      }

      if (
        video.currentTime ===
        lastVideoTime
      ) {
        return;
      }

      if (
        now -
          lastDetectTime <
        DETECT_INTERVAL_MS
      ) {
        return;
      }

      lastVideoTime =
        video.currentTime;

      lastDetectTime = now;

      const timestamp =
        Math.round(
          performance.now(),
        );

      try {
        const result =
          landmarker
            .detectForVideo(
              video,
              timestamp,
            );

        drawHands(result);

        const rightHand =
          findRightHand(
            result,
          );

        sendHand(
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

        const {
          FilesetResolver,
          HandLandmarker,
          DrawingUtils,
        } =
          await import(
            "@mediapipe/tasks-vision"
          );

        const vision =
          await FilesetResolver
            .forVisionTasks(
              WASM_URL,
            );

        let landmarker:
          HandLandmarkerInstance | null =
          null;

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
              (
                await HandLandmarker
                  .createFromOptions(
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
                  )
              ) as unknown as
                HandLandmarkerInstance;

            break;
          } catch (error) {
            lastError =
              error;

            console.warn(
              `HandLandmarker ${delegate} 초기화 실패`,
              error,
            );
          }
        }

        if (!landmarker) {
          throw (
            lastError instanceof
            Error
              ? lastError
              : new Error(
                  "MediaPipe 모델을 초기화하지 못했습니다.",
                )
          );
        }

        if (disposed) {
          landmarker.close();
          return;
        }

        landmarkerRef.current =
          landmarker;

        handConnectionsRef.current =
          HandLandmarker
            .HAND_CONNECTIONS;

        const canvas =
          canvasRef.current;

        if (!canvas) {
          throw new Error(
            "캔버스를 찾을 수 없습니다.",
          );
        }

        const context =
          canvas.getContext(
            "2d",
          );

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

        setStatus(
          "카메라 여는 중",
        );

        await startCamera(
          "user",
        );

        connectWebSocket();

        animationFrameRef.current =
          window
            .requestAnimationFrame(
              detectionLoop,
            );
      } catch (error) {
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

      switchCameraRef.current =
        null;

      if (
        animationFrameRef.current !==
        null
      ) {
        window
          .cancelAnimationFrame(
            animationFrameRef
              .current,
          );
      }

      animationFrameRef.current =
        null;

      if (
        reconnectTimerRef.current !==
        null
      ) {
        clearTimeout(
          reconnectTimerRef
            .current,
        );
      }

      reconnectTimerRef.current =
        null;

      const socket =
        webSocketRef.current;

      webSocketRef.current =
        null;

      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;

        try {
          socket.close();
        } catch {
          // 이미 종료된 경우 무시한다.
        }
      }

      streamRef.current
        ?.getTracks()
        .forEach(
          (track) =>
            track.stop(),
        );

      streamRef.current =
        null;

      landmarkerRef.current
        ?.close();

      landmarkerRef.current =
        null;

      drawingUtilsRef.current =
        null;

      handConnectionsRef.current =
        null;

      if (
        "speechSynthesis" in
        window
      ) {
        window
          .speechSynthesis
          .cancel();
      }
    };
  }, [
    roomCode,
    participantId,
  ]);

  function sendRecognizedText():
    void {
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

    const socket =
      webSocketRef.current;

    if (
      socket &&
      socket.readyState ===
        WebSocket.OPEN
    ) {
      socket.send(
        JSON.stringify({
          type: "reset",
        }),
      );

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

    lastSpokenComposedRef.current =
      "";

    if (
      "speechSynthesis" in
      window
    ) {
      window
        .speechSynthesis
        .cancel();
    }
  }

  function toggleTts(): void {
    setTtsEnabled(
      (previous) => {
        const next =
          !previous;

        ttsEnabledRef.current =
          next;

        if (
          !next &&
          "speechSynthesis" in
          window
        ) {
          window
            .speechSynthesis
            .cancel();
        }

        return next;
      },
    );
  }

  return (
    <section className="shrink-0 border-b border-slate-200 bg-white">
      {errorMessage && (
        <div
          role="alert"
          className="border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
        <video
          ref={videoRef}
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform:
              facing === "user"
                ? "scaleX(-1)"
                : "none",
          }}
        />

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{
            transform:
              facing === "user"
                ? "scaleX(-1)"
                : "none",
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/65" />

        <div className="pointer-events-none absolute inset-x-[22%] bottom-[18%] top-[18%] rounded-[28px] border border-white/25 shadow-[0_0_0_999px_rgba(15,23,42,0.05)]">
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-white/75">
            오른손을 안내선 안에 보여주세요
          </span>
        </div>

        <div className="absolute left-3 top-3 flex max-w-[58%] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
          <span
            className={
              "h-2 w-2 shrink-0 rounded-full " +
              (
                connected
                  ? "bg-emerald-400"
                  : "bg-rose-400"
              )
            }
          />

          <span className="truncate">
            {status}
          </span>
        </div>

        <div className="absolute right-3 top-3 flex gap-2">
          <button
            type="button"
            aria-label="카메라 전환"
            title="카메라 전환"
            disabled={
              !canFlipCamera
            }
            onClick={() => {
              void switchCameraRef
                .current?.();
            }}
            className="rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            전환
          </button>

          <button
            type="button"
            aria-label={
              ttsEnabled
                ? "인식 음성 끄기"
                : "인식 음성 켜기"
            }
            title={
              ttsEnabled
                ? "인식 음성 끄기"
                : "인식 음성 켜기"
            }
            onClick={
              toggleTts
            }
            className="rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-md transition active:scale-95"
          >
            {ttsEnabled
              ? "음성 켬"
              : "음성 끔"}
          </button>
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-white/70">
              현재 인식
            </p>

            <p
              aria-live="polite"
              className="mt-0.5 truncate text-lg font-black text-white drop-shadow"
            >
              {currentJamo
                ? `${currentJamo} · ${Math.round(
                    confidence *
                      100,
                  )}%`
                : "손동작을 기다리고 있어요"}
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
            지문자 입력
          </span>
        </div>
      </div>

      {chatErrorMessage && (
        <div
          role="alert"
          className="mx-3 mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {chatErrorMessage}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendRecognizedText();
        }}
        className="bg-white px-3 py-1.5"
        style={{
          paddingBottom:
            "max(0.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 rounded-[22px] border border-blue-100 bg-white px-4 py-2 shadow-[0_3px_12px_rgba(15,23,42,0.04)]">
            <textarea
              aria-label="지문자 인식 문장"
              value={
                recognizedText
              }
              rows={1}
              readOnly
              placeholder="지문자를 인식하면 문장이 여기에 표시됩니다"
              className="max-h-24 min-h-5 w-full resize-none overflow-y-auto bg-transparent text-[14px] leading-5 text-slate-900 outline-none placeholder:text-slate-400"
            />
          </div>

          <button
            type="submit"
            aria-label="지문자 메시지 전송"
            disabled={
              !chatConnected ||
              !recognizedText.trim()
            }
            className={[
              "flex h-11 w-[62px] shrink-0 items-center justify-center",
              "rounded-[18px] text-white",
              "transition duration-200",

              chatConnected &&
              recognizedText.trim()
                ? [
                    "bg-gradient-to-br",
                    "from-sky-400",
                    "via-blue-500",
                    "to-indigo-600",
                    "shadow-[0_7px_18px_rgba(37,99,235,0.22)]",
                    "hover:-translate-y-[1px]",
                    "hover:shadow-[0_10px_22px_rgba(37,99,235,0.28)]",
                    "active:translate-y-0",
                    "active:scale-95",
                  ].join(" ")
                : [
                    "cursor-not-allowed",
                    "bg-slate-200",
                    "text-slate-400",
                    "shadow-none",
                  ].join(" "),
            ].join(" ")}
          >
            <EarLinkSendMark />
          </button>
        </div>
      </form>
    </section>
  );
}