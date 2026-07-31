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
  "hand_landmarker/hand_landmarker/float16/1/" +
  "hand_landmarker.task";

const FASTAPI_WS_BASE_URL =
  process.env
    .NEXT_PUBLIC_FASTAPI_WS_BASE_URL ??
  "ws://localhost:8000";

const WS_MAX_BUFFERED_BYTES =
  64 * 1024;

const DETECT_INTERVAL_MS = 66;
const MAX_RECONNECT_ATTEMPTS = 5;

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
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => HandLandmarkerResult;

  close: () => void;
};

type DrawingUtilsInstance = {
  drawConnectors: (
    landmarks: Landmark[],
    connections: unknown,
    style: {
      color: string;
      lineWidth: number;
    },
  ) => void;

  drawLandmarks: (
    landmarks: Landmark[],
    style: {
      color: string;
      radius: number;
    },
  ) => void;
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
  onApplyText?: (
    text: string,
  ) => void;
};

function isCompleteKoreanSyllable(
  character: string,
): boolean {
  const code =
    character.codePointAt(0);

  return (
    code !== undefined &&
    code >= 0xac00 &&
    code <= 0xd7a3
  );
}

function clampConfidence(
  confidence: number | null,
): number {
  if (
    typeof confidence !==
      "number" ||
    !Number.isFinite(confidence)
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(0, confidence),
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
        "브라우저 설정에서 카메라를 허용해 주세요."
      );

    case "NotReadableError":
    case "AbortError":
      return (
        "카메라를 시작할 수 없습니다. " +
        "카메라를 사용하는 다른 앱을 종료해 주세요."
      );

    case "NotFoundError":
      return (
        "사용 가능한 카메라를 찾지 못했습니다."
      );

    case "OverconstrainedError":
      return (
        "요청한 카메라 설정을 사용할 수 없습니다."
      );

    case "SecurityError":
      return (
        "보안 문제로 카메라를 실행할 수 없습니다. " +
        "HTTPS 또는 localhost 환경인지 확인해 주세요."
      );

    default:
      return (
        error.message ||
        "카메라를 실행하지 못했습니다."
      );
  }
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-[22px] w-[22px]"
    >
      <path
        d="M4.5 11.5 19.5 5l-4.9 14-3.2-5.1-6.9-2.4Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="m11.4 13.9 4.1-4.1"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SignLanguageCamera({
  roomCode,
  participantId,
  onApplyText,
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
    useRef<number | null>(
      null,
    );

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

  const onApplyTextRef =
    useRef(onApplyText);

  const lastSpokenComposedRef =
    useRef("");

  const [, setStatus] =
    useState("준비 중");

  const [, setConnected] =
    useState(false);

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

  const [
    facing,
    setFacing,
  ] = useState<FacingMode>(
    "user",
  );

  useEffect(() => {
    onApplyTextRef.current =
      onApplyText;
  }, [onApplyText]);

  useEffect(() => {
    let disposed = false;
    let reconnectBlocked = false;
    let reconnectDelay = 500;
    let reconnectAttempts = 0;
    let lastVideoTime = -1;
    let lastDetectTime = 0;
    let frameId = 0;

    setCurrentJamo(null);
    setRecognizedText("");
    setConfidence(0);
    setErrorMessage("");

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

      const voices =
        window.speechSynthesis
          .getVoices()
          .filter(
            (voice) =>
              voice.lang.startsWith(
                "ko",
              ),
          );

      return (
        voices.find(
          (voice) =>
            voice.localService,
        ) ??
        voices[0] ??
        null
      );
    }

    function speak(
      text: string,
    ): void {
      if (
        !text ||
        !(
          "speechSynthesis" in
          window
        )
      ) {
        return;
      }

      window
        .speechSynthesis
        .cancel();

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

      window
        .speechSynthesis
        .speak(utterance);
    }

    function handleJamoMessage(
      message: JamoMessage,
    ): void {
      const nextText =
        typeof message.composed ===
          "string"
          ? message.composed
          : "";

      setCurrentJamo(
        typeof message.current ===
          "string"
          ? message.current
          : null,
      );

      setRecognizedText(
        nextText,
      );

      setConfidence(
        clampConfidence(
          message.confidence,
        ),
      );

      if (
        !nextText ||
        nextText ===
          lastSpokenComposedRef
            .current
      ) {
        return;
      }

      const completed =
        [...nextText].filter(
          isCompleteKoreanSyllable,
        );

      const previousCompleted =
        [
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

    function handleServerError(
      message: ErrorMessage,
    ): void {
      console.error(
        "지문자 서버 오류:",
        message.code,
        message.detail,
      );

      setErrorMessage(
        message.detail ||
          "지문자 서버에서 오류가 발생했습니다.",
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
        reconnectBlocked = true;

        setConnected(false);

        setStatus(
          "참가자 정보 없음",
        );

        setErrorMessage(
          "대화방에 참여한 후 지문자 기능을 사용할 수 있습니다.",
        );

        return;
      }

      const currentSocket =
        webSocketRef.current;

      if (
        currentSocket &&
        (
          currentSocket.readyState ===
            WebSocket.OPEN ||
          currentSocket.readyState ===
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

      const websocketUrl =
        `${baseUrl}/ws/translate/` +
        `${encodeURIComponent(
          normalizedRoomCode,
        )}/${participantId}`;

      setStatus(
        "지문자 서버 연결 중",
      );

      const socket =
        new WebSocket(
          websocketUrl,
        );

      webSocketRef.current =
        socket;

      socket.onopen = () => {
        reconnectDelay = 500;
        reconnectAttempts = 0;

        setConnected(true);

        setStatus(
          "지문자 서버 연결됨",
        );

        setErrorMessage("");
      };

      socket.onmessage = (
        event: MessageEvent,
      ) => {
        if (
          typeof event.data !==
            "string"
        ) {
          return;
        }

        let message:
          ServerMessage;

        try {
          message =
            JSON.parse(
              event.data,
            ) as ServerMessage;
        } catch {
          console.warn(
            "지문자 서버 메시지를 해석하지 못했습니다.",
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
          reconnectBlocked = true;

          setStatus(
            "참가자 확인 실패",
          );

          setErrorMessage(
            event.reason ||
              "해당 대화방의 참가자 정보를 확인할 수 없습니다.",
          );

          return;
        }

        reconnectAttempts += 1;

        if (
          reconnectAttempts >
          MAX_RECONNECT_ATTEMPTS
        ) {
          reconnectBlocked = true;

          setStatus(
            "지문자 서버 연결 실패",
          );

          setErrorMessage(
            "지문자 서버에 여러 번 연결하지 못했습니다. FastAPI 서버 상태를 확인해 주세요.",
          );

          return;
        }

        setStatus(
          `지문자 서버 재연결 중 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
        );

        reconnectTimerRef.current =
          window.setTimeout(
            () => {
              reconnectTimerRef.current =
                null;

              connectWebSocket();
            },
            reconnectDelay,
          );

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
      nextFacing: FacingMode,
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

      streamRef.current = null;
      video.srcObject = null;

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

      if (disposed) {
        stream
          .getTracks()
          .forEach(
            (track) =>
              track.stop(),
          );

        return;
      }

      canvas.width =
        video.videoWidth || 640;

      canvas.height =
        video.videoHeight || 480;

      facingRef.current =
        nextFacing;

      setFacing(
        nextFacing,
      );

      lastVideoTime = -1;
    }

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
        (
          hand,
          index,
        ) => {
          const category =
            handedness[index]?.[0];

          const handName =
            category
              ?.categoryName ??
            category
              ?.displayName;

          if (
            handName !== "Left"
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

      const handedness =
        result.handedness ??
        result.handednesses ??
        [];

      result.landmarks.forEach(
        (
          hand,
          index,
        ) => {
          const handName =
            handedness[
              index
            ]?.[0]
              ?.categoryName ??
            handedness[
              index
            ]?.[0]
              ?.displayName;

          const color =
            handName === "Left"
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
          WebSocket.OPEN ||
        socket.bufferedAmount >
          WS_MAX_BUFFERED_BYTES
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
      if (disposed) {
        return;
      }

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
          lastVideoTime ||
        now - lastDetectTime <
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

        sendHand(
          findRightHand(result),
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
        } = await import(
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
            lastError = error;

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

        if (disposed) {
          return;
        }

        connectWebSocket();

        animationFrameRef.current =
          window
            .requestAnimationFrame(
              detectionLoop,
            );
      } catch (error) {
        console.error(
          "지문자 카메라 초기화 실패:",
          error,
        );

        setConnected(false);

        setStatus(
          "초기화 실패",
        );

        setErrorMessage(
          getErrorMessage(
            error,
          ),
        );

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
      }
    }

    void initialize();

    return () => {
      disposed = true;

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
        window.clearTimeout(
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
          // 이미 닫힌 소켓은 무시한다.
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

      if (videoRef.current) {
        videoRef.current
          .srcObject = null;
      }

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

  function applyRecognizedText():
    void {
    const text =
      recognizedText.trim();

    if (!text) {
      return;
    }

    onApplyTextRef.current?.(
      text,
    );

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

  return (
    <section
      className="bg-white px-3 pt-2"
      style={{
        paddingBottom:
          "max(0.7rem, env(safe-area-inset-bottom))",
      }}
    >
      {errorMessage && (
        <div
          role="alert"
          className="mb-2 rounded-[14px] border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-medium leading-4 text-rose-700"
        >
          {errorMessage}
        </div>
      )}

      <div className="mb-2 px-0.5">
        <p className="text-[11px] font-black tracking-[-0.02em] text-[#153b60]">
          지문자 인식
        </p>
      </div>

      <div className="relative h-[clamp(190px,27dvh,230px)] overflow-hidden rounded-[24px] border border-slate-200 bg-[#070b16] shadow-[0_12px_28px_rgba(15,23,42,0.16)]">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            transform:
              facing === "user"
                ? "scaleX(-1)"
                : "none",
          }}
        />

        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          style={{
            transform:
              facing === "user"
                ? "scaleX(-1)"
                : "none",
          }}
        />

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />

        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[9px] font-semibold text-white/90 backdrop-blur-md">
          오른손을 프레임 안에 보여주세요
        </div>

        <div className="pointer-events-none absolute inset-x-[24%] bottom-[17%] top-[18%]">
          <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-[18px] border-l border-t border-white/45" />

          <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-[18px] border-r border-t border-white/45" />

          <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-[18px] border-b border-l border-white/45" />

          <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-[18px] border-b border-r border-white/45" />
        </div>

        <div className="absolute bottom-3 left-3 max-w-[78%] rounded-[14px] border border-white/10 bg-black/35 px-3 py-2 text-white backdrop-blur-md">
          <p className="text-[9px] font-semibold text-white/60">
            현재 인식
          </p>

          <p
            aria-live="polite"
            className="mt-0.5 truncate text-[13px] font-black tracking-[-0.02em]"
          >
            {currentJamo
              ? `${currentJamo} · ${Math.round(
                  confidence * 100,
                )}%`
              : "손동작을 기다리고 있어요"}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-stretch gap-2">
        <div className="min-w-0 flex-1 rounded-[18px] border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_5px_16px_rgba(15,23,42,0.04)]">
          <p className="text-[9px] font-black tracking-[-0.02em] text-fuchsia-500">
            인식된 문장
          </p>

          <p
            aria-live="polite"
            className={[
              "mt-1 max-h-10 overflow-hidden break-words text-[13px] font-bold leading-5 tracking-[-0.02em]",
              recognizedText
                ? "text-[#153b60]"
                : "text-slate-400",
            ].join(" ")}
          >
            {recognizedText ||
              "지문자를 인식하면 여기에 표시됩니다."}
          </p>
        </div>

        <button
          type="button"
          aria-label="인식된 문장을 입력창에 넣기"
          title="입력창에 넣기"
          disabled={
            !recognizedText.trim() ||
            !onApplyText
          }
          onClick={
            applyRecognizedText
          }
          className={[
            "flex w-[64px] shrink-0 items-center justify-center",
            "rounded-[18px] bg-[#0b3761] text-white",
            "shadow-[0_8px_18px_rgba(11,55,97,0.18)]",
            "transition duration-200",
            "hover:bg-[#092f54]",
            "active:scale-[0.96]",
            "disabled:cursor-not-allowed",
            "disabled:bg-slate-200",
            "disabled:text-slate-400",
            "disabled:shadow-none",
          ].join(" ")}
        >
          <SendIcon />
        </button>
      </div>
    </section>
  );
}