import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  ArrowUpRight,
  Mic,
  Square,
  Send,
  ScanEye,
  Image,
  Contrast,
  Type,
  RotateCcw,
  Volume2,
  ShieldCheck,
  ChevronDown,
  Check,
  ArrowRight,
  AudioLines,
  Globe,
  LoaderCircle,
} from "lucide-react";
import {
  emptyAudit,
  isNewTab,
  newTabQuery,
  wantsImage,
  imageOrdinal,
  wantsSearchSubmit,
  localCommand,
  DecisionSchema,
  type Audit,
  type Reply,
  type PageSnapshot,
} from "../../../shared/protocol";
async function background(message: unknown) {
  const r: Reply = await chrome.runtime.sendMessage(message);
  if (!r?.ok) throw Error(r?.error || "확장프로그램 연결에 실패했습니다.");
  return r.data;
}
type VoiceShortcutRequest = {
  token: string;
  tabId: number;
  requestedAt: number;
};
type TrackedReading = {
  tabId: number;
  token: string;
  segments: string[];
  text: string;
};
function voiceShortcutRequest(value: unknown): VoiceShortcutRequest | null {
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as any).token !== "string" ||
    !Number.isInteger((value as any).tabId) ||
    typeof (value as any).requestedAt !== "number"
  )
    return null;
  return value as VoiceShortcutRequest;
}
export default function App() {
  const pinnedTab =
    Number(new URLSearchParams(location.search).get("tab")) || null;
  const [report, setReport] = useState<Audit>(emptyAudit),
    [tab, setTab] = useState<chrome.tabs.Tab | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState("현재 페이지를 연결해주세요."),
    [command, setCommand] = useState(""),
    [highContrast, setHighContrast] = useState(false),
    [voice, setVoice] = useState(true),
    [listening, setListening] = useState(false),
    [voiceShortcut, setVoiceShortcut] =
      useState<VoiceShortcutRequest | null>(null),
    [consent, setConsent] = useState(false),
    [configured, setConfigured] = useState(false),
    [connected, setConnected] = useState(false),
    [confirmation, setConfirmation] = useState<{
      token: string;
      reason: string;
      message: string;
      tabId: number;
    } | null>(null),
    [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const followPage = useRef(!!pinnedTab);
  const commandEpoch = useRef(0);
  const speechRun = useRef(0);
  const activeReading = useRef<(TrackedReading & { playbackId: string }) | null>(null);
  const lastReading = useRef<TrackedReading | null>(null);
  const startingMic = useRef(false);
  const handledVoiceShortcut = useRef("");
  const cancelButton = useRef<HTMLButtonElement>(null);
  const micButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmation) cancelButton.current?.focus();
  }, [confirmation]);
  const recognition = useRef<any>(null),
    lastSpeech = useRef(""),
    running = useRef(false),
    tabRef = useRef<chrome.tabs.Tab | null>(null),
    cancelImages = useRef(false);
  useEffect(() => {
    const refresh = async () => {
      const t = pinnedTab
        ? await chrome.tabs.get(pinnedTab)
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      tabRef.current = t || null;
      setTab(t || null);
      setConnected(false);
      setReport(emptyAudit);
      setConfirmation(null);
      cancelImages.current = true;
      commandEpoch.current++;
      stopSpeech();
      if (
        t?.id &&
        ((!t.url && !t.pendingUrl) || isNewTab(t.url || t.pendingUrl))
      ) {
        setStatus(
          "“사과를 검색해줘”라고 말하거나 입력하세요. Google 검색 결과로 이동합니다.",
        );
        return;
      }
      if (
        followPage.current &&
        t?.id &&
        t.status === "complete" &&
        /^https?:/.test(t.url || "")
      ) {
        const id = t.id;
        try {
          try {
            await page({ type: "PING" }, id);
          } catch {
            await chrome.scripting.executeScript({
              target: { tabId: id },
              files: ["content-scripts/content.js"],
            });
          }
          if (tabRef.current?.id !== id) return;
          setConnected(true);
          setReport(await page({ type: "AUDIT" }, id));
          setStatus("이동한 페이지를 다시 분석했습니다.");
        } catch {
          setStatus(
            "페이지가 이동했습니다. 현재 페이지 분석을 눌러 다시 연결해주세요.",
          );
        }
      }
    };
    void refresh().catch(() =>
      setError(
        "대상 탭이 닫혔습니다. 웹페이지에서 AccessAI를 다시 열어주세요.",
      ),
    );
    const changed = () =>
      void refresh().catch(() =>
        setError(
          "대상 탭이 닫혔습니다. 웹페이지에서 AccessAI를 다시 열어주세요.",
        ),
      );
    chrome.tabs.onActivated.addListener(changed);
    const updated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (
        id === tabRef.current?.id &&
        (info.status === "loading" || info.status === "complete" || info.url)
      )
        void refresh().catch(() =>
          setError(
            "대상 탭이 닫혔습니다. 웹페이지에서 AccessAI를 다시 열어주세요.",
          ),
        );
    };
    chrome.tabs.onUpdated.addListener(updated);
    void chrome.storage.local
      .get(["aiConsent", "voice", "highContrast"])
      .then((s) => {
        setConsent(!!s.aiConsent);
        setVoice(s.voice !== false);
        setHighContrast(!!s.highContrast);
      });
    void background({ type: "CONFIG" })
      .then((c) => setConfigured(c.configured))
      .catch(() => setError("확장프로그램을 새로고침한 뒤 다시 열어주세요."));
    return () => {
      chrome.tabs.onActivated.removeListener(changed);
      chrome.tabs.onUpdated.removeListener(updated);
      recognition.current?.abort();
      stopSpeech();
    };
  }, []);
  function stopSpeech() {
    speechRun.current++;
    speechSynthesis.cancel();
    const reading = activeReading.current;
    activeReading.current = null;
    if (reading)
      void page({
        type: "READING_CLEAR", token: reading.token,
        playbackId: reading.playbackId,
      }, reading.tabId).catch(() => {});
  }
  function speak(text: string) {
    stopSpeech();
    lastSpeech.current = text;
    lastReading.current = null;
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find((v) => v.lang.startsWith("ko")) || null;
    speechSynthesis.speak(utterance);
  }
  function speakReading(reading: TrackedReading) {
    stopSpeech();
    lastSpeech.current = reading.text;
    lastReading.current = reading;
    if (!voice || !reading.segments.length) return;
    const playbackId = crypto.randomUUID();
    activeReading.current = { ...reading, playbackId };
    const run = speechRun.current;
    const play = async (index: number) => {
      if (run !== speechRun.current) return;
      if (index >= reading.segments.length) {
        stopSpeech();
        return;
      }
      try {
        const focused: boolean = await page(
          { type: "READING_FOCUS", token: reading.token, playbackId, index },
          reading.tabId,
        );
        if (run !== speechRun.current) return;
        if (!focused) {
          stopSpeech();
          setError("페이지가 바뀌어 읽던 위치를 찾을 수 없습니다. 다시 요청해주세요.");
          return;
        }
        const utterance = new SpeechSynthesisUtterance(reading.segments[index]);
        utterance.lang = "ko-KR";
        utterance.rate = 1;
        utterance.voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ko")) || null;
        utterance.onend = () => void play(index + 1);
        utterance.onerror = () => { if (run === speechRun.current) stopSpeech(); };
        speechSynthesis.speak(utterance);
      } catch {
        if (run === speechRun.current) stopSpeech();
      }
    };
    void play(0);
  }
  async function page(message: unknown, id = tabRef.current?.id) {
    if (!id) throw Error("웹페이지를 먼저 열어주세요.");
    const r: Reply = await chrome.tabs.sendMessage(id, message);
    if (!r?.ok)
      throw Error(r?.error || "페이지 연결이 끊겼습니다. 다시 연결해주세요.");
    return r.data;
  }
  async function task(label: string, fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "작업에 실패했습니다.");
    } finally {
      running.current = false;
      setBusy("");
    }
  }
  async function connect(targetTabId?: number) {
    await task("페이지 분석 중", async () => {
      const t = targetTabId
        ? await chrome.tabs.get(targetTabId)
        : pinnedTab
        ? await chrome.tabs.get(pinnedTab)
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (
        t?.id &&
        ((!t.url && !t.pendingUrl) || isNewTab(t.url || t.pendingUrl))
      ) {
        tabRef.current = t;
        setTab(t);
        setStatus(
          "새 탭 검색 준비가 되었습니다. “사과를 검색해줘”라고 말하거나 입력하세요.",
        );
        return;
      }
      if (!t?.id || !t.url || !/^https?:/.test(t.url))
        throw Error(
          "일반 HTTP/HTTPS 웹페이지에서 사용할 수 있습니다. Chrome 설정·PDF 등은 지원하지 않습니다.",
        );
      tabRef.current = t;
      setTab(t);
      followPage.current = true;
      try {
        await page({ type: "PING" }, t.id);
      } catch {
        await chrome.scripting.executeScript({
          target: { tabId: t.id },
          files: ["content-scripts/content.js"],
        });
      }
      setConnected(true);
      setReport(await page({ type: "AUDIT" }, t.id));
      setStatus("페이지 분석을 완료했습니다.");
    });
  }
  async function improve() {
    if (consent && configured)
      await chrome.permissions.request({
        origins: ["https://*/*", "http://*/*"],
      });
    await task("페이지 개선 중", async () => {
      const id = tabRef.current?.id;
      await page({ type: "TRANSFORM", highContrast }, id);
      setStatus("글자 가독성을 개선했습니다.");
      if (consent && configured) await descriptions(id);
      setReport(await page({ type: "AUDIT" }, id));
    });
  }
  async function descriptions(id = tabRef.current?.id) {
    if (!consent) throw Error("먼저 AI 분석 전송 안내에 동의해주세요.");
    const candidates = await page({ type: "IMAGES" }, id);
    cancelImages.current = false;
    let done = 0,
      failed = 0;
    let lastError = "";
    for (const img of candidates.slice(0, 8)) {
      if (cancelImages.current || tabRef.current?.id !== id) break;
      setStatus(
        `이미지 설명 ${done + failed + 1} / ${Math.min(candidates.length, 8)}`,
      );
      try {
        await describeOne(img.id, id);
        if (cancelImages.current) break;
        done++;
      } catch (e) {
        failed++;
        lastError = e instanceof Error ? e.message : "이미지 처리 실패";
        if (/한도|서버|동의/.test(lastError)) break;
      }
    }
    setStatus(
      `이미지 ${done}개 설명 완료${failed ? `, ${failed}개 처리 불가` : ""}. 한 번에 최대 8개를 처리합니다.`,
    );
    if (lastError) setError(lastError);
  }
  async function describeOne(imageId: string, id = tabRef.current?.id) {
    const result = await background({
      type: "DESCRIBE",
      id: imageId,
      tabId: id,
    });
    if (cancelImages.current || tabRef.current?.id !== id)
      throw Error("사진 설명을 취소했습니다.");
    await page(
      {
        type: "DESCRIPTION",
        id: imageId,
        url: result.url,
        description: result.description,
      },
      id,
    );
    return (
      (result.partial ? "화면에 보이는 사진 부분입니다. " : "") +
      result.description
    );
  }
  async function runCommand(text = command) {
    if (!text.trim()) return;
    setCommand("");
    if (/^(멈춰|정지|그만)$/.test(text.trim())) {
      commandEpoch.current++;
      stopSpeech();
      recognition.current?.abort();
      cancelImages.current = true;
      setConfirmation(null);
      void page({ type: "CANCEL" }).catch(() => {});
      return;
    }
    if (/^(다시 읽어줘|다시 읽기)$/.test(text.trim())) {
      if (lastReading.current) speakReading(lastReading.current);
      else speak(lastSpeech.current);
      return;
    }
    stopSpeech();
    const epoch = ++commandEpoch.current;
    await task("명령 이해 중", async () => {
      const id = tabRef.current?.id;
      if (
        tabRef.current?.id &&
        ((!tabRef.current.url && !tabRef.current.pendingUrl) ||
          isNewTab(tabRef.current.url || tabRef.current.pendingUrl))
      ) {
        const query = newTabQuery(text);
        if (!query)
          throw Error(
            "새 탭에서는 “사과를 검색해줘”처럼 검색어와 함께 요청해주세요.",
          );
        const current = await chrome.tabs.get(id!);
        if (
          (current.url || current.pendingUrl) &&
          !isNewTab(current.url || current.pendingUrl)
        )
          throw Error("탭이 바뀌었습니다. 다시 요청해주세요.");
        followPage.current = true;
        setMessages((m) => [
          ...m.slice(-5),
          { role: "user", text },
          { role: "assistant", text: `Google에서 검색합니다: ${query}` },
        ]);
        const url =
          "https://www.google.com/search?q=" + encodeURIComponent(query);
        if (!current.url && !current.pendingUrl)
          await chrome.tabs.create({ url, active: true });
        else await chrome.tabs.update(id!, { url });
        return;
      }
      if (!connected) throw Error("먼저 현재 페이지를 연결해주세요.");
      setMessages((m) => [...m.slice(-5), { role: "user", text }]);
      cancelImages.current = false;
      if (wantsImage(text)) {
        if (!consent) throw Error("먼저 AI 분석 전송 안내에 동의해주세요.");
        const images = await page({ type: "IMAGES", all: true }, id);
        if (!images.length)
          throw Error(
            "본문 영역을 확실히 찾지 못했거나 본문에 설명할 사진이 없습니다. 기사 원문을 열어 다시 요청해주세요.",
          );
        const ordinal = imageOrdinal(text);
        const allPhotos = /전부|모두|전체|all/i.test(text);
        const selected =
          ordinal >= 0
            ? images[ordinal]
            : [...images].sort((a, b) => a.distance - b.distance)[0];
        if (!allPhotos && !selected)
          throw Error("요청한 순서의 본문 사진이 없습니다.");
        const targets = allPhotos ? images : [selected];
        const answers: string[] = [];
        for (let i = 0; i < targets.length; i++) {
          if (epoch !== commandEpoch.current || cancelImages.current) return;
          setStatus(`본문 사진 분석 중 ${i + 1} / ${targets.length}`);
          const description = await describeOne(targets[i].id, id);
          if (epoch !== commandEpoch.current) return;
          answers.push(
            allPhotos ? `${i + 1}번째 사진: ${description}` : description,
          );
          setMessages((m) => [
            ...m.filter((entry: any) => entry.batch !== epoch).slice(-5),
            { role: "assistant", text: answers.join("\n\n"), batch: epoch },
          ]);
        }
        speak(answers.join("\n\n"));
        setReport(await page({ type: "AUDIT" }, id));
        return;
      }
      const snap: PageSnapshot = await page({ type: "SNAPSHOT" }, id);
      let local = localCommand(text);
      if (local?.type === "READ_PAGE") {
        const reading: { automatic: boolean; candidates: string[] } = await page(
          { type: "READING_CANDIDATES" },
          id,
        );
        if (!reading.automatic) {
          if (!reading.candidates.length)
            throw Error("읽을 수 있는 본문을 찾지 못했습니다.");
          if (!consent || !configured)
            throw Error(
              "본문 시작을 확정하지 못했습니다. AI 분석 전송에 동의한 뒤 다시 요청해주세요.",
            );
          const choice: { startIndex: number } = await background({
            type: "AI",
            input: {
              kind: "reading",
              title: snap.title,
              candidates: reading.candidates,
            },
          });
          local = { type: "READ_PAGE", startIndex: choice.startIndex };
        }
      }
      const decision = local
        ? { action: local, message: "" }
        : DecisionSchema.parse(
            await background({
              type: "AI",
              input: { kind: "command", command: text, page: snap },
            }),
          );
      if (epoch !== commandEpoch.current) return;
      if (id !== tabRef.current?.id)
        throw Error("활성 탭이 변경되었습니다. 다시 명령해주세요.");
      if (decision.action.type === "TYPE" && wantsSearchSubmit(text))
        decision.action = { ...decision.action, type: "SEARCH" };
      if (decision.action.type === "SEARCH" && !wantsSearchSubmit(text))
        decision.action = { ...decision.action, type: "TYPE" };
      const result = await page(
        { type: "EXECUTE", action: decision.action, revision: snap.revision },
        id,
      );
      if (epoch !== commandEpoch.current) return;
      if (result.image) {
        const answer = await describeOne(result.image.id, id);
        if (epoch !== commandEpoch.current) return;
        setMessages((m) => [
          ...m.slice(-5),
          { role: "assistant", text: answer },
        ]);
        speak(answer);
        return;
      }
      if (result.confirmation) {
        setConfirmation({
          token: result.confirmation,
          reason: result.reason,
          message: decision.message,
          tabId: id!,
        });
        speak(
          "확인이 필요한 행동입니다. 내용을 확인하고 실행 버튼을 눌러주세요.",
        );
        return;
      }
      const answer = result.text || decision.message;
      setMessages((m) => [...m.slice(-5), { role: "assistant", text: answer }]);
      if (result.reading?.segments?.length)
        speakReading({ ...result.reading, tabId: id!, text: answer });
      else speak(answer);
    });
  }
  async function listen() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Speech =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!Speech) {
      setError(
        "이 Chrome 환경은 음성 인식을 지원하지 않습니다. 아래에 명령을 입력해주세요.",
      );
      return;
    }
    if (startingMic.current) return;
    startingMic.current = true;
    setError("");
    setStatus("마이크 권한을 확인하고 있습니다.");
    let micTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
        }),
        new Promise((_, reject) => {
          micTimer = setTimeout(
            () => reject(new Error("microphone timeout")),
            10000,
          );
        }),
      ]);
      const rec = new Speech();
      recognition.current = rec;
      rec.lang = "ko-KR";
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);
      rec.onerror = (e: any) => {
        setListening(false);
        setError(
          e.error === "not-allowed"
            ? "마이크 권한을 허용해주세요. 권한 요청이 보이지 않으면 별도 창에서 열기를 사용해주세요."
            : "음성 인식을 완료하지 못했습니다. 다시 듣거나 명령을 입력해주세요.",
        );
      };
      rec.onresult = (e: any) => void runCommand(e.results[0][0].transcript);
      stopSpeech();
      rec.start();
      setStatus("마이크가 준비되었습니다. 명령을 말해주세요.");
    } catch {
      setError(
        "마이크를 사용할 수 없습니다. Chrome 마이크 권한을 확인하거나 별도 창에서 열기를 사용해주세요.",
      );
    } finally {
      clearTimeout(micTimer);
      startingMic.current = false;
    }
  }
  useEffect(() => {
    const receive = (value: unknown) => {
      const request = voiceShortcutRequest(value);
      if (request) setVoiceShortcut(request);
    };
    void chrome.storage.session
      .get("accessaiVoiceShortcut")
      .then((stored) => receive(stored.accessaiVoiceShortcut));
    const changed = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "session" && changes.accessaiVoiceShortcut?.newValue)
        receive(changes.accessaiVoiceShortcut.newValue);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);
  useEffect(() => {
    if (
      !voiceShortcut ||
      voiceShortcut.token === handledVoiceShortcut.current
    )
      return;
    handledVoiceShortcut.current = voiceShortcut.token;
    if (Date.now() - voiceShortcut.requestedAt > 15000) return;
    void (async () => {
      await connect(voiceShortcut.tabId);
      await listen();
      micButton.current?.focus();
      await chrome.storage.session.remove("accessaiVoiceShortcut");
    })();
  }, [voiceShortcut]);
  const newTab =
    !!tab?.id &&
    ((!tab.url && !tab.pendingUrl) || isNewTab(tab.url || tab.pendingUrl));
  const canCommand = connected || newTab;
  const hostname = (() => {
    if (newTab)
      return tab?.url || tab?.pendingUrl ? "Chrome 새 탭" : "검색 시작";
    try {
      return new URL(tab?.url || "").hostname;
    } catch {
      return "웹페이지를 열어주세요";
    }
  })();
  return (
    <main>
      <header>
        <a className="brand" href="#main">
          <span className="brandmark">
            <AudioLines size={23} />
          </span>
          <span>
            Access<span className="brand-ai">AI</span>
          </span>
        </a>
        <span className="beta">PREVIEW 1.0</span>
      </header>
      <div className="intro" id="main">
        <p className="eyebrow">A MORE ACCESSIBLE WEB</p>
        <h1>웹을, 더 가깝게.</h1>
        <p>
          지금 보고 있는 페이지에
          <br />
          당신을 위한 접근성을 더합니다.
        </p>
      </div>
      <section className="site">
        <div className="site-icon">
          <Globe size={20} />
        </div>
        <div>
          <strong>{hostname}</strong>
          <span>
            <i className={connected ? "dot active" : "dot"} />
            {newTab
              ? "검색 준비됨"
              : connected
                ? "이 페이지에 연결됨"
                : "연결 대기"}
          </span>
        </div>
        <button
          className="icon-button"
          onClick={() => void connect()}
          disabled={!!busy}
          aria-label="현재 페이지 연결 및 다시 분석"
        >
          <RotateCcw size={17} />
        </button>
      </section>
      {!connected && !newTab ? (
        <button
          className="primary"
          onClick={() => void connect()}
          disabled={!!busy}
        >
          <ScanEye size={18} />
          현재 페이지 분석
          <ArrowRight size={18} />
        </button>
      ) : null}
      <section className="analysis">
        <div className="section-heading">
          <h2>페이지 접근성</h2>
          <span>감지된 항목</span>
        </div>
        <div className="metrics">
          <div>
            <Image size={19} />
            <strong>{connected ? report.missing : "—"}</strong>
            <span>AI 미설명 사진</span>
          </div>
          <div>
            <Contrast size={19} />
            <strong>{connected ? report.contrast : "—"}</strong>
            <span>낮은 대비</span>
          </div>
          <div>
            <Type size={19} />
            <strong>{connected ? report.small : "—"}</strong>
            <span>작은 글씨</span>
          </div>
        </div>
        <details>
          <summary>
            기타 접근성 문제 <b>{report.other}</b>
            <ChevronDown size={15} />
          </summary>
          <ul>
            {report.issues.map((i) => (
              <li key={i.title}>
                {i.title}
                <b>{i.count}</b>
              </li>
            ))}
          </ul>
          <p>자동 검사 결과이며 WCAG 인증이나 전체 접근성 평가가 아닙니다.</p>
        </details>
        <button
          className="primary"
          disabled={!connected || !!busy}
          onClick={improve}
        >
          {busy ? (
            <LoaderCircle className="spin" size={19} />
          ) : (
            <Sparkles size={19} />
          )}{" "}
          {busy || "이 페이지 개선"}
          {!busy && <ArrowUpRight size={18} />}
        </button>
        <div className="improve-options">
          <label>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(e) => {
                setHighContrast(e.target.checked);
                void chrome.storage.local.set({
                  highContrast: e.target.checked,
                });
              }}
            />
            고대비 함께 적용
          </label>
          <button
            disabled={!connected || !!busy}
            onClick={() =>
              task("원상 복구 중", async () => {
                await page({ type: "RESTORE" });
                setReport(await page({ type: "AUDIT" }));
                setStatus("원래 페이지로 복구했습니다.");
              })
            }
          >
            원상 복구
          </button>
        </div>
        <div className="status" role="status">
          <Check size={14} />
          <span>{status}</span>
        </div>
        <button
          className="text-button"
          disabled={!connected || !!busy || !consent}
          onClick={async () => {
            await chrome.permissions.request({
              origins: ["https://*/*", "http://*/*"],
            });
            await task("이미지 설명 중", async () => {
              await descriptions();
              setReport(await page({ type: "AUDIT" }));
            });
          }}
        >
          이미지 설명 생성 / 추가 처리 <ArrowRight size={14} />
        </button>
      </section>
      <section className="voice">
        <div className="section-heading">
          <h2>
            <AudioLines size={18} /> Voice Mode
          </h2>
          <label className="switch">
            <input
              type="checkbox"
              aria-label="음성 출력 사용"
              checked={voice}
              onChange={(e) => {
                setVoice(e.target.checked);
                if (!e.target.checked) stopSpeech();
                void chrome.storage.local.set({ voice: e.target.checked });
              }}
            />
            <span />
          </label>
        </div>
        <p>말 한마디로, 다음 단계까지.</p>
        <button
          ref={micButton}
          aria-label={listening ? "음성 듣기 종료" : "음성 명령 듣기 시작"}
          className={"mic-button " + (listening ? "listening" : "")}
          disabled={!canCommand || !!busy}
          onClick={listen}
        >
          {listening ? <AudioLines size={26} /> : <Mic size={26} />}
        </button>
        <strong className="listen-label">
          {listening ? "듣고 있어요…" : "눌러서 말하기"}
        </strong>
        <span className="listen-help">한국어 음성 명령 · 마이크 권한 필요</span>
        <div className="suggestions">
          {(newTab
            ? ["사과를 검색해줘", "웹 접근성을 검색해줘"]
            : ["이 페이지 설명해줘", "아래로 내려줘"]
          ).map((t) => (
            <button
              key={t}
              disabled={!canCommand || !!busy}
              onClick={() => runCommand(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="messages" aria-live="polite">
          {messages.map((m, i) => (
            <p key={i} className={m.role}>
              <span>{m.role === "user" ? "나" : "AccessAI"}</span>
              {m.text}
            </p>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runCommand();
          }}
        >
          <input
            aria-label="명령 입력"
            placeholder="명령을 입력해도 좋아요"
            value={command}
            maxLength={1000}
            onChange={(e) => setCommand(e.target.value)}
          />
          <button
            aria-label="명령 보내기"
            disabled={!command.trim() || !!busy || !canCommand}
          >
            <Send size={18} />
          </button>
        </form>
        <div className="voice-controls">
          <button
            onClick={() => {
              commandEpoch.current++;
              stopSpeech();
              recognition.current?.abort();
              cancelImages.current = true;
              setConfirmation(null);
              void page({ type: "CANCEL" }).catch(() => {});
            }}
          >
            <Square size={12} />
            멈춤
          </button>
          <button onClick={() => lastReading.current
            ? speakReading(lastReading.current)
            : speak(lastSpeech.current)}>
            <Volume2 size={14} />
            다시 읽기
          </button>
          <button
            onClick={() =>
              chrome.tabs.create({
                url:
                  chrome.runtime.getURL("sidepanel.html") +
                  "?tab=" +
                  tabRef.current?.id,
              })
            }
          >
            별도 창에서 열기
          </button>
        </div>
      </section>
      {confirmation && (
        <section
          className="confirmation"
          role="alertdialog"
          aria-label="행동 실행 확인"
        >
          <ShieldCheck size={22} />
          <h2>실행 전 확인해주세요</h2>
          <p>{confirmation.message}</p>
          <p>{confirmation.reason}</p>
          <div>
            <button
              ref={cancelButton}
              onClick={() => {
                void page({ type: "CANCEL" }, confirmation.tabId).catch(
                  () => {},
                );
                setConfirmation(null);
              }}
            >
              취소
            </button>
            <button
              className="primary"
              onClick={() =>
                task("확인한 행동 실행 중", async () => {
                  const c = confirmation;
                  setConfirmation(null);
                  const r = await page(
                    { type: "CONFIRM", token: c.token },
                    c.tabId,
                  );
                  speak(r.text);
                })
              }
            >
              확인하고 실행
            </button>
          </div>
        </section>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <section className="privacy">
        <ShieldCheck size={17} />
        <div>
          <strong>내 브라우저에서 바뀌는 웹</strong>
          <p>원본 사이트는 변경하지 않습니다.</p>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                void chrome.storage.local.set({ aiConsent: e.target.checked });
              }}
            />
            AI 분석 시 필요한 이미지·페이지 문맥을 Google로 전송하는 데
            동의합니다.
          </label>
          <p>
            무료 AI 입력은 서비스 개선에 사용될 수 있습니다. 민감한 페이지에서는
            AI 기능을 꺼주세요.
          </p>
          {!configured && (
            <p className="setup-note">
              AI 서버 배포 연결 대기 · 로컬 개선 기능 사용 가능
            </p>
          )}
        </div>
      </section>
      <footer>
        당신의 방식으로 탐색하세요.<span>AccessAI · STARTON</span>
      </footer>
    </main>
  );
}
