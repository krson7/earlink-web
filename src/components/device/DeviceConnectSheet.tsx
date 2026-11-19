"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AnimationEvent } from "react";

import DeviceModel3D from "@/components/device/DeviceModel3D";
import type { DeviceMotion } from "@/components/device/DeviceModel3D";
import DeviceOutputControls from "@/components/device/DeviceOutputControls";
import type { EarLinkCommand, EarLinkStatus } from "@/lib/earlink-protocol";

/*
 * 하단에서 올라오는 기기 연결 팝업.
 *
 * 연결 중에는 기기가 좌우로 돌고, 연결되면 기기가 사라지면서
 * 원이 시계 방향으로 그려지고 그 안에 체크가 그려진 뒤 아래로 내려가며 닫힌다.
 */

// 원(0.3s 지연 + 0.65s)과 체크(0.4s)가 다 그려진 뒤 잠시 머문다.
const SUCCESS_HOLD_MS = 2100;

type Phase = "connecting" | "success" | "connected" | "remote" | "unsupported" | "error" | "idle";

type DeviceConnectSheetProps = {
  open: boolean;
  required: boolean;
  supported: boolean;
  connected: boolean;
  connecting: boolean;
  deviceName: string | null;
  serialNumber: string | null;
  // 다른 휴대폰이 이미 연결한 경우
  remoteConnected: boolean;
  remoteSerialNumber: string | null;
  error: string | null;
  status: EarLinkStatus | null;
  onControl: (command: EarLinkCommand) => Promise<void>;
  onIntervalChange: (milliseconds: number) => Promise<void>;
  onConnect: () => void;
  onDisconnect: () => void;
  onClose: () => void;
};

function getPhase(
  { supported, connected, connecting, remoteConnected, error }: DeviceConnectSheetProps,
  celebrating: boolean,
): Phase {
  if (connecting) return "connecting";
  if (connected) return celebrating ? "success" : "connected";
  if (remoteConnected) return "remote";
  if (!supported) return "unsupported";
  if (error) return "error";
  return "idle";
}

function getMotion(phase: Phase): DeviceMotion {
  if (phase === "connecting") return "spin";
  if (phase === "success" || phase === "connected" || phase === "remote") return "front";
  return "idle";
}

function SuccessMark() {
  return (
    <svg className="connect-success" viewBox="0 0 96 96" aria-hidden="true">
      <circle className="connect-success-ring" cx="48" cy="48" r="44" pathLength={1} transform="rotate(-90 48 48)" />
      <path className="connect-success-check" d="M30 49.5 42.5 62 67 36" pathLength={1} />
    </svg>
  );
}

