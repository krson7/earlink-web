/*
 * UI 테스트 모드
 *
 * true인 동안에는 실제 블루투스 기기를 찾지 않고
 * 기기를 누르면 잠시 뒤 "연결됨" 화면을 보여 준다.
 * (아이폰·PC처럼 블루투스를 못 쓰는 환경에서도 동일)
 *
 * 실제 EarLink 기기로 테스트할 때는 false로 바꾼다.
 */
export const DEVICE_UI_TEST = true;

export const UI_TEST_CONNECT_MS = 1600;
export const UI_TEST_SERIAL = "EL-0001";
