export const MP_VERSION = "0.10.35";

export const WASM_URL =
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;

export const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/" +
  "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export const WS_MAX_BUFFERED = 64 * 1024;
export const DETECT_INTERVAL_MS = 66;
export const MAX_RECONNECT_ATTEMPTS = 5;

export const FASTAPI_WS_BASE_URL =
  process.env.NEXT_PUBLIC_FASTAPI_WS_BASE_URL ?? "ws://localhost:8000";