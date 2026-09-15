# AccessAI

**웹사이트가 사용자를 충분히 배려하지 못했다면, 브라우저가 대신 배려한다.**

기존 웹사이트 위에서 이미지 설명, 가독성 개선, 기본 한국어 AI 음성 탐색을 제공하는 Chrome Manifest V3 확장프로그램입니다. 완전한 스크린리더 대체품이나 WCAG 인증 도구가 아닙니다.

해커톤 발표용 설명·시연 순서·당일 준비물은 [발표·기술 설명서](docs/HACKATHON_PRESENTATION.md)에, 폴더와 구현 파일을 처음부터 따라가는 설명은 [코드 안내서](docs/CODE_GUIDE_KO.md)에 정리했습니다.

## 심사위원 설치 — 1분

1. [GitHub Releases의 AccessAI-submission.zip](https://github.com/maker240305/accessai/releases/latest/download/AccessAI-submission.zip)을 내려받아 압축 해제합니다.
2. Chrome 주소창에 `chrome://extensions`를 입력합니다.
3. **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램 로드** → 압축을 푼 **AccessAI** 폴더를 선택합니다.
5. 일반 웹사이트에서 확장 메뉴의 **AccessAI**를 누르고 **현재 페이지 분석**을 선택합니다.

Node.js, npm, API Key 입력, 별도 서버 실행은 필요하지 않습니다. 인터넷 연결과 최신 데스크톱 Chrome이 필요합니다. 이미지 처리 시 웹사이트 접근 권한, 음성 입력 시 마이크 권한을 요청합니다.

## 사용

- **이 페이지 개선**: 작은 글자와 줄간격 보완. 고대비 옵션을 선택할 수 있습니다.
- **이미지 설명 생성 / 추가 처리**: 기존 alt 유무와 길이에 관계없이 화면의 주요 사진을 AI로 최대 8개씩 처리합니다. 설명은 실제 `alt`에 반영합니다.
- **원상 복구**: AccessAI가 적용한 스타일·alt 변경을 되돌립니다.
- **Voice Mode**: 마이크 버튼을 누르고 말하거나 명령을 입력합니다.
- **단축키**: `Alt+A`(macOS에서는 Option+A)로 현재 탭의 Voice Mode 마이크를 시작하고, `Alt+X`(Option+X)로 AccessAI Side Panel을 엽니다. 다른 확장프로그램과 충돌하면 Chrome의 `chrome://extensions/shortcuts`에서 바꿀 수 있습니다.
- 예: “페이지 읽어줘”, “이 페이지 설명해줘”, “로그인 버튼 눌러줘”, “사진설명해줘”, “검색창에 맥북 입력해줘”(검색까지 실행), “검색창에 맥북 입력만 해줘”(입력만), “아래로 내려줘”, “뒤로 가줘”, “멈춰”, “다시 읽어줘”.
- 결제·구매·삭제·폼 제출 등은 **확인하고 실행**을 눌러야 수행됩니다. 확인은 30초 후 또는 페이지 변경 시 만료됩니다.
- 마이크 권한 창이 나타나지 않으면 **별도 창에서 열기**를 사용합니다. 원래 페이지를 대상으로 유지합니다.

## 개발

Node.js 22 이상과 pnpm을 사용합니다. 이 저장소에서 실행:

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm package
```

`pnpm build`는 `extension/.output/chrome-mv3/`를 만듭니다. `pnpm package`는 production 빌드와 Manifest·비밀키 검사 후 제출 ZIP을 만듭니다. npm을 쓰는 개발 환경에서는 `npm run build`도 가능합니다.

## 구조

- `extension/entrypoints`: Side Panel React UI, Service Worker, Content Script
- `extension/core`: DOM 탐색, 실행 검사, axe-core 검사, 가독성·이미지 보완
- `shared/protocol.ts`: Zod 기반 요청·응답 및 제한된 action 스키마
- `proxy`: 무료 Cloudflare Worker → Gemini Developer API
- `scripts`: ZIP 생성, 비밀키 등록, 실제 AI 연결 검사
- `tests`: 프로토콜·프록시·DOM 통합 테스트
- `docs`: 운영·검증·개인정보 설명

## AI 서버 운영

`https://accessai-proxy.accessai.workers.dev`를 사용합니다. 운영 정보는 [docs/OPERATIONS.md](docs/OPERATIONS.md)를 참고하세요.

API 키는 Worker Secret에만 저장하고, 로컬 `proxy/.dev.vars`는 Git 및 ZIP에서 제외합니다. `VITE_` 변수에는 절대 비밀키를 넣지 않습니다. 배포 URL은 공개 설정이며 `extension/public-config.json`에 둡니다. `extension/.env.production`에서 개발자가 덮어쓸 수 있습니다.

## 지원 범위

일반적인 HTML 페이지의 메인 프레임, 표준 입력란·버튼·링크를 우선 지원합니다. Chrome 내부 페이지, Chrome Web Store, 내장 PDF 뷰어, 닫힌 Shadow DOM, 교차 출처 iframe, 캔버스 UI, 일부 자동화 차단 사이트는 지원되지 않을 수 있습니다. 음성 인식은 Chrome·OS·네트워크에 따라 달라집니다.

무료 AI 한도가 소진되면 AI 요청을 멈춥니다. 유료 API로 전환하지 않습니다. 로컬 가독성 개선과 기본 스크롤·뒤로 가기는 계속 사용할 수 있습니다. AI 설명은 잘못될 수 있고 장면의 모든 정보를 포함하지 않습니다.

공식 Demo Page는 사용자의 추후 요청 전까지 구현하지 않습니다. 테스트용 DOM fixture는 제품 시연 페이지와 별개입니다.

기사 페이지에서는 본문 사진만 분석합니다. 광고·관련 기사·기자 프로필은 제외합니다. “사진 설명해줘”는 화면 중앙과 가까운 본문 사진, “본문 사진 전부 설명해줘”는 본문 순서 전체, “두 번째 사진 설명해줘”는 본문 기준 순서로 처리합니다. 본문을 확정하지 못한 기사에서는 임의의 사진을 분석하지 않습니다.

동적으로 광고나 추천 기사가 바뀌어도 현재 기사 본문과 명령 대상이 그대로라면 명령을 계속 실행합니다. 실제 본문, 버튼 목적지, 입력 폼처럼 해당 명령에 필요한 상태가 바뀐 경우에는 다시 명령하도록 안내합니다.

“본문 읽어줘”는 웹페이지의 문단과 줄바꿈을 따라 실제 내용의 첫 문장부터 읽습니다. 나무위키처럼 링크로 나뉜 문장도 이어 붙이고, 목차·표·광고·저작권 안내는 제외합니다. 음성이 다음 문장으로 넘어가면 해당 원문을 강조하고 필요할 때 화면을 따라 이동합니다. 시작 위치를 확정할 수 없는 페이지에서는 동의한 경우에만 후보 문단을 AI에 보내 시작 위치를 선택하며, 읽는 내용은 웹페이지 원문 그대로입니다.

Chrome 새 탭에서는 AccessAI에 “사과를 검색해줘”라고 말하거나 입력하면 Google 검색 결과로 이동합니다. 새 탭 자체의 사진·가독성 분석은 하지 않으며 결과 웹페이지에서 분석이 이어집니다. Google의 textarea 검색창도 지원합니다.
