# 기기 연결 공유 API

한 휴대폰이 EarLink에 BLE로 연결하고 나머지 참여자는 모드를 선택해 입장한다. 다른 휴대폰의 연결 상태는 FastAPI가 공유한다. 구현은 [`backend/device_presence_router.py`](../backend/device_presence_router.py), 설치는 [backend 안내](../backend/README.md)를 참고한다.

브라우저는 웹 주소의 `/api/backend/rooms/device`를 호출하며 Next.js가 FastAPI의 `/rooms/device`로 전달한다. HTTP 요청을 휴대폰에서 백엔드로 직접 보내지 않으므로 휴대폰의 localhost 주소·CORS·HTTP 혼합 콘텐츠 문제를 피한다. 읽기와 프록시 응답에는 `Cache-Control: no-store`를 지정한다.

## 조회

`GET /rooms/device`는 다음 JSON을 반환한다.

```json
{ "connected": true, "serial_number": "EL-0427" }
```

연결이 없으면 `connected: false`, `serial_number: null`이다. 시리얼 특성이 없는 펌웨어는 연결되어 있어도 시리얼이 `null`이다. 연결하지 않은 브라우저는 3초마다 조회하며 포커스·화면 복귀 시에도 갱신한다.

서버 응답이 늦거나 실패했다고 미연결로 단정해 안내를 띄우지 않는다. 정상 조회에서 미연결이 확인되었을 때만 작은 연결 안내를 표시하며, 이 안내는 모드 선택을 가리지 않는다. `404`이면 해당 페이지에서는 조회를 중단한다. 서버 모듈 설치 후 페이지를 새로고침한다.

## 연결 담당자의 보고

`PUT /rooms/device` 요청:

```json
{
  "connected": true,
  "serial_number": "EL-0427",
  "owner_id": "브라우저 연결 세션의 임의 UUID"
}
```

성공 응답은 본문 없는 `204`다. 실제 GATT 초기화를 마친 후에만 연결을 보고한다. 연결 중에는 20초마다 갱신하고, 연결 해제·화면 종료 시에는 `connected: false`를 보낸다. 화면 종료 보고에는 `keepalive`를 사용하지만 전달을 보장하지 않으므로 마지막 갱신에서 **60초 후** 서버가 상태를 만료시킨다.

현재 연결 소유자의 `owner_id`만 갱신·해제할 수 있다. 다른 소유자의 해제는 무시하고, 만료되지 않은 연결을 덮어쓰려 하면 `409`를 반환한다. 소유자 토큰은 조회 응답에 포함하지 않는다. 브라우저는 연결·해제 요청을 순서대로 보내므로 이전 해제가 새 연결 보고보다 늦게 반영되지 않는다.

현재 고정 대화방과 기존 채팅 서버의 단일 worker 구성에 맞춘 메모리 상태다. 다중 worker·다중 서버에서는 채팅과 기기 상태를 함께 공용 저장소로 이전해야 한다. 방이 여러 개가 되면 기기 상태도 방 단위로 분리해야 한다.
