# FastAPI 기기 상태 공유 모듈

`device_presence_router.py`는 별도 FastAPI 저장소에 설치할 서버 코드다. 프론트엔드의 연결 상태만으로는 서로 다른 휴대폰의 BLE 연결 여부를 알 수 없다.

1. 이 파일을 백엔드의 `server/routers/device_presence_router.py`에 복사한다.
2. `server/routers/room_router.py`에서 `from server.routers.device_presence_router import router as device_presence_router`를 가져온다.
3. 기존 `/rooms` 라우터를 만든 뒤 `router.include_router(device_presence_router)`를 추가한다.
4. FastAPI와 Next.js 서버를 재시작한다. 이미 열린 웹 화면도 새로고침한다.

이 모듈은 기존 메모리 기반 채팅 서버와 동일하게 **FastAPI worker 하나**를 전제로 한다. 여러 worker나 서버 인스턴스를 사용하면 채팅 중계와 기기 상태를 함께 Redis 같은 공용 저장소로 옮겨야 한다.

API와 만료·연결 소유자 규칙은 [기기 상태 공유 규격](../docs/DEVICE_PRESENCE_API.md)을 참고한다. 테스트는 백엔드 Python 환경에서 `python tests/backend/test_device_presence.py`로 실행한다. 기존 DB나 모델을 불러오지 않는다.
