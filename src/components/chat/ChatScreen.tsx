"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { FormEvent } from "react";

import { MicIcon } from "@/components/Brand";
import BrailleKeyboardComposer from "@/components/chat/BrailleKeyboardComposer";
import CameraComposer from "@/components/chat/CameraComposer";
import ChatComposer from "@/components/chat/ChatComposer";
import ChatHeader from "@/components/chat/ChatHeader";
import MessageList from "@/components/chat/MessageList";

import type { EarLinkBluetooth } from "@/hooks/useEarLinkBluetooth";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useSpeechOutput } from "@/hooks/useSpeechOutput";

import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat";

import type {
  ChatMessageItem,
  JoinRoomResponse,
} from "@/types/chat";

type ChatScreenProps = {
  participant: JoinRoomResponse;
  messages: ChatMessageItem[];
  brailleTypingParticipantIds: number[];
  chatConnected: boolean;
  chatStatus: string;
  chatErrorMessage: string;
  earLink: EarLinkBluetooth;
  // 상단에 보여 줄 기기 상태 (내 휴대폰 또는 다른 휴대폰의 연결)
  device: { connected: boolean; serialNumber: string | null };
  // 점자 키보드로 보낸 내 메시지인지 확인 (한 번만 true)
  isKeyboardEcho: (content: string) => boolean;
  onDevicePress: () => void;
  onLeave: () => void;
  onSendMessage: (text: string) => boolean;
  onClearError: () => void;
};

function getChatPlaceholder(
  chatConnected: boolean,
  voiceMode: boolean,
  listening: boolean,
): string {
  if (!chatConnected) {
    return "채팅 서버 연결 중...";
  }

  if (voiceMode) {
    return listening ? "듣고 있어요…" : "마이크를 누르거나 입력하세요";
  }

  return "메시지를 입력하세요";
}

