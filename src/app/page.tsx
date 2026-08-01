"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import CameraComposer from "@/components/chat/CameraComposer";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageList from "@/components/chat/MessageList";
import IntroSplash from "@/components/entry/IntroSplash";
import ModeSelect from "@/components/entry/ModeSelect";

const FASTAPI_HTTP_BASE_URL =
  process.env
    .NEXT_PUBLIC_FASTAPI_HTTP_BASE_URL ??
  "http://localhost:8000";

const FASTAPI_WS_BASE_URL =
  process.env
    .NEXT_PUBLIC_FASTAPI_WS_BASE_URL ??
  "ws://localhost:8000";

const SPLASH_DURATION_MS = 1800;
const MAX_CHAT_MESSAGE_LENGTH = 1000;
const MAX_CHAT_RECONNECT_ATTEMPTS = 5;

type AccessibilityMode =
  | "VISUAL"
  | "HEARING"
  | "STANDARD";

type Screen =
  | "SPLASH"
  | "MODE_SELECT"
  | "CHAT";

type JoinRoomResponse = {
  participant_id: number;
  room_id: number;
  room_code: string;
  accessibility_mode: AccessibilityMode;
  joined_at: string;
};

type ErrorResponse = {
  detail?: unknown;
};

type ChatMessage = {
  type: "message";
  sender_id: number;
  content: string;
};

type ChatErrorMessage = {
  type: "error";
  code: string;
  detail: string;
};

type ChatServerMessage =
  | ChatMessage
  | ChatErrorMessage;

type ChatMessageItem =
  ChatMessage & {
    localId: string;
  };

function getApiErrorMessage(
  body: ErrorResponse | null,
): string {
  return typeof body?.detail ===
    "string"
    ? body.detail
    : "서버 요청을 처리하지 못했습니다.";
}

async function requestJson<T>(
  path: string,
  options: RequestInit,
): Promise<T> {
  const headers =
    new Headers(
      options.headers,
    );

  headers.set(
    "Content-Type",
    "application/json",
  );

  const response =
    await fetch(
      `${FASTAPI_HTTP_BASE_URL}${path}`,
      {
        ...options,
        headers,
      },
    );

  const body =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        body as ErrorResponse | null,
      ),
    );
  }

  return body as T;
}

function createLocalMessageId():
  string {
  if (
    typeof crypto !==
      "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return (
    `${Date.now()}-` +
    Math.random()
      .toString(16)
      .slice(2)
  );
}

