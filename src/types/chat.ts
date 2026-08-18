export type AccessibilityMode = "VISUAL" | "HEARING" | "STANDARD";

export type JoinRoomResponse = {
  participant_id: number;
  room_id: number;
  room_code: string;
  accessibility_mode: AccessibilityMode;
  joined_at: string;
};

export type ChatMessage = {
  type: "message";
  sender_id: number;
  content: string;
};

export type ChatErrorMessage = {
  type: "error";
  code: string;
  detail: string;
};

export type ChatServerMessage = ChatMessage | ChatErrorMessage;

export type ChatMessageItem = ChatMessage & {
  localId: string;
};