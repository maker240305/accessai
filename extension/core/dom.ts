import { searchPlan, submitSearch } from "./search";
import {
  riskReason,
  type PageSnapshot,
  type Action,
} from "../../shared/protocol";
const session = crypto.randomUUID().slice(0, 8);
let next = 0;
let revision = 0;
const ids = new WeakMap<Element, string>();
const elements = new Map<string, HTMLElement>();
type TargetVersion = {
  base: string;
  text: string;
  href: string;
  form: string;
  image: string;
};
type SnapshotVersion = {
  url: string;
  page: string;
  readingBlocks: string[];
  targets: Map<string, TargetVersion>;
  searches: Map<string, string>;
};
const snapshotVersions = new Map<string, SnapshotVersion>();
export let lastId: string | undefined;
export function visible(el: Element) {
  const s = getComputedStyle(el),
    r = el.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    s.display !== "none" &&
    s.visibility !== "hidden" &&
    !el.closest('[inert],[aria-hidden="true"]')
  );
}
export function name(el: HTMLElement): string {
  const refs = el
    .getAttribute("aria-labelledby")
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent || "")
    .join(" ");
  const labels = (el as HTMLInputElement).labels;
  return (
    refs ||
    el.getAttribute("aria-label") ||
    (labels?.length
      ? Array.from(labels)
          .map((l) => l.textContent)
          .join(" ")
      : "") ||
    el.getAttribute("alt") ||
    el.innerText ||
    el.textContent ||
    el.getAttribute("placeholder") ||
    el.title ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250);
}
export function idFor(el: HTMLElement) {
  let id = ids.get(el);
  if (!id) {
    id = `${session}_${++next}`;
    ids.set(el, id);
  }
  elements.set(id, el);
  return id;
}
export function isSensitive(el: HTMLElement) {
  return (
    el.matches(
      'input[type=password],input[type=hidden],input[autocomplete^="cc-"],input[autocomplete="one-time-code"]',
    ) ||
    /password|비밀번호|카드번호|보안코드|주민등록/.test(
      el.getAttribute("name") || "",
    )
  );
}
function searchSignature(el: HTMLElement) {
  const plan = searchPlan(el);
  const scope = plan.form || el.closest('[role="search"]') || el.parentElement!;
  return [
    pageUrl(),
    el.tagName,
    el.getAttribute("type") || "",
    el.getAttribute("name") || "",
    el.id,
    name(el),
    scope.getAttribute("role") || "",
    scope.getAttribute("aria-label") || "",
    plan.destination,
  ].join("|");
}
function normalizedText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}
function pageUrl() {
  const url = new URL(location.href);
  url.hash = "";
  return url.href;
}
function excludedReadingNode(el: Element) {
  return !!el.closest(
    'script,style,noscript,nav,aside,footer,form,table,[role="navigation"],[role="complementary"],[aria-hidden="true"],[inert],[data-ad],[data-advertisement],.advertisement,.ad-container,.related,.related-articles,.recommendation,.toc,.navbox',
  );
}
function readingRoot() {
  const selectors = [
    "#dic_area",
    '[itemprop="articleBody"]',
    ".article-text",
    ".article-body",
    ".article_body",
    ".article-content",
    ".article_content",
  ];
  for (const selector of selectors) {
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    ).filter(visible);
    if (roots.length === 1) return { root: roots[0], explicit: true };
  }
  const articles = Array.from(
    document.querySelectorAll<HTMLElement>("article"),
  ).filter((el) => visible(el) && normalizedText(el.textContent).length >= 200);
  if (articles.length === 1) return { root: articles[0], explicit: true };
  return {
    root:
      document.querySelector<HTMLElement>('main,[role="main"]') ||
      document.body,
    explicit: false,
  };
}
function readingLines(el: HTMLElement) {
  let raw = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      raw += node.textContent || "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      raw += "\n";
      return;
    }
    if (excludedReadingNode(node) || !visible(node)) return;
    for (const child of node.childNodes) visit(child);
  };
  for (const child of el.childNodes) visit(child);
  const lines = raw
    .split(/\n+/)
    .map(normalizedText)
    .filter(Boolean);
  // A short standalone label before prose (for example, “🍎🍏 / Apple”)
  // belongs to the illustration, not the first sentence.
  if (
    lines.length > 1 &&
    lines[0].length < 40 &&
    !/[.!?。！？]$/.test(lines[0]) &&
    /[.!?。！？]/.test(lines[1])
  )
    lines.shift();
  return lines;
}
type LocatedText = { text: string; positions: { node: Text; offset: number }[] };
function locatedReadingLines(el: HTMLElement): LocatedText[] {
  const raw: ({ char: string; node: Text; offset: number } | null)[] = [];
  const visit = (node: Node) => {
    if (node instanceof Text) {
      for (let offset = 0; offset < node.length; offset++)
        raw.push({ char: node.data[offset], node, offset });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      raw.push(null);
      return;
    }
    if (excludedReadingNode(node) || !visible(node)) return;
    for (const child of node.childNodes) visit(child);
  };
  for (const child of el.childNodes) visit(child);
  const lines: LocatedText[] = [];
  let line: typeof raw = [];
  const flush = () => {
    let text = "";
    const positions: LocatedText["positions"] = [];
    let space: LocatedText["positions"][number] | null = null;
    for (const entry of line) {
      if (!entry) continue;
      if (/\s/.test(entry.char)) {
        if (text) space = space || entry;
      } else {
        if (space) {
          text += " ";
          positions.push(space);
          space = null;
        }
        text += entry.char;
        positions.push(entry);
      }
    }
    if (text) lines.push({ text, positions });
    line = [];
  };
  for (const entry of raw) {
    if (!entry || entry.char === "\n" || entry.char === "\r") flush();
    else line.push(entry);
  }
  flush();
  if (
    lines.length > 1 &&
    lines[0].text.length < 40 &&
    !/[.!?。！？]$/.test(lines[0].text) &&
    /[.!?。！？]/.test(lines[1].text)
  ) lines.shift();
  return lines;
}
function rangeFor(located: LocatedText, start: number, end: number) {
  const first = located.positions[start];
  const last = located.positions[end - 1];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}
