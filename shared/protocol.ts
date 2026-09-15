import { z } from "zod";
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CLICK"), id: z.string().max(80) }),
  z.object({
    type: z.literal("TYPE"),
    id: z.string().max(80),
    text: z.string().max(1000),
  }),
  z.object({ type: z.literal("DESCRIBE"), id: z.string().max(80) }),
  z.object({
    type: z.literal("SEARCH"),
    id: z.string().max(80),
    text: z.string().min(1).max(1000),
  }),
  z.object({ type: z.literal("READ"), id: z.string().max(80) }),
  z.object({
    type: z.literal("READ_PAGE"),
    startIndex: z.number().int().min(0).max(19).optional(),
  }),
  z.object({ type: z.literal("FOCUS"), id: z.string().max(80) }),
  z.object({ type: z.literal("SCROLL"), direction: z.enum(["up", "down"]) }),
  z.object({ type: z.literal("BACK") }),
  z.object({ type: z.literal("ANSWER"), text: z.string().max(1800) }),
]);
export type Action = z.infer<typeof ActionSchema>;
export const DecisionSchema = z.object({
  action: ActionSchema,
  message: z.string().max(1800),
});
export type Decision = z.infer<typeof DecisionSchema>;
export const ElementSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(250),
  role: z.string().max(50),
  context: z.string().max(600),
  disabled: z.boolean(),
  inViewport: z.boolean(),
  x: z.number(),
  y: z.number(),
});
export const PageSchema = z.object({
  revision: z.string().max(80),
  title: z.string().max(300),
  text: z.string().max(10000),
  elements: z.array(ElementSchema).max(150),
  lastId: z.string().max(80).optional(),
});
export type PageSnapshot = z.infer<typeof PageSchema>;
export const RequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("image"),
    image: z
      .string()
      .max(1500000)
      .regex(/^[A-Za-z0-9+/]+=*$/),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    context: z.string().max(600),
  }),
  z.object({
    kind: z.literal("command"),
    command: z.string().min(1).max(1000),
    page: PageSchema,
  }),
  z.object({
    kind: z.literal("reading"),
    title: z.string().max(300),
    candidates: z.array(z.string().min(1).max(300)).min(1).max(20),
  }),
]);
export type AIRequest = z.infer<typeof RequestSchema>;
export interface Audit {
  missing: number;
  contrast: number;
  other: number;
  small: number;
  issues: { title: string; count: number }[];
  described: number;
  improved: boolean;
}
export const emptyAudit: Audit = {
  missing: 0,
  contrast: 0,
  other: 0,
  small: 0,
  issues: [],
  described: 0,
  improved: false,
};
export interface Reply {
  ok: boolean;
  data?: any;
  error?: string;
}
export function localCommand(text: string): Action | null {
  const t = text.trim().replace(/[.!?。]/g, "");
  if (/^(이 )?(페이지|기사|본문)(를|을)? (읽어줘|읽어 줘|읽어주세요)$/.test(t))
    return { type: "READ_PAGE" };
  if (/^(아래로|밑으로)( 내려줘| 스크롤)?$/.test(t))
    return { type: "SCROLL", direction: "down" };
  if (/^(위로)( 올라가줘| 스크롤)?$/.test(t))
    return { type: "SCROLL", direction: "up" };
  if (/^(뒤로|뒤로 가줘|이전 페이지)$/.test(t)) return { type: "BACK" };
  return null;
}
export function riskReason(
  name: string,
  context: string,
  isSubmit: boolean,
): string | null {
  if (isSubmit) return "폼 제출은 정보 전송이나 신청으로 이어질 수 있습니다.";
  if (
    /결제|구매|주문|삭제|탈퇴|예약|송금|전송|확정|동의|구독|신청|제출|pay|buy|purchase|checkout|delete|remove|confirm|submit|subscribe|send|book|reserve/i.test(
      name + " " + context,
    )
  )
    return "구매·제출·삭제 등 결과가 발생할 수 있는 행동입니다.";
  return null;
}

/** Extension tabs have sender.tab too; authenticate the URL, not its presence. */
export function trustedUI(
  url: string | undefined,
  extensionRoot: string,
): boolean {
  return (
    !!url &&
    url.startsWith(extensionRoot) &&
    /^chrome-extension:\/\/[a-p]{32}\/$/.test(extensionRoot)
  );
}

export function wantsImage(text: string) {
  return (
    /(?:사진|이미지|그림|photo|image|picture)/i.test(text) &&
    /설명|보여|읽어|뭐|무엇|describe|read|what/i.test(text)
  );
}
export function imageOrdinal(text: string) {
  const m = text.match(/(\d+)\s*번/);
  if (m) return Number(m[1]) - 1;
  const words = ["첫", "두", "세", "네", "다섯"];
  return words.findIndex(
    (w) => text.includes(w + " 번째") || text.includes(w + "번째"),
  );
}
export function wantsSearchSubmit(text: string) {
  return (
    /검색|search/i.test(text) &&
    !/(입력만|입력만 해|검색하지|제출하지|type only|do not search)/i.test(text)
  );
}

export function isNewTab(url = "") {
  return /^(chrome:\/\/(newtab|new-tab-page)(\/|$)|chrome-search:\/\/(local-ntp|remote-ntp)(\/|$))/.test(
    url,
  );
}
export function newTabQuery(command: string) {
  const text = command.trim();
  const match =
    text.match(
      /^(?:구글에서\s*|구글로\s*)?(.+?)(?:을|를)?\s*검색(?:해\s*줘|해|해\s*주세요|하기)?[.!?]?$/,
    ) || text.match(/^search\s+(?:for\s+)?(.+)$/i);
  return match?.[1]?.trim().replace(/^["'“]|["'”]$/g, "") || null;
}
