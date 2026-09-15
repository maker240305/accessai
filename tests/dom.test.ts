// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  snapshot,
  checkAction,
  execute,
  invalidate,
  currentRevision,
  pageReading,
  readingCandidates,
  beginReading,
  focusReading,
  clearReading,
} from "../extension/core/dom";
import {
  imageCandidates,
  transform,
  restore,
  applyDescription,
} from "../extension/core/accessibility";
beforeEach(() => {
  restore();
  document.body.innerHTML =
    '<main><h1>테스트</h1><button type="button" id="login">로그인</button><label for="q">검색창</label><input id="q"><input type="password" value="secret"><form><button>제출</button></form><p style="font-size:10px">작은 글씨</p><img id="product" src="https://example.org/item.jpg" width="200" height="200"><img src="https://example.org/decor.jpg" alt="" width="200" height="200"></main>';
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
    width: 200,
    height: 200,
    toJSON() {
      return {};
    },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  invalidate();
});
describe("DOM integration", () => {
  it("collects labels and excludes passwords", () => {
    const page = snapshot();
    expect(page.elements.some((e) => e.name === "검색창")).toBe(true);
    expect(page.text).not.toContain("secret");
    expect(page.elements.filter((e) => e.role === "input")).toHaveLength(1);
  });
  it("allows navigation actions after unrelated page updates", () => {
    const page = snapshot();
    invalidate();
    expect(checkAction({ type: "BACK" }, page.revision)).toBeNull();
  });
  it("types using native input events without submitting", async () => {
    const page = snapshot(),
      field = page.elements.find((e) => e.name === "검색창")!;
    const listener = vi.fn();
    document.querySelector("input")!.addEventListener("input", listener);
    checkAction({ type: "TYPE", id: field.id, text: "맥북" }, page.revision);
    await execute({ type: "TYPE", id: field.id, text: "맥북" });
    expect((document.querySelector("#q") as HTMLInputElement).value).toBe(
      "맥북",
    );
    expect(listener).toHaveBeenCalledOnce();
  });
  it("requires confirmation for a submit button", () => {
    const page = snapshot(),
      submit = page.elements.find(
        (e) => e.name === "제출" && e.role === "button",
      )!;
    expect(
      checkAction({ type: "CLICK", id: submit.id }, page.revision),
    ).toBeTruthy();
  });
  it("rejects removed and disabled elements", () => {
    const page = snapshot(),
      login = page.elements.find((e) => e.name === "로그인")!;
    (document.querySelector("#login") as HTMLButtonElement).disabled = true;
    expect(() =>
      checkAction({ type: "CLICK", id: login.id }, page.revision),
    ).toThrow();
    document.querySelector("#login")!.remove();
    expect(() =>
      checkAction({ type: "CLICK", id: login.id }, page.revision),
    ).toThrow();
  });
  it("analyzes large images regardless of alt and restores originals", () => {
    expect(imageCandidates()).toHaveLength(2);
    const page = snapshot(),
      img = page.elements.find((e) => e.role === "img")!;
    applyDescription(img.id, "검은 신발");
    expect(document.querySelector("#product")?.getAttribute("alt")).toBe(
      "검은 신발",
    );
    restore();
    expect(document.querySelector("#product")?.hasAttribute("alt")).toBe(false);
  });
  it("restores original font size after transformation", () => {
    transform(true);
    expect((document.querySelector("p") as HTMLElement).style.fontSize).toBe(
      "16px",
    );
    restore();
    expect((document.querySelector("p") as HTMLElement).style.fontSize).toBe(
      "10px",
    );
    expect(currentRevision()).toBeTruthy();
  });
});

