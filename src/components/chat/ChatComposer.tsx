"use client";

import { useEffect } from "react";

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

function EarLinkSendMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
      className="h-7 w-7"
    >
      <circle
        cx="23"
        cy="31"
        r="6"
        stroke="currentColor"
        strokeWidth="4"
      />

      <circle
        cx="41"
        cy="31"
        r="6"
        stroke="currentColor"
        strokeWidth="4"
      />
    </svg>
  );
}

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
      className={[
        "shrink-0 bg-white px-3 py-2.5",
        showTopBorder
          ? "border-t border-slate-200"
          : "",
      ].join(" ")}
      style={
        withSafeArea
          ? {
              paddingBottom:
                "max(0.75rem, env(safe-area-inset-bottom))",
            }
          : undefined
      }
    >
      {chatErrorMessage && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          {chatErrorMessage}
        </div>
      )}

      <div className="flex items-end gap-2">
        <label
          htmlFor="chat-message"
          className="sr-only"
        >
          메시지
        </label>

        <div className="min-w-0 flex-1 rounded-[24px] border border-blue-100 bg-white px-4 py-2.5 shadow-[0_5px_16px_rgba(15,23,42,0.04)] transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-50">
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
            className="max-h-24 min-h-5 w-full resize-none overflow-y-auto bg-transparent text-[14px] leading-5 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
          />
        </div>

        <button
          type="submit"
          aria-label="메시지 전송"
          disabled={!canSend}
          className={[
            "flex h-14 w-[74px] shrink-0 items-center justify-center",
            "rounded-[22px] text-white",
            "transition duration-200",
            canSend
              ? [
                  "bg-gradient-to-br",
                  "from-sky-400",
                  "via-blue-500",
                  "to-indigo-600",
                  "shadow-[0_10px_22px_rgba(37,99,235,0.25)]",
                  "hover:-translate-y-[1px]",
                  "hover:shadow-[0_13px_26px_rgba(37,99,235,0.30)]",
                  "active:translate-y-0",
                  "active:scale-95",
                ].join(" ")
              : [
                  "cursor-not-allowed",
                  "bg-slate-200",
                  "text-slate-400",
                  "shadow-none",
                ].join(" "),
          ].join(" ")}
        >
          <EarLinkSendMark />
        </button>
      </div>

      {message.length >
        maxLength - 100 && (
        <p className="mt-1 pr-[82px] text-right text-[10px] font-medium text-slate-400">
          {message.length}/{maxLength}
        </p>
      )}
    </form>
  );
}