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
  source?: "braille";
};

export type BrailleTypingMessage = {
  type: "typing";
  source: "braille";
  sender_id: number;
  active: boolean;
};

export type ChatCapabilitiesMessage = {
  type: "capabilities";
  braille_events: boolean;
};

export type ChatErrorMessage = {
  type: "error";
  code: string;
  detail: string;
};

export type ChatServerMessage = ChatMessage | ChatErrorMessage | BrailleTypingMessage | ChatCapabilitiesMessage;

export type ChatMessageItem = ChatMessage & {
  localId: string;
};