it("does not read article text for an image READ", async () => {
  const img = snapshot().elements.find((e) => e.role === "img")!;
  await expect(execute({ type: "READ", id: img.id })).rejects.toThrow("AI");
});
it("executes a requested search but keeps TYPE input-only", async () => {
  document.body.innerHTML =
    '<form action="https://example.org/search"><input type="search" name="q" aria-label="검색"><button>검색</button></form>';
  const submitted = vi.fn((e: Event) => e.preventDefault());
  document.querySelector("form")!.addEventListener("submit", submitted);
  const field = snapshot().elements.find((e) => e.role === "input")!;
  await execute({ type: "TYPE", id: field.id, text: "고양이" });
  expect(submitted).not.toHaveBeenCalled();
  await execute({ type: "SEARCH", id: field.id, text: "고양이" });
  expect(submitted).toHaveBeenCalledOnce();
});
it("replaces short alt with AI description and rejects changed sources", () => {
  const el = document.querySelector<HTMLImageElement>("#product")!;
  el.alt = "사진";
  const img = snapshot().elements.find((e) => e.role === "img")!;
  expect(imageCandidates()).toContain(el);
  applyDescription(img.id, "고양이가 창가에 앉아 있습니다.", el.src);
  expect(el.alt).toContain("고양이");
  expect(imageCandidates()).not.toContain(el);
  expect(() =>
    applyDescription(img.id, "틀린 설명", "https://other.org/x.jpg"),
  ).toThrow();
  restore();
  expect(el.alt).toBe("사진");
});

it("allows unchanged search forms after unrelated updates but rejects changed forms", () => {
  document.body.innerHTML =
    '<form action="https://example.org/search"><input type="search" name="q"><button>검색</button></form><aside>광고</aside>';
  const page = snapshot(),
    field = page.elements.find((e) => e.role === "input")!;
  document.querySelector("aside")!.textContent = "새 광고";
  invalidate();
  expect(
    checkAction(
      { type: "SEARCH", id: field.id, text: "고양이" },
      page.revision,
    ),
  ).toBeNull();
  document.querySelector("form")!.action = "https://example.org/checkout";
  expect(() =>
    checkAction(
      { type: "SEARCH", id: field.id, text: "고양이" },
      page.revision,
    ),
  ).toThrow();
});

it("limits Naver article images to the body and excludes embedded ads", () => {
  document.body.innerHTML =
    '<main><img src="/header.jpg"><div id="dic_area"><img id="body1" src="/one.jpg"><aside><img src="/ad.jpg"></aside><img id="body2" src="/two.jpg"></div><section><img src="/related.jpg"></section></main>';
  expect(imageCandidates().map((i) => i.id)).toEqual(["body1", "body2"]);
});
it("uses the innermost nested article body", () => {
  document.body.innerHTML = `<main><div class="article-body">
    <div class="reporter"><img id="writer" src="/writer.jpg"></div>
    <article id="article-view-content-div" itemprop="articleBody">
      <img id="body" src="/robot.jpg"><div data-ad><img id="ad" src="/ad.jpg"></div>
    </article>
  </div></main>`;
  expect(imageCandidates().map((i) => i.id)).toEqual(["body"]);
});
it("uses the innermost nested substantial article", () => {
  document.body.innerHTML = `<article>
    <img id="outer" src="/outer.jpg">
    <article><p>${"본문입니다. ".repeat(40)}</p><img id="inner" src="/inner.jpg"></article>
  </article>`;
  expect(imageCandidates().map((i) => i.id)).toEqual(["inner"]);
});
it("keeps disjoint explicit article bodies ambiguous", () => {
  document.body.innerHTML =
    '<main><div class="article-content"><img src="/one.jpg"></div><div itemprop="articleBody"><img src="/two.jpg"></div></main>';
  expect(imageCandidates()).toEqual([]);
});
it("keeps sibling article bodies under a shared candidate ambiguous", () => {
  document.body.innerHTML = `<main><div class="article-body">
    <section itemprop="articleBody"><img src="/one.jpg"></section>
    <section class="article-content"><img src="/two.jpg"></section>
  </div></main>`;
  expect(imageCandidates()).toEqual([]);
});
it("selects a substantial article and excludes recommendations", () => {
  document.body.innerHTML = `<article><p>${"본문입니다. ".repeat(40)}</p><img id="body" src="/photo.jpg"><div class="related"><img src="/related.jpg"></div></article><aside><img src="/ad.jpg"></aside><article><p>다음 기사</p><img src="/next.jpg"></article>`;
  expect(imageCandidates().map((i) => i.id)).toEqual(["body"]);
});
it("does not guess when multiple article bodies are plausible", () => {
  document.body.innerHTML = `<article><p>${"첫 기사 ".repeat(60)}</p><img src="/one.jpg"></article><article><p>${"다른 기사 ".repeat(60)}</p><img src="/two.jpg"></article>`;
  expect(imageCandidates()).toEqual([]);
});

