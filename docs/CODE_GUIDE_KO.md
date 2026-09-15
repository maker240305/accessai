# AccessAI 코드 안내서

이 문서는 “이 폴더의 파일이 왜 있고, 어디부터 읽어야 하는가?”를 설명한다. 코드를 처음 볼 때는 모든 파일을 순서대로 읽지 말고 아래 읽는 순서대로 보면 된다.

## 먼저 큰 그림

AccessAI는 하나의 웹사이트가 아니라, 서로 다른 환경에서 실행되는 네 조각으로 되어 있다.

    사용자
      ↓
    Side Panel 화면 (React)
      ↓ 메시지
    Content Script ─────────→ 현재 열어둔 웹페이지의 DOM/CSS
      ↑                    (글자 크기, alt, 클릭, 스크롤 등)
      ↓
    Background Service Worker
      ↓
    Cloudflare Worker ──────→ Gemini API
                             (키는 여기만 보관)

- Side Panel: 오른쪽에 열리는 AccessAI 화면이다. 버튼, 음성 명령, 안내 문구를 보여준다.
- Content Script: 네이버·구글·나무위키처럼 사용자가 연 실제 사이트 안에 들어가서 그 사이트의 HTML을 읽고 바꾸는 코드다.
- Background Service Worker: 확장프로그램의 중간 관리자다. API 통신과 화면 캡처처럼 Content Script가 하면 안 되는 일을 한다.
- Cloudflare Worker: Gemini API 키를 숨긴 작은 서버다. 확장프로그램은 여기로만 AI 요청을 보낸다.

## 폴더 지도

    starton/
    ├── extension/              Chrome 확장프로그램 본체
    │   ├── entrypoints/        Chrome이 실제로 실행하는 시작 파일
    │   ├── core/               웹페이지를 분석·변경하는 핵심 기능
    │   ├── public/             아이콘 같은 정적 파일
    │   ├── wxt.config.ts       확장 이름, 권한, 단축키 설정
    │   ├── public-config.json  공개 가능한 AI 프록시 주소
    │   └── .output/            빌드 결과물. 직접 수정하지 않음
    ├── shared/                 확장과 서버가 같이 쓰는 약속
    ├── proxy/                  Cloudflare Worker 서버
    ├── tests/                  자동 테스트
    ├── scripts/                ZIP 생성·배포 보조 스크립트
    ├── docs/                   발표·운영·개인정보·검증 문서
    ├── artifacts/              최종 제출 ZIP이 생성되는 곳
    ├── package.json            실행 명령과 라이브러리 목록
    └── README.md               프로젝트 사용법

### 직접 수정하는 곳

- 화면을 바꾸고 싶다 → extension/entrypoints/sidepanel/App.tsx, style.css
- 웹페이지 분석·읽기·클릭을 바꾸고 싶다 → extension/core/dom.ts
- 사진 설명 대상을 바꾸고 싶다 → extension/core/images.ts
- 글씨·고대비 개선을 바꾸고 싶다 → extension/core/accessibility.ts
- 검색 자동 실행을 바꾸고 싶다 → extension/core/search.ts
- AI가 고를 수 있는 행동을 바꾸고 싶다 → shared/protocol.ts, proxy/index.ts
- 단축키·권한·확장 이름을 바꾸고 싶다 → extension/wxt.config.ts

### 직접 수정하면 안 되는 곳

- extension/.output/: TypeScript를 Chrome용 JavaScript로 바꾼 결과다. pnpm build 또는 pnpm package가 다시 만든다.
- extension/.wxt/: WXT가 생성한 타입·설정 파일이다.
- proxy/.dev.vars: 로컬 Gemini 키가 들어갈 수 있다. Git, 발표 자료, ZIP에 넣지 않는다.
- node_modules/: 설치된 라이브러리 묶음이다. 저장소 코드가 아니다.

## 가장 쉬운 읽는 순서

### 1. package.json — “어떤 명령을 쓰는 프로젝트인가?”

여기에는 프로젝트 이름과 라이브러리, 명령이 있다.

| 명령 | 하는 일 |
| --- | --- |
| pnpm dev | 확장프로그램 개발 모드 실행 |
| pnpm build | Chrome이 읽을 수 있는 확장 폴더 생성 |
| pnpm typecheck | TypeScript 문법·타입 검사 |
| pnpm lint | 코드 스타일·실수 검사 |
| pnpm test | 자동 테스트 |
| pnpm package | 빌드 후 제출 ZIP 생성 |
| pnpm proxy:deploy | Cloudflare Worker 서버 배포 |

