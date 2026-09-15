# 운영과 무료 사용

## 2026-09-09 확인

- Google AI Studio의 starton 프로젝트가 **무료 등급**임을 실제 UI에서 확인했습니다.
- 로컬 키의 끝부분이 해당 프로젝트 키와 일치함을 값 노출 없이 확인했습니다.
- `gemini-3.5-flash-lite`에 실제 요청하여 HTTP 200과 한국어 응답을 확인했습니다.
- 공식 모델 문서: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- 무료 가격표: https://ai.google.dev/gemini-api/docs/pricing
- 결제 계정 연결이 유료 전환 조건: https://ai.google.dev/gemini-api/docs/billing
- 실제 한도는 계정별 AI Studio에서 확인: https://ai.google.dev/gemini-api/docs/rate-limits
- Workers Free: https://developers.cloudflare.com/workers/platform/pricing/

**Gemini 프로젝트에 결제 계정을 연결하거나 Workers를 유료로 업그레이드하지 마세요.** 무료 플랜이 과금 방지 경계입니다. 코드의 `FREE_TIER_CONFIRMED`는 운영자 확인 플래그이며 결제 상태를 자동 검증하는 API가 아닙니다. 예산 알림은 과금 차단 장치가 아닙니다.

## 배포

```sh
pnpm exec wrangler login
pnpm proxy:deploy
node scripts/register-secret.mjs
```

Secret 등록 스크립트는 `proxy/.dev.vars`의 `GEMINI_API_KEY`를 stdin으로 Wrangler에 전달합니다. 키를 인자로 전달하거나 출력하지 않습니다.

확장 ID는 `extension/public-key.json`의 공개키로 고정됩니다. 이 파일은 API 비밀키가 아니며 unpacked 설치 경로가 달라도 같은 ID를 유지하기 위한 공개 식별 정보입니다. 프록시는 이 ID의 Origin만 허용합니다.

**Origin 검사는 사용자 인증이 아닙니다.** 비브라우저 클라이언트는 Origin을 위조할 수 있습니다. 회원가입 없는 공개 ZIP의 공통 비밀값도 추출 가능하므로 보안 수단으로 사용하지 않습니다. 요청 크기·허용 모델·출력 길이를 서버에서 제한하고, isolate별 요청 속도를 제한합니다. 대규모 남용을 완전히 차단하지는 못하며 최종 무료 한도는 Google에서 강제됩니다. 한도 소진은 가용성 저하로 처리하고 과금으로 해결하지 않습니다.

모델·외부 URL을 클라이언트가 선택하지 못합니다. 이미지 URL은 프록시에서 가져오지 않아 서버 SSRF 경로를 만들지 않습니다. 원시 페이지·이미지·키를 앱 로그에 기록하지 않습니다.

## 장애 대응

- 403: 확장 ID / Origin 설정 확인
- 429: 무료 한도 또는 속도 제한. 반복 재시도·유료 fallback 없음
- 503: Secret 또는 무료 Tier 확인 설정 확인
- 503 중 "서버 실행 지역": Gemini가 Worker 실행 지역을 지원하지 않음. `proxy/wrangler.toml`의 한국 리전 배치 설정과 실제 `cf-placement` 확인
- 502: 모델 응답 형식 / 제공자 장애 / 타임아웃. 모델 오류 본문은 사용자에게 그대로 전달하지 않음
- 이미지 실패: 접근 권한, 인증 필요 이미지, 크기(원본 최대 5 MB), 지원 형식 확인

배포 전 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm package`를 실행하세요. 제출 ZIP에는 소스·키·캐시·개발 서버가 포함되지 않습니다.

2026-09-12: 한국에서 들어온 요청이 Cloudflare 홍콩(HKG)에서 실행되며 Gemini가 `FAILED_PRECONDITION: User location is not supported for the API use.`를 반환했습니다. Worker를 서울 인접 Cloudflare 데이터센터에 배치하도록 `gcp:asia-northeast3` 힌트를 설정했습니다. 실제 응답의 `cf-placement: remote-ICN`과 AI 명령 HTTP 200을 확인했습니다.