export default function DeviceConnectSheet(props: DeviceConnectSheetProps) {
  const {
    open, required, connected, deviceName, serialNumber, remoteSerialNumber, error, status,
    onControl, onIntervalChange, onConnect, onDisconnect, onClose,
  } = props;

  const titleId = useId();
  const descriptionId = useId();
  const cardRef = useRef<HTMLElement | null>(null);

  // 닫히는 애니메이션이 끝날 때까지 화면에 남겨 둔다.
  const [mounted, setMounted] = useState(open);
  const [previousOpen, setPreviousOpen] = useState(open);
  const [previousConnected, setPreviousConnected] = useState(connected);
  const [celebrating, setCelebrating] = useState(false);

  if (open !== previousOpen) {
    setPreviousOpen(open);

    if (open) {
      setMounted(true);
      setCelebrating(false);
    }
  }

  // 팝업이 열려 있는 동안 연결이 완료된 순간에만 성공 화면을 보여 준다.
  if (connected !== previousConnected) {
    setPreviousConnected(connected);
    setCelebrating(connected && open);
  }

  const phase = getPhase(props, celebrating);
  const name = deviceName ?? "EarLink";

  useEffect(() => {
    if (!open || !celebrating) {
      return;
    }

    if ("vibrate" in navigator) {
      navigator.vibrate(30);
    }

    const timer = window.setTimeout(onClose, SUCCESS_HOLD_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, celebrating, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    /*
     * 키보드로 연 경우에만 닫을 때 포커스를 되돌린다.
     * 터치로 연 버튼에 포커스를 되돌리면 포커스 테두리가 생긴다.
     */
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const restoreFocusTo = opener?.matches(":focus-visible") ? opener : null;
    cardRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        if (!required) onClose();
      }
      if (event.key === "Tab") {
        const controls = cardRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), [tabindex='0']");
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        if (!first || !last) {
          event.preventDefault();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === cardRef.current)) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      restoreFocusTo?.focus({ preventScroll: true });
    };
  }, [open, required, onClose]);

  function handleAnimationEnd(event: AnimationEvent<HTMLElement>): void {
    if (!open && event.target === event.currentTarget) {
      setMounted(false);
    }
  }

  if (!mounted) {
    return null;
  }

  const identity = serialNumber ? `${name} · ${serialNumber}` : name;
  const remoteIdentity = remoteSerialNumber ? `EarLink · ${remoteSerialNumber}` : "EarLink";

  const copy: Record<Phase, { title: string; description: string }> = {
    connecting: {
      title: "EarLink 연결 중…",
      description: "기기 전원을 켜고 휴대폰 가까이에 두세요.",
    },
    success: {
      title: "연결됨",
      description: identity,
    },
    connected: {
      title: name,
      description: serialNumber ? `연결됨 · ${serialNumber}` : "연결됨",
    },
    remote: {
      title: "다른 휴대폰에 연결됨",
      description: `${remoteIdentity}는 이미 다른 휴대폰과 연결되어 있어요. 점자는 그 휴대폰을 통해 전달돼요.`,
    },
    unsupported: {
      title: "블루투스를 쓸 수 없어요",
      description: "이 브라우저에서는 기기 연결을 지원하지 않아요. Android의 Chrome에서 https 주소로 열어 주세요.",
    },
    error: {
      title: "연결하지 못했어요",
      description: "기기 전원이 켜져 있고 휴대폰 가까이에 있는지 확인해 주세요.",
    },
    idle: {
      title: "EarLink 연결",
      description: "기기 전원을 켜고 휴대폰 가까이에 두세요.",
    },
  };

  return (
    <div className={open ? "connect-sheet" : "connect-sheet is-closing"} data-phase={phase}>
      <div className="connect-sheet-backdrop" aria-hidden="true" onClick={required ? undefined : onClose} />

      <section
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="connect-sheet-card"
        onAnimationEnd={handleAnimationEnd}
      >
        <span className="connect-sheet-grabber" aria-hidden="true" />

        {!required && <button type="button" onClick={onClose} aria-label="닫기" className="soft-circle connect-sheet-close">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>}

        <div className="connect-sheet-visual">
          <DeviceModel3D motion={getMotion(phase)} />
          {phase === "success" && <SuccessMark />}
        </div>

        <div className="connect-sheet-copy" aria-live="polite">
          <h2 id={titleId}>{copy[phase].title}</h2>
          <p id={descriptionId}>{copy[phase].description}</p>
        </div>

        {phase === "error" && error && (
          <p role="alert" className="connect-sheet-error">{error}</p>
        )}

        {phase === "connected" && status && (
          <DeviceOutputControls status={status} onControl={onControl} onIntervalChange={onIntervalChange} />
        )}

        <div className="connect-sheet-actions">
          {phase === "connecting" && (
            <button type="button" disabled className="connect-sheet-primary">
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              연결 중…
            </button>
          )}

          {(phase === "success" || phase === "connected" || phase === "remote" || (phase === "unsupported" && !required)) && (
            <button type="button" onClick={onClose} className="connect-sheet-primary">
              {phase === "success" || phase === "connected" ? "완료" : "확인"}
            </button>
          )}

          {phase === "unsupported" && required && (
            <p role="status">다른 휴대폰에서 EarLink를 연결하면 입장할 수 있어요.</p>
          )}

          {(phase === "idle" || phase === "error") && (
            <button type="button" onClick={onConnect} className="connect-sheet-primary">
              {phase === "error" ? "다시 시도" : "연결하기"}
            </button>
          )}

          {phase === "connected" && (
            <button type="button" onClick={onDisconnect} className="connect-sheet-secondary">
              연결 해제
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
