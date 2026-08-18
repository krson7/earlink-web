"use client";

import { useCallback, useRef, useState } from "react";

import { joinRoom } from "@/lib/room-api";
import type { AccessibilityMode, JoinRoomResponse } from "@/types/chat";

export function useRoomSession() {
  const joinInFlightRef = useRef(false);

  const [participant, setParticipant] = useState<JoinRoomResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  const enterRoom = useCallback(async (
    selectedMode: AccessibilityMode,
    beforeParticipantCommit?: () => void,
  ): Promise<void> => {
    if (joinInFlightRef.current) {
      return;
    }

    joinInFlightRef.current = true;
    setJoining(true);
    setJoinError("");

    try {
      const joinedParticipant = await joinRoom(selectedMode);

      beforeParticipantCommit?.();
      setParticipant(joinedParticipant);
    } catch (error) {
      setParticipant(null);

      setJoinError(
        error instanceof Error
          ? error.message
          : "대화방 입장에 실패했습니다.",
      );
    } finally {
      setJoining(false);
      joinInFlightRef.current = false;
    }
  }, []);

  const leaveRoom = useCallback((): void => {
    setParticipant(null);
    setJoinError("");
    joinInFlightRef.current = false;
  }, []);

  return {
    participant,
    joining,
    joinError,
    enterRoom,
    leaveRoom,
  };
}