export default function ChatScreen({
  participant,
  messages,
  brailleTypingParticipantIds,
  chatConnected,
  chatStatus,
  chatErrorMessage,
  earLink,
  device,
  isKeyboardEcho,
  onDevicePress,
  onLeave,
  onSendMessage,
  onClearError,
}: ChatScreenProps) {
  const inputRef =
    useRef<HTMLTextAreaElement | null>(null);

  const [message, setMessage] =
    useState("");

  const [failedMessages, setFailedMessages] = useState<ChatMessageItem[]>([]);
  const [retrying, setRetrying] = useState(false);

  const accessibilityMode =
    participant.accessibility_mode;

  // 서버 값 VISUAL은 화면에서 "음성" 모드다.
  const voiceMode = accessibilityMode === "VISUAL";

  /*
   * EarLink Bluetooth
   *
   * 연결은 메인 화면에서도 할 수 있도록 page.tsx가 관리한다.
   * 대화방을 나갔다 들어와도 연결이 유지된다.
   */
  const {
    connected: earLinkConnected,
    connecting: earLinkConnecting,
    send: sendToEarLink,
    keyboard,
    keyboardSupported,
    keyboardError,
    requestKeyboardSend,
  } = earLink;

  /*
   * 음성 모드: 받은 메시지는 소리로 읽고, 입력은 마이크로 받는다.
   */
  const { speak, hold: holdSpeech } = useSpeechOutput();
  const speechInput = useSpeechInput((text) => {
    setMessage(text);
    onClearError();
  });
  const { listening, cancel: cancelListening } = speechInput;

  // 입장 시점에 이미 있던 메시지는 읽지 않는다.
  const [spokenIds] = useState(
    () => new Set(messages.map((chatMessage) => chatMessage.localId)),
  );

  useEffect(() => {
    for (const chatMessage of messages) {
      if (spokenIds.has(chatMessage.localId)) continue;
      spokenIds.add(chatMessage.localId);

      if (
        voiceMode &&
        chatMessage.sender_id !== participant.participant_id &&
        chatMessage.content.trim()
      ) {
        speak(chatMessage.content);
      }
    }
  }, [messages, voiceMode, participant.participant_id, speak, spokenIds]);

  // 마이크로 듣는 동안에는 읽기를 멈춘다.
  useEffect(() => {
    holdSpeech(listening);
  }, [listening, holdSpeech]);

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

  useEffect(() => () => { earLinkSessionRef.current += 1; }, []);

  async function retryFailedMessages(): Promise<void> {
    if (retrying || !earLinkConnected) return;
    setRetrying(true);
    const session = earLinkSessionRef.current;
    try {
      for (const failed of failedMessages) {
        if (session !== earLinkSessionRef.current) break;
        await sendToEarLink(failed.content);
        setFailedMessages((previous) => previous.filter((item) => item.localId !== failed.localId));
      }
    } catch {
      // The Bluetooth hook displays the transmission error.
    } finally {
      setRetrying(false);
    }
  }

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
      // 늦게 도착한 인식 결과가 비운 입력칸을 다시 채우지 않게 한다.
      cancelListening();
      setMessage("");
    }
  }

  /*
   * EarLink 채팅 전달
   *
   * 정책:
   *
   * 1. 모든 대화 방식에서 동작 (기기가 연결되어 있을 때)
   * 2. EarLink 연결 전 메시지는 전달하지 않음
   * 3. 연결 완료 시점에 존재하는 메시지는 모두 과거 메시지로 처리
   * 4. 연결 이후 새로 들어온 메시지만 전달 (내 메시지 + 상대 메시지)
   * 5. 점자 키보드로 보낸 내 메시지는 전달하지 않음
   *    (기기에서 친 글이 다시 점자로 돌아오지 않게)
   * 6. 같은 메시지는 두 번 전달하지 않음
   */
  useEffect(() => {
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

    for (const chatMessage of newMessages) {
      /*
       * 점자 키보드로 보낸 내 메시지는 제외
       */
      if (
        chatMessage.sender_id ===
          participant.participant_id &&
        isKeyboardEcho(chatMessage.content)
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

            } catch (error) {
              if (earLinkSessionRef.current === currentSession) {
                setFailedMessages((previous) => previous.some((item) => item.localId === chatMessage.localId)
                  ? previous : [...previous, chatMessage]);
              }
              console.error(
                "EarLink 메시지 전송 실패:",
                error,
              );
            }
          },
        );
    }
  }, [
    earLinkConnected,
    messages,
    participant.participant_id,
    sendToEarLink,
    isKeyboardEcho,
  ]);

  const micButton = voiceMode ? (
    <button
      type="button"
      aria-pressed={listening}
      aria-label={listening ? "음성 입력 멈추기" : "음성으로 입력"}
      disabled={!speechInput.supported || !chatConnected}
      onClick={() => (listening ? speechInput.stop() : speechInput.start())}
      className={listening ? "soft-circle mic-button is-listening" : "soft-circle mic-button"}
    >
      <MicIcon />
    </button>
  ) : undefined;

  const composerError =
    chatErrorMessage ||
    (voiceMode ? speechInput.error ?? "" : "");

  return (
    <div className="chat-screen">
      <ChatHeader
        chatConnected={chatConnected}
        chatStatus={chatStatus}
        accessibilityMode={
          accessibilityMode
        }
        deviceConnected={device.connected}
        deviceConnecting={earLinkConnecting}
        serialNumber={device.serialNumber}
        onDevicePress={onDevicePress}
        onLeave={onLeave}
      />

      <MessageList
        messages={messages}
        brailleTypingParticipantIds={brailleTypingParticipantIds}
        participantId={
          participant.participant_id
        }
      />

      {failedMessages.length > 0 && (
        <div role="alert" className="device-delivery-notice">
          <span>점자 기기로 {failedMessages.length}개를 보내지 못했어요</span>
          <button
            type="button"
            disabled={!earLinkConnected || retrying}
            onClick={() => void retryFailedMessages()}
          >
            {retrying ? "다시 보내는 중…" : "다시 보내기"}
          </button>
        </div>
      )}

      <div className="composer-stack">
        {earLinkConnected && keyboardSupported && (
          <BrailleKeyboardComposer
            chatConnected={chatConnected}
            snapshot={keyboard}
            error={keyboardError}
            onSend={requestKeyboardSend}
          />
        )}

        {accessibilityMode === "HEARING" ? (
          <CameraComposer
            roomCode={participant.room_code}
            participantId={participant.participant_id}
            chatConnected={chatConnected}
            chatErrorMessage={chatErrorMessage}
            onSendText={onSendMessage}
          />
        ) : (
          <ChatComposer
            message={message}
            chatConnected={chatConnected}
            chatErrorMessage={composerError}
            placeholder={getChatPlaceholder(
              chatConnected,
              voiceMode,
              listening,
            )}
            maxLength={
              MAX_CHAT_MESSAGE_LENGTH
            }
            inputRef={inputRef}
            leadingAction={micButton}
            onMessageChange={
              handleMessageChange
            }
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
