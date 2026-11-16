import Image from "next/image";

import type { AccessibilityMode } from "@/types/chat";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`brand-mark ${className}`}>
      <Image src="/earlink-mark.svg" alt="" width={60} height={60} />
    </span>
  );
}

function MicPaths() {
  return (
    <>
      <rect x="9" y="3" width="6" height="11.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.8 21h6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

export function MicIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-[22px] w-[22px]"><MicPaths /></svg>;
}

// VISUAL은 서버 값 그대로 두고 화면에서는 "음성" 모드로 쓴다.
export function ModeIcon({ mode }: { mode: AccessibilityMode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="mode-icon">
      {mode === "VISUAL" ? (
        <MicPaths />
      ) : mode === "HEARING" ? (
        <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5c0 4-2.7 7-6.7 7h-1c-2 0-4-1-5.3-3l-3-4a1.6 1.6 0 0 1 2.5-2L9 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" /><path d="M7 9h.01M10.3 9h.01M13.7 9h.01M17 9h.01M7 12h.01M10.3 12h.01M13.7 12h.01M17 12h.01M7 15h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>
      )}
    </svg>
  );
}

export function SendIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6"><path d="M12 20V4m-6 6 6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
