"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createLocalMessageId,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_RECONNECT_ATTEMPTS,
} from "@/lib/chat";
import type {
  ChatMessageItem,
  ChatServerMessage,
  JoinRoomResponse,
} from "@/types/chat";

const FASTAPI_WS_BASE_URL =
  process.env.NEXT_PUBLIC_FASTAPI_WS_BASE_URL ?? "ws://localhost:8000";

export function useChatSocket(participant: JoinRoomResponse | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("채팅 연결 전");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!participant) {
      return;
    }

    let disposed = false;
    let reconnectBlocked = false;
    let reconnectDelay = 500;
    let reconnectAttempts = 0;

    const roomCode = participant.room_code.trim().toUpperCase();
    const participantId = participant.participant_id;

    function connect(): void {
      if (disposed || reconnectBlocked) {
        return;
      }

      const currentSocket = socketRef.current;

      if (
        currentSocket &&
        (currentSocket.readyState === WebSocket.OPEN ||
          currentSocket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const baseUrl = FASTAPI_WS_BASE_URL.replace(/\/+$/, "");
      const websocketUrl =
        `${baseUrl}/ws/rooms/` +
        `${encodeURIComponent(roomCode)}/${participantId}`;

      setStatus("채팅 서버 연결 중");

      const socket = new WebSocket(websocketUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectDelay = 500;
        reconnectAttempts = 0;

        setConnected(true);
        setStatus("채팅 서버 연결됨");
        setErrorMessage("");
      };

      socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== "string") {
          return;
        }

        let serverMessage: ChatServerMessage;

        try {
          serverMessage = JSON.parse(event.data) as ChatServerMessage;
        } catch {
          console.warn("채팅 서버 메시지를 해석하지 못했습니다.");
          return;
        }

        if (serverMessage.type === "message") {
          if (
            typeof serverMessage.sender_id !== "number" ||
            typeof serverMessage.content !== "string"
          ) {
            return;
          }

          setMessages((previousMessages) => [
            ...previousMessages,
            {
              ...serverMessage,
              localId: createLocalMessageId(),
            },
          ]);

          return;
        }

        if (serverMessage.type === "error") {
          setErrorMessage(
            typeof serverMessage.detail === "string"
              ? serverMessage.detail
              : "채팅 서버에서 오류가 발생했습니다.",
          );
        }
      };

      socket.onclose = (event: CloseEvent) => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        setConnected(false);

        if (disposed) {
          return;
        }

        if (event.code === 1008) {
          reconnectBlocked = true;
          setStatus("채팅 참가자 확인 실패");

          setErrorMessage(
            event.reason ||
              "해당 대화방의 참가자 정보를 확인할 수 없습니다.",
          );

          return;
        }

        reconnectAttempts += 1;

        if (reconnectAttempts > MAX_CHAT_RECONNECT_ATTEMPTS) {
          reconnectBlocked = true;
          setStatus("채팅 재연결 실패");

          setErrorMessage(
            event.reason ||
              "채팅 서버에 다시 연결하지 못했습니다.",
          );

          return;
        }

        setStatus(
          `채팅 서버 재연결 중 (${reconnectAttempts}/${MAX_CHAT_RECONNECT_ATTEMPTS})`,
        );

        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, reconnectDelay);

        reconnectDelay = Math.min(reconnectDelay * 2, 8000);
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          // 이미 닫힌 소켓은 무시한다.
        }
      };
    }

    connect();

    return () => {
      disposed = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      reconnectTimerRef.current = null;

      const socket = socketRef.current;
      socketRef.current = null;

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
    };
  }, [participant]);

  const prepareConnection = useCallback((): void => {
    setMessages([]);
    setConnected(false);
    setStatus("채팅 연결 준비 중");
    setErrorMessage("");
  }, []);

  const sendMessage = useCallback((text: string): boolean => {
    const trimmedMessage = text.trim();

    if (!trimmedMessage) {
      setErrorMessage("보낼 메시지를 입력해 주세요.");
      return false;
    }

    if (trimmedMessage.length > MAX_CHAT_MESSAGE_LENGTH) {
      setErrorMessage(
        `메시지는 최대 ${MAX_CHAT_MESSAGE_LENGTH}자까지 입력할 수 있습니다.`,
      );
      return false;
    }

    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setErrorMessage("채팅 서버에 연결되어 있지 않습니다.");
      return false;
    }

    socket.send(trimmedMessage);
    setErrorMessage("");

    return true;
  }, []);

  const clearError = useCallback((): void => {
    setErrorMessage("");
  }, []);

  const reset = useCallback((): void => {
    setMessages([]);
    setConnected(false);
    setStatus("채팅 연결 전");
    setErrorMessage("");
  }, []);

  return {
    messages,
    connected,
    status,
    errorMessage,
    prepareConnection,
    sendMessage,
    clearError,
    reset,
  };
}