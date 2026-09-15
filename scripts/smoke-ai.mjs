import { readFile } from "node:fs/promises";
const source = await readFile("proxy/.dev.vars", "utf8");
const key = source
  .split("\n")
  .find((l) => l.startsWith("GEMINI_API_KEY="))
  ?.slice(15)
  .trim()
  .replace(/^["']|["']$/g, "");
if (!key) throw Error("Key not saved");
const res = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: "접근성 테스트입니다. 한국어로 준비 완료라고만 답해주세요.",
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 100 },
    }),
  },
);
const result = await res.json();
console.log(
  JSON.stringify(
    {
      status: res.status,
      text: result.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text)
        .join(""),
      errorCode: result.error?.status,
      message: result.error?.message?.replaceAll(key, "[REDACTED]"),
    },
    null,
    2,
  ),
);
