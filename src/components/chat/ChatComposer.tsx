"use client";

import { useEffect } from "react";
import { SendIcon } from "@/components/Brand";

import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  RefObject,
} from "react";

type ChatComposerProps = {
  message: string;
  chatConnected: boolean;
  chatErrorMessage: string;
  placeholder: string;
  maxLength: number;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onMessageChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  withSafeArea?: boolean;
  showTopBorder?: boolean;
};

export default function ChatComposer({
  message,
  chatConnected,
  chatErrorMessage,
  placeholder,
  maxLength,
  inputRef,
  onMessageChange,
  onSubmit,
  withSafeArea = true,
  showTopBorder = true,
}: ChatComposerProps) {
  useEffect(() => {
    const textarea = inputRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";

    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      96,
    )}px`;
  }, [inputRef, message]);

  function handleChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void {
    onMessageChange(event.target.value);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const canSend =
    chatConnected &&
    Boolean(message.trim());

  return (
    <form
      onSubmit={onSubmit}
      className="composer"
      data-top-border={showTopBorder || undefined}
      style={
        withSafeArea
          ? {
              paddingBottom:
                "max(0.5rem, env(safe-area-inset-bottom))",
            }
          : undefined
      }
    >
      {chatErrorMessage && (
        <div
          role="alert"
          className="mb-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {chatErrorMessage}
        </div>
      )}

      <div className="flex items-center gap-2">
        <label
          htmlFor="chat-message"
          className="sr-only"
        >
          메시지
        </label>

        {/* 메시지 입력창 */}
        <div className="composer-input">
          <textarea
            ref={inputRef}
            id="chat-message"
            value={message}
            rows={1}
            maxLength={maxLength}
            disabled={!chatConnected}
            placeholder={placeholder}
            enterKeyHint="send"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="disabled:cursor-not-allowed"
          />
        </div>

        {/* 전송 버튼 */}
        <button
          type="submit"
          aria-label="메시지 전송"
          disabled={!canSend}
          className="soft-circle send-button"
        >
          <SendIcon />
        </button>
      </div>

      {message.length >
        maxLength - 100 && (
        <p className="mt-1 pr-[70px] text-right text-[10px] font-medium text-slate-400">
          {message.length}/{maxLength}
        </p>
      )}
    </form>
  );
}
