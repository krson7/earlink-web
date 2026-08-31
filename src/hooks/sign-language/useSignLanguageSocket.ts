"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import type {
  Dispatch,
  SetStateAction,
} from "react";

import {
  FASTAPI_WS_BASE_URL,
  MAX_RECONNECT_ATTEMPTS,
  WS_MAX_BUFFERED,
} from "@/lib/sign-language/constants";

import type {
  ErrorMessage,
  JamoMessage,
  Landmark,
  ServerMessage,
} from "@/types/sign-language";

type UseSignLanguageSocketParams = {
  roomCode: string;
  participantId: number;

  setStatus: Dispatch<
    SetStateAction<string>
  >;

  setConnected: Dispatch<
    SetStateAction<boolean>
  >;

  setErrorMessage: Dispatch<
    SetStateAction<string>
  >;

  onJamoMessage: (
    message: JamoMessage,
  ) => void;
};

export function useSignLanguageSocket({
  roomCode,
  participantId,
  setStatus,
  setConnected,
  setErrorMessage,
  onJamoMessage,
}: UseSignLanguageSocketParams) {
  const webSocketRef =
    useRef<WebSocket | null>(null);

  const reconnectTimerRef =
    useRef<
      ReturnType<typeof setTimeout> | null
    >(null);

  const reconnectDelayRef =
    useRef(500);

  const reconnectBlockedRef =
    useRef(false);

  const reconnectAttemptsRef =
    useRef(0);

  const disposedRef =
    useRef(true);

  const frameIdRef =
    useRef(0);

  const onJamoMessageRef =
    useRef(onJamoMessage);

  useEffect(() => {
    onJamoMessageRef.current =
      onJamoMessage;
  }, [onJamoMessage]);

  const clearReconnectTimer =
    useCallback((): void => {
      if (
        reconnectTimerRef.current !==
        null
      ) {
        clearTimeout(
          reconnectTimerRef.current,
        );
      }

      reconnectTimerRef.current =
        null;
    }, []);

  const closeCurrentSocket =
    useCallback((): void => {
      const socket =
        webSocketRef.current;

      webSocketRef.current = null;

      if (!socket) {
        return;
      }

      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      try {
        socket.close();
      } catch {
        // 이미 종료된 경우 무시한다.
      }
    }, []);

  const handleServerError =
    useCallback(
      (
        message: ErrorMessage,
      ): void => {
        console.error(
          "지문자 서버 오류:",
          message.code,
          message.detail,
        );

        setErrorMessage(
          message.detail,
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
          reconnectBlockedRef.current =
            true;
        }
      },
      [
        setErrorMessage,
        setStatus,
      ],
    );

  const connectWebSocket =
    useCallback((): void => {
      if (
        disposedRef.current ||
        reconnectBlockedRef.current
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
        setConnected(false);

        setStatus(
          "참가자 정보 없음",
        );

        setErrorMessage(
          "대화방에 참여한 후 지문자 기능을 사용할 수 있습니다.",
        );

        reconnectBlockedRef.current =
          true;

        return;
      }

      const currentSocket =
        webSocketRef.current;

      if (
        currentSocket &&
        (currentSocket.readyState ===
          WebSocket.OPEN ||
          currentSocket.readyState ===
            WebSocket.CONNECTING)
      ) {
        return;
      }

      const baseUrl =
        FASTAPI_WS_BASE_URL.replace(
          /\/+$/,
          "",
        );

      const translateWebSocketUrl =
        `${baseUrl}/ws/translate/` +
        `${encodeURIComponent(
          normalizedRoomCode,
        )}/` +
        `${participantId}`;

      setStatus(
        "FastAPI 서버 연결 중",
      );

      const socket =
        new WebSocket(
          translateWebSocketUrl,
        );

      webSocketRef.current =
        socket;

      socket.onopen = () => {
        reconnectDelayRef.current =
          500;

        reconnectAttemptsRef.current =
          0;

        setConnected(true);

        setStatus(
          "FastAPI 서버 연결됨",
        );

        setErrorMessage("");
      };

      socket.onmessage = (
        event: MessageEvent,
      ) => {
        let message: ServerMessage;

        try {
          message =
            JSON.parse(
              event.data,
            ) as ServerMessage;
        } catch {
          console.warn(
            "서버 메시지를 JSON으로 해석하지 못했습니다.",
          );

          return;
        }

        switch (message.type) {
          case "jamo":
            onJamoMessageRef.current(
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

        if (
          disposedRef.current
        ) {
          return;
        }

        if (event.code === 1008) {
          reconnectBlockedRef.current =
            true;

          setStatus(
            "참가자 확인 실패",
          );

          setErrorMessage(
            event.reason ||
              "해당 대화방의 참가자 정보를 확인할 수 없습니다.",
          );

          return;
        }

        if (
          reconnectBlockedRef.current
        ) {
          setStatus(
            "지문자 기능 사용 불가",
          );

          if (event.reason) {
            setErrorMessage(
              event.reason,
            );
          }

          return;
        }

        setStatus(
          event.code === 1011
            ? "서버 오류 · 재연결 중"
            : "FastAPI 서버 재연결 중",
        );

        if (
          reconnectAttemptsRef.current >=
          MAX_RECONNECT_ATTEMPTS
        ) {
          reconnectBlockedRef.current =
            true;

          setStatus(
            "지문자 서버 연결 실패",
          );

          setErrorMessage(
            "지문자 서버에 여러 번 연결하지 못했습니다. FastAPI 서버 상태를 확인해 주세요.",
          );

          return;
        }

        reconnectAttemptsRef.current +=
          1;

        reconnectTimerRef.current =
          setTimeout(() => {
            reconnectTimerRef.current =
              null;

            connectWebSocket();
          }, reconnectDelayRef.current);

        reconnectDelayRef.current =
          Math.min(
            reconnectDelayRef.current *
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
    }, [
      handleServerError,
      participantId,
      roomCode,
      setConnected,
      setErrorMessage,
      setStatus,
    ]);

  const startConnectionSession =
    useCallback((): void => {
      clearReconnectTimer();
      closeCurrentSocket();

      disposedRef.current = false;

      reconnectDelayRef.current =
        500;

      reconnectBlockedRef.current =
        false;

      reconnectAttemptsRef.current =
        0;

      frameIdRef.current = 0;

      connectWebSocket();
    }, [
      clearReconnectTimer,
      closeCurrentSocket,
      connectWebSocket,
    ]);

  const stopConnectionSession =
    useCallback((): void => {
      disposedRef.current = true;

      clearReconnectTimer();
      closeCurrentSocket();
    }, [
      clearReconnectTimer,
      closeCurrentSocket,
    ]);

  const sendHand =
    useCallback(
      (
        hand: Landmark[] | null,
        timestamp: number,
      ): void => {
        const socket =
          webSocketRef.current;

        if (
          !socket ||
          socket.readyState !==
            WebSocket.OPEN
        ) {
          return;
        }

        if (
          socket.bufferedAmount >
          WS_MAX_BUFFERED
        ) {
          return;
        }

        frameIdRef.current += 1;

        socket.send(
          JSON.stringify({
            type: "hand",

            frame_id:
              frameIdRef.current,

            t: timestamp,

            hand: hand
              ? hand.map(
                  (point) => [
                    Math.round(
                      point.x * 10000,
                    ) / 10000,

                    Math.round(
                      point.y * 10000,
                    ) / 10000,
                  ],
                )
              : null,
          }),
        );
      },
      [],
    );

  const sendReset =
    useCallback((): boolean => {
      const socket =
        webSocketRef.current;

      if (
        !socket ||
        socket.readyState !==
          WebSocket.OPEN
      ) {
        return false;
      }

      socket.send(
        JSON.stringify({
          type: "reset",
        }),
      );

      return true;
    }, []);

  useEffect(() => {
    return () => {
      stopConnectionSession();
    };
  }, [stopConnectionSession]);

  return {
    startConnectionSession,
    stopConnectionSession,
    sendHand,
    sendReset,
  };
}