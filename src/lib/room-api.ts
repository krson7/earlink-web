import { requestJson } from "@/lib/api";
import type { AccessibilityMode, JoinRoomResponse } from "@/types/chat";

export function joinRoom(accessibilityMode: AccessibilityMode): Promise<JoinRoomResponse> {
  return requestJson<JoinRoomResponse>("/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      accessibility_mode: accessibilityMode,
    }),
  });
}