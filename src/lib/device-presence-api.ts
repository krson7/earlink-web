import { requestJson } from "@/lib/api";

/*
 * 기기 연결 공유 API (서버 규격: docs/DEVICE_PRESENCE_API.md)
 *
 * 한 휴대폰이 EarLink에 연결하면 서버에 알려서,
 * 다른 휴대폰에는 연결 안내를 띄우지 않는다.
 */

export type DevicePresence = {
  connected: boolean;
  serialNumber: string | null;
};

type DevicePresenceBody = {
  connected?: unknown;
  serial_number?: unknown;
};

function toPresence(body: DevicePresenceBody | null): DevicePresence {
  return {
    connected: body?.connected === true,
    serialNumber: typeof body?.serial_number === "string" && body.serial_number
      ? body.serial_number
      : null,
  };
}

export async function fetchDevicePresence(): Promise<DevicePresence> {
  return toPresence(await requestJson<DevicePresenceBody | null>("/rooms/device", { method: "GET" }));
}

export async function reportDevicePresence(
  presence: DevicePresence,
  options: { keepalive?: boolean } = {},
): Promise<void> {
  await requestJson<unknown>("/rooms/device", {
    method: "PUT",
    keepalive: options.keepalive,
    body: JSON.stringify({
      connected: presence.connected,
      serial_number: presence.serialNumber,
    }),
  });
}
