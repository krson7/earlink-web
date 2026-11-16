"use client";

import Image from "next/image";

import type { EarLinkBluetooth } from "@/hooks/useEarLinkBluetooth";

export type DeviceSummary = Pick<EarLinkBluetooth, "supported" | "connected" | "connecting" | "deviceName"> & {
  // 다른 휴대폰이 이미 연결한 경우
  remoteConnected: boolean;
};

type BrailleDeviceProps = {
  device: DeviceSummary;
  showGuide: boolean;
  onPress: () => void;
};

function getDeviceState({ connected, connecting, remoteConnected }: DeviceSummary): string {
  if (connected || remoteConnected) return "connected";
  if (connecting) return "connecting";
  return "idle";
}

function BluetoothSymbol() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10-5 5V2l5 5L7 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function BrailleDevice({ device, showGuide, onPress }: BrailleDeviceProps) {
  const name = device.deviceName ?? "EarLink";

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

      <div className="device-anchor">
        {showGuide && (
          <div className="connect-guide-bubble" role="status">
            <button type="button" onClick={onPress} className="connect-guide-action">
              <span className="connect-guide-symbol"><BluetoothSymbol /></span>
              <span className="connect-guide-label">
                <strong>기기를 눌러 연결하세요</strong>
                <span>every way connect</span>
              </span>
            </button>
          </div>
        )}

        <button type="button" onClick={onPress} aria-label={label} aria-busy={device.connecting} className="device-button">
          <span className="device-spot" aria-hidden="true" />
          <Image
            className="device-product"
            src="/earlink-device-pearl-glow.webp"
            alt=""
            width={1798}
            height={875}
            sizes="(max-width: 430px) 80vw, 340px"
            loading="eager"
            draggable={false}
          />
        </button>
      </div>
    </div>
  );
}