발표용 결과물은 `pnpm package`로 만드는 `artifacts/AccessAI-submission.zip`이며, 심사위원은 [GitHub Releases](https://github.com/maker240305/accessai/releases/latest)에서 받을 수 있다.

### 2. extension/wxt.config.ts — “Chrome에 AccessAI를 어떻게 등록했나?”

이 파일은 Chrome 확장프로그램의 신분증이다.

- 이름: AccessAI — 더 넓은 웹
- Manifest V3 사용
- Side Panel 사용 권한
- 현재 탭과 스크립트 삽입 권한
- Alt+X: Side Panel 열기
- Alt+A: Voice Mode 시작
- 아이콘과 고정 확장 ID 설정

여기서 설정한 내용은 빌드하면 extension/.output/chrome-mv3/manifest.json으로 변환된다.

### 3. extension/entrypoints/ — “Chrome이 실제로 시작하는 세 파일”

Chrome 확장프로그램에는 일반 웹앱처럼 하나의 main.ts만 있는 게 아니다. 서로 다른 장소에서 따로 실행되는 시작점이 있다.

| 파일 | 실행 장소 | 역할 |
| --- | --- | --- |
| sidepanel/App.tsx | 오른쪽 AccessAI 화면 | 사용자가 보는 UI와 명령 흐름 |
| content.ts | 사용자가 연 모든 HTTP/HTTPS 페이지 | 페이지 DOM 분석·수정·클릭 실행 |
| background.ts | Chrome 백그라운드 | API 요청, 이미지 준비, 단축키 처리 |

#### sidepanel/App.tsx

가장 큰 화면 파일이다. 버튼과 상태를 만들고, 사용자의 명령을 전체 흐름으로 연결한다.

- connect(): 현재 탭에 Content Script가 있는지 확인하고 페이지를 분석한다.
- improve(): 글씨·대비를 바꾸고 필요하면 이미지 설명도 시작한다.
- runCommand(): 입력란 또는 음성으로 받은 문장을 처리한다.
- listen(): Chrome의 음성 인식 기능을 시작한다.
- speak(): 일반 안내를 음성으로 읽는다.
- speakReading(): 본문을 짧은 조각으로 읽으며 현재 문장을 화면에 표시한다.
- stopSpeech(): 음성과 본문 강조를 같이 멈춘다.

사용자가 “본문 읽어줘”라고 하면 이 파일이 SNAPSHOT을 요청하고, 필요할 때 AI를 부른 뒤 EXECUTE 메시지를 Content Script에 보낸다.

#### content.ts

이 파일은 실제 웹페이지 안에서 작동하는 메시지 접수처다. Side Panel에서 온 메시지를 switch로 나누어 핵심 함수에 전달한다.

    Side Panel → { type: AUDIT } → content.ts → accessibility.ts의 audit()
    Side Panel → { type: EXECUTE } → content.ts → dom.ts의 checkAction() → execute()
    Side Panel → { type: IMAGES } → content.ts → images.ts의 meaningfulImages()

또한 MutationObserver로 페이지 변화도 감지한다. 그래서 페이지가 바뀌면 과거에 수집한 버튼을 그대로 믿지 않는다.

#### background.ts

브라우저 권한이 필요한 중간 작업을 한다.

- Alt+X, Alt+A 단축키를 받아 Side Panel을 연다.
- Alt+A 요청을 chrome.storage.session에 잠시 저장한다. Side Panel이 열린 뒤 이를 읽어 마이크를 시작하고 마이크 버튼에 포커스를 둔다.
- AI 동의를 검사하고 Cloudflare Worker로 요청한다.
- 이미지가 교차 출처라 Canvas에서 읽기 어렵다면 원본을 가져오거나 현재 보이는 탭의 사진 부분을 캡처한다.
- 이미지 크기를 줄이고 해시를 만들어 같은 이미지의 설명을 30일 동안 캐시한다.

## extension/core/ — 실제 기능이 있는 곳

### dom.ts — 가장 중요한 파일

웹페이지의 DOM을 읽고, 사용자가 요청한 행동을 안전하게 실행한다.

주요 역할은 네 가지다.

1. 요소 수집: 버튼, 링크, 입력창 등에 임시 ID를 붙인다. 이름은 aria-label, label, alt, 텍스트, placeholder 등을 순서대로 사용한다.
2. 본문 추출: 기사 본문 선택자와 article을 우선 찾고, 광고·추천·저작권·목차를 제외한다.
3. 변경 확인: 명령을 받은 시점과 실행 직전을 비교한다. 예를 들어 버튼 링크 주소가 바뀌었으면 클릭하지 않는다.
4. 실행: 클릭, 입력, 검색, 읽기, 스크롤, 뒤로 가기를 실제 DOM API로 실행한다.

본문 읽기 관련 함수도 이 파일에 있다.

- readingRoot(): 본문 전체 범위를 찾는다.
- readingBlocks(): 문단 후보를 만든다.
- pageReading(): 실제 읽을 원문 텍스트를 만든다.
- beginReading(): 문장과 화면 위치를 연결한다.
- focusReading(): 현재 읽는 문장을 강조하고 필요한 경우만 스크롤한다.
- checkAction(): 실행 직전 안전성·변경 여부를 검사한다.
- execute(): 최종 동작을 수행한다.

### images.ts — 어떤 사진을 AI에 보낼지

이미지 수가 많다고 전부 AI에 보내지 않는다.

- 광고·추천·사이드바·기자 프로필 아래 이미지를 제외한다.
- 너비·높이가 너무 작은 아이콘을 제외한다.
- 기사라면 본문 범위가 확실할 때 본문 사진만 고른다.
- 이미지 요소에 임시 ID, 위치, 크기, 현재 화면과의 거리 같은 정보를 붙인다.
- prepareImage()은 사진을 화면 중앙으로 가져오고, 원본 픽셀을 준비한다.

### accessibility.ts — 분석·개선·복구

- audit(): axe-core를 실행해 WCAG A/AA 위반, 대비 문제, 설명이 필요한 사진, 작은 글씨 수를 Side Panel용 숫자로 만든다.
- transform(): 작은 글씨를 16px로 바꾸고 줄간격·포커스 스타일을 추가한다. 고대비 옵션도 여기서 만든다.
- applyDescription(): AI 설명을 실제 img.alt에 반영한다.
- restore(): AccessAI가 바꾼 글씨 크기와 alt를 원래대로 되돌린다.

### search.ts — 검색은 더 조심해서 실행

검색창에 입력하는 것과 실제 검색을 제출하는 것은 다르다. 이 파일은 검색용 폼인지 확인하고, 비밀번호·카드·첨부 파일·여러 입력란이 있는 폼·위험한 주소는 자동 제출하지 않게 한다.

- searchPlan(): 이 입력란을 검색창으로 믿어도 되는지 검사한다.
- submitSearch(): 실행 직전에 다시 검사한 뒤 검색 버튼을 누르거나 폼을 제출한다.

## shared/protocol.ts — 서로 지켜야 하는 약속

Side Panel, Content Script, Background, Proxy가 주고받는 데이터 형식은 모두 이 파일에서 정의한다. zod는 “AI가 이상한 형식의 값을 돌려줘도 실행 전에 거절하는 검사기”라고 생각하면 된다.

가장 중요한 것은 ActionSchema이다. AI가 고를 수 있는 행동을 다음처럼 제한한다.

    CLICK(id)       실제 버튼 또는 링크 클릭
    TYPE(id, text)  입력만 하기
    SEARCH(id,text) 검색 입력 후 검색 실행
    DESCRIBE(id)    사진 설명 요청
    READ(id)        특정 텍스트 읽기
    READ_PAGE()     본문 읽기
    FOCUS(id)       입력창·요소에 포커스
    SCROLL(up/down) 화면 이동
    BACK()          뒤로 가기
    ANSWER(text)    페이지를 바꾸지 않는 답변

AI는 이 목록 밖의 JavaScript를 실행할 수 없다. riskReason()은 결제·구매·삭제·예약·제출 등 위험 단어가 있는 행동에 확인을 요구한다. localCommand()은 “본문 읽어줘”, “아래로 내려줘”처럼 AI 없이 확실하게 해석할 수 있는 명령을 처리한다.

## proxy/ — API 키를 숨긴 서버

### proxy/index.ts

Cloudflare Worker에서 실행되는 서버 코드다.

1. 요청이 AccessAI 확장 Origin에서 왔는지 확인한다.
2. 요청 크기와 분당 요청 수를 제한한다.
3. RequestSchema로 입력 형식을 확인한다.
4. Gemini에 고정된 모델과 시스템 지시문으로 요청한다.
5. AI 응답을 다시 DecisionSchema으로 검사한다.
6. 사용자에게는 필요한 결과나 안전한 오류 문구만 돌려준다.

Gemini는 세 용도로만 쓴다.

| kind | Gemini가 하는 일 |
| --- | --- |
| image | 사진을 보고 짧은 한국어 설명 생성 |
| command | 사용자 문장을 제한된 action 하나로 변환 |
| reading | 모호한 본문 후보 중 시작 문단 번호 선택 |

### proxy/wrangler.toml

Cloudflare 배포 설정이다. Worker 이름, 서울 인접 리전 배치 힌트, 허용 확장 ID, 무료 운영 확인 플래그가 있다. GEMINI_API_KEY는 이 파일에 쓰지 않고 Cloudflare Secret으로만 등록한다.

## scripts/ — 반복 작업 자동화

| 파일 | 하는 일 |
| --- | --- |
| package.mjs | 확장을 production으로 빌드하고, 비밀키·localhost가 들어가지 않았는지 검사한 뒤 제출 ZIP 생성 |
| register-secret.mjs | 로컬 proxy/.dev.vars의 키를 출력하지 않고 Cloudflare Secret에 등록 |
| smoke-ai.mjs | 개발 환경에서 AI 요청 흐름을 간단히 확인 |
| smoke-proxy.mjs | 배포된 프록시의 연결을 간단히 확인 |
| fixture-server.mjs | 테스트용 HTML/이미지를 제공하는 작은 로컬 서버 |

## tests/ — 고장 나지 않았는지 확인하는 코드

- dom.test.ts: 웹페이지 DOM을 가짜로 만들고 본문 추출, 검색, 이미지 선택, 광고 제외, 페이지 변경 감지, 본문 따라 읽기 등을 확인한다.
- core.test.ts: AI 요청 형식, 프록시 오류 처리, 위험 행동 검사 같은 서버·공유 규칙을 확인한다.
- fixtures/: 테스트에 쓰는 작은 이미지 파일이다.

테스트는 실제 Gemini를 호출하지 않는다. 그래서 무료 한도를 쓰지 않고 빠르게 실행할 수 있다.

## docs/ — 코드는 아니지만 꼭 필요한 문서

| 파일 | 용도 |
| --- | --- |
| HACKATHON_PRESENTATION.md | 발표 멘트, 시연 순서, 예상 질문 |
| CODE_GUIDE_KO.md | 지금 읽고 있는 코드 안내서 |
| OPERATIONS.md | AI 키·Cloudflare 운영과 장애 대응 |
| PRIVACY.md | 어떤 정보가 AI에 전송되는지 |
| VALIDATION.md | 무엇을 테스트했고 어떤 한계가 있는지 |

## 기능 하나를 파일로 따라가기

### 예시 1: “사진 설명해줘”

    App.tsx
      → images.ts: 본문 안의 의미 있는 사진을 고름
      → content.ts: 사진 정보와 픽셀 준비 요청
      → background.ts: 원본 또는 화면 캡처를 만들고 캐시 확인
      → proxy/index.ts: Gemini에 사진 설명 요청
      → accessibility.ts: 응답을 img.alt에 반영
      → App.tsx: 설명을 화면과 음성으로 전달

### 예시 2: “본문 읽어줘”

    App.tsx
      → shared/protocol.ts: READ_PAGE라는 로컬 명령으로 해석
      → content.ts
      → dom.ts: 본문 시작·문단·문장 위치를 찾음
      → App.tsx: 문장을 하나씩 Web Speech로 읽음
      → content.ts / dom.ts: 현재 문장을 강조하고 필요한 경우 스크롤

### 예시 3: “검색창에 사과 입력해줘”

    App.tsx
      → (복잡한 문장이면 proxy/index.ts의 AI가 SEARCH 또는 TYPE 제안)
      → content.ts
      → dom.ts: 대상 ID와 페이지 변화 여부 확인
      → search.ts: 진짜 검색 폼인지·위험한 폼이 아닌지 재확인
      → dom.ts: 입력 후 검색 버튼 클릭 또는 requestSubmit()

## 코드 수정 후 하는 일

화면·기능을 수정했다면 보통 다음만 실행하면 된다.

    pnpm typecheck
    pnpm test
    pnpm package

- Side Panel이나 Content Script를 바꿨다면 pnpm package 뒤 Chrome의 chrome://extensions에서 AccessAI 새로고침을 누른다.
- proxy/index.ts를 바꿨다면 위 명령에 더해 pnpm proxy:deploy가 필요하다.
- extension/.output/은 항상 빌드 결과이므로 고치지 않는다.

## 발표에서 코드 질문을 받으면 이렇게 답하면 된다

- “AI가 직접 웹을 조작하나요?” → “아니요. AI는 허용된 action 하나를 제안하고, Content Script가 현재 DOM을 다시 검사한 뒤 실행합니다.”
- “키는 어디 있나요?” → “Chrome ZIP에는 없고 Cloudflare Worker Secret에만 있습니다.”
- “기존 사이트에 영향을 주나요?” → “사이트 서버는 바꾸지 않고 브라우저 DOM/CSS만 바꿉니다. 다만 사용자가 확인한 클릭·제출은 실제 사이트 동작입니다.”
- “광고 사진을 설명하면 어떡하나요?” → “기사 본문이 확정될 때만 그 범위의 사진을 고르고, 모호하면 임의로 AI 요청하지 않습니다.”
