import { meaningfulImages, imageInfo, prepareImage } from "../core/images";
import { defineContentScript } from "wxt/utils/define-content-script";
import {
  snapshot,
  resolve,
  checkAction,
  execute,
  invalidate,
  pageReading,
  readingCandidates,
  beginReading,
  focusReading,
  clearReading,
} from "../core/dom";
import {
  audit,
  transform,
  restore,
  imageCandidates,
  applyDescription,
} from "../core/accessibility";
import { ActionSchema } from "../../shared/protocol";
export default defineContentScript({
  matches: ["https://*/*", "http://*/*"],
  registration: "runtime",
  main() {
    let pending: {
      token: string;
      action: ReturnType<typeof ActionSchema.parse>;
      revision: string;
      expires: number;
    } | null = null;
    let auditing = false;
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (r) =>
            r.type === "attributes" ||
            r.type === "characterData" ||
            (r.type === "childList" &&
              Array.from(r.addedNodes)
                .concat(Array.from(r.removedNodes))
                .some((n) => !(n instanceof HTMLStyleElement))),
        )
      ) {
        invalidate();
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "href",
        "disabled",
        "aria-disabled",
        "aria-label",
        "aria-labelledby",
        "role",
        "src",
        "alt",
        "hidden",
        "inert",
      ],
    });
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      (async () => {
        switch (message.type) {
          case "PING":
            return true;
          case "SNAPSHOT":
            return snapshot();
          case "READING_CANDIDATES":
            return { automatic: !!pageReading(), candidates: readingCandidates() };
          case "READING_FOCUS":
            return focusReading(
              String(message.token), Number(message.index), String(message.playbackId),
            );
          case "READING_CLEAR":
            clearReading(String(message.token), String(message.playbackId));
            return true;
          case "AUDIT":
            if (auditing) throw Error("분석 중입니다. 잠시 기다려주세요.");
            auditing = true;
            try {
              return await audit();
            } finally {
              auditing = false;
            }
          case "TRANSFORM":
            transform(!!message.highContrast);
            return true;
          case "RESTORE":
            restore();
            return true;
          case "IMAGES":
            return (message.all ? meaningfulImages() : imageCandidates()).map(
              imageInfo,
            );
          case "PREPARE_IMAGE":
            return prepareImage(message.id);
          case "DESCRIPTION":
            applyDescription(
              message.id,
              String(message.description).slice(0, 400),
              message.url,
            );
            return true;
          case "EXECUTE": {
            const action = ActionSchema.parse(message.action);
            const reason = checkAction(action, message.revision);
            if (
              action.type === "DESCRIBE" ||
              (action.type === "READ" &&
                document.images.length &&
                resolve(action.id) instanceof HTMLImageElement)
            )
              return { image: await prepareImage(action.id) };
            if (reason) {
              pending = {
                token: crypto.randomUUID(),
                action,
                revision: message.revision,
                expires: Date.now() + 30000,
              };
              return { confirmation: pending.token, reason };
            }
            const text = await execute(action);
            return {
              text,
              ...((action.type === "READ_PAGE" || action.type === "READ")
                ? { reading: beginReading(action, text) } : {}),
            };
          }
          case "CONFIRM": {
            const p = pending;
            pending = null;
            if (!p || message.token !== p.token || p.expires < Date.now())
              throw Error(
                "확인이 만료되었거나 페이지가 변경되었습니다. 다시 명령해주세요.",
              );
            checkAction(p.action, p.revision);
            return { text: await execute(p.action) };
          }
          case "CANCEL":
            pending = null;
            return true;
          default:
            throw Error("지원하지 않는 요청입니다.");
        }
      })()
        .then((data) => sendResponse({ ok: true, data }))
        .catch((error) =>
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "페이지 작업에 실패했습니다.",
          }),
        );
      return true;
    });
  },
});
