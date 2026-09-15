import identity from "./public-key.json";
import { defineConfig } from "wxt";
export default defineConfig({
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      manifest.host_permissions = [
        "https://accessai-proxy.accessai.workers.dev/*",
      ];
    },
  },
  modules: ["@wxt-dev/module-react"],
  manifest: {
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    key: identity.key,
    name: "AccessAI — 더 넓은 웹",
    description:
      "이미지 설명, 가독성 개선, 기본 AI 음성 탐색을 제공하는 접근성 도우미",
    version: "1.0.0",
    minimum_chrome_version: "116",
    permissions: ["storage", "activeTab", "scripting", "sidePanel"],
    optional_host_permissions: ["https://*/*", "http://*/*"],
    host_permissions: ["https://*.workers.dev/*"],
    action: { default_title: "AccessAI 열기" },
    side_panel: { default_path: "sidepanel.html" },
    commands: {
      "open-accessai": {
        suggested_key: { default: "Alt+X" },
        description: "AccessAI 열기",
      },
      "start-voice-input": {
        suggested_key: { default: "Alt+A" },
        description: "AccessAI 마이크 입력 시작",
      },
    },
  },
});
