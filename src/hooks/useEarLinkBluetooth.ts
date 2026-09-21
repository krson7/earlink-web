
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
        throw new Error(
          "이 브라우저에서는 Bluetooth를 지원하지 않습니다.",
        );
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
        throw new Error(
          "Bluetooth GATT를 사용할 수 없습니다.",
        );
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

      device.addEventListener(
        "gattserverdisconnected",
        () => {
          characteristicRef.current = null;
          setConnected(false);
        },
      );
    } catch (err) {
      console.error(
        "EarLink Bluetooth 연결 실패:",
        err,
      );

      setConnected(false);

      setError(
        err instanceof Error
          ? err.message
          : "EarLink 연결에 실패했습니다.",
      );
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