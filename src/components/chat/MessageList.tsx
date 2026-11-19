"use client";

import { useEffect, useRef } from "react";
import type { BrailleTypingItem, ChatMessageItem } from "@/types/chat";

type MessageListProps = {
  messages: ChatMessageItem[];
  participantId: number;
  brailleTyping: BrailleTypingItem[];
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

export default function MessageList({ messages, participantId, brailleTyping }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const draftSignature = JSON.stringify(brailleTyping);

  useEffect(() => {
    const container = scrollRef.current;
    container?.scrollTo({
      top: container.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [messages, draftSignature]);

  return (
    <section className="message-list">
      <div ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions text"
        aria-label="실시간 채팅 메시지" className="message-scroll">
        {messages.length === 0 && brailleTyping.length === 0 && (
          <div className="flex min-h-[65%] flex-col items-center justify-center px-8 text-center">
            <p className="mt-2 text-xs leading-6 text-slate-500">
              같은 방에 입장한 사용자에게<br />메시지가 실시간으로 전달됩니다.
            </p>
          </div>
        )}

        {messages.map((chatMessage) => {
          // The phone relays the hardware user's messages over its socket.
          // That transport ID never makes the keyboard user the screen user.
          const isMine = chatMessage.source !== "braille" && chatMessage.sender_id === participantId;
          return (
            <div key={chatMessage.localId} data-sender={isMine ? "self" : "other"}
              className={isMine ? "flex justify-end pl-7" : "flex items-end gap-2.5 pr-7"}>
              {!isMine && <ParticipantAvatar />}
              <div className="max-w-[82%]">
                {!isMine && <p className="message-sender">{chatMessage.source === "braille" ? "점자 키보드 참여자" : "참여자"}</p>}
                <div className={isMine ? "message-bubble mine" : "message-bubble"}>
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{chatMessage.content}</p>
                </div>
              </div>
            </div>
          );
        })}

        {brailleTyping.map((draft) => (
          <div key={`braille-${draft.senderId}`} data-sender="other" data-participant-id={draft.senderId}
            className="flex items-end gap-2.5 pr-7 braille-typing">
            <ParticipantAvatar />
            <div className="max-w-[82%]">
              <p className="message-sender">점자 키보드 참여자</p>
              <div className="message-bubble typing-bubble" aria-label="상대방의 점자 입력 내용">
                {draft.content && <p className="braille-live-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{draft.content}</p>}
                <div className="typing-status">
                  <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
                  <span>점자로 입력 중이에요</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
