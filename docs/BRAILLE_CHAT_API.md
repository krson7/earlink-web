# 모든 모드의 점자 입력과 입력 중 표시

EarLink를 연결한 휴대폰의 참여 모드와 무관하게, 현재 입장한 대화방의 WebSocket으로 점자 키보드 입력을 보낸다. 연결 담당자가 음성·수어·텍스트 중 어느 모드를 선택해도 같다. 점자 사용자가 별도의 휴대폰이나 모드를 선택할 필요는 없다. 방 입장 및 채팅 연결 이전에는 기기에 초안을 보관한다.

## WebSocket 확장

경로는 기존 `/ws/rooms/{room_code}/{participant_id}`를 유지한다. 서버는 참가자를 검증하고 연결을 등록한 다음 지원 여부를 알린다.

```json
{"type":"capabilities","braille_events":true}
```

웹은 이 알림을 받은 연결에서만 다음 JSON 이벤트를 보낸다. 구 서버에 연결하면 점자 메시지를 기존 일반 문자열로 전송하고 입력 중 알림은 보내지 않는다. 따라서 제어 JSON이 일반 말풍선이나 기기 출력으로 노출되지 않는다.

```json
{"type":"typing","source":"braille","active":true}
{"type":"typing","source":"braille","active":false}
{"type":"message","source":"braille","content":"한글"}
```

서버는 소켓의 검증된 참가자 ID를 `sender_id`로 사용해 같은 방에만 중계한다. 클라이언트가 보낸 `sender_id`는 사용하지 않는다. 일반 채팅은 기존처럼 문자열을 전송하며, 응답 형태도 유지한다.

```json
{"type":"typing","source":"braille","sender_id":1,"active":true}
{"type":"message","source":"braille","sender_id":1,"content":"한글"}
```

`typing` 이벤트는 메시지 목록, 음성 읽기, 점자 출력에 넣지 않는다. 상대방의 `source: "braille"` 이벤트만 말풍선으로 표시한다. 미완성 자음도 작성 상태로 인정하지만 초안 내용은 공유하지 않는다. 기기의 주기적인 동기화 응답은 새 입력으로 취급하지 않는다.

- 실제 점자 칸이 바뀌면 시작하고, 활동 중에는 약 2초마다 상태를 갱신한다.
- 전송 요청·전체 삭제·BLE 해제·방 나가기·채팅 해제 시 종료한다.
- 실제 편집이 5초간 없으면 종료한다. 수신자는 마지막 갱신으로부터 7초 후 표시를 지워 유실된 종료 이벤트에도 복구한다.
- 서버도 점자 메시지 전송과 소켓 종료 시 종료 상태를 중계한다. 일반 메시지는 점자 입력 상태를 지우지 않는다.
- 점자 메시지의 공백·길이 제한은 일반 메시지와 같다. 입력 상태는 `active`가 boolean이고 `source`가 `braille`인지 검사한다.

## 적용 및 검증

웹과 별도 FastAPI 저장소의 `server/routers/chat_router.py`를 함께 배포한다. 현재 개발 백엔드 경로는 `C:/Users/hi/Desktop/EarLink`이다. 이번 변경에 따른 BLE 규격이나 펌웨어 수정은 없다.

```powershell
npm.cmd run test:earlink
npm.cmd run test:bluetooth:browser
node node_modules/typescript/bin/tsc --noEmit
npm.cmd run build
& C:/Users/hi/Desktop/EarLink/.venv/Scripts/python.exe tests/backend/test_braille_chat.py --backend-root C:/Users/hi/Desktop/EarLink
```

브라우저 검사는 실행 중인 웹 서버를 사용한다. 기본 주소는 `http://127.0.0.1:3000`이며 `EARLINK_TEST_URL`로 바꿀 수 있다. 물리 기기 대신 테스트 전용 GATT fixture를 사용한다. 백엔드 검사는 별도 저장소의 실제 라우터와 연결 관리자를 사용하되, 참가자 DB 검증을 테스트용으로 대체하고 운영 DB나 추론 모델을 실행하지 않는다.

### 실제 서버를 통한 다중 브라우저 검사

다음 테스트 서버는 별도 저장소의 실제 방 입장·참가자 검증·채팅 라우터를 사용한다. 운영 DB 대신 작업 폴더 안에 임시 SQLite DB를 만들고, 테스트 제어 API는 이 스크립트에서만 loopback으로 연다. 서비스 앱에는 테스트 API를 추가하지 않는다.

첫 번째 터미널:

```powershell
& C:/Users/hi/Desktop/EarLink/.venv/Scripts/python.exe tests/backend/live_chat_server.py --backend-root C:/Users/hi/Desktop/EarLink --port 3180
```

두 번째 터미널:

```powershell
$env:NEXT_PUBLIC_FASTAPI_HTTP_BASE_URL='http://127.0.0.1:3180'
$env:NEXT_PUBLIC_FASTAPI_WS_BASE_URL='ws://127.0.0.1:3180'
npm.cmd run dev -- --hostname 127.0.0.1 --port 3100
```

세 번째 터미널:

```powershell
npm.cmd run test:chat:browser
```

브라우저 3개가 서로 다른 참가자로 실제 서버에 입장하여 점자 알림·메시지 중계·중복 방지·일반 채팅·음성 콜백·서버 및 BLE 재연결·모드 변경·작은 화면을 검사한다. 음성 인식/합성의 브라우저 API는 테스트 콜백으로 대체하고, 카메라는 사용할 수 없는 상태에서 채팅 독립 동작을 확인한다. 실제 마이크 인식률·카메라 영상과 모델 정확도·물리 BLE 연결을 검증하는 검사는 아니다. 상세 결과는 `node_modules/.cache/earlink-live-tests/live-report.json`에 저장한다.
