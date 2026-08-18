import ModeSelect from "@/components/entry/ModeSelect";
import type { AccessibilityMode } from "@/types/chat";

type ModeSelectScreenProps = {
  loading: boolean;
  errorMessage: string;
  onSelectMode: (mode: AccessibilityMode) => void;
};

export default function ModeSelectScreen({
  loading,
  errorMessage,
  onSelectMode,
}: ModeSelectScreenProps) {
  return (
    <div className="relative h-full">
      <ModeSelect onSelectMode={onSelectMode} />

      {errorMessage && (
        <div
          role="alert"
          className="absolute left-5 right-5 top-5 z-20 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700 shadow-lg"
        >
          {errorMessage}
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/65 backdrop-blur-[2px]">
          <div
            role="status"
            aria-live="polite"
            className="rounded-3xl border border-slate-200 bg-white px-7 py-5 text-center shadow-xl"
          >
            <div
              aria-hidden="true"
              className="mx-auto h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-500"
            />

            <p className="mt-3 text-sm font-bold text-slate-700">
              대화방에 입장하고 있어요
            </p>
          </div>
        </div>
      )}
    </div>
  );
}