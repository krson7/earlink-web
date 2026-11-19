"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { fetchDevicePresence, reportDevicePresence } from "@/lib/device-presence-api";
import type { DevicePresence } from "@/lib/device-presence-api";

/*
 * 다른 휴대폰이 이미 EarLink에 연결했는지 서버를 통해 공유한다.
 *
 * - 내가 연결하면 서버에 알리고, 주기적으로 갱신한다.
 * - 내가 연결하지 않았으면 서버에 물어본다.
 * - 조회 중이거나 실패한 상태는 연결 완료로 취급하지 않고 재조회한다.
 */

const POLL_INTERVAL_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 20_000;

type Options = {
  localConnected: boolean;
  serialNumber: string | null;
  poll: boolean;
};

export function useDevicePresence({ localConnected, serialNumber, poll }: Options) {
  const ownerIdRef = useRef<string | null>(null);
  const reportsRef = useRef<Promise<void>>(Promise.resolve());
  const [remote, setRemote] = useState<DevicePresence | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldPoll = poll && !localConnected;

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    let disposed = false;
    let checking = false;

    async function check(): Promise<void> {
      if (checking) return;
      checking = true;
      try {
        // A disconnect report must finish before we can interpret a connection
        // as belonging to another phone rather than our own previous session.
        await reportsRef.current;
        if (disposed) return;
        const presence = await fetchDevicePresence();
        if (!disposed) {
          setRemote(presence);
          setChecked(true);
          setError(null);
        }
      } catch (failure) {
        if (disposed) return;
        setError(failure instanceof ApiError && failure.status === 404
          ? "기기 연결 상태 공유 기능을 사용할 수 없어요. 서버 설정을 확인해 주세요."
          : "다른 휴대폰의 연결 상태를 확인하지 못했어요. 자동으로 다시 확인하고 있어요.");
      } finally {
        checking = false;
      }
    }

    async function refresh(): Promise<void> {
      await check();
    }
    void refresh();
    const timer = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [shouldPoll]);

  useEffect(() => {
    if (!localConnected) {
      return;
    }

    function report(connected: boolean, keepalive = false): void {
      const ownerId = ownerIdRef.current ??= crypto.randomUUID();
      // Preserve connect/disconnect ordering, including Strict Mode effect restarts.
      reportsRef.current = reportsRef.current.then(() =>
        reportDevicePresence({ connected, serialNumber }, { ownerId, keepalive }),
      ).catch(() => undefined);
    }

    function handlePageHide(): void {
      report(false, true);
    }
    const handlePageShow = () => report(true);

    report(true);
    const timer = window.setInterval(() => report(true), HEARTBEAT_INTERVAL_MS);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      report(false);
    };
  }, [localConnected, serialNumber]);

  const remoteConnected = !localConnected && remote?.connected === true;

  return {
    // 서버 응답을 기다리는 동안 연결 안내를 잠깐 미룬다.
    checked: checked || localConnected,
    error,
    remoteConnected,
    remoteSerialNumber: remoteConnected ? remote?.serialNumber ?? null : null,
  };
}
