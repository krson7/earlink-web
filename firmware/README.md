# EARLINK ESP32 펌웨어

3칸 × 6점 솔레노이드 장치용 펌웨어다. 국립국어원 2024 개정 규정을 확인하여 현대 한글의 자모·약자·약어와 주요 문맥 예외를 적용했다. **규정 전체 준수 완료는 아니다.** 일반 UEB 영어 점역과 일부 기호·의미 문맥은 미구현/미검증이며 해당 입력은 출력에서 거부한다.

- [기존 코드 분석·변경 파일·매핑 안내](REFACTOR_REPORT.md)
- [공식 출처·조항별 구현·미지원 사항](RULES_2024.md)
- [파일별 전체 코드](FULL_CODE.md)
- [전체 점역 대조 표](validation/BRAILLE_RESULTS.md)
- [칸별 점 번호·비트마스크·규칙·원문 위치 JSON](validation/braille-results.json)
- [공식 PDF 글꼴과 고정 정답의 독립 대조](validation/official-source-audit.json)
- [빌드/소프트웨어 검사와 실제 장치 검증 구분](validation/BUILD_RESULTS.md)
- [전수·장시간·AddressSanitizer 검사와 발견한 오류](validation/DEEP_VALIDATION.md)

## 처리 흐름

```text
웹 NFC 텍스트 → 기존 BLE v1 패킷 → Receiver 전체 메시지 재조립
→ UTF-8 검증/현대 NFD 조합 → 문맥 기반 점역 → Translation.cells
→ Pager의 3셀 창 → 논리 18점/물리 채널 매핑
→ active-low 바이트 → 74HC595 LSBFIRST → 솔레노이드
```

`earlink::translate(const std::string&)`와 `Translation { cells, unsupported }`는 유지했다. 필요한 점이 1인 논리 마스크만 만든다. `unsupported != 0`이면 부분 결과를 출력하면 안 된다. BLE 통합과 Pager는 이를 강제한다. 진단이 필요한 PC 도구는 `translate(text, callback, context)`를 사용할 수 있다.

## Arduino IDE / VS Code

`firmware/earlink`의 스케치와 모든 헤더를 함께 사용한다. Arduino IDE에서 `earlink.ino`를 열고 **ESP32 Dev Module**을 선택한다. 폴더와 `.ino` 이름을 함께 `EARLINK`로 바꾸는 것은 가능하지만 스케치 파일만 다른 이름으로 복사하면 안 된다. Arduino-ESP32에 포함된 BLE를 쓰며 별도 외부 점역 라이브러리는 필요 없다.

