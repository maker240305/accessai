import { describe, it, expect, vi, afterEach } from "vitest";
import {
  trustedUI,
  isNewTab,
  newTabQuery,
  ActionSchema,
  localCommand,
  riskReason,
  RequestSchema,
} from "../shared/protocol";
import proxy from "../proxy/index";
const env = {
  GEMINI_API_KEY: "test-only-not-real",
  FREE_TIER_CONFIRMED: "true",
  ALLOWED_EXTENSION_IDS: "test",
};
function req(body: unknown, origin = "chrome-extension://test") {
  return new Request("https://proxy.test/ai", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const command = {
  kind: "command",
  command: "로그인 눌러줘",
  page: {
    revision: "1",
    title: "페이지",
    text: "",
    elements: [
      {
        id: "a",
        name: "로그인",
        role: "button",
        context: "",
        disabled: false,
        inViewport: true,
        x: 1,
        y: 1,
      },
    ],
  },
};
afterEach(() => vi.unstubAllGlobals());
describe("action boundary", () => {
  it("rejects arbitrary script execution", () => {
    expect(
      ActionSchema.safeParse({ type: "EVAL", text: "alert(1)" }).success,
    ).toBe(false);
  });
  it("requires a target for click", () => {
    expect(ActionSchema.safeParse({ type: "CLICK" }).success).toBe(false);
  });
  it("limits input size", () => {
    expect(
      ActionSchema.safeParse({ type: "TYPE", id: "a", text: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });
  it("handles basic scroll without AI", () =>
    expect(localCommand("아래로 내려줘")).toEqual({
      type: "SCROLL",
      direction: "down",
    }));
  it("handles page and article reading without AI", () => {
    expect(localCommand("페이지 읽어줘")).toEqual({ type: "READ_PAGE" });
    expect(localCommand("이 기사를 읽어주세요.")).toEqual({
      type: "READ_PAGE",
    });
  });
  it("does not guess free-form intent locally", () =>
    expect(localCommand("내가 산 거 보여줘")).toBeNull());
  it("requires confirmation for submit and destructive actions", () => {
    expect(riskReason("계속", "", true)).toBeTruthy();
    expect(riskReason("구매 확정", "", false)).toBeTruthy();
    expect(riskReason("Delete account", "", false)).toBeTruthy();
    expect(riskReason("로그인", "", false)).toBeNull();
  });
  it("bounds page upload", () =>
    expect(
      RequestSchema.safeParse({
        ...command,
        page: { ...command.page, text: "x".repeat(10001) },
      }).success,
    ).toBe(false));
});
describe("proxy", () => {
  it("accepts only an in-range reading start selected from supplied candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          candidates: [{ content: { parts: [{ text: '{"startIndex":1}' }] } }],
        }),
      ),
    );
    const response = await proxy.fetch(
      req({
        kind: "reading",
        title: "사과",
        candidates: ["목차", "사과나무의 열매."],
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ startIndex: 1 });
  });
  it("rejects unlisted origins before making AI calls", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (await proxy.fetch(req(command, "https://evil.test"), env)).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed until free tier is verified", async () =>
    expect(
      (
        await proxy.fetch(req(command), {
          ...env,
          FREE_TIER_CONFIRMED: "false",
        })
      ).status,
    ).toBe(503));
  it("rejects an unknown target in model output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      message: "열기",
                      action: { type: "CLICK", id: "absent" },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    expect((await proxy.fetch(req(command), env)).status).toBe(502);
  });
  it("returns valid action without executing anything", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      message: "로그인 열기",
                      action: { type: "CLICK", id: "a" },
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
    );
    const r = await proxy.fetch(req(command), env);
    expect(r.status).toBe(200);
    expect((await r.json()).action.id).toBe("a");
  });
  it("quota stops with no paid fallback or retry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const r = await proxy.fetch(req(command), env);
    expect(r.status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await r.json()).error).toContain("무료");
  });
  it("identifies unsupported Worker location without exposing provider details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 400,
              status: "FAILED_PRECONDITION",
              message: "User location is not supported for the API use.",
            },
          },
          { status: 400 },
        ),
      ),
    );
    const response = await proxy.fetch(req(command), env);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("서버 실행 지역");
  });
});

describe("UI sender boundary", () => {
  const root = "chrome-extension://mdhobnonbpkileokdphecpdkomadcjoa/";
  it("allows our side panel and full extension tab", () => {
    expect(trustedUI(root + "sidepanel.html", root)).toBe(true);
    expect(trustedUI(root + "sidepanel.html?tab=123", root)).toBe(true);
  });
  it("rejects websites, absent URLs and other extensions", () => {
    expect(trustedUI("https://example.org", root)).toBe(false);
    expect(trustedUI(undefined, root)).toBe(false);
    expect(
      trustedUI(
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/sidepanel.html",
        root,
      ),
    ).toBe(false);
  });
});

it("recognizes only Chrome new-tab URLs and extracts search requests", () => {
  expect(isNewTab("chrome://newtab/")).toBe(true);
  expect(isNewTab("chrome://new-tab-page/")).toBe(true);
  expect(isNewTab("chrome://settings/")).toBe(false);
  expect(isNewTab("https://example.org/newtab")).toBe(false);
  expect(newTabQuery("사과를 검색해줘")).toBe("사과");
  expect(newTabQuery("웹 접근성 검색해줘")).toBe("웹 접근성");
  expect(newTabQuery("사진 설명해줘")).toBeNull();
});
