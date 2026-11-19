# EarLink Web

Next.js 기반 접근성 채팅 MVP입니다.

- [프로젝트 구조 분석](docs/PROJECT_ANALYSIS.md)
- [ESP32 3칸 점자 펌웨어, 업로드와 전송 규격](firmware/README.md)
- [9버튼 한글 점자 키보드: 핀 배치·웹 입력·채팅 전송](firmware/KEYBOARD.md)
- [점자 사용자의 메시지 수신과 입력 중 말풍선](docs/BRAILLE_CHAT_API.md)
- 기기 전송 테스트: `npm run test:earlink`
- [실제 Bluetooth 연결 및 배포 설정](docs/PRODUCTION_BLUETOOTH.md)

## 실제 EarLink 연결

기기 이미지나 연결 안내를 누르면 브라우저의 Bluetooth 선택창이 열린다. `EarLink`를 선택하고 GATT 연결·상태 읽기가 완료되어야 연결됨으로 표시된다. 기기 선택 취소·연결 실패 시 연결 완료로 처리하지 않는다. UI 테스트 타이머와 가상 전송 분기는 배포 코드에서 제거했다.

실서비스에서는 Web Bluetooth를 지원하는 브라우저와 HTTPS 주소가 필요하다. 한 휴대폰만 기기에 연결하면 다른 참여자는 연결 안내 없이 모드를 선택해 입장한다. 기기 연결은 모드 선택을 막지 않는다.

HTTP와 WebSocket은 기본적으로 웹 주소를 통해 Next.js 서버가 FastAPI에 전달한다. 휴대폰이 자신의 `localhost`에 요청하지 않는다. `.env.example`의 `FASTAPI_HTTP_BASE_URL`을 **Next.js 서버에서 접근 가능한** 백엔드 주소로 설정한 뒤 빌드한다. 같은 컴퓨터에서 두 서버를 실행하면 `http://127.0.0.1:8000`을 사용한다. 기기 상태 공유용 FastAPI 모듈과 설치 방법은 [backend 안내](backend/README.md)를 참고한다.

아래는 프론트엔드 실행 안내입니다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