function readingChunks(located: LocatedText) {
  const chunks: { text: string; range: Range }[] = [];
  let start = 0;
  while (start < located.text.length) {
    const limit = Math.min(start + 240, located.text.length);
    let end = limit;
    if (limit < located.text.length) {
      const portion = located.text.slice(start, limit);
      const sentence = Math.max(
        portion.lastIndexOf(". "), portion.lastIndexOf("? "),
        portion.lastIndexOf("! "), portion.lastIndexOf("。 "),
        portion.lastIndexOf("！ "), portion.lastIndexOf("？ "),
      );
      const space = portion.lastIndexOf(" ");
      if (sentence >= 40) end = start + sentence + 1;
      else if (space >= 40) end = start + space;
    }
    while (start < end && located.text[start] === " ") start++;
    while (end > start && located.text[end - 1] === " ") end--;
    if (end > start)
      chunks.push({ text: located.text.slice(start, end), range: rangeFor(located, start, end) });
    start = Math.max(end, start + 1);
  }
  return chunks;
}
function readingBlocks(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("p,div,section"))
    .filter((el) => {
      if (!visible(el) || excludedReadingNode(el)) return false;
      if (el.tagName === "P") return true;
      if (el.querySelector(":scope > p, :scope > section")) return false;
      const directBreaks = Array.from(el.children).filter(
        (child) => child.tagName === "BR",
      ).length;
      if (directBreaks) return true;
      const directText = Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || "")
        .join("");
      return directText.trim().length >= 80 &&
        !el.querySelector("p,div,section,table");
    })
    .map((el) => ({ el, lines: readingLines(el) }))
    .filter(({ lines }) => {
      const text = lines.join(" ");
      return (
        text.length >= 8 &&
        !/^(이 저작물은|기여하신 문서의 저작권|This site is protected by|Copyright|All rights reserved)/i.test(
          text,
        )
      );
    });
}
export function readingCandidates() {
  const { root } = readingRoot();
  return readingBlocks(root)
    .slice(0, 20)
    .map(({ lines }) => lines.join(" ").slice(0, 300));
}
function readingBlockVersions() {
  const { root } = readingRoot();
  return readingBlocks(root)
    .slice(0, 20)
    .map(({ lines }) => lines.join(" "));
}
function readingSelection(startIndex?: number) {
  const { root, explicit } = readingRoot();
  const blocks = readingBlocks(root);
  const start = startIndex ?? (explicit
    ? 0
    : blocks.findIndex(({ lines }) => {
        const text = lines.join(" ");
        return (
          text.length >= 60 &&
          lines.length >= 2 &&
          /[.!?。！？]/.test(text)
        );
      }));
  return { blocks, start };
}
function readingContent(startIndex?: number) {
  const { blocks, start } = readingSelection(startIndex);
  if (start < 0 || start >= blocks.length)
    return { text: "", target: null, chunks: [] as { text: string; range: Range }[] };
  const parts: string[] = [];
  const chunks: { text: string; range: Range }[] = [];
  let length = 0;
  for (const { el, lines } of blocks.slice(start)) {
    const located = locatedReadingLines(el);
    for (let i = 0; i < lines.length; i++) {
      if (length >= 7000) break;
      const separator = parts.length ? 2 : 0;
      const line = lines[i].slice(0, 7000 - length - separator);
      if (!line) break;
      parts.push(line);
      if (located[i]?.text.startsWith(line))
        chunks.push(...readingChunks({ text: line, positions: located[i].positions.slice(0, line.length) }));
      length += line.length + separator;
    }
    if (length >= 7000) break;
  }
  return { text: parts.join("\n\n"), target: blocks[start].el, chunks };
}
export function pageReading(startIndex?: number) {
  return readingContent(startIndex).text;
}
let activeReading: {
  token: string;
  url: string;
  chunks: { text: string; range: Range }[];
} | null = null;
const cancelledReadings = new Set<string>();
let highlightedPlaybackId: string | null = null;
let readingStyle: HTMLStyleElement | null = null;
export function beginReading(action: Extract<Action, { type: "READ_PAGE" | "READ" }>, fallback: string) {
  clearReading();
  cancelledReadings.clear();
  const chunks = action.type === "READ_PAGE"
    ? readingContent(action.startIndex).chunks
    : locatedReadingLines(resolve(action.id)).flatMap(readingChunks);
  if (action.type === "READ") {
    let remaining = 1500;
    for (const chunk of chunks) {
      const spoken = chunk.text.slice(0, remaining);
      chunk.text = spoken;
      remaining -= spoken.length;
    }
    while (chunks.length && !chunks[chunks.length - 1].text) chunks.pop();
  }
  if (!chunks.length && action.type === "READ") {
    const range = document.createRange();
    range.selectNodeContents(resolve(action.id));
    chunks.push({ text: fallback, range });
  }
  const token = crypto.randomUUID();
  activeReading = { token, url: pageUrl(), chunks };
  return { token, segments: chunks.map((chunk) => chunk.text) };
}
export function clearReading(token?: string, playbackId?: string) {
  if (token && activeReading?.token !== token) return;
  if (playbackId) cancelledReadings.add(playbackId);
  if (playbackId && highlightedPlaybackId !== playbackId) return;
  (globalThis as any).CSS?.highlights?.delete("accessai-current-reading");
  readingStyle?.remove();
  readingStyle = null;
  highlightedPlaybackId = null;
}
export function focusReading(token: string, index: number, playbackId = "") {
  const session = activeReading;
  const range = session?.chunks[index]?.range;
  if (!session || session.token !== token || session.url !== pageUrl() ||
      !range?.startContainer.isConnected || cancelledReadings.has(playbackId)) return false;
  clearReading();
  highlightedPlaybackId = playbackId;
  if ((globalThis as any).CSS?.highlights && (window as any).Highlight) {
    readingStyle = document.createElement("style");
    readingStyle.textContent =
      "::highlight(accessai-current-reading) { background-color: rgba(255, 213, 70, .55); color: inherit; }";
    document.documentElement.append(readingStyle);
    (globalThis as any).CSS.highlights.set(
      "accessai-current-reading", new (window as any).Highlight(range),
    );
  }
  const rect = range.getBoundingClientRect();
  const origin = range.startContainer instanceof Element
    ? range.startContainer : range.startContainer.parentElement;
  let scroller = origin?.parentElement;
  while (scroller && scroller !== document.body) {
    const overflow = getComputedStyle(scroller).overflowY;
    if (/(auto|scroll)/.test(overflow) && scroller.scrollHeight > scroller.clientHeight)
      break;
    scroller = scroller.parentElement;
  }
  const container = scroller && scroller !== document.body ? scroller : null;
  const bounds = container?.getBoundingClientRect();
  const top = bounds?.top ?? 0;
  const bottom = bounds?.bottom ?? innerHeight;
  if (rect.top < top + 90 || rect.bottom > bottom - 70) {
    const offset = rect.top - top - Math.min((bottom - top) * 0.3, 180);
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant" : "smooth";
    if (container) container.scrollBy({ top: offset, behavior });
    else window.scrollBy({ top: offset, behavior });
  }
  return true;
}
function targetVersion(el: HTMLElement): TargetVersion {
  const form =
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLButtonElement
      ? el.form
      : el.closest("form");
  return {
    base: [
      el.tagName,
      el.getAttribute("role") || "",
      name(el),
      el.matches(':disabled,[aria-disabled="true"]') ? "disabled" : "enabled",
      el.getAttribute("type") || "",
    ].join("|"),
    text: normalizedText(el.innerText || el.textContent).slice(0, 2000),
    href:
      el instanceof HTMLAnchorElement
        ? el.href
        : el.getAttribute("formaction") || "",
    form: form
      ? [
          form.action,
          form.method,
          form.target,
          form.getAttribute("aria-label") || "",
        ].join("|")
      : "",
    image:
      el instanceof HTMLImageElement
        ? [el.currentSrc || el.src, el.naturalWidth, el.naturalHeight].join("|")
        : "",
  };
}
function sameTarget(action: Action, before: TargetVersion, el: HTMLElement) {
  const now = targetVersion(el);
  if (action.type === "READ")
    return before.base === now.base && before.text === now.text;
  if (action.type === "DESCRIBE")
    return before.base === now.base && before.image === now.image;
  if (action.type === "CLICK")
    return (
      before.base === now.base &&
      before.href === now.href &&
      before.form === now.form
    );
  if (action.type === "TYPE" || action.type === "FOCUS")
    return before.base === now.base && before.form === now.form;
  return true;
}
export function snapshot(): PageSnapshot {
  elements.clear();
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button,a[href],input,textarea,select,[role="button"],[role="link"],[role="textbox"],[role="combobox"],[tabindex],img,h1,h2,h3,article,[role="listitem"],li',
    ),
  ).filter((el) => visible(el) && !isSensitive(el));
  candidates.sort((a, b) => Number(inViewport(b)) - Number(inViewport(a)));
  const items = candidates.slice(0, 150).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      id: idFor(el),
      name: name(el),
      role: el.getAttribute("role") || el.tagName.toLowerCase(),
      context: (
        el.closest("article,li,section")?.textContent ||
        el.parentElement?.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .slice(0, 600),
      disabled: el.matches(':disabled,[aria-disabled="true"]'),
      inViewport: inViewport(el),
      x: Math.round(r.x),
      y: Math.round(r.y),
    };
  });
  const root = document.querySelector('main,[role="main"]') || document.body;
  // textContent never includes live input values; omit form/script/style contents.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  let node: Node | null;
  while ((node = walker.nextNode()) && text.length < 9500) {
    const p = node.parentElement;
    if (
      p &&
      !p.closest(
        'script,style,noscript,textarea,input,[contenteditable="true"],[aria-hidden="true"]',
      ) &&
      visible(p)
    )
      text += " " + node.textContent?.trim();
  }
  const searches = new Map<string, string>();
  const targets = new Map<string, TargetVersion>();
  for (const el of candidates.slice(0, 150))
    targets.set(idFor(el), targetVersion(el));
  for (const el of candidates.slice(0, 150)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement))
      continue;
    try {
      searches.set(idFor(el), searchSignature(el));
    } catch {
      /* Not a safe search field. */
    }
  }
  snapshotVersions.set(currentRevision(), {
    url: pageUrl(),
    page: pageReading(),
    readingBlocks: readingBlockVersions(),
    targets,
    searches,
  });
  if (snapshotVersions.size > 8)
    snapshotVersions.delete(snapshotVersions.keys().next().value!);
  return {
    revision: `${session}:${revision}`,
    title: document.title.slice(0, 300),
    text: text.replace(/\s+/g, " ").slice(0, 10000),
    elements: items,
    lastId,
  };
}
function inViewport(el: Element) {
  const r = el.getBoundingClientRect();
  return (
    r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
  );
}
export function invalidate() {
  revision++;
}
export function currentRevision() {
  return `${session}:${revision}`;
}
export function resolve(id: string) {
  const el = elements.get(id);
  if (
    !el?.isConnected ||
    !visible(el) ||
    el.matches(':disabled,[aria-disabled="true"]')
  )
    throw Error(
      "페이지가 바뀌었거나 사용할 수 없는 대상입니다. 다시 명령해주세요.",
    );
  return el;
}
export function highlight(el: HTMLElement) {
  el.scrollIntoView({
    block: "center",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
  const old = el.style.outline,
    offset = el.style.outlineOffset;
  el.style.outline = "4px solid #6c5ce7";
  el.style.outlineOffset = "5px";
  setTimeout(() => {
    el.style.outline = old;
    el.style.outlineOffset = offset;
  }, 1100);
}
export function checkAction(action: Action, expected: string) {
  const previous = snapshotVersions.get(expected);
  if (!previous || previous.url !== pageUrl())
    throw Error("페이지가 이동했습니다. 다시 명령해주세요.");
  let unchanged = false;
  if (action.type === "SEARCH") {
    const signature = previous.searches.get(action.id);
    const current = searchSignature(resolve(action.id));
    unchanged = !!signature && signature === current;
  } else if ("id" in action) {
    const target = previous.targets.get(action.id);
    try {
      unchanged = !!target && sameTarget(action, target, resolve(action.id));
    } catch {
      /* Removed, hidden, disabled, or materially changed target. */
    }
  } else if (action.type === "READ_PAGE" && action.startIndex !== undefined) {
    const current = readingBlockVersions();
    unchanged =
      !!previous.readingBlocks[action.startIndex] &&
      previous.readingBlocks[action.startIndex] === current[action.startIndex];
  } else if (action.type === "READ_PAGE" || action.type === "ANSWER") {
    unchanged = previous.page === pageReading();
  } else {
    // Scrolling and going back depend on document identity, not live widgets.
    unchanged = true;
  }
  if (!unchanged)
    throw Error("요청한 내용이나 대상이 변경되었습니다. 다시 명령해주세요.");
  if (!("id" in action)) return null;
  const el = resolve(action.id);
  if (isSensitive(el)) throw Error("민감한 정보는 직접 입력해주세요.");
  if (
    action.type === "TYPE" &&
    !el.matches(
      'input:not([type=button]):not([type=submit]):not([type=file]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable="true"]',
    )
  )
    throw Error("텍스트를 입력할 수 없는 대상입니다.");
  if (action.type === "SEARCH") {
    searchPlan(el);
    return null;
  }
  if (action.type === "DESCRIBE") {
    if (!(el instanceof HTMLImageElement)) throw Error("사진을 선택해주세요.");
    return null;
  }
  if (action.type === "CLICK") {
    if (
      !el.matches(
        'button,a[href],input[type=button],input[type=submit],input[type=checkbox],input[type=radio],[role="button"],[role="link"]',
      )
    )
      throw Error("클릭 가능한 버튼이나 링크를 선택해주세요.");
    if (
      el instanceof HTMLAnchorElement &&
      !/^https?:$/.test(new URL(el.href).protocol)
    )
      throw Error("지원하지 않는 링크입니다.");
    return riskReason(
      name(el),
      el.closest("form")?.getAttribute("aria-label") || "",
      (el instanceof HTMLButtonElement && el.type === "submit" && !!el.form) ||
        (el instanceof HTMLInputElement && el.type === "submit"),
    );
  }
  return null;
}
export async function execute(action: Action) {
  if (action.type === "ANSWER") return action.text;
  if (action.type === "READ_PAGE") {
    const { text, target } = readingContent(action.startIndex);
    if (!text) return "읽을 수 있는 본문을 찾지 못했습니다.";
    if (target) {
      target.scrollIntoView({
        block: target.getBoundingClientRect().height > innerHeight * 0.7
          ? "start"
          : "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
    return text;
  }
  if (action.type === "SCROLL") {
    window.scrollBy({
      top: (action.direction === "down" ? 1 : -1) * innerHeight * 0.75,
      behavior: "smooth",
    });
    return action.direction === "down"
      ? "아래로 이동했습니다."
      : "위로 이동했습니다.";
  }
  if (action.type === "BACK") {
    history.back();
    return "이전 페이지로 이동합니다.";
  }
  const el = resolve(action.id);
  lastId = action.id;
  highlight(el);
  if (
    action.type === "DESCRIBE" ||
    (action.type === "READ" && el instanceof HTMLImageElement)
  )
    throw Error("사진은 이미지 AI 분석으로 처리해야 합니다.");
  if (action.type === "READ")
    return (
      (
        name(el) +
        " " +
        (el.innerText || el.closest("article,li")?.textContent || "")
      )
        .trim()
        .slice(0, 1500) || "읽을 수 있는 설명이 없습니다."
    );
  if (action.type === "FOCUS") {
    el.focus();
    return `${name(el)}에 초점을 이동했습니다.`;
  }
  if (action.type === "TYPE" || action.type === "SEARCH") {
    const search = action.type === "SEARCH" ? searchPlan(el) : null;
    if (el instanceof HTMLSelectElement) {
      const option = Array.from(el.options).find(
        (o) => o.text === action.text || o.value === action.text,
      );
      if (!option) throw Error("일치하는 선택지가 없습니다.");
      el.value = option.value;
    } else if (el.isContentEditable) el.textContent = action.text;
    else {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(
        el,
        action.text,
      );
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.focus();
    if (search) {
      submitSearch(el, search);
      return `검색을 실행했습니다: ${action.text}`;
    }
    return `${name(el) || "입력란"}에 입력했습니다. 제출하지 않았습니다.`;
  }
  const before = targetVersion(el);
  await new Promise((r) => setTimeout(r, 350));
  if (resolve(action.id) !== el || !sameTarget(action, before, el))
    throw Error("대상이 변경되어 실행을 취소했습니다.");
  el.click();
  return `${name(el) || "선택한 항목"}을 열었습니다.`;
}
