import { mkdir, cp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const source = path.resolve("extension/.output/chrome-mv3");
const out = path.resolve("artifacts");
const staging = path.join(out, "submission");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(source, path.join(staging, "AccessAI"), { recursive: true });
const manifest = JSON.parse(
  await readFile(path.join(source, "manifest.json"), "utf8"),
);
if (manifest.manifest_version !== 3) throw Error("Manifest V3 required");
for (const name of [
  manifest.background.service_worker,
  manifest.side_panel.default_path,
  "content-scripts/content.js",
])
  await readFile(path.join(source, name));
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) await scan(p);
    else if (/\.(js|json|html)$/.test(p)) {
      const t = await readFile(p, "utf8");
      if (/AIza[0-9A-Za-z_-]{30,}|GEMINI_API_KEY\s*[:=]\s*["'][^"']+/.test(t))
        throw Error("Possible secret in bundle");
      if (/localhost:\d+|127\.0\.0\.1:\d+/.test(t))
        throw Error("Local development endpoint in bundle");
    }
  }
}
await scan(source);
const background = await readFile(
  path.join(source, manifest.background.service_worker),
  "utf8",
);
if (!background.includes("https://accessai-proxy.accessai.workers.dev"))
  throw Error("Submission requires the deployed AI endpoint");
await writeFile(
  path.join(staging, "INSTALL.txt"),
  "AccessAI 설치 (1분)\n\n1. 이 ZIP을 압축 해제합니다.\n2. Chrome 주소창에 chrome://extensions 를 입력합니다.\n3. 오른쪽 위 개발자 모드를 켭니다.\n4. 압축해제된 확장 프로그램을 로드를 누릅니다.\n5. 이 문서 옆의 AccessAI 폴더를 선택합니다.\n6. 일반 웹사이트에서 확장 아이콘을 눌러 현재 페이지를 분석합니다.\n\nAI는 인터넷과 공유 무료 서버가 필요합니다. 마이크 권한은 처음 한 번 허용합니다.\nNode.js, npm, API Key, 별도 서버 설치가 필요하지 않습니다.\nChrome 내부 페이지, PDF, 일부 iframe·보안 페이지는 지원되지 않습니다.\n",
);
const zip = path.join(out, "AccessAI-submission.zip");
await rm(zip, { force: true });
execFileSync("/usr/bin/zip", ["-qr", zip, "AccessAI", "INSTALL.txt"], {
  cwd: staging,
});
console.log(`Validated Manifest V3 and secret scan. ZIP: ${zip}`);
