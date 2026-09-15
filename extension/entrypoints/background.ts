import config from "../public-config.json";
import { defineBackground } from "wxt/utils/define-background";
import { RequestSchema, trustedUI } from "../../shared/protocol";
const proxy = (import.meta.env.VITE_PROXY_URL || config.proxyUrl).replace(
  /\/$/,
  "",
);
export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  chrome.commands.onCommand.addListener((command, tab) => {
    // Keep the user gesture: awaiting an API call before open loses it in Chrome.
    if (command === "open-accessai" && tab?.id) {
      void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      return;
    }
    if (command === "start-voice-input" && tab?.id) {
      const request = {
        token: crypto.randomUUID(),
        tabId: tab.id,
        requestedAt: Date.now(),
      };
      // The panel may be opening for the first time. Session storage lets it
      // receive this request after React has mounted, while an already-open
      // panel receives the storage change immediately.
      void chrome.storage.session.set({ accessaiVoiceShortcut: request });
      void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    }
  });
  const inflight = new Map<string, Promise<unknown>>();
  async function ai(input: unknown) {
    if (!proxy)
      throw Error(
        "AI 서버가 아직 연결되지 않았습니다. 제작자가 배포 URL을 설정한 제출 빌드가 필요합니다.",
      );
    const consent = await chrome.storage.local.get("aiConsent");
    if (!consent.aiConsent)
      throw Error("AI 분석을 위해 전송 안내에 동의해주세요.");
    const parsed = RequestSchema.parse(input);
    const response = await fetch(proxy + "/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.error || "AI 서버 연결에 실패했습니다.");
    return result;
  }
  let captureQueue: Promise<unknown> = Promise.resolve();
  let lastCapture = 0;
  async function originalImage(url: string) {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol))
      throw Error("이미지 URL 직접 가져오기 불가");
    const response = await fetch(u.href, {
      credentials: "omit",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error("이미지를 가져올 수 없습니다.");
    if (Number(response.headers.get("content-length") || 0) > 5000000)
      throw Error("이미지가 너무 큽니다.");
    const reader = response.body?.getReader();
    if (!reader) throw Error("이미지가 비어 있습니다.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5000000) {
        await reader.cancel();
        throw Error("이미지가 너무 큽니다.");
      }
      chunks.push(value);
    }
    return new Blob(chunks as BlobPart[], {
      type: response.headers.get("content-type") || "image/jpeg",
    });
  }
  async function prepared(tabId: number, id: string) {
    const r = await chrome.tabs.sendMessage(tabId, {
      type: "PREPARE_IMAGE",
      id,
    });
    if (!r?.ok) throw Error(r?.error || "사진을 찾을 수 없습니다.");
    return r.data;
  }
  async function captureImage(tabId: number, info: any): Promise<Blob> {
    const work = captureQueue
      .catch(() => {})
      .then(async () => {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.active)
          throw Error(
            "사진이 있는 탭을 화면에 열고 다시 사진 설명을 요청해주세요.",
          );
        const delay = Math.max(0, 600 - (Date.now() - lastCapture));
        if (delay) await new Promise((r) => setTimeout(r, delay));
        const before = await prepared(tabId, info.id);
        if (before.url !== info.url)
          throw Error("사진이 바뀌었습니다. 다시 요청해주세요.");
        lastCapture = Date.now();
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "png",
        });
        const after = await prepared(tabId, info.id);
        if (!(await chrome.tabs.get(tabId)).active)
          throw Error("사진 탭이 바뀌었습니다. 다시 요청해주세요.");
        if (
          before.url !== after.url ||
          JSON.stringify(before.rect) !== JSON.stringify(after.rect) ||
          JSON.stringify(before.viewport) !== JSON.stringify(after.viewport)
        )
          throw Error(
            "사진 위치가 바뀌었습니다. 스크롤을 멈추고 다시 요청해주세요.",
          );
        const bitmap = await createImageBitmap(
          await (await fetch(screenshot)).blob(),
        );
        try {
          const rect = before.rect,
            sx = bitmap.width / before.viewport.width,
            sy = bitmap.height / before.viewport.height;
          if (rect.width < 20 || rect.height < 20)
            throw Error("화면에서 사진을 확인할 수 없습니다.");
          const scale = Math.min(1, 1000 / Math.max(rect.width, rect.height));
          const canvas = new OffscreenCanvas(
            Math.max(1, Math.round(rect.width * scale)),
            Math.max(1, Math.round(rect.height * scale)),
          );
          canvas
            .getContext("2d")!
            .drawImage(
              bitmap,
              rect.x * sx,
              rect.y * sy,
              rect.width * sx,
              rect.height * sy,
              0,
              0,
              canvas.width,
              canvas.height,
            );
          return await canvas.convertToBlob({
            type: "image/jpeg",
            quality: 0.8,
          });
        } finally {
          bitmap.close();
        }
      });
    captureQueue = work;
    return work;
  }
  async function describe(tabId: number, id: string) {
    if (!(await chrome.storage.local.get("aiConsent")).aiConsent)
      throw Error("먼저 AI 분석 전송 안내에 동의해주세요.");
    const info = await prepared(tabId, id);
    let blob: Blob;
    let captured = false;
    if (info.dataUrl) {
      blob = await (await fetch(info.dataUrl)).blob();
    } else {
      try {
        blob = await originalImage(info.url);
        await createImageBitmap(blob).then((b) => b.close());
      } catch {
        blob = await captureImage(tabId, info);
        captured = true;
      }
    }
    const context =
      captured && info.partial
        ? "화면에 보이는 사진의 일부입니다. 보이는 부분만 설명하세요."
        : "";
    const bitmap = await createImageBitmap(blob).catch(() => {
      throw Error(
        "이 이미지 형식을 해석할 수 없습니다. PNG·JPEG·WebP 이미지를 지원합니다.",
      );
    });
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const resized = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.78,
    });
    const buffer = await resized.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    const hash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const key = "image:ko:3.5:v2:" + hash;
    const cached = await chrome.storage.local.get(key);
    if (cached[key] && Date.now() - cached[key].time < 30 * 86400000)
      return {
        ...cached[key],
        cached: true,
        url: info.url,
        partial: captured && info.partial,
      };
    if (inflight.has(key))
      return {
        ...((await inflight.get(key)) as object),
        url: info.url,
        partial: captured && info.partial,
      };
    const work = (async () => {
      let binary = "";
      for (const byte of new Uint8Array(buffer))
        binary += String.fromCharCode(byte);
      const result = await ai({
        kind: "image",
        image: btoa(binary),
        mime: "image/jpeg",
        context,
      });
      const entry = { description: result.description, time: Date.now() };
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all)
        .filter((k) => k.startsWith("image:"))
        .sort((a, b) => all[a].time - all[b].time);
      if (keys.length >= 200)
        await chrome.storage.local.remove(keys.slice(0, keys.length - 199));
      await chrome.storage.local.set({ [key]: entry });
      return entry;
    })();
    inflight.set(key, work);
    try {
      return {
        ...(await work),
        url: info.url,
        partial: captured && info.partial,
      };
    } finally {
      inflight.delete(key);
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    // Only trusted extension UI may initiate network calls, never a content script.
    if (!trustedUI(sender.url, chrome.runtime.getURL(""))) return;
    if (!["AI", "DESCRIBE", "CONFIG"].includes(message.type)) return;
    (async () => {
      if (message.type === "CONFIG") return { configured: !!proxy };
      if (message.type === "AI") return ai(message.input);
      if (!Number.isInteger(message.tabId) || typeof message.id !== "string")
        throw Error("사진 요청이 올바르지 않습니다.");
      return describe(message.tabId, message.id);
    })()
      .then((data) => respond({ ok: true, data }))
      .catch((e) =>
        respond({
          ok: false,
          error: e instanceof Error ? e.message : "AI 요청에 실패했습니다.",
        }),
      );
    return true;
  });
});
