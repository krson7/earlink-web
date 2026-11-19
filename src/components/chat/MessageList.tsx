"use client";

import {
  useEffect,
  useRef,
} from "react";
import type { ChatMessageItem } from "@/types/chat";

type MessageListProps = {
  messages: ChatMessageItem[];
  participantId: number;
  brailleTypingParticipantIds: number[];
};

function ParticipantAvatar() {
  return (
    <div aria-hidden="true" className="participant-avatar">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="8" r="3" />
        <path d="M5 20a7 7 0 0 1 14 0Z" />
      </svg>
    </div>
  );
}

export default function MessageList({
  messages,
  participantId,
  brailleTypingParticipantIds,
}: MessageListProps) {
  const scrollRef =
    useRef<HTMLDivElement | null>(
      null,
    );
  const typingCount = brailleTypingParticipantIds.filter((id) => id !== participantId).length;

  useEffect(() => {
    const container = scrollRef.current;
    container?.scrollTo({
      top: container.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [messages, typingCount]);

  return (
    <section className="message-list">
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="실시간 채팅 메시지"
        className="message-scroll"
      >
        {messages.length === 0 && typingCount === 0 ? (
          <div className="flex min-h-[65%] flex-col items-center justify-center px-8 text-center">
            

            <p className="mt-2 text-xs leading-6 text-slate-500">
              같은 방에 입장한 사용자에게
              <br />
              메시지가 실시간으로 전달됩니다.
            </p>
          </div>
        ) : (
          messages.map(
            (chatMessage) => {
              const isMine =
                chatMessage.sender_id ===
                participantId;

              if (isMine) {
                return (
                  <div
                    key={
                      chatMessage.localId
                    }
                    className="flex justify-end pl-7"
                  >
                    <div className="max-w-[82%]">
                      <div className="message-bubble mine">
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {
                            chatMessage.content
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={
                    chatMessage.localId
                  }
                  className="flex items-end gap-2.5 pr-7"
                >
                  <ParticipantAvatar />

                  <div className="max-w-[82%]">
                    <p className="mb-1 ml-1 text-[11px] font-medium text-[#606b80]">
                      참여자
                    </p>

                    <div className="message-bubble">
                      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {
                          chatMessage.content
                        }
                      </p>
                    </div>
                  </div>
                </div>
              );
            },
          )
        )}

        {typingCount > 0 && (
          <div className="flex items-end gap-2.5 pr-7 braille-typing" role="status" aria-live="polite">
            <ParticipantAvatar />
            <div className="max-w-[82%]">
              <p className="mb-1 ml-1 text-[11px] font-medium text-[#606b80]">점자 키보드 참여자</p>
              <div className="message-bubble typing-bubble">
                <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
                <span>{typingCount > 1 ? `${typingCount}명이 점자로 입력 중이에요` : "점자로 입력 중이에요"}</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
