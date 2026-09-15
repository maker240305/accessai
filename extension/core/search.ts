import { name, isSensitive, visible } from "./dom";
import { riskReason } from "../../shared/protocol";
export function searchPlan(el: HTMLElement): {
  form: HTMLFormElement | null;
  button: HTMLElement | null;
  destination: string;
} {
  if (
    !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ||
    el.disabled ||
    el.readOnly ||
    isSensitive(el)
  )
    throw Error("검색 입력란이 아닙니다. 일반 입력은 입력만 수행합니다.");
  const form = el.form,
    scope = form || el.closest("[role=search]");
  const label = [
    name(el),
    el.type,
    el.name,
    el.id,
    scope?.getAttribute("role"),
    scope?.getAttribute("aria-label"),
  ].join(" ");
  if (!/검색|search|\b(q|query|keyword)\b/i.test(label))
    throw Error("검색 용도로 확인되지 않은 입력란은 자동 제출하지 않습니다.");
  if (form) {
    const url = new URL(form.action || location.href, location.href);
    if (
      !/^https?:$/.test(url.protocol) ||
      riskReason(
        "",
        url.pathname + " " + (form.getAttribute("aria-label") || ""),
        false,
      ) ||
      form.querySelector('input[type=password],input[autocomplete^="cc-"]')
    )
      throw Error("중요 정보가 포함된 폼은 검색으로 자동 제출하지 않습니다.");
    if (
      Array.from(
        form.querySelectorAll<HTMLInputElement>('input[type="file"]'),
      ).some((input) => (input.files?.length || 0) > 0)
    )
      throw Error("첨부 파일이 있는 검색은 직접 실행해주세요.");
    const others = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        "input,textarea",
      ),
    ).filter(
      (i) =>
        i !== el &&
        !["hidden", "submit", "button", "checkbox", "radio", "file"].includes(
          i.type,
        ),
    );
    if (others.some((i) => !i.disabled))
      throw Error("여러 정보 입력란이 있는 폼은 자동 검색하지 않습니다.");
  }
  const buttons = Array.from(
    (scope || el.parentElement || el).querySelectorAll<HTMLElement>(
      "button,input[type=submit],[role=button]",
    ),
  ).filter(
    (b) =>
      visible(b) &&
      !b.matches(":disabled,[aria-disabled=true]") &&
      !/voice|image|lens|lucky|ai mode|음성|이미지|렌즈|ai 모드/i.test(name(b)),
  );
  const explicit = buttons.find((b) => /검색|search/i.test(name(b))) || null;
  const submit =
    buttons.find(
      (b) =>
        (b instanceof HTMLButtonElement && b.type === "submit") ||
        (b instanceof HTMLInputElement && b.type === "submit"),
    ) || null;
  const button =
    submit && /검색|search/i.test(name(submit)) ? submit : explicit || submit;
  if (button?.hasAttribute("formaction")) {
    const target = new URL(button.getAttribute("formaction")!, location.href);
    if (
      !/^https?:$/.test(target.protocol) ||
      riskReason("", target.pathname, false)
    )
      throw Error("검색 버튼의 제출 주소를 안전하게 확인할 수 없습니다.");
  }
  if (button && riskReason(name(button), "", false))
    throw Error("결과가 발생할 수 있는 버튼은 자동 검색하지 않습니다.");
  if (
    form &&
    form.method.toLowerCase() !== "get" &&
    !explicit &&
    scope?.getAttribute("role") !== "search"
  )
    throw Error("검색 전용 폼인지 확인할 수 없습니다.");
  if (!form && !explicit)
    throw Error(
      "검색 실행 버튼을 찾지 못했습니다. 검색 버튼을 직접 선택해주세요.",
    );
  return {
    form,
    button,
    destination: form ? [form.action, form.method, form.target].join("|") : "",
  };
}
export function submitSearch(
  el: HTMLElement,
  plan: ReturnType<typeof searchPlan>,
) {
  if (!el.isConnected) throw Error("검색창이 변경되어 실행을 취소했습니다.");
  const fresh = searchPlan(el);
  if (
    fresh.form !== plan.form ||
    fresh.destination !== plan.destination ||
    (!plan.form && fresh.button !== plan.button)
  )
    throw Error("검색 버튼이 변경되어 실행을 취소했습니다.");
  if (fresh.button) fresh.button.click();
  else fresh.form!.requestSubmit();
}
