"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createLocalMessageId,
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_CHAT_RECONNECT_ATTEMPTS,
} from "@/lib/chat";
import type {
  BrailleTypingItem,
  ChatMessageItem,
  ChatServerMessage,
  JoinRoomResponse,
} from "@/types/chat";

const FASTAPI_WS_BASE_URL =
  process.env.NEXT_PUBLIC_FASTAPI_WS_BASE_URL ?? "ws://localhost:8000";

const BRAILLE_TYPING_TTL_MS = 7000;

export function useChatSocket(participant: JoinRoomResponse | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const brailleEventsRef = useRef(false);
  const brailleDraftsRef = useRef(false);
  // Older servers omit source. Match echoes in send order, including identical
  // text sent by the screen user and the separate keyboard user.
  const pendingSendsRef = useRef<{ content: string; braille: boolean }[]>([]);
  const typingTimersRef = useRef(new Map<number, number>());

  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("채팅 연결 전");
  const [errorMessage, setErrorMessage] = useState("");
  const [brailleTyping, setBrailleTyping] = useState<BrailleTypingItem[]>([]);

  const clearTyping = useCallback(() => {
    for (const timer of typingTimersRef.current.values()) window.clearTimeout(timer);
    typingTimersRef.current.clear();
    setBrailleTyping([]);
  }, []);

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
        brailleEventsRef.current = false;
        brailleDraftsRef.current = false;
        pendingSendsRef.current = [];
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

        if (!serverMessage || typeof serverMessage !== "object") return;

        if (serverMessage.type === "capabilities") {
          brailleEventsRef.current = serverMessage.braille_events === true;
          brailleDraftsRef.current = serverMessage.braille_drafts === true;
          return;
        }

        function stopTyping(senderId: number): void {
          window.clearTimeout(typingTimersRef.current.get(senderId));
          typingTimersRef.current.delete(senderId);
          setBrailleTyping((previous) => previous.filter((item) => item.senderId !== senderId));
        }

        if (serverMessage.type === "typing") {
          if (serverMessage.source !== "braille" ||
              !Number.isSafeInteger(serverMessage.sender_id) || serverMessage.sender_id <= 0 ||
              serverMessage.sender_id === participantId || typeof serverMessage.active !== "boolean" ||
              (serverMessage.content !== undefined && (typeof serverMessage.content !== "string" ||
                serverMessage.content.length > MAX_CHAT_MESSAGE_LENGTH))) return;
          const senderId = serverMessage.sender_id;
          window.clearTimeout(typingTimersRef.current.get(senderId));
          if (!serverMessage.active) {
            stopTyping(senderId);
          } else {
            const content = serverMessage.content;
            setBrailleTyping((previous) => {
              const existing = previous.find((item) => item.senderId === senderId);
              if (existing && existing.content === content) return previous;
              return [...previous.filter((item) => item.senderId !== senderId), { senderId, content }];
            });
            typingTimersRef.current.set(senderId, window.setTimeout(() => stopTyping(senderId), BRAILLE_TYPING_TTL_MS));
          }
          return;
        }

        if (serverMessage.type === "message") {
          if (
            typeof serverMessage.sender_id !== "number" ||
            typeof serverMessage.content !== "string"
          ) {
            return;
          }

          let source = serverMessage.source;
          if (serverMessage.sender_id === participantId) {
            const index = pendingSendsRef.current.findIndex((item) => item.content === serverMessage.content);
            if (index !== -1) {
              const [sent] = pendingSendsRef.current.splice(index, 1);
              if (sent.braille) source = "braille";
            }
          }
          if (source === "braille") stopTyping(serverMessage.sender_id);

          setMessages((previousMessages) => [
            ...previousMessages,
            {
              ...serverMessage,
              source,
              localId: createLocalMessageId(),
            },
          ]);

          return;
        }

        if (serverMessage.type === "error") {
          if (serverMessage.code !== "INVALID_TYPING_EVENT") pendingSendsRef.current.shift();
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
        brailleEventsRef.current = false;
        clearTyping();

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
      brailleEventsRef.current = false;
      brailleDraftsRef.current = false;
      pendingSendsRef.current = [];
      clearTyping();

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
  }, [participant, clearTyping]);

  const prepareConnection = useCallback((): void => {
    clearTyping();
    setMessages([]);
    setConnected(false);
    setStatus("채팅 연결 준비 중");
    setErrorMessage("");
  }, [clearTyping]);

  const sendText = useCallback((text: string, braille = false): boolean => {
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

    try {
      // Older servers treat every frame as chat text. Only use envelopes after
      // the server advertises support, so status JSON never appears in chat.
      socket.send(braille && brailleEventsRef.current
        ? JSON.stringify({ type: "message", source: "braille", content: trimmedMessage })
        : trimmedMessage);
      pendingSendsRef.current.push({ content: trimmedMessage, braille });
    } catch {
      setErrorMessage("메시지를 전송하지 못했습니다. 연결을 확인해 주세요.");
      return false;
    }
    setErrorMessage("");

    return true;
  }, []);

  const sendMessage = useCallback((text: string) => sendText(text), [sendText]);
  const sendBrailleMessage = useCallback((text: string) => sendText(text, true), [sendText]);

  const sendBrailleTyping = useCallback((active: boolean, content = ""): boolean => {
    const socket = socketRef.current;
    if (!brailleEventsRef.current || !socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify({ type: "typing", source: "braille", active,
        ...(brailleDraftsRef.current ? { content: active ? content.slice(0, MAX_CHAT_MESSAGE_LENGTH) : "" } : {}),
      }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const clearError = useCallback((): void => {
    setErrorMessage("");
  }, []);

  const reset = useCallback((): void => {
    sendBrailleTyping(false);
    clearTyping();
    setMessages([]);
    setConnected(false);
    setStatus("채팅 연결 전");
    setErrorMessage("");
  }, [sendBrailleTyping, clearTyping]);
  

  return {
    messages,
    brailleTyping,
    connected,
    status,
    errorMessage,
    prepareConnection,
    sendMessage,
    sendBrailleMessage,
    sendBrailleTyping,
    clearError,
    reset,
  };
}
