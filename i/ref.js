// Страницы приглашения avail.asia/i/ и промокода avail.asia/p/ (CRM, этап 5;
// docs/crm/phase5_contract.md §5.1, §11). Один скрипт на обе страницы:
// <body data-mode="i"> или "p"; вид (приглашение/промокод) после ответа
// сервера берётся из ответа.
//
// Порядок:
//  1) код из ?k= (короткую форму /i/КОД переводит сюда 404.html), ?s=,
//     ?preview=1 (просмотр сотрудником — не считается);
//  2) уже применён в веб-версии (avail_claimed, ≤30 дней) → экран «Готово»
//     со значками магазинов (значки — только здесь);
//  3) встроенный браузер LINE / Facebook / Instagram / TikTok → сначала
//     «Откройте в обычном браузере» (Google не пускает вход оттуда);
//  4) crm_public_hit дважды: при открытии и после первого касания/прокрутки
//     (так сервер отличает человека от сканера ссылок);
//  5) ответ «код есть» → avail_ref в localStorage на 48 ч (его подхватит
//     веб-версия /app/), бонус, кнопки «Зарегистрироваться» / «Войти» —
//     код идёт и в адресе (?ref=…), код текстом с «Копировать».
// Все тексты — через textContent (никакого innerHTML). Названий компаний и
// имён людей сервер сюда не присылает (OQ-8).
(function () {
  "use strict";

  var API = "https://paikboidnrgthyxpwdrk.supabase.co/rest/v1/rpc/";
  // Публичный ключ anon — тот же, что в приложении
  // (lib/core/supabase/supabase_config.dart). Секретом не является.
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWtib2lkbnJndGh5eHB3ZHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTM2NDksImV4cCI6MjA5NjA2OTY0OX0.4RcHFtSg1lxytBEk4HrWaN_dtmshcTfVWd2VVf8LaO4";
  var LANGS = ["ru", "en", "th", "zh", "vi", "id", "ms", "km"];
  var LOCALE = { ru: "ru-RU", en: "en-GB", th: "th-TH", zh: "zh-CN", vi: "vi-VN", id: "id-ID", ms: "ms-MY", km: "km-KH" };
  var DAY_WORD = { th: "วัน", zh: "天", vi: "ngày", id: "hari", ms: "hari", km: "ថ្ងៃ" };
  var CODE_RE = /^[0-9A-Z-]{3,32}$/;
  var GROUP_RE = /^[0-9A-Z]{12}$/;
  var S_RE = /^[a-z0-9_-]{1,32}$/;
  var VID_RE = /^[A-Za-z0-9_-]{16,64}$/;
  var STATES = ["active", "expired", "not_started", "ended"];
  var HOUR = 3600 * 1000;
  // avail_ref живёт 48 ч: срок считает веб-версия по полю ts.
  var CLAIMED_TTL = 30 * 24 * HOUR;
  var TIMEOUT_MS = 12000;
  var APP = "/app/";
  var SCREENS = ["loading", "nocode", "enter", "inapp", "main", "invalid", "done"];
  var EVENTS = ["pointerdown", "touchstart", "keydown", "scroll", "focusin"];
  var T = self.AVAIL_REF_T || {};

  // ---------- мелочи ----------
  var el = function (id) { return document.getElementById(id); };
  var txt = function (id, s) { var e = el(id); e.textContent = s; return e; };
  var show = function (id, on) { el(id).hidden = !on; };
  var num = function (x) {
    return typeof x === "number" && isFinite(x) && x > 0 ? Math.min(Math.floor(x), 100000) : 0;
  };

  // Как crm.norm_code на сервере: без пробелов, заглавными; I/L/O и дефисы
  // в 12-значных кодах сервер поправит сам и вернёт настоящий код.
  function norm(raw) {
    if (typeof raw !== "string") return "";
    var c = raw.replace(/\s+/g, "").toUpperCase();
    return CODE_RE.test(c) ? c : "";
  }

  function sget(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function sset(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }
  function sjson(k) {
    var v = sget(k);
    if (!v) return null;
    try {
      var j = JSON.parse(v);
      return j && typeof j === "object" ? j : null;
    } catch (e) {
      return null;
    }
  }

  function randomId() {
    var b = new Uint8Array(16), i, s = "";
    try {
      crypto.getRandomValues(b);
    } catch (e) {
      for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    }
    for (i = 0; i < 16; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Номер посетителя (22 знака): один на браузер, общий с /app/.
  function visitor() {
    var v = sget("avail_vid");
    if (v && VID_RE.test(v)) return v;
    v = randomId();
    sset("avail_vid", v);
    return v;
  }

  function okLang(l) { return LANGS.indexOf(l) >= 0; }
  function twoLetters(x) {
    var l = String(x || "").slice(0, 2).toLowerCase();
    return l === "in" ? "id" : l; // старый код индонезийского (Android)
  }
  // ?lang= → выбор на сайте (avail.lang, общий ключ с витриной) → язык
  // браузера → английский.
  function pickLang(q) {
    var l = twoLetters(q);
    if (okLang(l)) return l;
    l = sget("avail.lang");
    if (okLang(l)) return l;
    var nav = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < nav.length; i++) {
      l = twoLetters(nav[i]);
      if (okLang(l)) return l;
    }
    return "en";
  }

  function inAppName(ua) {
    ua = String(ua || "");
    if (/\bLine\//.test(ua)) return "LINE";
    if (/Instagram/.test(ua)) return "Instagram";
    if (/FBAN|FBAV|FB_IAB|FBIOS/.test(ua)) return "Facebook";
    if (/musical_ly|BytedanceWebview|TikTok|trill_/i.test(ua)) return "TikTok";
    return null;
  }

  // ---------- состояние ----------
  var mode = document.body && document.body.getAttribute("data-mode") === "p" ? "p" : "i";
  var params;
  try {
    params = new URLSearchParams(location.search || "");
  } catch (e) {
    params = { get: function () { return null; } };
  }
  var rawK = params.get("k") || "";
  var code = norm(rawK);
  var sRaw = String(params.get("s") || "").toLowerCase();
  var s = S_RE.test(sRaw) ? sRaw : "";
  var preview = params.get("preview") === "1";
  var qLang = params.get("lang");
  var L = pickLang(qLang);
  var app = inAppName(navigator.userAgent);
  var vid = visitor();

  var screen = "loading";
  var hitState = "pending"; // pending | valid | invalid | unknown | rate_limited
  var hit = null;
  var claimed = null;
  var inappDismissed = false;
  var interacted = false;
  var enterBusy = false;
  var enterMsg = null;
  var flash = {};

  function t(key, vars) {
    var s0 = (T[L] && T[L][key]) || (T.en && T.en[key]) || "";
    if (!vars) return s0;
    return s0.replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }

  // «3 дня» — с неразрывным пробелом, чтобы число не отрывалось от слова.
  function days(n) {
    var NB = "\u00a0";
    if (L === "ru") {
      var m10 = n % 10, m100 = n % 100;
      return n + NB + (m10 === 1 && m100 !== 11 ? "день"
        : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "дня" : "дней");
    }
    if (L === "en") return n + NB + (n === 1 ? "day" : "days");
    return n + NB + (DAY_WORD[L] || "days");
  }
  function dayCount() {
    return Math.max(1, Math.round(((hit && hit.hours) || 72) / 24));
  }

  function fmtDate(iso) {
    var d = new Date(iso || "");
    if (isNaN(d.getTime())) return "";
    try {
      var opt = { day: "numeric", month: "long", timeZone: "Asia/Bangkok" };
      if (new Date().getFullYear() !== d.getFullYear()) opt.year = "numeric";
      return new Intl.DateTimeFormat(LOCALE[L] || "en-GB", opt).format(d);
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function kindNow() {
    return hit ? hit.kind : mode === "p" ? "promo" : "invite";
  }
  // Приглашения — группами по 4 (7KQ2 M9XA P4TD), промокоды — как есть.
  function grouped(c) {
    return kindNow() !== "promo" && GROUP_RE.test(c) ? c.slice(0, 4) + " " + c.slice(4, 8) + " " + c.slice(8) : c;
  }
  function pageUrl() {
    var origin = location.origin || "https://avail.asia";
    return origin + "/" + (kindNow() === "promo" ? "p" : "i") + "/?k=" + encodeURIComponent(code) +
      (s ? "&s=" + encodeURIComponent(s) : "");
  }
  function appUrl(route) {
    var q = code ? "?ref=" + encodeURIComponent(code) + (s ? "&ref_s=" + encodeURIComponent(s) : "") : "";
    return APP + q + "#/home/profile/" + route;
  }

  function refHost() {
    var r = "";
    try { r = document.referrer || ""; } catch (e) { r = ""; }
    var m = /^https?:\/\/([^\/?#]+)/i.exec(r);
    if (!m) return null;
    var h = m[1].slice(m[1].lastIndexOf("@") + 1).replace(/:\d+$/, "").toLowerCase();
    if (!h || h.length > 100 || h === String(location.hostname || "").toLowerCase()) return null;
    return h;
  }

  // ---------- сервер ----------
  function post(fn, body) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
    var done = function (j) {
      if (timer) clearTimeout(timer);
      return j;
    };
    var p;
    try {
      p = fetch(API + fn, {
        method: "POST",
        headers: {
          "apikey": ANON,
          "Authorization": "Bearer " + ANON,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: ctl ? ctl.signal : undefined,
      });
    } catch (e) {
      return Promise.resolve(done(null));
    }
    return p.then(function (r) {
      return r.json().catch(function () { return null; });
    }).catch(function () {
      return null;
    }).then(done);
  }

  function sendHit(interaction) {
    return post("crm_public_hit", {
      p_code: code,
      p_visitor: vid,
      p_interaction: !!interaction,
      p_referrer_host: refHost(),
      p_preview: preview,
    });
  }

  function readClaimed() {
    var c = sjson("avail_claimed");
    if (!c || c.code !== code) return null;
    var ts = Number(c.ts), now = Date.now();
    if (!(ts > 0) || now - ts > CLAIMED_TTL || ts - now > HOUR) return null;
    return {
      status: String(c.status || ""),
      credited: num(c.credited),
      after: num(c.pending_after_listing),
      held: num(c.held_amount),
    };
  }

  function onHit(j) {
    if (j && j.ok === true && j.valid === true) {
      hitState = "valid";
      hit = {
        kind: j.kind === "promo" ? "promo" : "invite",
        test: j.test === true,
        state: STATES.indexOf(j.state) >= 0 ? j.state : "",
        bonusNow: num(j.bonus_now),
        bonusAfter: num(j.bonus_after_listing),
        hours: num(j.listing_hours) || 72,
        startsAt: typeof j.starts_at === "string" ? j.starts_at : null,
      };
      if (typeof j.code === "string" && CODE_RE.test(j.code)) code = j.code;
      // Код сохраняем для веб-версии: она применит его после регистрации.
      // Просмотр сотрудником ничего не сохраняет.
      if (!preview) {
        sset("avail_ref", JSON.stringify({ code: code, kind: hit.kind, s: s || null, ts: Date.now() }));
      }
      if (!claimed) claimed = readClaimed();
      if (claimed) screen = "done";
      else if (screen === "loading") screen = "main";
    } else if (j && j.ok === true && j.valid === false) {
      hitState = "invalid";
      if (screen !== "done") screen = "invalid";
    } else if (hitState !== "valid" && hitState !== "invalid") {
      // Нет связи или слишком много запросов: код и кнопки всё равно
      // показываем (регистрация работает, код уйдёт в адресе), без бонуса.
      hitState = j && j.error === "rate_limited" ? "rate_limited" : "unknown";
      if (screen === "loading") screen = "main";
    }
    render();
  }

  function onFirstInteraction() {
    if (interacted) return;
    interacted = true;
    for (var i = 0; i < EVENTS.length; i++) window.removeEventListener(EVENTS[i], onFirstInteraction, true);
    if (hitState === "invalid") return;
    sendHit(true).then(function (j) {
      // Первый запрос не дошёл, а этот дошёл — заполняем страницу.
      if (hitState !== "valid" && j && j.ok === true && j.valid === true) onHit(j);
    });
  }

  // ---------- копирование ----------
  function copy(text, btnId, inputId) {
    var finish = function (ok) {
      flash[btnId] = ok ? "copied" : "copy_fail";
      render();
      setTimeout(function () {
        delete flash[btnId];
        render();
      }, 2500);
    };
    var fallback = function () {
      var inp = el(inputId || "clip");
      var ok = false;
      try {
        inp.value = text;
        inp.focus();
        inp.select();
        if (inp.setSelectionRange) inp.setSelectionRange(0, text.length);
        ok = document.execCommand("copy") === true;
      } catch (e) {
        ok = false;
      }
      finish(ok);
    };
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(text).then(function () { finish(true); }, fallback);
        return;
      }
    } catch (e) {
      // нет доступа к буферу — запасной путь
    }
    fallback();
  }

  // ---------- ввод промокода (/p/ без кода) ----------
  function check() {
    if (enterBusy) return;
    var c = norm(el("enter_input").value);
    if (!c) {
      enterMsg = "invalid";
      render();
      return;
    }
    enterBusy = true;
    enterMsg = null;
    render();
    post("crm_public_hit", { p_code: c, p_visitor: vid, p_interaction: true, p_referrer_host: null, p_preview: false })
      .then(function (j) {
        if (j && j.ok === true && j.valid === true) {
          var cc = typeof j.code === "string" && CODE_RE.test(j.code) ? j.code : c;
          var lq = okLang(twoLetters(qLang)) ? "&lang=" + twoLetters(qLang) : "";
          enterBusy = false;
          location.replace("/" + (j.kind === "promo" ? "p" : "i") + "/?k=" + encodeURIComponent(cc) +
            (s ? "&s=" + encodeURIComponent(s) : "") + lq);
          return;
        }
        enterBusy = false;
        enterMsg = j && j.ok === true && j.valid === false ? "invalid" : "try_later";
        render();
      });
  }

  // ---------- отрисовка ----------
  function render() {
    var promo = kindNow() === "promo";
    document.documentElement.lang = L;
    document.title = t(screen === "enter" || promo ? "doc_promo" : "doc_invite");
    var sel = el("lang");
    if (sel.value !== L) sel.value = L;
    txt("lang_label", t("lang_label"));
    for (var i = 0; i < SCREENS.length; i++) show("s_" + SCREENS[i], SCREENS[i] === screen);
    txt("test_banner", t("test"));
    show("test_banner", hitState === "valid" && hit.test && screen !== "done");
    txt("preview_banner", t("preview"));
    show("preview_banner", preview && !!code);
    txt("loading_text", t("loading"));

    // нет кода в ссылке /i/
    txt("nocode_title", t("nocode_t"));
    txt("nocode_text", t("nocode"));
    txt("nocode_btn", t("nocode_btn"));

    // /p/ без кода: поле ввода
    txt("enter_badge", t("badge_promo"));
    txt("enter_title", t("enter_t"));
    txt("enter_hint", t("enter_hint"));
    txt("enter_label", t("enter_t"));
    el("enter_input").placeholder = t("enter_ph");
    var eb = txt("enter_btn", t(enterBusy ? "checking" : "check"));
    eb.disabled = enterBusy;
    txt("enter_msg", enterMsg ? t(enterMsg) : "");
    show("enter_msg", !!enterMsg);
    txt("enter_noreg", t("noreg"));

    // встроенный браузер
    txt("inapp_title", t("inapp_t"));
    txt("inapp_text", t("inapp", { app: app || "" }));
    // LINE сам открывает обычный браузер по метке openExternalBrowser=1.
    var open = txt("inapp_open", t("inapp_open"));
    open.href = pageUrl() + "&openExternalBrowser=1";
    show("inapp_open", app === "LINE");
    txt("inapp_how", t("inapp_how"));
    txt("inapp_1", t("inapp_1"));
    txt("inapp_2", t("inapp_2"));
    txt("inapp_or", t("or"));
    // В поле — без https:// (иначе на телефоне не помещается); копируется полная ссылка.
    el("inapp_url").value = pageUrl().replace(/^https?:\/\//, "");
    var ic = txt("inapp_copy", t(flash.inapp_copy || "copy_link"));
    ic.className = app === "LINE" ? "btn btn-sec" : "btn btn-primary";
    txt("inapp_paste", t("inapp_paste"));
    txt("inapp_locked", "🔒 " + t("inapp_locked"));
    txt("inapp_here", t("inapp_here"));

    // главный экран
    txt("badge", t(promo ? "badge_promo" : "badge_invite"));
    txt("title", promo ? t("title_promo", { code: code }) : t("title_invite"));
    txt("lead", t("lead"));
    var st = hitState === "valid" ? hit.state : "";
    var note = st === "expired" ? t("expired")
      : st === "not_started" ? t("promo_not_started", { date: fmtDate(hit.startsAt) })
      : st === "ended" ? t("promo_ended") : "";
    txt("state_text", note);
    show("state_text", !!note);
    var bonusOn = hitState === "valid" && st === "active" && (hit.bonusNow > 0 || hit.bonusAfter > 0);
    var nNow = bonusOn ? hit.bonusNow : 0, nAfter = bonusOn ? hit.bonusAfter : 0;
    show("bonus", bonusOn);
    txt("bonus_title", t("bonus_t"));
    txt("bonus_now_n", "+" + nNow);
    txt("bonus_now_t", t("bonus_now"));
    show("tile_now", nNow > 0);
    txt("bonus_after_n", "+" + nAfter);
    txt("bonus_after_t", t("bonus_after", { d: days(dayCount()) }));
    show("tile_after", nAfter > 0);
    el("tiles").className = nNow > 0 && nAfter > 0 ? "tiles" : "tiles one";
    txt("bonus_note", t("bonus_note"));
    el("reg").href = appUrl("registration");
    txt("reg_1", nNow > 0 ? t("go_bonus", { n: nNow }) : t("go"));
    txt("reg_2", nNow > 0 ? t("go_bonus_sub") : "");
    show("reg_2", nNow > 0);
    txt("have_q", t("have_q"));
    el("login").href = appUrl("login");
    txt("login", t(bonusOn ? "login_bonus" : "login"));
    txt("code_title", t("code_t"));
    txt("code", grouped(code));
    txt("code_copy", t(flash.code_copy || "copy"));
    txt("help", t("help"));

    // код не найден
    txt("invalid_title", t("invalid_t"));
    txt("invalid_text", t("invalid"));
    txt("invalid_code", code ? t("code_t") + ": " + grouped(code) : "");
    show("invalid_code", !!code);
    txt("noreg", t("noreg"));
    txt("other_code", t("other_code"));

    // «Готово» (код уже применён в веб-версии)
    var c = claimed || { status: "", credited: 0, after: 0, held: 0 };
    var paid = c.status === "paid" && c.credited > 0;
    txt("done_title", t("done_t"));
    txt("done_sub", t("done_sub"));
    txt("paid_text", t("paid_box", { n: c.credited }));
    show("paid_box", paid);
    var dn = c.status === "held" ? (c.held > 0 ? t("held", { n: c.held }) : t("held_nonum"))
      : paid ? "" : t("already_claimed");
    txt("done_text", dn);
    show("done_text", !!dn);
    var after = c.status === "paid" || c.status === "held" ? c.after : 0;
    var d = days(dayCount());
    txt("steps_title", t("pending_after", { n: after, d: d }));
    txt("step1", t("step1"));
    txt("step2", t("step2", { d: d }));
    txt("step3", t("step3", { n: after }));
    show("steps", after > 0);
    txt("install_title", t("install_t"));
    txt("sb_app", t("sb_app"));
    txt("sb_google", t("sb_google"));
    txt("install_hint", t("install_hint"));
    txt("done_or", t("or"));
    txt("continue", t("continue"));

    // подвал: условия и политика на языке страницы
    var m = /^([\s\S]*)\{terms\}([\s\S]*)\{privacy\}([\s\S]*)$/.exec(t("legal")) || ["", "", " · ", ""];
    var lp = L === "en" ? "" : L + "/";
    txt("legal_a", m[1]);
    txt("legal_b", m[2]);
    txt("legal_c", m[3]);
    el("terms").href = "/legal/terms/" + lp;
    txt("terms", t("terms"));
    el("privacy").href = "/legal/privacy/" + lp;
    txt("privacy", t("privacy"));
    show("legal", screen !== "done" && screen !== "loading");
  }

  function start() {
    var sel = el("lang");
    sel.addEventListener("change", function () {
      var v = sel.value;
      if (!okLang(v)) return;
      L = v;
      sset("avail.lang", v);
      render();
    });
    el("code_copy").addEventListener("click", function () { copy(code, "code_copy", null); });
    el("inapp_copy").addEventListener("click", function () { copy(pageUrl(), "inapp_copy", "inapp_url"); });
    el("inapp_url").addEventListener("focus", function () {
      try { el("inapp_url").select(); } catch (e) { /* ничего */ }
    });
    el("inapp_here").addEventListener("click", function () {
      inappDismissed = true;
      screen = hitState === "invalid" ? "invalid" : hitState === "pending" ? "loading" : "main";
      render();
    });
    el("enter_btn").addEventListener("click", check);
    el("enter_input").addEventListener("keydown", function (e) {
      if (e && e.key === "Enter") {
        if (e.preventDefault) e.preventDefault();
        check();
      }
    });

    if (!rawK.trim()) {
      screen = mode === "p" ? "enter" : "nocode";
      render();
      return;
    }
    if (!code) {
      hitState = "invalid";
      screen = "invalid";
      render();
      return;
    }
    claimed = readClaimed();
    screen = claimed ? "done" : app && !inappDismissed ? "inapp" : "loading";
    render();
    for (var i = 0; i < EVENTS.length; i++) {
      window.addEventListener(EVENTS[i], onFirstInteraction, { capture: true, passive: true });
    }
    sendHit(false).then(onHit);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