VS Code에서도 같은 폴더를 사용하거나 Arduino CLI로 컴파일한다.

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 --build-path .firmware-build/esp32 firmware/earlink
```

검증한 보드 패키지 버전과 메모리 결과는 빌드 보고서에 기록했다. 이 작업에서 보드 업로드나 실제 솔레노이드 구동은 실행하지 않았다.

## 유지한 하드웨어 조건

| 항목 | 설정 |
|---|---|
| DATA / LATCH / CLOCK | GPIO 16 / 17 / 18 |
| 장치 | ESP32 Dev Module, 74HC595, 6점 × 3칸 |
| 극성 | 1=점 내려감, 0=점 올라감 |
| 전송 | LSBFIRST, 사용자 확인 솔레노이드 배치에 따른 3바이트 전송 |
| 시작·지우기·연결 해제·표시 종료 | 활성 18채널 모두 1로 내려감 |
| 자동 표시 / 사이 간격 | 3000ms / 250ms |
| 수신 / 수동 유지 타임아웃 | 10000ms / 10000ms |

전체 내려감의 기존 전송 바이트는 **3F 3F 3F**다. 각 바이트의 상위 두 비트는 기존처럼 0으로 유지한다. `00 00 00`은 활성 18개가 올라가는 반대 극성이므로 초기화 값으로 사용하면 안 된다.

`BrailleMapping.h`의 `LOGICAL_TO_CHANNEL`로 18개 점 전체를 매핑한다. 사용자에게 확인한 실제 배치를 읽는 면의 왼쪽 세로줄부터, 각 줄의 위→아래 순서로 적용했다.

| 칸 | 왼쪽 세로줄: 점 1·2·3 → 솔레노이드 | 오른쪽 세로줄: 점 4·5·6 → 솔레노이드 |
|---|---|---|
| 1 | 1, 3, 5 | 2, 4, 6 |
| 2 | 12, 10, 8 | 11, 9, 7 |
| 3 | 18, 16, 14 | 17, 15, 13 |

각 칸의 표준 점 번호는 다시 1~6으로 시작한다. 전체 18점을 세로줄 순서로 연속해서 부르면 `(1,2,3) (4,5,6) (7,8,9) (10,11,12) (13,14,15) (16,17,18)` 위치에 위 표의 솔레노이드가 대응한다.

솔레노이드 번호는 기존 소프트웨어 채널 T1~T18로 해석했다. 첫 `shiftOut` 바이트의 bit0~5가 T1~T6, 두 번째가 T7~T12, 세 번째가 T13~T18이다. 시작 로그의 `physical=user-confirmed`는 사용자 제공 배치를 반영했다는 뜻이며, 수정 펌웨어의 실기 구동 결과는 아니다. [T1~T18 수정 절차](REFACTOR_REPORT.md#⑥-t1t18-매핑-수정-방법)를 참조한다.

기존 `OUTPUT_ENABLED=true`를 유지했다. GPIO 출력 없이 변환·BLE·페이지를 확인하려면 `Config.h`에서 false로 설정한다. 이 소프트웨어 옵션이나 기존 표시 시간이 코일 정격·전력·발열의 검증을 의미하지 않는다. 실제 회로의 전류 경로와 드라이버 보호, 지속 통전 정격은 별도 실측 대상이다.

## 페이지와 메모리

점역 후 **3글자가 아니라 3점자 칸씩** 출력한다. 마지막 페이지의 빈 자리는 논리 0이며 실제 점은 내려간다. 현재 메시지 1개와 대기 3개를 관리하고, 자동/다음/이전/직접 넘김/지우기 동작을 유지한다. 직접 넘김 상태의 10초 만료는 화면만 내리고 현재 페이지 데이터는 보존한다.

디스플레이 페이지는 문서의 줄바꿈과 다르다. 점자 스트림을 3칸 창으로 나누며 문서 줄 연결표·줄 끝 금칙을 새로 넣지 않는다. LF/CR/탭은 빈 셀 1개, CRLF는 빈 셀 1개로 표시한다. 이 표시 정책은 규정 대조 PASS 대상에 포함하지 않는다.

입력은 최대 4096바이트, 변환은 24592셀, 현재+대기 합계는 32768셀까지 제한한다. 정확한 출력 크기를 먼저 측정해 셀 벡터를 한 번 할당한다. 전체 디코딩 문자 배열과 규칙 추적 배열은 ESP32에 만들지 않는다. 저장 공간이나 힙이 부족하면 기존 QUEUE_FULL 응답을 사용한다.

## 미지원·미검증 입력

미지원 문자와 잘못된 UTF-8을 임의의 물음표로 바꾸지 않는다. 0부터 시작하는 원문 바이트/문자 위치·유니코드·사유를 시리얼에 최대 32건 기록하고 총 unsupported 개수를 알린다. 메시지 전체를 기존 BAD_PACKET으로 거부하며 이미 읽고 있던 다른 메시지는 유지한다.

`Hello`, `HELLO`, 기본 로마자 표와 제한된 어휘는 지원하지만, `school` 등 일반 UEB 묶음약자가 필요한 입력은 아직 거부한다. 이 기능 제한을 포함한 전체 목록은 [RULES_2024.md](RULES_2024.md)에 있다. 미지원 입력을 일부만 읽거나 규정에 맞는 것으로 표시해서는 안 된다.

## BLE v1 호환 규격

웹 코드 `src/lib/earlink-protocol.ts`의 wire format과 UUID는 변경하지 않았다. 이번 작업에서 웹과 펌웨어를 새 프로토콜로 동시에 바꿀 필요는 없다. 과거의 원문 단일 Write 장치가 아닌, 저장소의 기존 v1 장치와의 호환을 유지했다.

이름 `EarLink`, Service `8f3a0001-7c3b-4b8a-9f52-123456789abc`.

TEXT: `8f3a0002-7c3b-4b8a-9f52-123456789abc`, Write with response. 정수는 little-endian, 패킷은 최대 20바이트다.

| 프레임 | 바이트 |
|---|---|
| BEGIN | `45 4C 01 01 id:u16 totalBytes:u16` |
| DATA | `45 4C 01 02 id:u16 byteOffset:u16 payload:1..12bytes` |
| COMMIT | `45 4C 01 03 id:u16` |

부분 UTF-8을 패킷마다 해석하지 않는다. 순서·오프셋·ID·길이가 맞아야 COMMIT 후 점역한다. 후속 데이터가 10초 동안 없으면 조립을 취소한다. GATT Write 성공은 점역/출력 큐 등록 ACK와 다르다.

STATUS/control: `8f3a0003-7c3b-4b8a-9f52-123456789abc`, Read + Write + Notify. 상태는 16바이트다.

| 오프셋 | 내용 |
|---:|---|
| 0 | 버전 1 |
| 1 | flags: bit0 활성, bit1 자동, bit2 GPIO 활성 설정, bit3 표시 중 |
| 2~3 | 마지막 처리 메시지 ID |
| 4 | 결과: 0 없음, 1 큐 등록, 2 잘못된 패킷/점역 불가, 3 입력 길이 초과, 4 순서/길이 오류, 5 큐/저장 공간 부족, 6 수신 시간 초과 |
| 5 | 대기 메시지 수 |
| 6~7 | 현재 메시지 ID |
| 8~9 | 현재 페이지: 1부터, 비활성은 0 |
| 10~11 | 전체 페이지 수 |
| 12~13 | 현재 메시지의 unsupported: 거부된 다른 메시지의 값으로 바꾸지 않음 |
| 14~15 | 자동 페이지 표시 시간(ms) |

제어 쓰기는 `[1, command]`: 1 다음, 2 이전, 3 지우기, 4 직접 넘김, 5 자동 넘김. `[1,6,milliseconds:u16]`은 1000~10000ms를 허용한다. ACK=1은 소프트웨어 큐 등록을 의미하며 실제 점의 상승을 센서로 확인한 응답은 아니다. 자동 재전송은 추가하지 않았다.

## 자동 검증

Python 3와 Node 22.18 이상, C++17 컴파일러(MSVC C++ Build Tools 또는 g++/clang++)가 필요하다. 점역 테스트에 추가 Python 패키지는 필요 없다.

```powershell
npm.cmd run test:firmware
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

