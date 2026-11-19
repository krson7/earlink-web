# 점자 사용자의 메시지 수신과 입력 중 표시

EarLink를 연결한 휴대폰의 참여 모드와 무관하게, 현재 입장한 대화방의 WebSocket으로 점자 키보드 입력을 보낸다. 연결 담당자가 음성·수어·텍스트 중 어느 모드를 선택해도 같다. 점자 사용자가 별도의 휴대폰이나 모드를 선택할 필요는 없다. 방 입장 및 채팅 연결 이전에는 기기에 초안을 보관한다.

점자 키보드 사용자는 화면에서 텍스트·수어·음성을 선택한 사람과 **다른 사람**이다. 연결된 휴대폰은 중계만 담당한다. `source: "braille"` 메시지는 중계 휴대폰에서도 항상 왼쪽 상대방 말풍선으로 표시하며, 화면 사용자가 선택한 모드로 보낸 자신의 메시지만 오른쪽에 표시한다. 하단 점자 입력창과 웹 전송 버튼은 없으며, 점자 사용자가 기기의 전송 키를 누른다. 작성 중에는 변환된 글자를 왼쪽 말풍선에서 실시간 갱신하고 전송 시 확정 메시지 한 개로 바꾼다.

음성·수어·텍스트 화면과 채팅 목록은 점자 키보드 상태·입력 오류·점역 처리를 직접 다루지 않는다. 기기 중계 계층에서 작성 내용을 변환한 뒤, 연결된 휴대폰의 초안과 다른 휴대폰에서 받은 초안을 같은 상대방 말풍선 목록으로 전달한다. 화면 사용자가 작성 중인 내용은 점자 입력이나 기기 전송 키로 변경·삭제되지 않는다.

## WebSocket 확장

경로는 기존 `/ws/rooms/{room_code}/{participant_id}`를 유지한다. 서버는 참가자를 검증하고 연결을 등록한 다음 지원 여부를 알린다.

```json
{"type":"capabilities","braille_events":true,"braille_drafts":true}
```

웹은 이 알림을 받은 연결에서만 다음 JSON 이벤트를 보낸다. 구 서버에 연결하면 점자 메시지를 기존 일반 문자열로 전송하고 입력 중 알림은 보내지 않는다. 따라서 제어 JSON이 일반 말풍선이나 기기 출력으로 노출되지 않는다.

`braille_drafts: true`일 때만 `typing` 이벤트에 작성 중인 `content`를 포함한다. 이전 서버에서는 중계 휴대폰에만 초안 내용이 보이고, 상대 휴대폰에는 기존 입력 중 표시가 보인다. 완전히 구형인 서버에서도 이 휴대폰이 보낸 메시지의 출처를 전송 순서대로 복원하여 점자 메시지가 오른쪽에 뜨지 않게 한다.

```json
{"type":"typing","source":"braille","active":true,"content":"한ㄱ"}
{"type":"typing","source":"braille","active":false,"content":""}
{"type":"message","source":"braille","content":"한글"}
```

서버는 소켓의 검증된 참가자 ID를 `sender_id`로 사용해 같은 방에만 중계한다. 클라이언트가 보낸 `sender_id`는 사용하지 않는다. 일반 채팅은 기존처럼 문자열을 전송하며, 응답 형태도 유지한다.

```json
{"type":"typing","source":"braille","sender_id":1,"active":true,"content":"한ㄱ"}
{"type":"message","source":"braille","sender_id":1,"content":"한글"}
```

`typing` 이벤트는 확정 메시지 내역, 음성 읽기, 점자 출력에 넣지 않는다. 미완성 자음도 그대로 왼쪽 초안 말풍선에 보여 주며, 같은 작성 내용이 동기화로 다시 도착해도 말풍선을 추가하지 않는다. 중계 휴대폰은 BLE 초안을 직접 보여 주고 자신의 소켓으로 돌아온 입력 이벤트는 무시하므로 중복되지 않는다. 점자 전송 메시지는 음성 모드에서 상대방의 말로 읽되 같은 기기로 되돌려 출력하지 않는다.

- 실제 점자 칸이 바뀔 때마다 글자를 갱신하고, 작성 내용이 남아 있는 동안 약 2초마다 상태를 갱신한다.
- 전송 요청·전체 삭제·BLE 해제·방 나가기·채팅 해제 시 종료한다.
- 입력을 잠시 멈춰도 초안은 유지한다. 수신자는 마지막 갱신으로부터 7초 후 표시를 지워 연결 해제와 유실된 종료 이벤트에도 복구한다.
- 서버도 점자 메시지 전송과 소켓 종료 시 종료 상태를 중계한다. 일반 메시지는 점자 입력 상태를 지우지 않는다.
- 점자 메시지의 공백·길이 제한은 일반 메시지와 같다. 입력 상태는 `active`가 boolean이고 `source`가 `braille`인지 검사하고, 선택 필드 `content`는 1000자 이하의 문자열만 허용한다.

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
