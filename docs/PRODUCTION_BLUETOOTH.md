# 실제 EarLink Bluetooth 연결

## 동작

1. 첫 화면의 기기 이미지 또는 연결 안내를 누른다.
2. 같은 클릭 이벤트 안에서 `navigator.bluetooth.requestDevice`를 호출한다. 페이지 진입만으로 기기를 검색하거나 자동 연결하지 않는다.
3. 브라우저 선택창에서 `EarLink`를 선택한다. 이름 필터는 현재 ESP32 펌웨어의 `BLEDevice::init("EarLink")`와 일치한다.
4. GATT 연결, EarLink 서비스·텍스트·상태 특성 확인, 알림 구독과 상태 읽기를 마쳐야 연결 완료를 표시한다. 점자 키보드 특성은 있을 때만 초기화한다.
5. 기기가 상태 패킷으로 수신을 확인해야 메시지 전송을 성공으로 처리한다. 수신 거절·연결 해제·확인 시간 초과는 실패로 처리한다.

기기 선택 취소는 미연결 상태로 돌아간다. 권한 거절·GATT 초기화 실패는 재시도할 수 있는 오류를 표시한다. 연결 도중 끊긴 세션이 나중에 연결 완료로 바뀌지 않도록 초기화 전부터 연결 해제 이벤트를 감시하고, 성공 직전에도 실제 GATT 연결 여부를 확인한다.

`src/lib/device-ui-test.ts`, 가상 시리얼, 1.6초 뒤 성공 처리, 전송을 무조건 성공시키는 분기를 제거했다. GATT UUID·패킷 규격과 ESP32 출력·극성은 유지한다. 시리얼 특성이 없는 실제 기기에는 임의의 시리얼을 표시하지 않는다.

## 배포 설정

Web Bluetooth를 지원하는 브라우저와 HTTPS가 필요하다. 브라우저의 기기 검색은 사용자 클릭에서 시작해야 한다. [Chrome 공식 안내](https://developer.chrome.com/docs/capabilities/bluetooth)를 참고한다.

배포 환경에 실제 FastAPI 서버 주소를 설정한 뒤 빌드한다. `.env.example`은 자리 표시자이며 실제 서버 주소가 아니다.

```dotenv
NEXT_PUBLIC_FASTAPI_HTTP_BASE_URL=https://api.example.com
NEXT_PUBLIC_FASTAPI_WS_BASE_URL=wss://api.example.com
```

두 값은 `next build` 시 브라우저 번들에 포함되므로 변경 후 다시 빌드해야 한다. 현재 로컬 `.env.local`의 개발용 localhost 주소는 외부 배포에 사용할 수 없다. 배포 플랫폼 환경 변수에 올바른 주소가 이미 설정되어 있다면 해당 플랫폼의 빌드에서 그 값을 사용한다.

```sh
npm run build
npm run start
```

이번 변경은 배포용 코드 전환이며 호스팅 서비스에 게시한 작업은 아니다. 실제 배포용 HTTPS API·WSS 주소는 별도 확인이 필요하다.

## 검증

현재 프로덕션 빌드, TypeScript 및 변경 파일 lint 검사가 통과했다. 기존 프로토콜·키보드 테스트 16개와 아래 브라우저 연결 시나리오 11개가 통과했으며 브라우저 런타임 예외는 없었다. 브라우저 시나리오의 GATT 기기는 테스트 전용 모의 기기다.

기존 프로토콜·키보드 테스트:

```sh
npm run test:earlink
```

개발 또는 프로덕션 서버를 먼저 실행한 뒤 브라우저 회귀 검증:

```sh
npm run test:bluetooth:browser
```

Chrome/Chromium이 설치된 Node 환경에서 실행한다. 기본 주소는 `http://127.0.0.1:3000`이며 `EARLINK_TEST_URL`로 바꿀 수 있다. 자동 탐지되지 않는 브라우저는 `CHROME_BIN`으로 실행 파일 경로를 지정한다. 검증 보고서는 `node_modules/.cache/earlink-bluetooth-tests/production-report.json`에 저장한다.

브라우저 검증은 실제 앱에 Web Bluetooth API와 채팅·연결 공유 서버의 모의 응답을 외부에서 주입한다. 모의 기기와 주입 코드는 `tests/browser`에만 있으며 배포 앱에서 사용하지 않는다. 확인 범위는 다음과 같다.

- 진입 시 자동 요청 없음, 실제 사용자 클릭에서 선택창 요청, EarLink 필터·서비스 UUID.
- 선택 대기와 초기화가 1.6초를 넘어도 성공으로 바뀌지 않음, 취소·재시도·권한 거절.
- 상태 읽기 완료 후 연결, 시리얼 없는 펌웨어, 실제 연결만 서버에 보고, 연결 해제.
- GATT 실패, 필수 특성 누락, 잘못된 상태 패킷, 알림 구독 실패, 초기화 중 연결 해제, 이벤트 없이 GATT 연결이 사라지는 경우.
- Bluetooth 미지원 환경, 다른 휴대폰의 연결과 로컬 연결 구분.
- 선택 키보드·시리얼 특성, 준비·동기화 패킷, 채팅 → GATT 텍스트 패킷 → ACK, 수신 거절 및 재시도.

물리 ESP32·솔레노이드 및 실제 휴대폰의 Bluetooth 선택창과 페어링은 이 자동 검증 범위에 포함되지 않는다. 최종 배포 전 실제 하드웨어로 확인해야 한다.
