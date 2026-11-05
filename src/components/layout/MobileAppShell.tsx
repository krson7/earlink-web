import type { ReactNode } from "react";

type MobileAppShellProps = {
  children: ReactNode;
};

export default function MobileAppShell({ children }: MobileAppShellProps) {
  return (
    <div className="app-backdrop">
      <div className="app-shell">
        {children}
      </div>
    </div>
  );
}
