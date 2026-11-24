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
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

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
          setLookupError(null);
        }
      } catch (failure) {
        if (disposed) return;
        setLookupError(failure instanceof ApiError && failure.status === 404
          ? "기기 연결 상태를 공유할 수 없어요. 다른 휴대폰이 연결했다면 페어링 없이 참여하세요."
          : "다른 휴대폰의 연결 상태를 확인하지 못했어요. 페어링 없이 참여할 수 있으며 자동으로 다시 확인해요.");
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

    let disposed = false;
    let suspended = false;
    let reporting = false;
    let timer: number | undefined;

    function report(connected: boolean, keepalive = false): Promise<void> {
      const ownerId = ownerIdRef.current ??= crypto.randomUUID();
      // Preserve connect/disconnect ordering, including Strict Mode effect restarts.
      const pending = reportsRef.current.then(() =>
        reportDevicePresence({ connected, serialNumber }, { ownerId, keepalive }),
      );
      reportsRef.current = pending.catch(() => undefined);
      return pending;
    }

    async function refresh(): Promise<void> {
      if (disposed || suspended || reporting) return;
      reporting = true;
      window.clearTimeout(timer);
      let delay = HEARTBEAT_INTERVAL_MS;
      try {
        await report(true);
        if (!disposed) setReportError(null);
      } catch {
        delay = POLL_INTERVAL_MS;
        if (!disposed) {
          setReportError("기기는 연결됐지만 연결 상태 공유를 재시도하고 있어요. 다른 휴대폰은 페어링 없이 참여할 수 있어요.");
        }
      } finally {
        reporting = false;
        if (!disposed && !suspended) timer = window.setTimeout(() => void refresh(), delay);
      }
    }

    function handlePageHide(): void {
      suspended = true;
      window.clearTimeout(timer);
      void report(false, true).catch(() => undefined);
    }
    function handlePageShow(): void {
      suspended = false;
      void refresh();
    }
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };

    void refresh();
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      void report(false).catch(() => undefined);
    };
  }, [localConnected, serialNumber]);

  const remoteConnected = !localConnected && remote?.connected === true;

  return {
    // 서버 응답을 기다리는 동안 연결 안내를 잠깐 미룬다.
    checked: checked || localConnected,
    error: localConnected ? reportError : lookupError,
    remoteConnected,
    remoteSerialNumber: remoteConnected ? remote?.serialNumber ?? null : null,
  };
}
