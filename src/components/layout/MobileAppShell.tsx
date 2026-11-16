"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type MobileAppShellProps = {
  children: ReactNode;
};

export default function MobileAppShell({ children }: MobileAppShellProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const element = viewportRef.current;
    if (!viewport || !element) return;
    let frame = 0;

    function updateViewport() {
      if (!viewport || !element || viewport.scale !== 1) return;
      // Browser bars and keyboards can resize the visible area independently of
      // the layout viewport. Leave native pinch zoom under the user's control.
      element.style.setProperty("--app-viewport-height", `${viewport.height}px`);
      element.style.setProperty("--app-viewport-top", `${viewport.offsetTop}px`);
    }

    function scheduleUpdate() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateViewport);
    }

    updateViewport();
    viewport.addEventListener("resize", scheduleUpdate);
    viewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("pageshow", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", scheduleUpdate);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("pageshow", scheduleUpdate);
    };
  }, []);

  return (
    <div ref={viewportRef} className="app-backdrop">
      <div className="app-shell">
        {children}
      </div>
    </div>
  );
}
