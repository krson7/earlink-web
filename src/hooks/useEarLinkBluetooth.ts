/// <reference types="web-bluetooth" />
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACK_TIMEOUT_MS, EARLINK_SERVICE_UUID, EARLINK_STATUS_UUID, EARLINK_TEXT_UUID,
  decodeStatus, deviceError, encodeCommand, encodeInterval, encodeTextPackets,
} from "@/lib/earlink-protocol";
import type { EarLinkCommand, EarLinkStatus } from "@/lib/earlink-protocol";

type Acknowledgement = {
  id: number;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
};

export function useEarLinkBluetooth() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<EarLinkStatus | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const textRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const statusRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const removeListenersRef = useRef<(() => void) | null>(null);
  const attemptRef = useRef(false);
  const sessionRef = useRef(0);
  const nextIdRef = useRef(1);
  const ackRef = useRef<Acknowledgement | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const disconnect = useCallback(() => {
    sessionRef.current += 1;
    attemptRef.current = false;
    removeListenersRef.current?.();
    removeListenersRef.current = null;
    const ack = ackRef.current;
    ackRef.current = null;
    if (ack) {
      if (ack.timer) clearTimeout(ack.timer);
      ack.reject(new Error("EarLink 연결이 해제되었습니다."));
    }
    deviceRef.current?.gatt?.disconnect();
    deviceRef.current = null;
    textRef.current = null;
    statusRef.current = null;
    queueRef.current = Promise.resolve();
    setConnected(false);
    setConnecting(false);
    setDeviceName(null);
    setStatus(null);
    setError(null);
  }, []);

  useEffect(() => disconnect, [disconnect]);

  const receiveStatus = useCallback((value: DataView) => {
    const next = decodeStatus(value);
    setStatus(next);
    const ack = ackRef.current;
    if (ack && next.acknowledgedId === ack.id && next.result !== 0) {
      ackRef.current = null;
      if (ack.timer) clearTimeout(ack.timer);
      if (next.result === 1) ack.resolve();
      else ack.reject(new Error(deviceError(next.result)));
    }
  }, []);

  const connect = useCallback(async () => {
    if (attemptRef.current || deviceRef.current?.gatt?.connected) return;
    attemptRef.current = true;
    setConnecting(true);
    setError(null);
    const session = ++sessionRef.current;
    let selected: BluetoothDevice | null = null;
    function ensureCurrent() {
      if (session !== sessionRef.current) throw new Error("연결 요청이 취소되었습니다.");
    }
    try {
      if (!navigator.bluetooth) throw new Error("이 브라우저에서는 Bluetooth 연결을 지원하지 않습니다.");
      selected = await navigator.bluetooth.requestDevice({
        filters: [{ name: "EarLink" }], optionalServices: [EARLINK_SERVICE_UUID],
      });
      ensureCurrent();
      deviceRef.current = selected;
      const server = await selected.gatt?.connect();
      ensureCurrent();
      if (!server) throw new Error("EarLink 기기에 연결하지 못했습니다.");
      const service = await server.getPrimaryService(EARLINK_SERVICE_UUID);
      ensureCurrent();
      const textCharacteristic = await service.getCharacteristic(EARLINK_TEXT_UUID);
      ensureCurrent();
      let stateCharacteristic: BluetoothRemoteGATTCharacteristic;
      try {
        stateCharacteristic = await service.getCharacteristic(EARLINK_STATUS_UUID);
      } catch {
        throw new Error("3칸 점자 출력용 EarLink 펌웨어를 먼저 업로드해 주세요.");
      }
      ensureCurrent();
      const onStatus = () => {
        if (session !== sessionRef.current || !stateCharacteristic.value) return;
        try { receiveStatus(stateCharacteristic.value); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "기기 상태를 읽지 못했습니다."); }
      };
      const onDisconnect = () => {
        if (session === sessionRef.current) disconnect();
      };
      const device = selected;
      device.addEventListener("gattserverdisconnected", onDisconnect);
      stateCharacteristic.addEventListener("characteristicvaluechanged", onStatus);
      removeListenersRef.current = () => {
        device.removeEventListener("gattserverdisconnected", onDisconnect);
        stateCharacteristic.removeEventListener("characteristicvaluechanged", onStatus);
      };
      await stateCharacteristic.startNotifications();
      ensureCurrent();
      const state = await stateCharacteristic.readValue();
      ensureCurrent();
      receiveStatus(state);
      textRef.current = textCharacteristic;
      statusRef.current = stateCharacteristic;
      setDeviceName(device.name ?? "EarLink");
      setConnected(true);
    } catch (failure) {
      if (session !== sessionRef.current) {
        // An older connection attempt must not close a newer session on the same device.
        if (selected !== deviceRef.current) selected?.gatt?.disconnect();
        return;
      }
      const cancelled = !selected && failure instanceof DOMException &&
        (failure.name === "NotFoundError" || failure.name === "AbortError");
      disconnect();
      if (!cancelled) setError(failure instanceof Error ? failure.message : "EarLink 연결에 실패했습니다.");
    } finally {
      if (session === sessionRef.current) {
        attemptRef.current = false;
        setConnecting(false);
      }
    }
  }, [disconnect, receiveStatus]);

  // All GATT writes share one queue, including UI controls during a long message.
  const enqueue = useCallback((operation: () => Promise<void>) => {
    const session = sessionRef.current;
    const task = queueRef.current.then(async () => {
      if (session !== sessionRef.current || !deviceRef.current?.gatt?.connected) {
        throw new Error("EarLink가 연결되어 있지 않습니다.");
      }
      await operation();
    });
    queueRef.current = task.catch(() => undefined);
    return task.catch((failure: unknown) => {
      if (session === sessionRef.current) {
        setError(failure instanceof Error ? failure.message : "기기 전송에 실패했습니다.");
      }
      throw failure;
    });
  }, []);

  const send = useCallback((text: string): Promise<void> => enqueue(async () => {
    const characteristic = textRef.current;
    if (!characteristic) throw new Error("EarLink가 연결되어 있지 않습니다.");
    const session = sessionRef.current;
    const id = nextIdRef.current;
    nextIdRef.current = id === 65535 ? 1 : id + 1;
    const packets = encodeTextPackets(text, id);
    let resolveAck!: () => void;
    let rejectAck!: (error: Error) => void;
    const acknowledged = new Promise<void>((resolve, reject) => { resolveAck = resolve; rejectAck = reject; });
    const acknowledgement: Acknowledgement = { id, resolve: resolveAck, reject: rejectAck, timer: null };
    ackRef.current = acknowledgement;
    // A rejection can arrive while writeValueWithResponse is still pending.
    void acknowledged.catch(() => undefined);
    try {
      for (const packet of packets) {
        if (session !== sessionRef.current) throw new Error("메시지 전송 중 연결이 해제되었습니다.");
        await characteristic.writeValueWithResponse(packet);
      }
      if (ackRef.current === acknowledgement) {
        acknowledgement.timer = setTimeout(() => {
          if (ackRef.current !== acknowledgement) return;
          ackRef.current = null;
          acknowledgement.reject(new Error("기기의 메시지 수신 확인 시간이 초과되었습니다."));
        }, ACK_TIMEOUT_MS);
      }
      await acknowledged;
      if (session === sessionRef.current) setError(null);
    } finally {
      if (acknowledgement.timer) clearTimeout(acknowledgement.timer);
      if (ackRef.current === acknowledgement) ackRef.current = null;
    }
  }), [enqueue]);

  const sendControl = useCallback((packet: Uint8Array<ArrayBuffer>) => enqueue(async () => {
    const characteristic = statusRef.current;
    if (!characteristic) throw new Error("EarLink가 연결되어 있지 않습니다.");
    await characteristic.writeValueWithResponse(packet);
  }), [enqueue]);

  const control = useCallback((command: EarLinkCommand) => sendControl(encodeCommand(command)), [sendControl]);
  const setIntervalMs = useCallback((milliseconds: number) => sendControl(encodeInterval(milliseconds)), [sendControl]);

  return { connected, connecting, deviceName, error, status, connect, disconnect, send, control, setIntervalMs };
}