it("searches a Google-style textarea while preserving input-only behavior", async () => {
  document.body.innerHTML =
    '<form action="https://www.google.com/search" role="search"><textarea name="q" title="Search" aria-label="Search"></textarea><input type="hidden" name="source" value="hp"><input type="file"><button type="button" aria-label="Search by voice">Voice</button><button>Google Search</button></form>';
  const submitted = vi.fn((e: Event) => e.preventDefault());
  document.querySelector("form")!.addEventListener("submit", submitted);
  const page = snapshot(),
    field = page.elements.find((e) => e.role === "textarea")!;
  await execute({ type: "TYPE", id: field.id, text: "사과" });
  expect(submitted).not.toHaveBeenCalled();
  const current = snapshot();
  invalidate();
  expect(
    checkAction(
      { type: "SEARCH", id: field.id, text: "사과" },
      current.revision,
    ),
  ).toBeNull();
  await execute({ type: "SEARCH", id: field.id, text: "사과" });
  expect(document.querySelector("textarea")!.value).toBe("사과");
  expect(submitted).toHaveBeenCalledOnce();
});
it("rejects a search form containing a separate message textarea", () => {
  document.body.innerHTML =
    '<form><input type="search" name="q"><textarea name="message"></textarea><button>Search</button></form>';
  const page = snapshot(),
    field = page.elements.find((e) => e.role === "input")!;
  expect(() =>
    checkAction({ type: "SEARCH", id: field.id, text: "사과" }, page.revision),
  ).toThrow();
});

it("does not submit a search with attached files", () => {
  document.body.innerHTML =
    '<form action="https://google.com/search"><textarea name="q" aria-label="Search"></textarea><input type="file"><button type="button" aria-label="Search by voice">Voice</button><button>Google Search</button></form>';
  Object.defineProperty(document.querySelector("input[type=file]"), "files", {
    value: [new File(["private"], "private.txt")],
  });
  const page = snapshot(),
    field = page.elements.find((e) => e.role === "textarea")!;
  expect(() =>
    checkAction({ type: "SEARCH", id: field.id, text: "사과" }, page.revision),
  ).toThrow("첨부 파일");
});

it("handles search controls appearing after typing", async () => {
  document.body.innerHTML =
    '<form action="https://google.com/search"><textarea name="q" aria-label="Search"></textarea></form>';
  const form = document.querySelector("form")!;
  const submitted = vi.fn((e: Event) => e.preventDefault());
  form.addEventListener("submit", submitted);
  document.querySelector("textarea")!.addEventListener("input", () => {
    const b = document.createElement("button");
    b.textContent = "Google Search";
    form.append(b);
  });
  const field = snapshot().elements.find((e) => e.role === "textarea")!;
  await execute({ type: "SEARCH", id: field.id, text: "사과" });
  expect(submitted).toHaveBeenCalledOnce();
});

it("reads the same article after unrelated ads change", async () => {
  document.body.innerHTML = `<main><h1>기사 제목</h1><div class="article-text"><p>${"본문 문장입니다. ".repeat(20)}</p><div data-ad>광고 A</div></div></main>`;
  const page = snapshot();
  document.querySelector("[data-ad]")!.textContent = "광고 B";
  invalidate();
  expect(checkAction({ type: "READ_PAGE" }, page.revision)).toBeNull();
  await expect(execute({ type: "READ_PAGE" })).resolves.toContain("본문 문장");
});

it("keeps ambiguous short blocks available for AI selection and reads only the selected original", async () => {
  document.body.innerHTML = `<h1>사과</h1><div>동음이의어 항목입니다.<br>목차 1. 개요</div>
    <div>사과나무의 열매.<br>과일의 한 종류다.</div>`;
  expect(pageReading()).toBe("");
  expect(readingCandidates()[1]).toContain("사과나무의 열매.");
  const page = snapshot();
  expect(checkAction({ type: "READ_PAGE", startIndex: 1 }, page.revision)).toBeNull();
  const blocks = document.querySelectorAll("div");
  blocks[0].scrollIntoView = vi.fn();
  blocks[1].scrollIntoView = vi.fn();
  await expect(execute({ type: "READ_PAGE", startIndex: 1 })).resolves.toBe(
    "사과나무의 열매.\n\n과일의 한 종류다.",
  );
  expect(blocks[0].scrollIntoView).not.toHaveBeenCalled();
  expect(blocks[1].scrollIntoView).toHaveBeenCalledWith(
    expect.objectContaining({ block: "center" }),
  );
});

