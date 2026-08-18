import type { ReactNode } from "react";

type MobileAppShellProps = {
  children: ReactNode;
};

export default function MobileAppShell({ children }: MobileAppShellProps) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-200 text-slate-900">
      <div className="mx-auto h-full w-full max-w-[430px] overflow-hidden bg-white shadow-2xl">
        {children}
      </div>
    </div>
  );
}