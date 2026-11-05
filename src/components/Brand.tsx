import type { AccessibilityMode } from "@/types/chat";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`brand-mark ${className}`}>
      <svg viewBox="0 0 48 48" fill="none">
        <path d="M23 12a12 12 0 0 0-12 12c0 3 1 5.5 3 7.7L11 40l10-5a12 12 0 1 0 2-23Z" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
        <circle cx="30" cy="23" r="11" stroke="currentColor" strokeWidth="3.4" />
      </svg>
    </span>
  );
}

export function ModeIcon({ mode }: { mode: AccessibilityMode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="mode-icon">
      {mode === "VISUAL" ? (
        <>{[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" fill="currentColor" />))}</>
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
