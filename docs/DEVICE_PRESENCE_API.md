# 기기 연결 공유 API

## 왜 필요한가

EarLink 기기는 블루투스로 **한 휴대폰에만** 연결된다. 그런데 웹은 QR을 찍은 휴대폰마다 "기기를 눌러 연결하세요" 안내를 띄운다. 한 휴대폰이 이미 연결했다면 다른 휴대폰에는 이 안내가 뜨면 안 된다.

휴대폰끼리는 서로의 블루투스 상태를 알 수 없으므로, 서버가 "지금 기기가 연결돼 있는지"를 한 곳에 들고 있다가 알려 줘야 한다.

## 웹의 현재 동작

웹은 이미 아래 API를 호출하도록 구현되어 있다(`src/hooks/useDevicePresence.ts`).

- 서버가 `404`를 돌려주면 API가 없는 것으로 보고 더 묻지 않는다. 이 경우 모든 휴대폰에 안내가 그대로 뜬다(지금과 동일).
- 그 밖의 오류는 무시하고 "연결 없음"으로 처리한다.

**서버에 아래 두 API를 추가하면 웹 수정 없이 바로 동작한다.**

## API

기존 HTTP API와 같은 주소(`NEXT_PUBLIC_FASTAPI_HTTP_BASE_URL`)를 쓴다. 요청·응답은 JSON이고, 웹은 다른 출처에서 호출하므로 `GET`·`PUT`·`OPTIONS`에 CORS를 허용해야 한다.

### `GET /rooms/device` — 지금 연결돼 있는지

응답 `200`:

```json
{ "connected": true, "serial_number": "EL-0001" }
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `connected` | boolean | 어떤 휴대폰이든 지금 기기에 연결돼 있으면 `true` |
| `serial_number` | string \| null | 연결된 기기의 시리얼. 모르면 `null` |

연결된 기기가 없으면 `{ "connected": false, "serial_number": null }`.

웹은 메인 화면과 대화방에서 **10초마다** 호출한다.

### `PUT /rooms/device` — 내 휴대폰의 연결 상태 알림

요청 본문:

```json
{ "connected": true, "serial_number": "EL-0001" }
```

응답: `204` (본문 없음) 또는 `200`. 웹은 응답 본문을 읽지 않는다.

웹이 호출하는 시점:

| 시점 | 본문 |
|---|---|
| 기기 연결 직후 | `connected: true` |
| 연결돼 있는 동안 **20초마다** | `connected: true` (살아 있음 알림) |
| 연결 해제 | `connected: false` |
| 탭을 닫거나 페이지를 떠날 때 | `connected: false` (`keepalive` 요청이라 도착하지 않을 수 있음) |

## 서버가 지켜야 할 규칙

1. **60초 동안 `connected: true` 갱신이 없으면 미연결로 처리한다.** 휴대폰 배터리가 꺼지거나 탭이 강제로 닫히면 `connected: false`가 오지 않기 때문이다. 웹은 20초마다 갱신하므로 정상 연결이 끊긴 것으로 오인되지는 않는다.
2. 마지막으로 받은 `connected: true`의 `serial_number`를 `GET` 응답에 그대로 돌려준다.
3. 상태는 메모리에 하나만 두면 충분하다. 현재 `/rooms/join`이 방 코드 없이 동작하므로 이 API도 방 구분 없이 하나의 상태를 쓴다. 나중에 방이 여러 개가 되면 `/rooms/{room_code}/device`로 나누면 된다.

### 참고 구현 (FastAPI)

```python
import time
from fastapi import Response
from pydantic import BaseModel

PRESENCE_TTL_SECONDS = 60
_presence = {"connected": False, "serial_number": None, "updated_at": 0.0}

class DevicePresence(BaseModel):
    connected: bool
    serial_number: str | None = None

@app.get("/rooms/device")
def get_device_presence():
    alive = time.monotonic() - _presence["updated_at"] < PRESENCE_TTL_SECONDS
    connected = _presence["connected"] and alive
    return {
        "connected": connected,
        "serial_number": _presence["serial_number"] if connected else None,
    }

@app.put("/rooms/device", status_code=204)
def put_device_presence(body: DevicePresence):
    _presence.update(
        connected=body.connected,
        serial_number=body.serial_number if body.connected else None,
        updated_at=time.monotonic(),
    )
    return Response(status_code=204)
```

## 알려진 한계

- 두 휴대폰이 거의 동시에 연결 버튼을 누르면 둘 다 안내를 볼 수 있다. 기기는 블루투스 특성상 한 휴대폰만 실제로 연결되고, 다른 휴대폰은 연결에 실패한다.
- 시리얼은 기기가 블루투스로 알려 줄 때만 채워진다(선택 특성 `8f3a0005-7c3b-4b8a-9f52-123456789abc`, UTF-8 문자열). 현재 펌웨어에는 없어서, UI 테스트 모드(`src/lib/device-ui-test.ts`)에서만 `EL-0001`이 표시된다.