첫 명령은 기존 브라우저 프로토콜 검사, 실제 브라우저 패킷의 C++ Receiver 재조립 검사, UTF-8/길이/페이지/시간/큐/매핑 검사, 고정 정답 점역 대조를 실행하고 `validation` 보고서를 갱신한다. 테스트가 실패하면 0이 아닌 종료 코드를 반환한다. UNVERIFIED를 PASS로 바꾸지 않는다.

현재 빠른 검사에는 독립적인 조항 기반 기대값으로 약어·숫자·부분 NFD·긴 메시지 경계 174250건을 검사하는 과정도 포함한다. 전체 인접 음절과 장시간 불량 입력을 확인하려면 다음을 별도로 실행한다.

```powershell
npm.cmd run test:firmware:deep
npm.cmd run test:firmware:asan
```

각 명령은 전체 11172² 인접 음절 조합을 끝까지 검사하고 최소 600초 및 정해진 최소 혼합 검사 건수를 충족할 때까지 실행한다. 따라서 ASAN 실행은 600초보다 길어질 수 있다. Windows ASAN 실행에는 MSVC AddressSanitizer 구성 요소가 필요하다. 이번 기록은 일반 약 600초, ASAN 약 1320초였으며 실제 장치를 구동하지 않았다.

전체 코드 문서를 갱신하려면 다음 명령을 실행한다.

```powershell
python firmware/tools/export_full_code.py
```

선택적으로 고정 정답을 공식 PDF의 실제 점자 글꼴과 재대조하려면 `pypdf`를 설치한 환경에서 다음을 실행한다. 일반 테스트에는 이 패키지가 필요 없다. 이 검사는 비어 있지 않은 점형열의 존재만 확인하며 공백·의미까지 인증하지 않는다.

```powershell
python firmware/tools/check_official_source.py --pdf '공식_2024_규정.pdf'
```
