import axe from "axe-core";
import { meaningfulImages, findImage } from "./images";
import { visible } from "./dom";
import type { Audit } from "../../shared/protocol";
const originals = new Map<HTMLImageElement, string | null>();
const fontOriginals = new Map<
  HTMLElement,
  { value: string; priority: string }
>();
let style: HTMLStyleElement | null = null;
const generated = new WeakMap<HTMLImageElement, string>();
export function imageCandidates() {
  return meaningfulImages()
    .filter((img) => generated.get(img) !== (img.currentSrc || img.src))
    .slice(0, 40);
}
export function smallTexts() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "p,span,a,button,label,li,td,th,input,textarea,select",
    ),
  )
    .filter(
      (el) =>
        visible(el) &&
        parseFloat(getComputedStyle(el).fontSize) < 14 &&
        (el.textContent?.trim() || el.matches("input,textarea,select")),
    )
    .slice(0, 500);
}
export async function audit(): Promise<Audit> {
  const result = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    resultTypes: ["violations"],
    rules: { "color-contrast": { enabled: true } },
  });
  const contrast = result.violations.filter((v) => v.id === "color-contrast");
  const other = result.violations.filter(
    (v) => v.id !== "color-contrast" && v.id !== "image-alt",
  );
  return {
    missing: imageCandidates().length,
    contrast: contrast.reduce((n, v) => n + v.nodes.length, 0),
    other: other.reduce((n, v) => n + v.nodes.length, 0),
    small: smallTexts().length,
    issues: result.violations.map((v) => ({
      title: v.help,
      count: v.nodes.length,
    })),
    described: originals.size,
    improved: !!style,
  };
}
export function transform(highContrast: boolean) {
  for (const el of smallTexts()) {
    if (!fontOriginals.has(el))
      fontOriginals.set(el, {
        value: el.style.getPropertyValue("font-size"),
        priority: el.style.getPropertyPriority("font-size"),
      });
    el.style.setProperty("font-size", "16px", "important");
  }
  style?.remove();
  style = document.createElement("style");
  style.dataset.accessai = "true";
  style.textContent = `p,li,td,label {line-height:1.65 !important} :focus-visible {outline:3px solid #7857ff !important;outline-offset:3px !important} ${highContrast ? "html,body,body *:not(img):not(svg):not(path):not(video):not(canvas) {background-color:#10151f !important;color:#fff !important;border-color:#b8c4d8 !important;text-shadow:none !important} a {color:#9edbff !important;text-decoration:underline !important} input,textarea,select,button {border:1px solid #b8c4d8 !important}" : ""}`;
  document.documentElement.append(style);
}
export function applyDescription(
  id: string,
  description: string,
  expectedUrl?: string,
) {
  const img = findImage(id);
  if (expectedUrl && (img.currentSrc || img.src) !== expectedUrl)
    throw Error("사진이 변경되어 설명을 적용하지 않았습니다.");
  if (!originals.has(img)) originals.set(img, img.getAttribute("alt"));
  img.alt = description;
  generated.set(img, img.currentSrc || img.src);
}
export function restore() {
  style?.remove();
  style = null;
  for (const [el, old] of fontOriginals) {
    if (old.value) el.style.setProperty("font-size", old.value, old.priority);
    else el.style.removeProperty("font-size");
  }
  fontOriginals.clear();
  for (const [img, alt] of originals) {
    generated.delete(img);
    if (alt === null) img.removeAttribute("alt");
    else img.alt = alt;
  }
  originals.clear();
}
