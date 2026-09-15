import { deflateSync } from "node:zlib";
const root = "https://accessai-proxy.accessai.workers.dev";
const origin = "chrome-extension://mdhobnonbpkileokdphecpdkomadcjoa";
const health = await fetch(root + "/health");
console.log("Health", health.status, await health.json());
const page = {
  revision: "smoke:1",
  title: "공개 테스트 데이터",
  text: "검색창과 로그인 버튼이 있습니다.",
  elements: [
    {
      id: "search",
      name: "검색창",
      role: "input",
      context: "",
      disabled: false,
      inViewport: true,
      x: 0,
      y: 0,
    },
    {
      id: "login",
      name: "로그인",
      role: "button",
      context: "",
      disabled: false,
      inViewport: true,
      x: 100,
      y: 0,
    },
  ],
};
for (const command of ["로그인 버튼 눌러줘", "검색창에 맥북 입력해줘"]) {
  const res = await fetch(root + "/ai", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "command", command, page }),
  });
  console.log("Command", res.status, await res.json());
}
function crc32(b) {
  let c = 0xffffffff;
  for (const n of b) {
    c ^= n;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type),
    len = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([len, tag, data, crc]);
}
const hdr = Buffer.alloc(13);
hdr.writeUInt32BE(128, 0);
hdr.writeUInt32BE(128, 4);
hdr[8] = 8;
hdr[9] = 2;
const pixels = Buffer.alloc(128 * (128 * 3 + 1));
for (let y = 0; y < 128; y++)
  for (let x = 0; x < 128; x++) pixels[y * 385 + 1 + x * 3] = 255;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", hdr),
  chunk("IDAT", deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]);
const res = await fetch(root + "/ai", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "image",
    image: png.toString("base64"),
    mime: "image/png",
    context: "테스트용 단색 이미지",
  }),
});
console.log("Image", res.status, await res.json());
