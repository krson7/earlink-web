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
    <div
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d7dde3] shadow-sm ring-1 ring-white"
    >
      <svg
        viewBox="0 0 64 64"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="32"
          cy="32"
          r="32"
          fill="#d7dde3"
        />

        <circle
          cx="32"
          cy="24"
          r="12"
          fill="#b4bcc4"
        />

        <path
          d="M14 54c2.8-9.6 10.8-15 18-15s15.2 5.4 18 15"
          fill="#b4bcc4"
        />
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
    <section className="relative min-h-0 flex-1 overflow-hidden bg-[#f8fafc]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(100,116,139,0.07),_transparent_38%)]"
      />

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="실시간 채팅 메시지"
        className="relative h-full space-y-3 overflow-y-auto overscroll-contain px-3 py-4"
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
                    className="flex justify-end pl-12"
                  >
                    <div className="max-w-[82%]">
                      <div className="rounded-[20px] rounded-br-[6px] bg-gradient-to-br from-[#596779] via-[#68778a] to-[#7c899a] px-3.5 py-2.5 text-[14px] leading-5 text-white shadow-[0_5px_14px_rgba(51,65,85,0.16)] ring-1 ring-white/20">
                        <p className="whitespace-pre-wrap break-words">
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
                  className="flex items-end gap-2 pr-12"
                >
                  <ParticipantAvatar />

                  <div className="max-w-[82%]">
                    <p className="mb-1 ml-1 text-[11px] font-semibold text-slate-500">
                      참여자
                    </p>

                    <div className="rounded-[20px] rounded-bl-[6px] bg-white px-3.5 py-2.5 text-[14px] leading-5 text-slate-800 shadow-[0_3px_10px_rgba(15,23,42,0.06)] ring-1 ring-slate-200">
                      <p className="whitespace-pre-wrap break-words">
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