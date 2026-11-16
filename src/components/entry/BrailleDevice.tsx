"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import type { EarLinkBluetooth } from "@/hooks/useEarLinkBluetooth";

export type DeviceSummary = Pick<EarLinkBluetooth, "supported" | "connected" | "connecting" | "deviceName"> & {
  // 다른 휴대폰이 이미 연결한 경우
  remoteConnected: boolean;
};

type BrailleDeviceProps = {
  device: DeviceSummary;
  showGuide: boolean;
  onPress: () => void;
  onDismissGuide: () => void;
};

function getDeviceState({ connected, connecting, remoteConnected }: DeviceSummary): string {
  if (connected || remoteConnected) return "connected";
  if (connecting) return "connecting";
  return "idle";
}

export default function BrailleDevice({ device, showGuide, onPress, onDismissGuide }: BrailleDeviceProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const name = device.deviceName ?? "EarLink";

  // 작은 화면에서는 기기가 화면 아래에 가려질 수 있어 안내가 뜰 때 보이게 한다.
  useEffect(() => {
    if (showGuide) {
      anchorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [showGuide]);

  const chipText = device.connected
    ? `${name} 연결됨`
    : device.connecting
      ? "기기 연결 중…"
      : device.remoteConnected
        ? "다른 휴대폰에 연결됨"
        : device.supported
          ? "눌러서 기기 연결"
          : "이 브라우저는 기기 연결 미지원";

  const label = device.connected
    ? `${name} 연결됨. 눌러서 연결 관리`
    : device.connecting
      ? "EarLink 기기 연결 중"
      : device.remoteConnected
        ? "EarLink가 다른 휴대폰에 연결됨"
        : "EarLink 점자 기기 연결하기";

  return (
    <div className="device-scene" data-state={getDeviceState(device)} data-guide={showGuide || undefined}>
      <div className="device-light" aria-hidden="true" />

      <div ref={anchorRef} className="device-anchor">
        {showGuide && (
          <div className="connect-guide-bubble" role="status">
            <strong>기기를 눌러 연결하세요</strong>
            <span>어떤 방식으로 대화해도 점자가 기기로 전달돼요</span>
            <button type="button" onClick={onDismissGuide} className="connect-guide-skip">
              나중에 연결하기
            </button>
          </div>
        )}

        <button type="button" onClick={onPress} aria-label={label} className="device-button">
          <span className="device-spot" aria-hidden="true" />
          <Image
            className="device-product"
            src="/earlink-device.webp"
            alt=""
            width={1100}
            height={535}
            sizes="(max-width: 430px) 80vw, 340px"
            loading="eager"
            draggable={false}
          />
          <span className="device-chip" aria-hidden="true">
            <span className="device-chip-dot" />
            {chipText}
          </span>
        </button>
      </div>
    </div>
  );
}
