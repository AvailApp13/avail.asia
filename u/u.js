// Страница отписки avail.asia/u/ (CRM, этап 3; контракт §10.5).
// 1) токен из ?t= проверяется по виду; 2) GET в crm-unsubscribe — узнать
// состояние (ничего не меняет); 3) кнопка — POST {"t": …} → «Готово».
// Тексты — RU/EN/TH, язык: из ответа функции, иначе язык браузера, иначе
// EN; переключатель RU · EN · TH. Всё выводится через textContent.
(() => {
  "use strict";

  const FN = "https://paikboidnrgthyxpwdrk.supabase.co/functions/v1/crm-unsubscribe";
  const TOKEN_RE = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/;

  const T = {
    ru: {
      loading_t: "Проверяем ссылку…",
      loading: "",
      active_t: "Больше не писать вам?",
      active: "Вы больше не получите от Avail рекламных писем и сообщений — ни по почте, ни в мессенджерах.",
      go: "Да, больше не писать",
      sending: "Отписываем…",
      done_t: "Готово. Больше не напишем.",
      done: "Мы больше не будем вам писать. Спасибо, что ответили.",
      already_t: "Вы уже отписаны",
      already: "Мы больше не пишем вам рекламных писем.",
      test_t: "Это тестовое письмо",
      test: "Ничего не изменится — это проверка от команды Avail.",
      invalid_t: "Ссылка не работает",
      invalid: "Напишите нам на hello@avail.asia со словом unsubscribe — и мы больше не будем писать.",
      error_t: "Не получилось",
      error: "Попробуйте ещё раз через минуту.",
      retry: "Попробовать ещё раз",
    },
    en: {
      loading_t: "Checking the link…",
      loading: "",
      active_t: "Stop writing to you?",
      active: "You will no longer get marketing emails or messages from Avail — by email or in messengers.",
      go: "Yes, stop writing to me",
      sending: "Unsubscribing…",
      done_t: "Done. We won't write again.",
      done: "We will not write to you any more. Thank you for letting us know.",
      already_t: "You are already unsubscribed",
      already: "We no longer send you marketing emails.",
      test_t: "This is a test email",
      test: "Nothing will change — this is a check by the Avail team.",
      invalid_t: "This link doesn't work",
      invalid: "Email us at hello@avail.asia with the word unsubscribe, and we will stop writing.",
      error_t: "Something went wrong",
      error: "Please try again in a minute.",
      retry: "Try again",
    },
    th: {
      loading_t: "กำลังตรวจสอบลิงก์…",
      loading: "",
      active_t: "ไม่ต้องการให้เราส่งข้อความถึงคุณอีกใช่ไหม?",
      active: "คุณจะไม่ได้รับอีเมลหรือข้อความโฆษณาจาก Avail อีก ทั้งทางอีเมลและแอปแชท",
      go: "ใช่ ไม่ต้องส่งมาอีก",
      sending: "กำลังยกเลิกการรับ…",
      done_t: "เรียบร้อยแล้ว เราจะไม่ส่งมาอีก",
      done: "เราจะไม่ส่งข้อความถึงคุณอีก ขอบคุณที่แจ้งให้เราทราบค่ะ",
      already_t: "คุณยกเลิกการรับไปแล้ว",
      already: "เราไม่ได้ส่งอีเมลโฆษณาถึงคุณอีกแล้ว",
      test_t: "นี่คืออีเมลทดสอบ",
      test: "ไม่มีอะไรเปลี่ยนแปลง — นี่คือการทดสอบจากทีม Avail",
      invalid_t: "ลิงก์นี้ใช้ไม่ได้",
      invalid: "กรุณาส่งอีเมลถึง hello@avail.asia พร้อมคำว่า unsubscribe แล้วเราจะไม่ส่งมาอีก",
      error_t: "ไม่สำเร็จ",
      error: "กรุณาลองอีกครั้งในอีกสักครู่",
      retry: "ลองอีกครั้ง",
    },
  };

  let token = "";
  try {
    token = new URLSearchParams(location.search).get("t") || "";
  } catch {
    token = "";
  }
  let state = TOKEN_RE.test(token) ? "loading" : "invalid";
  let lastAction = null;
  let chosen = null;
  let serverLang = null;

  const browserLang = () => {
    const list = navigator.languages || [navigator.language || ""];
    for (const item of list) {
      const l = String(item).slice(0, 2).toLowerCase();
      if (l === "ru" || l === "th" || l === "en") return l;
    }
    return "en";
  };

  const lang = () => chosen || serverLang || browserLang();
  const el = (id) => document.getElementById(id);

  const render = () => {
    const L = lang();
    const t = T[L];
    document.documentElement.lang = L;
    const key = state === "sending" ? "active" : state;
    el("title").textContent = t[key + "_t"];
    el("text").textContent = state === "sending" ? t.sending : t[key];
    el("text").hidden = !el("text").textContent;
    const go = el("go");
    go.hidden = !(state === "active" || state === "sending");
    go.disabled = state === "sending";
    go.textContent = state === "sending" ? t.sending : t.go;
    const retry = el("retry");
    retry.hidden = state !== "error";
    retry.textContent = t.retry;
    el("box").className = state === "done" ? "ok" : "";
    document.title = "Avail — " + t[key + "_t"];
    for (const b of document.querySelectorAll(".langs button")) {
      b.setAttribute("aria-pressed", b.getAttribute("data-lang") === L ? "true" : "false");
    }
  };

  const setState = (s) => {
    state = s;
    render();
  };

  const read = (resp) =>
    resp.json().then((j) => {
      if (!resp.ok || !j || j.ok !== true || typeof j.state !== "string") throw new Error("bad");
      return j;
    });

  const check = () => {
    lastAction = check;
    setState("loading");
    fetch(FN + "?t=" + encodeURIComponent(token), {
      method: "GET",
      headers: { "Accept": "application/json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    }).then(read).then((j) => {
      if (j.lang === "ru" || j.lang === "en" || j.lang === "th") serverLang = j.lang;
      const s = j.state;
      setState(s === "active" || s === "already" || s === "test" ? s : "invalid");
    }).catch(() => setState("error"));
  };

  const confirmUnsubscribe = () => {
    lastAction = confirmUnsubscribe;
    setState("sending");
    // text/plain — «простой» запрос без предварительного OPTIONS.
    fetch(FN, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ t: token }),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    }).then(read).then((j) => {
      const s = j.state;
      setState(s === "done" || s === "already" || s === "test" ? s : "invalid");
    }).catch(() => setState("error"));
  };

  const start = () => {
    for (const b of document.querySelectorAll(".langs button")) {
      b.addEventListener("click", (ev) => {
        chosen = ev.currentTarget.getAttribute("data-lang");
        render();
      });
    }
    el("go").addEventListener("click", () => {
      if (state === "active") confirmUnsubscribe();
    });
    el("retry").addEventListener("click", () => {
      if (lastAction) lastAction();
    });
    render();
    if (state === "loading") check();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
