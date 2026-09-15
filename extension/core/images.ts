import { idFor, visible, highlight } from "./dom";
const excluded =
  'aside,nav,footer,[role="complementary"],[role="navigation"],[data-ad],[data-advertisement],.advertisement,.ad-container,.related,.related-articles,.recommendation,.reporter,.author-profile';
function excludedImage(img: Element) {
  return !!img.closest(excluded);
}
function deepestCandidates(candidates: Element[]) {
  return candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) => other !== candidate && candidate.contains(other),
      ),
  );
}
/** A narrow article body wins over broad page/main containers. */
export function articleImageScope(): {
  root: Element | null;
  article: boolean;
} {
  const specific = Array.from(
    document.querySelectorAll(
      '#dic_area,[itemprop="articleBody"],.article-body,.article_body,.article-content,.article_content',
    ),
  ).filter((el) => visible(el) && !el.closest(excluded));
  const specificRoots = deepestCandidates(specific);
  if (specificRoots.length === 1)
    return { root: specificRoots[0], article: true };
  if (specificRoots.length > 1) return { root: null, article: true };
  const articles = Array.from(document.querySelectorAll("article")).filter(
    (el) => visible(el) && !el.closest(excluded),
  );
  const substantial = deepestCandidates(
    articles.filter((el) => {
      const paragraphs = Array.from(el.querySelectorAll("p")).filter(
        (p) => !p.closest(excluded),
      );
      return (
        paragraphs.reduce(
          (n, p) => n + (p.textContent?.trim().length || 0),
          0,
        ) >= 200
      );
    }),
  );
  if (substantial.length === 1) return { root: substantial[0], article: true };
  const declared = document.querySelector(
    'meta[property="og:type"][content="article"]',
  );
  if (declared || articles.length) {
    const blocks = Array.from(
      document.querySelectorAll(
        'main section,main div,[role="main"] section,[role="main"] div',
      ),
    ).filter((el) => {
      if (!visible(el) || el.closest(excluded)) return false;
      const direct = Array.from(el.children).filter((c) => c.tagName === "P");
      return (
        direct.length >= 3 &&
        direct.reduce((n, p) => n + (p.textContent?.length || 0), 0) >= 500
      );
    });
    return { root: blocks.length === 1 ? blocks[0] : null, article: true };
  }
  return { root: null, article: false };
}
export function meaningfulImages() {
  const scope = articleImageScope();
  if (scope.article && !scope.root) return [];

  return Array.from(document.images).filter((img) => {
    const r = img.getBoundingClientRect();
    // Alt is deliberately not a filter: captions/credits are not visual descriptions.
    return (
      visible(img) &&
      !excludedImage(img) &&
      (!scope.root || scope.root.contains(img)) &&
      r.width >= 80 &&
      r.height >= 60 &&
      r.width * r.height >= 10000 &&
      !!(img.currentSrc || img.src)
    );
  });
}
export function imageInfo(img: HTMLImageElement) {
  const r = img.getBoundingClientRect();
  return {
    id: idFor(img),
    url: img.currentSrc || img.src,
    name: img.alt.slice(0, 250),
    context: (
      img.closest("figure")?.querySelector("figcaption")?.textContent || ""
    )
      .replace(/\s+/g, " ")
      .slice(0, 200),
    inViewport:
      r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    area: r.width * r.height,
    distance: Math.abs((r.top + r.bottom) / 2 - innerHeight / 2),
    main: !!img.closest("article,main,[role=main]"),
  };
}
export function findImage(id: string) {
  const img = Array.from(document.images).find((img) => idFor(img) === id);
  if (!img || !meaningfulImages().includes(img))
    throw Error("사진이 사라졌습니다. 다시 요청해주세요.");
  return img;
}
export async function prepareImage(id: string) {
  const img = findImage(id);
  img.scrollIntoView({ block: "center", behavior: "instant" });
  if (!img.complete || !img.naturalWidth)
    await Promise.race([
      img.decode().catch(() => {}),
      new Promise((r) => setTimeout(r, 1800)),
    ]);
  highlight(img);
  const info = imageInfo(img),
    r = img.getBoundingClientRect();
  let dataUrl: string | undefined;
  try {
    if (!img.naturalWidth) throw Error("not loaded");
    const scale = Math.min(
      1,
      1000 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    /* Cross-origin taint: the background tries the original URL, then visible image crop. */
  }
  const left = Math.max(0, r.left),
    top = Math.max(0, r.top),
    right = Math.min(innerWidth, r.right),
    bottom = Math.min(innerHeight, r.bottom);
  return {
    ...info,
    dataUrl,
    rect: {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    },
    viewport: { width: innerWidth, height: innerHeight },
    partial:
      left > r.left || top > r.top || right < r.right || bottom < r.bottom,
  };
}
