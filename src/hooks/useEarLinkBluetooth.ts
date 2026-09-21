/// <reference types="web-bluetooth" />

"use client";

import {
  useCallback,
  useRef,
  useState,
} from "react";

const SERVICE_UUID =
  "8f3a0001-7c3b-4b8a-9f52-123456789abc";

const CHARACTERISTIC_UUID =
  "8f3a0002-7c3b-4b8a-9f52-123456789abc";

function getBluetoothErrorMessage(
  error: unknown,
): string | null {
  if (error instanceof DOMException) {
    // 사용자가 Bluetooth 기기 선택창을 닫은 경우
    // 에러처럼 보여주지 않음
    if (
      error.name === "NotFoundError" ||
      error.name === "AbortError"
    ) {
      return null;
    }

    if (error.name === "SecurityError") {
      return "Bluetooth 사용 권한을 확인해주세요.";
    }

    if (error.name === "NetworkError") {
      return "EarLink 기기에 연결하지 못했습니다.";
    }

    if (error.name === "NotSupportedError") {
      return "이 브라우저에서는 Bluetooth 연결을 지원하지 않습니다.";
    }
  }

  return "EarLink 연결에 실패했습니다. 기기 상태를 확인해주세요.";
}

export function useEarLinkBluetooth() {
  const [connected, setConnected] =
    useState(false);

  const [deviceName, setDeviceName] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const deviceRef =
    useRef<BluetoothDevice | null>(null);

  const characteristicRef =
    useRef<BluetoothRemoteGATTCharacteristic | null>(
      null,
    );

  const connect = useCallback(async () => {
    try {
      setError(null);

      if (!navigator.bluetooth) {
        setError(
          "이 브라우저에서는 Bluetooth 연결을 지원하지 않습니다.",
        );
        return;
      }

      const device =
        await navigator.bluetooth.requestDevice({
          filters: [
            {
              name: "EarLink",
            },
          ],

          optionalServices: [
            SERVICE_UUID,
          ],
        });

      if (!device.gatt) {
        setError(
          "EarLink 기기와 통신할 수 없습니다.",
        );
        return;
      }

      const server =
        await device.gatt.connect();

      const service =
        await server.getPrimaryService(
          SERVICE_UUID,
        );

      const characteristic =
        await service.getCharacteristic(
          CHARACTERISTIC_UUID,
        );

      deviceRef.current = device;
      characteristicRef.current =
        characteristic;

      setDeviceName(
        device.name ?? "EarLink",
      );

      setConnected(true);
      setError(null);

      device.addEventListener(
        "gattserverdisconnected",
        () => {
          characteristicRef.current = null;
          setConnected(false);
          setDeviceName(null);
        },
      );
    } catch (err) {
      console.error(
        "EarLink Bluetooth 연결 실패:",
        err,
      );

      setConnected(false);

      const message =
        getBluetoothErrorMessage(err);

      setError(message);
    }
  }, []);

  const disconnect = useCallback(() => {
    const device = deviceRef.current;

    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }

    deviceRef.current = null;
    characteristicRef.current = null;

    setConnected(false);
    setDeviceName(null);
    setError(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const characteristic =
        characteristicRef.current;

      if (!characteristic || !connected) {
        throw new Error(
          "EarLink가 연결되어 있지 않습니다.",
        );
      }

      const data =
        new TextEncoder().encode(text);

      await characteristic.writeValueWithResponse(
        data,
      );
    },
    [connected],
  );

  return {
    connected,
    deviceName,
    error,
    connect,
    disconnect,
    send,
  };
}