it("starts a wiki page at its short linked definition, not the license notice", () => {
  document.body.innerHTML = `<header><h1>사과</h1></header>
    <div class="notice">동음이의어에 대한 내용은 다른 문서를 참고하십시오.<br></div>
    <table><tr><td>${"사과 관련 항목 ".repeat(30)}</td></tr></table>
    <div class="wiki-content"><div class="wiki-paragraph">
      <span>🍎🍏 / Apple</span><br><br>
      <a href="/apple-tree">사과나무</a>의 <a href="/fruit">열매</a>.<br><br>
      <a href="/fruit">과일</a>의 대표 주자이다. 한국에서는 제철 과일로 생산된다.<br><br>
      예시로 활용될 때 가장 많이 쓰이는 단어이다.
    </div></div>
    <div data-ad>광고</div>
    <div class="license"><p>이 저작물은 CC BY-NC-SA 2.0 KR에 따라 이용할 수 있습니다.</p></div>`;
  const read = pageReading();
  expect(read.slice(0, 9)).toBe("사과나무의 열매.");
  expect(read).toContain("과일의 대표 주자이다.");
  expect(read).not.toContain("동음이의어");
  expect(read).not.toContain("CC BY-NC-SA");
  expect(read).not.toContain("🍎🍏 / Apple");
});

it("tracks linked wiki sentences and follows the next spoken line", () => {
  document.body.innerHTML = `<div><span>🍎🍏 / Apple</span><br>
    <a>사과나무</a>의 <a>열매</a>.<br>
    과일의 대표 주자이다. 한국에서는 제철 과일이다.<br>
    마지막 문장이다.</div>`;
  const plan = beginReading({ type: "READ_PAGE", startIndex: 0 }, "");
  expect(plan.segments[0]).toBe("사과나무의 열매.");
  expect(plan.segments.at(-1)).toBe("마지막 문장이다.");
  const scroll = vi.fn();
  vi.stubGlobal("scrollBy", scroll);
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => ({
      top: 1000, bottom: 1020, left: 0, right: 100, width: 100, height: 20,
      x: 0, y: 1000, toJSON() { return {}; },
    })),
  });
  expect(focusReading(plan.token, 0, "first-playback")).toBe(true);
  clearReading(plan.token, "first-playback");
  expect(focusReading(plan.token, 1, "first-playback")).toBe(false);
  expect(focusReading(plan.token, plan.segments.length - 1, "replay")).toBe(true);
  expect(scroll).toHaveBeenCalledTimes(2);
  clearReading();
});

it("rejects page reading when the article body changes", () => {
  document.body.innerHTML = `<main><h1>기사 제목</h1><div class="article-text"><p>${"원래 본문입니다. ".repeat(20)}</p></div></main>`;
  const page = snapshot();
  document.querySelector("p")!.textContent = "다른 기사 본문입니다. ".repeat(
    20,
  );
  invalidate();
  expect(() => checkAction({ type: "READ_PAGE" }, page.revision)).toThrow(
    "내용이나 대상",
  );
});

it("allows reading an unchanged target after a recommendation changes", async () => {
  document.body.innerHTML =
    '<main><h2 id="body">읽어야 할 문장입니다.</h2><aside>추천 A</aside></main>';
  const page = snapshot();
  const target = page.elements.find((e) => e.name === "읽어야 할 문장입니다.")!;
  document.querySelector("aside")!.textContent = "추천 B";
  invalidate();
  expect(
    checkAction({ type: "READ", id: target.id }, page.revision),
  ).toBeNull();
  await expect(execute({ type: "READ", id: target.id })).resolves.toContain(
    "읽어야 할 문장",
  );
});

it("rejects clicking when the same target changes destination", () => {
  document.body.innerHTML =
    '<main><a href="/safe">계속</a><aside>광고</aside></main>';
  const page = snapshot();
  const target = page.elements.find((e) => e.role === "a")!;
  document.querySelector("a")!.setAttribute("href", "/different");
  invalidate();
  expect(() =>
    checkAction({ type: "CLICK", id: target.id }, page.revision),
  ).toThrow("내용이나 대상");
});
