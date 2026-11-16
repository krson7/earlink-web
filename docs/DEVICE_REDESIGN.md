# EARLINK 제품 질감과 연결 안내

## 최종 화면

- 기존 앱 프레임 폭·최대 높이와 기본 디자인을 유지한다. 기기는 정면으로 표시한다.
- 연결 안내에는 아래 두 줄만 표시한다. 안내 카드와 기기 이미지가 연결 버튼이다.

  ```text
  기기를 눌러 연결하세요
  every way connect
  ```

- 하단 연결 칩, '나중에 연결하기', 'BLUETOOTH LE' 설명은 제거했다. 배경 누르기와 Escape로 안내를 닫는 기존 동작은 유지한다.
- '기기를 눌러 연결하세요'에는 로딩 화면 EarLink 제목의 글꼴·굵기 900·자간 -.06em을, 'every way connect'에는 로딩 화면 슬로건의 글꼴·굵기 500·자간 -.04em을 공유한다. 안내 카드에 맞는 기존 글자 크기와 가운데 정렬은 유지한다. 블루투스 아이콘의 폭이 텍스트 중심을 밀어내지 않도록 배치했다.
- 본체의 기존 외형·키 배열·3셀 18점은 유지하고, 유광 화이트 재질, 상단 중앙의 발광하는 백색 원형 LED, 전면 오른쪽의 원형 DC 충전 단자를 표현했다. 스페이스 키 아래 EARLINK 글자는 제거했다.
- LED는 이미지의 발광 표현이다. 실제 ESP32 상태를 표시하는 새 기능이나 BLE 명령은 추가하지 않았다.

## 모바일 화면 고정

- 문서와 앱 배경을 고정하고 루트 스크롤 및 오버스크롤을 차단했다.
- `visualViewport`의 resize·scroll 이벤트로 주소창과 키보드가 변할 때 보이는 높이와 상단 오프셋을 반영한다. 이벤트 갱신은 animation frame으로 합친다. 네이티브 핀치 확대는 유지한다.
- 화면 전체 높이 대신 앱 컨테이너의 실제 높이를 기준으로 내부 간격을 조정한다. 작은 화면에서는 기기가 남은 공간 안에 들어가며 안전 영역을 고려한다.
- 채팅의 자동 이동은 메시지 영역의 `scrollTo`로 한정했다. 이전 `scrollIntoView`처럼 상위 앱까지 이동시키지 않는다. 채팅 메시지 스크롤과 입력 기능은 유지한다.

## 파일

- `public/earlink-device-pearl-glow.webp`: 최종 제품 이미지, 1798 × 875, 투명 배경, 약 118 KB. 원본 `public/earlink-device.webp`는 보존한다.
- `src/app/globals.css`: 연결 안내 스타일·글꼴, 모바일 고정, 컨테이너 높이에 따른 간격, 이미지 참조.
- `src/components/layout/MobileAppShell.tsx`: 실제 보이는 뷰포트의 높이·오프셋 동기화.
- `src/components/entry/BrailleDevice.tsx`: 연결 안내와 태그라인, 이미지. 하단 연결 칩 제거.
- `src/components/entry/ModeSelect.tsx`, `ModeSelectScreen.tsx`: 삭제된 안내 버튼의 불필요한 prop 전달 제거.
- `src/components/chat/MessageList.tsx`: 메시지 영역 안에서만 자동 스크롤.
- `src/components/device/DeviceModel3D.tsx`: 기존 구조를 유지하며 대기 자세는 정면.
- `src/app/page.tsx`, `src/hooks/useEarLinkBluetooth.ts`: 배포 버전에서는 실제 Web Bluetooth 연결만 사용한다. UI 테스트 타이머·가상 시리얼·가상 전송 분기와 `src/lib/device-ui-test.ts`는 제거했다.

GATT UUID·패킷, 펌웨어, 솔레노이드 극성, 채팅 통신, 음성·카메라·퍼킨스 점자 입력 로직은 유지한다. 기기 클릭 → 브라우저 기기 선택 → GATT 연결·알림 구독·상태 읽기 → 연결 완료 순서로 동작한다. 초기화 중 연결이 끊어져도 성공으로 바뀌지 않도록 보강했다. 배포 조건과 검증 범위는 [실제 Bluetooth 연결](PRODUCTION_BLUETOOTH.md)을 참고한다.

## 검증

- 개발 서버: `http://127.0.0.1:3000`, HTTP 200.
- 프로덕션 빌드 및 수정 파일 lint 통과. 프로토콜·키보드 테스트 16개 통과.
- Chrome 데스크톱·태블릿 및 모바일 모드에서 320×568, 360×640, 375×667, 390×844, 412×915 등 확인. 기본 프레임 크기를 유지하며 메인 영역에 세로 넘침과 스크롤이 발생하지 않는다.
- 모바일 안전 영역 위 47px·아래 34px, 주소창으로 보이는 높이가 667·620·568px로 바뀌는 조건을 에뮬레이션했다. 스와이프 후 루트·메인 스크롤 위치 0 유지.
- 키보드로 보이는 높이가 350px인 조건에서 채팅 입력창이 보이고, 35개 메시지의 내부 스크롤이 동작하는 것을 확인했다.
- 1440·390·320px 화면에서 두 문구와 EarLink 브랜드의 실제 폰트가 동일한 Noto Sans KR인지 확인했다. 두 텍스트의 실제 중심과 안내 카드 중심의 차이는 0.01px 이내였고 세로 넘침 없이 연결 버튼도 동작했다.
- 배포용 연결 경로는 브라우저 외부 주입 모의 GATT 기기로 별도 검증한다. 앱 소스에는 가상 연결 기능이 없으며 검증용 기기는 테스트 파일에만 존재한다.
- 실제 휴대폰 Safari 및 물리 ESP32·마이크·카메라·스피커 종단 검증은 수행하지 않았다.

## 글꼴

기존 `src/app/layout.tsx`의 Noto Sans KR을 상속한다. 추가 폰트 파일은 사용하지 않는다.

## 최종 이미지 편집 프롬프트

내장 image_gen 편집 도구로 생성하고 Sharp로 WebP 인코딩했다. `transparent_background: true`.

```text
Use case: precise-object-edit. Edit only the existing small circular LED ring at the top center of the attached EARLINK hardware photo. It currently looks like an unlit molded white plastic ring. Make it unmistakably SWITCHED ON and EMITTING NATURAL NEUTRAL WHITE LIGHT, even at 300px display width: a brilliant softly overexposed pure WHITE emissive ring core, a natural feathered WHITE optical bloom directly around it, and realistic WHITE light gently spilling onto the surrounding pearl-white shell. The core must be visibly self-luminous, not gray, not a solid plastic button. Use a small slightly darker neutral-gray inner recess to make the white luminous ring legible against the white body. Increase emitted brightness, not physical size. Keep the original small ring geometry and location. No blue/cyan/yellow/orange tint whatsoever, no colored glow, no fake starburst, no giant neon ring. Realistic bright white electronic power indicator photographed with subtle lens bloom. Preserve the rest of the photo precisely: enclosure silhouette and perspective, clean glossy white finish, 8 angled finger keys, center space key, exactly 18 silver braille dots as 3 six-dot cells, circular black DC charging jack on the RIGHT of the front wall, no EARLINK lettering or other branding anywhere. No additional hardware, no extra ports or dots. Same dimensions and framing, full product visible, transparent alpha background, no floor, no UI, no watermark.
```
