# EARLINK 펌웨어 리팩토링 결과

## 상태

현재 물리 극성은 사용자 연결 파도로 확인한 **HIGH=내려감 / LOW=올라옴**이다. 문자 표시 중에는 점역의 돌출점은 LOW로 두고 배경 점만 HIGH로 내리며, 기본·종료 상태는 전체 LOW다. 2026-11-14에 점역 비트 1을 그대로 HIGH로 내리던 역전 오류를 `DisplayController.h`에서 수정했다. 연결 파도는 내림 마스크를 직접 사용하므로 반전하지 않는다. 아래 기존 점역 분석은 유지하되 전체 내려감을 대기값으로 쓰는 정책은 교체했다.

현대 한글의 자모·약자·약어·핵심 예외와 숫자 처리, 출력 매핑 분리, BLE/Pager 연동을 실제 프로젝트에 반영했다. **일반 UEB 영문 엔진과 아래 미검증 문맥이 남아 있어 요청한 규정 전체 준수의 완료 상태는 아니다.** 완성된 것으로 표시하지 않은 항목은 [규칙 적용 범위](RULES_2024.md)에 기록했다.

## ① 기존 코드 분석

사용하는 스케치는 `firmware/earlink/earlink.ino` 한 개다. 별도의 개선판·구판 펌웨어는 저장소 파일 목록에 없었다. 요청에 있던 `BrailleMapping.h`는 존재하지 않아 새로 추가했다. Arduino에서는 스케치 폴더와 파일 이름이 일치해야 하므로 기존 소문자 이름을 유지했다.

기존 의존 관계는 `earlink.ino → Config/Protocol/Pager → BrailleText`였다. BLE 콜백은 20바이트 이벤트를 FreeRTOS 큐에 넣고, loop에서 Receiver가 BEGIN/DATA/COMMIT을 재조립했다. UTF-8 전체 메시지를 점역한 뒤 Pager가 현재 1개와 대기 3개 메시지를 관리하고, 스케치가 3셀을 역순 전송하며 극성을 뒤집었다.

| 파일 | 기존 책임 | 문제 |
|---|---|---|
| BrailleText.h | UTF-8 해석·자모 테이블·상태·점역을 한 함수에서 수행 | 모든 음절 풀어쓰기, 약자·약어 없음, 단독 자모 미지원, 숫자 뒤 무조건 빈칸, 느낌표 점형 오류, 미지원 문자를 물음표로 오인시킴 |
| Config.h | 핀·시간·한 칸의 점→비트와 칸 역순 | 18개 전체에 걸친 교차 매핑 불가 |
| Pager.h | 페이지·대기열·시간 관리 | 정상 동작; 빈/불완전 점역·전체 셀 저장량 방어가 부족 |
| Protocol.h | v1 프레임 검증·재조립 | 구조 유지 대상; 독립 호출 시 null 포인터·20바이트 초과 방어 보완 가능 |
| earlink.ino | BLE 및 GPIO 출력 | 논리 셀과 물리 전송, 반전 극성이 같은 함수에 혼합 |
| firmware/README.md | 사용 설명 | 실제 코드와 다른 GPIO 2/3/4, 출력 0으로 초기화한다는 오래된 설명이 남아 있었음 |

기존 변환기의 자모 테이블을 그대로 정답으로 간주하지 않고 공식 PDF의 표와 점 위치를 확인했다. 예를 들어 기존 `!`의 456은 규정의 235와 달랐다. `한글`은 기존 6셀에서 규정 약자를 적용한 4셀로, `가나다`는 기존 6셀에서 3셀로 바뀐다.

## ② 반영 파일과 역할

