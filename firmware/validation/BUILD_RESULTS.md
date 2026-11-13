# 빌드와 검증 기록

검증 기간: 2026-11-12~13, Windows / Asia/Seoul. 실제 작업 트리의 최종 소스로 실행했다. 이 문서는 실물 구동 확인서가 아니다.

2026-11-13 솔레노이드 배치 수정 후 `python firmware/tests/run_tests.py`와 ESP32 컴파일을 다시 실행해 통과했다. 현재 매핑은 칸별 점 1~6 순서로 `1,3,5,2,4,6 / 12,10,8,11,9,7 / 18,16,14,17,15,13`이다. 기존 임시 매핑의 역순 바이트 호환 검사를 사용자 제공 배치의 개별 18점 및 전체 262144조합 검사로 교체했다. 아래 장시간/ASAN 기록은 매핑 변경 전 실행 결과이며 이번 수정에서 다시 실행하지 않았다.

| 검사 | 결과 | 범위 |
|---|---|---|
| 고정 정답 점역 대조 415건 | **PASS 402 / FAIL 0 / UNVERIFIED 13** | 공식 표·예시 312건 + 수작업 조합 90건이 PASS; 표시 정책 5건 + 미지원/미검증 8건은 UNVERIFIED |
| 공식 PDF 글꼴과 고정 정답의 독립 대조 | MATCH 312 / UNVERIFIED 0 | 출처 쪽에서 비어 있지 않은 점형열의 존재 확인; 공백·의미·규칙 전체를 보증하지 않음 |
| 조항 기반 인접 음절 대조 | PASS: 124813584쌍 × 2빌드 | 일반/ASAN에서 각각 전수 검사; 공식 직접 예문 수로 계산하지 않음 |
| 장시간 일반/ASAN 실행 | PASS: 600.006초 / 1320.39초 | 실제 건수·범위는 DEEP_VALIDATION.md; 실기·전문 검수는 아님 |
| 추가 경계·문맥 대조 | PASS: 174250건 × 일반/ASAN | 약어·숫자·부분 NFD·긴 한글 패킷; context-coverage*.json |
| UNVERIFIED 입력의 소프트웨어 회귀 검사 | PASS | UNVERIFIED를 규정 PASS로 바꾸지 않음 |
| 브라우저 프로토콜 테스트 | PASS 5건 | 길이·NFC·20바이트 분할·STATUS·명령·실제 송신 패킷 생성 |
| 실제 브라우저 패킷 → C++ Receiver | PASS | 한글/로마자/숫자/이모지 메시지 재조립; 이모지의 점역 지원을 뜻하지 않음 |
| 현대 한글 11172자 | PASS: 셀 범위·상한·NFD 동등성 | 전체 음절의 점역 정답을 검수했다는 뜻이 아님 |
| UTF-8·지원하지 않는 문자 | PASS: 소프트웨어 검사 | overlong, surrogate, U+10FFFF 초과, 잘림, 다음 ASCII 보존, 오류 원문 위치 |
| Pager | PASS: 소프트웨어 검사 | 3칸 페이지·공백 간격·FIFO/가득 참·자동/수동/이전·유지 시간·millis 순환·초기화·불완전 점역 거부 |
| 매핑 검증 | PASS: 소프트웨어 검사 | 0/19 범위 오류·중복·누락·칸 간 교차 매핑 |
| 사용자 확인 배치의 출력 비교 | PASS: 개별 18점 + 전체 262144조합 | 가로 3행×6열의 독립 배치 기대값과 매핑/active-low 출력 대조; 전체 내려감·올라감 포함 |
| ESP32 Dev Module 컴파일 | PASS | Arduino-ESP32 3.3.12 / esp32:esp32:esp32; 업로드 안 함 |
| 웹 TypeScript | PASS | tsc --noEmit --incremental false |
| git diff --check | PASS | CRLF 정규화 안내 외 공백 오류 없음 |
| 실제 BLE 연결·실물 점 상승/하강 | **UNVERIFIED** | 실제 장치 테스트 안 함 |
| T1~T18 물리 점 위치·촉독 | 배치: 사용자 확인 / 실기·촉독: **UNVERIFIED** | 제공된 세로줄 배치를 코드에 적용; 수정 펌웨어의 장치 구동은 실행하지 않음 |
| 코일 정격·발열·전력·연속 통전 | **UNVERIFIED** | 소프트웨어 타이머/미리보기/컴파일로 판단하지 않음 |
| 한국 점자 규정 전체 적합성 | **미완료** | 일반 UEB 및 RULES_2024.md에 명시한 미구현·미검증 문맥이 남음 |

## 최종 ESP32 컴파일 출력

```text
Sketch uses 1110667 bytes (84%) of program storage space. Maximum is 1310720 bytes.
Global variables use 41444 bytes (12%) of dynamic memory, leaving 286236 bytes for local variables. Maximum is 327680 bytes.
```

위 정적 RAM 수치는 BLE 실행 후 가용 힙이나 솔레노이드 전원 정격 측정값이 아니다. 실제 메시지 할당 전에는 펌웨어가 가용 힙과 최대 연속 블록을 검사한다.

## 재현 명령

프로젝트 루트에서 Python 3.13.7, Node 24.18.0, MSVC C++17로 실행했다. MSVC에는 `/W4 /WX /O2 /utf-8`을 적용했다. g++/clang++ 경로도 스크립트에 있으나 이 환경에서 실행한 것은 MSVC 경로다.

```powershell
python firmware/tests/run_tests.py
node node_modules/typescript/bin/tsc --noEmit --incremental false
arduino-cli compile --fqbn esp32:esp32:esp32 --build-path .firmware-build/esp32 firmware/earlink
python firmware/tools/export_full_code.py
git diff --check
```

Node의 기존 `MODULE_TYPELESS_PACKAGE_JSON` 안내가 출력되지만 5개 테스트는 모두 통과한다. 이 안내를 없애기 위해 웹 프로젝트의 package type을 변경하지 않았다. 프런트엔드 화면·서버·지문자 인식 경로는 수정하지 않았다.

`braille-results.json`에는 각 입력의 예상/실제 점자·칸 수·점 번호·6비트 마스크·각 칸의 적용 규칙·원문 위치가 있다. `code-manifest.json`은 FULL_CODE.md에 수록된 실제 코드 파일 24개의 **LF 정규화 SHA-256**을 기록한다. `official-source-audit.json`은 공식 PDF 글꼴 대조 기록이다. [전수·장시간 검증 상세](DEEP_VALIDATION.md)에 반복 수와 발견한 오류를 기록했다.

## 해석할 때 주의할 제한

PASS는 고정된 입력과 근거 조항을 대조했다는 뜻이다. `manual-rule-composition`은 실제 원문 문장과 직접 대조한 결과가 아니라 공식 조항으로 직접 작성한 기대값과의 일치다. 미지원 항목·애플리케이션 표시 정책은 UNVERIFIED로 유지했다.

펌웨어가 미지원·미검증 규칙으로 진단하는 입력은 기존 BAD_PACKET으로 메시지 전체를 거부한다. UNVERIFIED 중 표시 정책/NFD/원시 셀은 동작을 지원하지만 규정 직접 대조 PASS로 분류하지 않은 경우다. 테스트 판정과 실제 지원 여부를 동일하게 해석하면 안 된다.
