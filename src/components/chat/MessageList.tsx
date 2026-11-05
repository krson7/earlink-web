"use client";

import {
  useEffect,
  useRef,
} from "react";

type ChatMessageItem = {
  type: "message";
  sender_id: number;
  content: string;
  localId: string;
};

type MessageListProps = {
  messages: ChatMessageItem[];
  participantId: number;
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
}: MessageListProps) {
  const endRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  return (
    <section className="message-list">
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="실시간 채팅 메시지"
        className="message-scroll"
      >
        {messages.length === 0 ? (
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

        <div ref={endRef} />
      </div>
    </section>
  );
}