| 구분 | 파일 | 역할 |
|---|---|---|
| 수정 | earlink/BrailleText.h | 문맥 판단·약자/약어·숫자/로마자 상태·점역 감사 콜백; 기존 translate/Translation 유지 |
| 수정 | earlink/Config.h | 확인된 GPIO·기존 시간 설정과 출력 활성화 유지; 힙 여유 설정 |
| 수정 | earlink/Pager.h | 기존 페이지 동작 유지; 불완전 점역·빈 메시지·저장 셀 상한 방어 |
| 수정 | earlink/Protocol.h | v1 유지; 입력 포인터와 패킷 상한 검사; 공통 수신 상한 참조 |
| 수정 | earlink/earlink.ino | 초기화·BLE·명령·오류/메모리 검사·기능 연결 |
| 추가 | earlink/Utf8.h | 잘못된 UTF-8 검증, 원문 위치, 현대 NFD 조합 |
| 추가 | earlink/BrailleRules.h | 조항이 명시된 논리적 점형 데이터 |
| 추가 | earlink/BrailleMapping.h | 논리 18점→T1~T18, 선택한 채널만 HIGH, 시험 코드와 같은 역순 전송 |
| 추가 | earlink/BrailleOutput.h | Arduino GPIO 초기화·74HC595 LSBFIRST·매핑 로그 |
| 추가 | earlink/ConnectionWave.h, DisplayController.h | 비차단 세로열 알림, 출력 중재, 파도 후 페이지 표시 시간 보장 |
| 추가 | earlink/EarlinkLimits.h | 입력·변환·대기열 메모리 상한 |
| 수정 | tests/core_test.cpp | 수신·페이지·시간·UTF-8·출력 바이트 호환 회귀 검사 |
| 추가 | tests/cases_2024.py | 구현과 독립적인 공식 표/예시/수작업 정답 |
| 추가 | tests/braille_cli.cpp | PC에서 실제 점역기를 실행하고 칸·감사 기록 출력 |
| 추가 | tests/run_tests.py | 브라우저+native 검사 실행, PASS/FAIL/UNVERIFIED 보고서 생성 |
| 추가 | tests/official_words_2024.json | 공식 PDF 좌표로 짝지어 검토한 229개 낱말/점형 |
| 추가 | tests/syllable_oracle_2024.py | 구현 테이블을 읽지 않는 조항 기반 기대값 생성기 |
| 추가 | tests/deep_test.cpp, tests/run_deep_tests.py | 전수 음절·인접 조합·Unicode·고정 시드 혼합/상태 장시간 검사와 ASAN 실행 |
| 추가 | tests/context_test.cpp | 약어 접두/접미·숫자 모드·부분 NFD·긴 메시지 분할의 추가 대조 |
| 추가 | tools/export_full_code.py | 실제 파일을 읽어 파일별 전체 코드 문서 생성 |
| 추가 | tools/check_official_source.py | 공식 PDF의 실제 점자 글꼴과 고정 정답의 독립 대조; 변환 결과를 읽지 않음 |
| 추가 | tools/extract_official_words.py | 글꼴·기준선·좌표로 공식 예시 후보 추출; 정답 자동 수정 없음 |
| 수정 | ../package.json | npm run test:firmware 명령 추가; 의존성 변화 없음 |
| 수정 | ../.gitignore | 테스트용 Python 캐시 제외 |
| 수정/추가 | README.md, RULES_2024.md, REFACTOR_REPORT.md, FULL_CODE.md, validation/* | 정확한 사용 설명, 출처, 제한, 전체 코드, 검증 결과 |

변환은 논리적으로 돌출시킬 점을 1로 만든다. `DisplayController`가 표시 중에만 배경점 내림 마스크로 변환하고, 매핑은 그 내림 마스크를 HIGH 채널로 연결한다. 프로토콜은 점형이나 출력 핀을 알지 못하고, Pager는 매핑이나 BLE characteristic을 알지 못한다.

## 유지한 동작과 변경한 오류 처리

- Service/Text/Status UUID, 20바이트 패킷, v1 BEGIN/DATA/COMMIT, 4096바이트 수신 제한, 16바이트 STATUS와 명령 번호 유지.
- GPIO DATA=16, LATCH=17, CLOCK=18, LSBFIRST 유지. 출력은 선택한 채널에 HIGH를 주며 사용자가 검증한 `data[2]→data[0]` 순서로 전송한다.
- 자동 PAGE=2000ms로 변경. BLANK=250ms, RECEIVE_TIMEOUT=10000ms, 수동 HOLD_TIMEOUT=10000ms 유지.
- 현재 1개+대기 3개, 3셀 표시, 자동/수동/이전 유지. 초기화·연결 해제·지우기·공백은 전체 신호 해제로 변경했다.
- 미지원 입력은 과거처럼 물음표로 바꾸지 않는다. `unsupported`와 상세 로그를 남기고 메시지 전체를 기존 BAD_PACKET으로 거부한다. 기존 정상 메시지의 페이지나 대기열을 지우지 않는다.
- 긴 입력은 측정 패스로 메모리를 확인하고 기존 QUEUE_FULL로 용량 부족을 알린다. 동적 할당 실패를 실제 장치에서 강제로 재현한 것은 아니다.
- 일반 UEB 미구현으로 제한된 어휘 외 영어도 거부한다. 기존 MVP 대비 중요한 기능 제한이다.

## ③ 파일별 전체 코드

[FULL_CODE.md](FULL_CODE.md)에 모든 펌웨어 헤더·스케치·테스트·도구·설정을 파일별 코드 블록으로 **생략 없이** 수록했다. ZIP이 아니다. 원본 파일도 해당 경로에 모두 반영되어 있다.

## ④ 검증 결과

[전체 대조 표](validation/BRAILLE_RESULTS.md), [칸별 점 번호·비트·규칙·원문 위치 JSON](validation/braille-results.json), [컴파일 및 소프트웨어/실기 구분](validation/BUILD_RESULTS.md)을 제공한다. 전체 대조 표에는 요청한 모든 문자열이 들어 있다.

공식 표·예시를 전사한 결과와 원문에 없는 문장을 조항으로 직접 조합한 결과는 `evidence`로 구분한다. 표시 정책과 미지원 규칙은 회귀 검사 결과와 관계없이 UNVERIFIED다. 전문 점역사의 촉독 검수와 규정 전체의 적합성 검증은 수행하지 않았다.

## ⑤ 미지원과 미검증

일반 UEB, 일부 단독 된소리, 옛한글·그리스 문자·IPA·수식/서식·단독 기호 설명·의미에 따른 부호 선택은 [상세 제한 목록](RULES_2024.md#미구현미검증-사항)에 명시했다. T1~T18 위치는 사용자 제공 배치를 반영했다. 수정 펌웨어의 실물 구동, 코일 정격·전력·발열, 연속 구동 안정성은 UNVERIFIED다.

## ⑥ T1~T18 매핑 수정 방법

수정할 파일은 `earlink/BrailleMapping.h`, 배열은 `LOGICAL_TO_CHANNEL`이다. 배열의 첫 6개는 읽는 방향의 1번 칸 점1~6, 다음 6개는 2번 칸, 마지막 6개는 3번 칸이다.

T 번호는 사용자 개별 시험의 `data[]` 기준이다. **`data[0]`의 bit0~5가 T1~T6, `data[1]`이 T7~T12, `data[2]`가 T13~T18**이다. 역순 전송하므로 첫 shiftOut은 T13~T18, 마지막은 T1~T6이다. 레지스터 패키지의 Q 핀 번호를 뜻하지 않는다. 논리 칸/점에 대응하는 솔레노이드 배열은 `1,3,5,2,4,6 / 12,10,8,11,9,7 / 18,16,14,17,15,13`을 사용한다.

실측 결과에서 “채널 Tn이 칸 c의 점 d를 움직인다”면 `LOGICAL_TO_CHANNEL[(c-1)*6+(d-1)] = n`으로 기록한다. 18개 결과를 모두 채운 뒤 1~18이 한 번씩 등장하는지 검사한다. 미확인 위치는 0으로 남겨 둘 수 있지만 그 상태에서는 정적 검증이 컴파일을 막는다. 임의로 빈 위치를 채워 확정하지 않는다.

현재 `PHYSICAL_LAYOUT_VERIFIED=true`는 사용자가 전체 배치를 확인해 제공했다는 의미다. 시작 로그에는 `physical=user-confirmed`와 모든 칸/점→Tn 대응을 출력한다. 이 값은 표시용이며 배열의 검증을 생략시키지 않는다. 수정 펌웨어를 업로드하여 실제 점 상승을 확인한 것은 아니다. 자동 T1~T18 순차 구동 기능은 추가하지 않았다.
