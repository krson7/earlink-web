"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { fetchDevicePresence, reportDevicePresence } from "@/lib/device-presence-api";
import type { DevicePresence } from "@/lib/device-presence-api";

/*
 * 다른 휴대폰이 이미 EarLink에 연결했는지 서버를 통해 공유한다.
 *
 * - 내가 연결하면 서버에 알리고, 주기적으로 갱신한다.
 * - 내가 연결하지 않았으면 서버에 물어본다.
 * - 서버에 API가 없거나 실패하면 "다른 연결 없음"으로 보고 조용히 넘어간다.
 */

const POLL_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const FIRST_CHECK_TIMEOUT_MS = 1_500;

type Options = {
  localConnected: boolean;
  serialNumber: string | null;
  poll: boolean;
};

export function useDevicePresence({ localConnected, serialNumber, poll }: Options) {
  const [remote, setRemote] = useState<DevicePresence | null>(null);
  const [checked, setChecked] = useState(false);
  const [apiMissing, setApiMissing] = useState(false);

  const shouldPoll = poll && !localConnected && !apiMissing;

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    let disposed = false;

    async function check(): Promise<void> {
      try {
        const presence = await fetchDevicePresence();
        if (!disposed) setRemote(presence);
      } catch (failure) {
        if (disposed) return;
        setRemote(null);
        // 서버에 아직 API가 없으면 더 묻지 않는다.
        if (failure instanceof ApiError && failure.status === 404) setApiMissing(true);
      } finally {
        if (!disposed) setChecked(true);
      }
    }

    void check();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    const giveUp = window.setTimeout(() => {
      if (!disposed) setChecked(true);
    }, FIRST_CHECK_TIMEOUT_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
    };
  }, [shouldPoll]);

  useEffect(() => {
    if (!localConnected || apiMissing) {
      return;
    }

    function report(connected: boolean, keepalive = false): void {
      void reportDevicePresence({ connected, serialNumber }, { keepalive }).catch(() => undefined);
    }

    function handlePageHide(): void {
      report(false, true);
    }

    report(true);
    const timer = window.setInterval(() => report(true), HEARTBEAT_INTERVAL_MS);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", handlePageHide);
      report(false);
    };
  }, [localConnected, serialNumber, apiMissing]);

  const remoteConnected = !localConnected && remote?.connected === true;

  return {
    // 서버 응답을 기다리는 동안 연결 안내를 잠깐 미룬다.
    checked: checked || apiMissing || localConnected,
    remoteConnected,
    remoteSerialNumber: remoteConnected ? remote?.serialNumber ?? null : null,
  };
}
