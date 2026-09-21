"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { FormEvent } from "react";

import CameraComposer from "@/components/chat/CameraComposer";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatHeader from "@/components/chat/ChatHeader";
import EarLinkConnector from "@/components/chat/EarLinkConnector";
import MessageList from "@/components/chat/MessageList";

import { useEarLinkBluetooth } from "@/hooks/useEarLinkBluetooth";

import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat";

import type {
  ChatMessageItem,
  JoinRoomResponse,
} from "@/types/chat";

type ChatScreenProps = {
  participant: JoinRoomResponse;
  messages: ChatMessageItem[];
  chatConnected: boolean;
  chatStatus: string;
  chatErrorMessage: string;
  onLeave: () => void;
  onSendMessage: (text: string) => boolean;
  onClearError: () => void;
};

function getChatPlaceholder(
  chatConnected: boolean,
): string {
  if (!chatConnected) {
    return "채팅 서버 연결 중...";
  }

  return "메시지를 입력하세요";
}

export default function ChatScreen({
  participant,
  messages,
  chatConnected,
  chatStatus,
  chatErrorMessage,
  onLeave,
  onSendMessage,
  onClearError,
}: ChatScreenProps) {
  const inputRef =
    useRef<HTMLTextAreaElement | null>(null);

  const [message, setMessage] =
    useState("");

  const accessibilityMode =
    participant.accessibility_mode;

  /*
   * EarLink Bluetooth
   */
  const {
    connected: earLinkConnected,
    deviceName: earLinkDeviceName,
    error: earLinkError,
    connect: connectEarLink,
    disconnect: disconnectEarLink,
    send: sendToEarLink,
  } = useEarLinkBluetooth();

  /*
   * 이미 확인한 채팅 메시지 ID
   *
   * EarLink 연결 전에 존재했던 메시지나
   * 이미 ESP32로 전달한 메시지를 다시 보내지 않기 위해 사용.
   */
  const processedMessageIdsRef =
    useRef<Set<string>>(new Set());

  /*
   * 현재 EarLink 연결에서
   * 기존 메시지 기준점을 잡았는지 여부
   */
  const earLinkReadyRef =
    useRef(false);

  /*
   * 연결 세션 번호.
   *
   * 연결이 끊긴 뒤 이전 연결에서 대기 중이던
   * 메시지가 새 연결로 넘어가는 것을 방지.
   */
  const earLinkSessionRef =
    useRef(0);

  /*
   * BLE Write를 순서대로 실행하기 위한 Queue.
   *
   * 메시지가 연속으로 여러 개 들어와도
   * BLE Write가 동시에 실행되지 않게 한다.
   */
  const sendQueueRef =
    useRef<Promise<void>>(Promise.resolve());

  function handleMessageChange(
    value: string,
  ): void {
    setMessage(value);
    onClearError();
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    if (onSendMessage(message)) {
      setMessage("");
    }
  }

  /*
   * EarLink 채팅 전달
   *
   * 정책:
   *
   * 1. VISUAL 모드에서만 동작
   * 2. EarLink 연결 전 메시지는 전달하지 않음
   * 3. 연결 완료 시점에 존재하는 메시지는 모두 과거 메시지로 처리
   * 4. 연결 이후 새로 들어온 메시지만 전달
   * 5. 내가 보낸 메시지는 전달하지 않음
   * 6. 같은 메시지는 두 번 전달하지 않음
   */
  useEffect(() => {
    if (accessibilityMode !== "VISUAL") {
      return;
    }

    /*
     * EarLink가 연결되어 있지 않은 상태
     *
     * 연결 전에 들어온 채팅은 저장해두지 않고
     * 그냥 무시한다.
     */
    if (!earLinkConnected) {
      earLinkReadyRef.current = false;

      processedMessageIdsRef.current.clear();

      /*
       * 이전 Bluetooth 세션 무효화
       */
      earLinkSessionRef.current += 1;

      return;
    }

    /*
     * EarLink가 방금 연결된 순간
     *
     * 현재 화면에 존재하는 모든 메시지를
     * "이미 처리된 메시지"로 기록한다.
     *
     * 따라서 연결 이전 메시지는 ESP32로 가지 않는다.
     */
    if (!earLinkReadyRef.current) {
      processedMessageIdsRef.current =
        new Set(
          messages.map(
            (chatMessage) =>
              chatMessage.localId,
          ),
        );

      earLinkReadyRef.current = true;

      /*
       * 새로운 Bluetooth 연결 세션 시작
       */
      earLinkSessionRef.current += 1;

      return;
    }

    /*
     * 아직 처리하지 않은 새 메시지 찾기
     */
    const newMessages =
      messages.filter(
        (chatMessage) =>
          !processedMessageIdsRef.current.has(
            chatMessage.localId,
          ),
      );

    if (newMessages.length === 0) {
      return;
    }

    /*
     * 먼저 처리된 메시지로 등록한다.
     *
     * React가 다시 렌더링되어도
     * 같은 메시지가 중복 전송되지 않는다.
     */
    for (const chatMessage of newMessages) {
      processedMessageIdsRef.current.add(
        chatMessage.localId,
      );
    }

    const currentSession =
      earLinkSessionRef.current;

    /*
     * 새 메시지 중 상대방 메시지만
     * EarLink로 전달한다.
     */
    for (const chatMessage of newMessages) {
      /*
       * 내가 보낸 메시지는 제외
       */
      if (
        chatMessage.sender_id ===
        participant.participant_id
      ) {
        continue;
      }

      /*
       * 빈 메시지 제외
       */
      if (!chatMessage.content.trim()) {
        continue;
      }

      /*
       * BLE Write는 한 번에 하나씩 실행
       */
      sendQueueRef.current =
        sendQueueRef.current.then(
          async () => {
            /*
             * 전송 대기 중 연결이 끊겼다면
             * 해당 메시지는 보내지 않는다.
             */
            if (
              earLinkSessionRef.current !==
              currentSession
            ) {
              return;
            }

            try {
              await sendToEarLink(
                chatMessage.content,
              );

              console.log(
                "EarLink 메시지 전송:",
                chatMessage.content,
              );
            } catch (error) {
              console.error(
                "EarLink 메시지 전송 실패:",
                error,
              );
            }
          },
        );
    }
  }, [
    accessibilityMode,
    earLinkConnected,
    messages,
    participant.participant_id,
    sendToEarLink,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <ChatHeader
        chatConnected={chatConnected}
        chatStatus={chatStatus}
        accessibilityMode={
          accessibilityMode
        }
        onLeave={onLeave}
      />

      <MessageList
        messages={messages}
        participantId={
          participant.participant_id
        }
      />

      {accessibilityMode ===
      "HEARING" ? (
        <CameraComposer
          roomCode={participant.room_code}
          participantId={
            participant.participant_id
          }
          chatConnected={chatConnected}
          chatErrorMessage={
            chatErrorMessage
          }
          onSendText={onSendMessage}
        />
      ) : accessibilityMode ===
        "VISUAL" ? (
        <EarLinkConnector
          connected={earLinkConnected}
          deviceName={
            earLinkDeviceName
          }
          error={earLinkError}
          onConnect={connectEarLink}
          onDisconnect={
            disconnectEarLink
          }
        />
      ) : (
        <ChatComposer
          message={message}
          chatConnected={chatConnected}
          chatErrorMessage={
            chatErrorMessage
          }
          placeholder={getChatPlaceholder(
            chatConnected,
          )}
          maxLength={
            MAX_CHAT_MESSAGE_LENGTH
          }
          inputRef={inputRef}
          onMessageChange={
            handleMessageChange
          }
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}