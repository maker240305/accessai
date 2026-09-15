// Automated/manual QA fixture, not a shipped or deployed demo page.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>AccessAI QA fixture</title><style>body{font:16px sans-serif;max-width:700px;margin:40px auto}p{font-size:11px;color:#bbb}img{width:160px;height:160px}li{margin:30px 0}main{min-height:1500px}button,input{padding:12px}</style><main><h1>접근성 통합 검사</h1><label for="q">검색창</label><input id="q"><button type="button" onclick="document.querySelector('#result').textContent='로그인 화면 열림'">로그인</button><p>가독성 개선 대상 텍스트</p><ul><li><h2>빨간색 상품</h2><img src="/red.png"><a href="/detail">첫 번째 상품 열기</a></li><li><h2>파란색 상품</h2><img src="/blue.png"><button type="button">상품 상세</button></li></ul><form onsubmit="event.preventDefault();document.querySelector('#result').textContent='구매 제출됨'"><button>구매 확정</button></form><div id="result" role="status"></div></main></html>`;
createServer((req, res) => {
  if (req.url === "/red.png" || req.url === "/blue.png") {
    res.setHeader("Content-Type", "image/png");
    res.end(readFileSync("tests/fixtures" + req.url));
  } else if (req.url?.endsWith(".svg")) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${req.url.includes("red") ? "#ef4444" : "#3b82f6"}"/></svg>`,
    );
  } else {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      req.url === "/detail"
        ? '<html lang="ko"><title>상품 상세</title><h1>상품 상세 페이지</h1><a href="/">돌아가기</a></html>'
        : html,
    );
  }
}).listen(4173, "127.0.0.1", () =>
  console.log("QA fixture: http://127.0.0.1:4173"),
);