export default function Home() {
  const chatWebSocketRef =
    useRef<WebSocket | null>(
      null,
    );

  const chatReconnectTimerRef =
    useRef<number | null>(
      null,
    );

  const chatInputRef =
    useRef<HTMLTextAreaElement | null>(
      null,
    );

  // 서비스 선택 버튼을 빠르게 여러 번 눌러도
  // 참가 요청이 중복되지 않도록 막는다.
  const joinInFlightRef =
    useRef(false);

  const [
    screen,
    setScreen,
  ] =
    useState<Screen>(
      "SPLASH",
    );

  const [
    accessibilityMode,
    setAccessibilityMode,
  ] =
    useState<
      AccessibilityMode | null
    >(null);

  const [
    joinedParticipant,
    setJoinedParticipant,
  ] =
    useState<
      JoinRoomResponse | null
    >(null);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    chatMessages,
    setChatMessages,
  ] =
    useState<
      ChatMessageItem[]
    >([]);

  const [
    chatConnected,
    setChatConnected,
  ] =
    useState(false);

  const [
    chatStatus,
    setChatStatus,
  ] =
    useState(
      "채팅 연결 전",
    );

  const [
    chatErrorMessage,
    setChatErrorMessage,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  useEffect(() => {
    if (
      screen !== "SPLASH"
    ) {
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          setScreen(
            "MODE_SELECT",
          );
        },
        SPLASH_DURATION_MS,
      );

    return () => {
      window.clearTimeout(
        timer,
      );
    };
  }, [screen]);

  useEffect(() => {
    if (
      !joinedParticipant
    ) {
      setChatConnected(
        false,
      );

      setChatStatus(
        "채팅 연결 전",
      );

      return;
    }

    let disposed = false;
    let reconnectBlocked =
      false;

    let reconnectDelay =
      500;

    let reconnectAttempts =
      0;

    const normalizedRoomCode =
      joinedParticipant
        .room_code
        .trim()
        .toUpperCase();

    const participantId =
      joinedParticipant
        .participant_id;

    function connectChatWebSocket():
      void {
      if (
        disposed ||
        reconnectBlocked
      ) {
        return;
      }

      const currentSocket =
        chatWebSocketRef.current;

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

      const websocketUrl =
        `${baseUrl}/ws/rooms/` +
        `${encodeURIComponent(
          normalizedRoomCode,
        )}/${participantId}`;

      setChatStatus(
        "채팅 서버 연결 중",
      );

      const socket =
        new WebSocket(
          websocketUrl,
        );

      chatWebSocketRef.current =
        socket;

      socket.onopen = () => {
        reconnectDelay =
          500;

        reconnectAttempts =
          0;

        setChatConnected(
          true,
        );

        setChatStatus(
          "채팅 서버 연결됨",
        );

        setChatErrorMessage(
          "",
        );
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

        let serverMessage:
          ChatServerMessage;

        try {
          serverMessage =
            JSON.parse(
              event.data,
            ) as ChatServerMessage;
        } catch {
          console.warn(
            "채팅 서버 메시지를 해석하지 못했습니다.",
          );

          return;
        }

        if (
          serverMessage.type ===
          "message"
        ) {
          if (
            typeof serverMessage
              .sender_id !==
              "number" ||
            typeof serverMessage
              .content !==
              "string"
          ) {
            return;
          }

          setChatMessages(
            (
              previousMessages,
            ) => [
              ...previousMessages,
              {
                ...serverMessage,

                localId:
                  createLocalMessageId(),
              },
            ],
          );

          return;
        }

        if (
          serverMessage.type ===
          "error"
        ) {
          setChatErrorMessage(
            typeof serverMessage
              .detail ===
              "string"
              ? serverMessage
                  .detail
              : (
                "채팅 서버에서 " +
                "오류가 발생했습니다."
              ),
          );
        }
      };

      socket.onclose = (
        event: CloseEvent,
      ) => {
        if (
          chatWebSocketRef
            .current ===
          socket
        ) {
          chatWebSocketRef.current =
            null;
        }

        setChatConnected(
          false,
        );

        if (disposed) {
          return;
        }

        if (
          event.code ===
          1008
        ) {
          reconnectBlocked =
            true;

          setChatStatus(
            "채팅 참가자 확인 실패",
          );

          setChatErrorMessage(
            event.reason ||
              (
                "해당 대화방의 참가자 " +
                "정보를 확인할 수 없습니다."
              ),
          );

          return;
        }

        reconnectAttempts +=
          1;

        if (
          reconnectAttempts >
          MAX_CHAT_RECONNECT_ATTEMPTS
        ) {
          reconnectBlocked =
            true;

          setChatStatus(
            "채팅 재연결 실패",
          );

          setChatErrorMessage(
            event.reason ||
              (
                "채팅 서버에 다시 " +
                "연결하지 못했습니다."
              ),
          );

          return;
        }

        setChatStatus(
          `채팅 서버 재연결 중 ` +
          `(${reconnectAttempts}/` +
          `${MAX_CHAT_RECONNECT_ATTEMPTS})`,
        );

        chatReconnectTimerRef.current =
          window.setTimeout(
            () => {
              chatReconnectTimerRef.current =
                null;

              connectChatWebSocket();
            },
            reconnectDelay,
          );

        reconnectDelay =
          Math.min(
            reconnectDelay *
              2,
            8000,
          );
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          // 이미 닫힌 소켓은 무시한다.
        }
      };
    }

    connectChatWebSocket();

    return () => {
      disposed = true;

      if (
        chatReconnectTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          chatReconnectTimerRef.current,
        );
      }

      chatReconnectTimerRef.current =
        null;

      const socket =
        chatWebSocketRef.current;

      chatWebSocketRef.current =
        null;

      if (socket) {
        socket.onopen =
          null;

        socket.onmessage =
          null;

        socket.onerror =
          null;

        socket.onclose =
          null;

        try {
          socket.close();
        } catch {
          // 이미 닫힌 소켓은 무시한다.
        }
      }
    };
  }, [joinedParticipant]);

  async function joinDefaultRoom(
    selectedMode:
      AccessibilityMode,
  ): Promise<void> {
    if (
      joinInFlightRef.current
    ) {
      return;
    }

    joinInFlightRef.current =
      true;

    setLoading(true);
    setErrorMessage("");
    setChatErrorMessage("");

    try {
      const participant =
        await requestJson<JoinRoomResponse>(
          "/rooms/join",
          {
            method: "POST",

            body:
              JSON.stringify({
                accessibility_mode:
                  selectedMode,
              }),
          },
        );

      setAccessibilityMode(
        participant
          .accessibility_mode,
      );

      setJoinedParticipant(
        participant,
      );

      setMessage("");
      setChatMessages([]);
      setChatConnected(
        false,
      );

      setChatStatus(
        "채팅 연결 준비 중",
      );

      setChatErrorMessage(
        "",
      );

      setScreen("CHAT");
    } catch (error) {
      setAccessibilityMode(
        null,
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : (
            "대화방 입장에 " +
            "실패했습니다."
          ),
      );
    } finally {
      setLoading(false);

      joinInFlightRef.current =
        false;
    }
  }

  function handleSelectMode(
    selectedMode:
      AccessibilityMode,
  ): void {
    void joinDefaultRoom(
      selectedMode,
    );
  }

  function handleLeaveRoom():
    void {
    setJoinedParticipant(
      null,
    );

    setAccessibilityMode(
      null,
    );

    setMessage("");
    setChatMessages([]);

    setChatConnected(
      false,
    );

    setChatStatus(
      "채팅 연결 전",
    );

    setChatErrorMessage(
      "",
    );

    setErrorMessage("");

    joinInFlightRef.current =
      false;

    setScreen(
      "MODE_SELECT",
    );
  }

  function handleMessageChange(
    value: string,
  ): void {
    setMessage(value);

    setChatErrorMessage(
      "",
    );
  }

  function handleApplyRecognizedText(
    text: string,
  ): void {
    const normalizedText =
      text.trim();

    if (!normalizedText) {
      return;
    }

    const previousText =
      message.trimEnd();

    const nextMessage =
      previousText
        ? `${previousText} ${normalizedText}`
        : normalizedText;

    if (
      nextMessage.length >
      MAX_CHAT_MESSAGE_LENGTH
    ) {
      setChatErrorMessage(
        `메시지는 최대 ` +
        `${MAX_CHAT_MESSAGE_LENGTH}자까지 ` +
        `입력할 수 있습니다.`,
      );

      return;
    }

    setMessage(
      nextMessage,
    );

    setChatErrorMessage(
      "",
    );

    window
      .requestAnimationFrame(
        () => {
          chatInputRef.current
            ?.focus();
        },
      );
  }

  function handleSendMessage(
    event:
      FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    const trimmedMessage =
      message.trim();

    if (!trimmedMessage) {
      setChatErrorMessage(
        "보낼 메시지를 입력해 주세요.",
      );

      return;
    }

    if (
      trimmedMessage.length >
      MAX_CHAT_MESSAGE_LENGTH
    ) {
      setChatErrorMessage(
        `메시지는 최대 ` +
        `${MAX_CHAT_MESSAGE_LENGTH}자까지 ` +
        `입력할 수 있습니다.`,
      );

      return;
    }

    const socket =
      chatWebSocketRef.current;

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
    ) {
      setChatErrorMessage(
        "채팅 서버에 연결되어 있지 않습니다.",
      );

      return;
    }

    // room_code와 participant_id는
    // WebSocket URL에 이미 포함되어 있으므로
    // 메시지는 일반 문자열로 전송한다.
    socket.send(
      trimmedMessage,
    );

    setMessage("");

    setChatErrorMessage(
      "",
    );
  }

  function getChatPlaceholder():
    string {
    if (!chatConnected) {
      return "채팅 서버 연결 중...";
    }

    if (
      accessibilityMode ===
      "VISUAL"
    ) {
      return (
        "점자 기기 연동 전입니다. " +
        "임시로 텍스트를 입력하세요"
      );
    }

    return "메시지를 입력하세요";
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-200 text-slate-900">
      <div className="mx-auto h-full w-full max-w-[430px] overflow-hidden bg-white shadow-2xl">
        {screen ===
          "SPLASH" && (
          <IntroSplash />
        )}

        {screen ===
          "MODE_SELECT" && (
          <div className="relative h-full">
            <ModeSelect
              onSelectMode={
                handleSelectMode
              }
            />

            {errorMessage && (
              <div
                role="alert"
                className="absolute left-5 right-5 top-5 z-20 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700 shadow-lg"
              >
                {errorMessage}
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/65 backdrop-blur-[2px]">
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-3xl border border-slate-200 bg-white px-7 py-5 text-center shadow-xl"
                >
                  <div
                    aria-hidden="true"
                    className="mx-auto h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-fuchsia-500"
                  />

                  <p className="mt-3 text-sm font-bold text-slate-700">
                    대화방에 입장하고 있어요
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {screen ===
          "CHAT" &&
          joinedParticipant &&
          accessibilityMode && (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
            <ChatHeader
              chatConnected={
                chatConnected
              }
              chatStatus={
                chatStatus
              }
              accessibilityMode={
                accessibilityMode
              }
              onLeave={
                handleLeaveRoom
              }
            />

            <MessageList
              messages={
                chatMessages
              }
              participantId={
                joinedParticipant
                  .participant_id
              }
            />

            {accessibilityMode ===
            "HEARING" ? (
              <CameraComposer
                roomCode={
                  joinedParticipant
                    .room_code
                }
                participantId={
                  joinedParticipant
                    .participant_id
                }
                message={
                  message
                }
                chatConnected={
                  chatConnected
                }
                chatErrorMessage={
                  chatErrorMessage
                }
                maxLength={
                  MAX_CHAT_MESSAGE_LENGTH
                }
                inputRef={
                  chatInputRef
                }
                onMessageChange={
                  handleMessageChange
                }
                onApplyText={
                  handleApplyRecognizedText
                }
                onSubmit={
                  handleSendMessage
                }
              />
            ) : (
              <ChatComposer
                message={
                  message
                }
                chatConnected={
                  chatConnected
                }
                chatErrorMessage={
                  chatErrorMessage
                }
                placeholder={
                  getChatPlaceholder()
                }
                maxLength={
                  MAX_CHAT_MESSAGE_LENGTH
                }
                inputRef={
                  chatInputRef
                }
                onMessageChange={
                  handleMessageChange
                }
                onSubmit={
                  handleSendMessage
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}