export type FacingMode = "user" | "environment";

export type Landmark = {
  x: number;
  y: number;
  z?: number;
};

export type HandednessCategory = {
  categoryName?: string;
  displayName?: string;
};

export type HandLandmarkerResult = {
  landmarks: Landmark[][];
  handedness?: HandednessCategory[][];
  handednesses?: HandednessCategory[][];
};

export type HandLandmarkerInstance = {
  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number,
  ): HandLandmarkerResult;

  close(): void;
};

export type DrawingUtilsInstance = {
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

export type JamoMessage = {
  type: "jamo";
  current: string | null;
  composed: string;
  confidence: number | null;
};

export type EchoMessage = {
  type: "echo";
  frame_id: number;
  t: number;
  n_dims: number;
};

export type ErrorMessage = {
  type: "error";
  code: string;
  detail: string;
};

export type ResetCompleteMessage = {
  type: "reset_complete";
};

export type ServerMessage =
  | JamoMessage
  | EchoMessage
  | ErrorMessage
  | ResetCompleteMessage;

export type SignLanguageCameraProps = {
  roomCode: string;
  participantId: number;
  chatConnected: boolean;
  chatErrorMessage: string;
  onSendText: (text: string) => boolean;
};

export type UseSignLanguageCameraParams = Pick<
  SignLanguageCameraProps,
  "roomCode" | "participantId" | "onSendText"
>;