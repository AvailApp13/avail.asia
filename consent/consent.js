// Страница согласия партнёра avail.asia/consent/?k=КОД (CRM, этап 9;
// docs/crm/phase9_contract.md §8, §13). Заменяет заглушку этапа 5.
//
// Порядок:
//  1) код из ?k= (как crm.norm_code: без пробелов, заглавными); нет кода —
//     «Ссылка неполная»;
//  2) вход: ЧИТАЕМ сессию веб-версии Avail на этом сайте
//     (localStorage['sb-paikboidnrgthyxpwdrk-auth-token']). Никогда не
//     обновляем и не записываем её: обновление сменило бы ключ входа и
//     разлогинило веб-версию. Нет входа или вход устарел — «Войдите»: кнопка
//     открывает /app/ в новой вкладке; страница слушает событие storage и
//     возвращение на вкладку и сама продолжает, когда вход появился;
//  3) crm_public_consent_get с JWT пользователя → экран по состоянию:
//     pending (текст согласия, флажок, «Разрешаю»), given («Отозвать» с
//     подтверждением), revoked / expired / cancelled, wrong_account, invalid;
//  4) «Разрешаю» → crm_public_consent_give (версия текста + язык страницы),
//     «Отозвать» → crm_public_consent_revoke.
// Почта, код сверх адреса, имена сотрудников не показываются. Все тексты —
// через textContent (никакого innerHTML).
(function () {
  "use strict";

  var API = "https://paikboidnrgthyxpwdrk.supabase.co/rest/v1/rpc/";
  // Публичный ключ anon — тот же, что в приложении и на /i/
  // (lib/core/supabase/supabase_config.dart). Секретом не является.
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWtib2lkbnJndGh5eHB3ZHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTM2NDksImV4cCI6MjA5NjA2OTY0OX0.4RcHFtSg1lxytBEk4HrWaN_dtmshcTfVWd2VVf8LaO4";
  // Ключ, под которым supabase_flutter (веб-версия /app/) хранит вход.
  var SESSION_KEY = "sb-paikboidnrgthyxpwdrk-auth-token";
  var RELOAD_KEY = "avail.consent.reloaded";
  var LANGS = ["ru", "en", "th", "zh", "vi", "id", "ms", "km"];
  var LOCALE = { ru: "ru-RU", en: "en-GB", th: "th-TH", zh: "zh-CN", vi: "vi-VN", id: "id-ID", ms: "ms-MY", km: "km-KH" };
  var CODE_RE = /^[0-9A-Z-]{3,32}$/;
  var SCREENS = ["loading", "nolink", "signin", "pending", "given", "closed", "wrong", "invalid", "blocked", "error"];
  var TIMEOUT_MS = 15000;
  // Вход, который истекает меньше чем через 30 с, считаем устаревшим.
  var SKEW_MS = 30000;
  var T = self.AVAIL_CONSENT_T || {};
  var VERSION = String(self.AVAIL_CONSENT_VERSION || "1");

  // ---------- мелочи ----------
  var el = function (id) { return document.getElementById(id); };
  var txt = function (id, s) { var e = el(id); e.textContent = s == null ? "" : String(s); return e; };
  var show = function (id, on) { el(id).hidden = !on; };

  function norm(raw) {
    if (typeof raw !== "string") return "";
    var c = raw.replace(/\s+/g, "").toUpperCase();
    return CODE_RE.test(c) ? c : "";
  }

  function sget(store, k) {
    try { return store ? store.getItem(k) : null; } catch (e) { return null; }
  }
  function sset(store, k, v) {
    try { if (store) store.setItem(k, v); return true; } catch (e) { return false; }
  }
  function sdel(store, k) {
    try { if (store) store.removeItem(k); } catch (e) { /* приватное окно */ }
  }
  var LS = null, SS = null;
  try { LS = localStorage; } catch (e) { LS = null; }
  try { SS = typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch (e) { SS = null; }

  function okLang(l) { return LANGS.indexOf(l) >= 0; }
  function twoLetters(x) {
    var l = String(x || "").slice(0, 2).toLowerCase();
    return l === "in" ? "id" : l;
  }
  // ?lang= → выбор на сайте (avail.lang) → язык браузера → английский.
  function pickLang(q) {
    var l = twoLetters(q);
    if (okLang(l)) return l;
    l = sget(LS, "avail.lang");
    if (okLang(l)) return l;
    var nav = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < nav.length; i++) {
      l = twoLetters(nav[i]);
      if (okLang(l)) return l;
    }
    return "en";
  }

  function b64json(part) {
    try {
      var s = part.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4) s += "=";
      var j = JSON.parse(decodeURIComponent(escape(atob(s))));
      return j && typeof j === "object" ? j : null;
    } catch (e) {
      return null;
    }
  }

  // Вход веб-версии: только чтение. → null (нет входа) или
  // {token, uid, anon, expired}.
  function readSession() {
    var raw = sget(LS, SESSION_KEY);
    if (!raw) return null;
    var j;
    try { j = JSON.parse(raw); } catch (e) { return null; }
    if (j && typeof j === "object" && j.currentSession && typeof j.currentSession === "object") j = j.currentSession;
    if (!j || typeof j !== "object" || typeof j.access_token !== "string") return null;
    var parts = j.access_token.split(".");
    if (parts.length !== 3) return null;
    var claims = b64json(parts[1]) || {};
    var exp = typeof j.expires_at === "number" ? j.expires_at : typeof claims.exp === "number" ? claims.exp : 0;
    var user = j.user && typeof j.user === "object" ? j.user : {};
    var uid = typeof user.id === "string" ? user.id : typeof claims.sub === "string" ? claims.sub : "";
    return {
      token: j.access_token,
      uid: uid,
      anon: user.is_anonymous === true || claims.is_anonymous === true || !uid,
      expired: !exp || exp * 1000 <= Date.now() + SKEW_MS,
    };
  }

  // ---------- состояние ----------
  var params;
  try {
    params = new URLSearchParams(location.search || "");
  } catch (e) {
    params = { get: function () { return null; } };
  }
  var code = norm(params.get("k") || "");
  var L = pickLang(params.get("lang"));
  var cur = "loading";
  var view = { kind: "loading" }; // что сейчас на экране (для смены языка)
  var usedToken = null; // с каким входом спрашивали сервер
  var busy = false;

  function t(k) {
    var d = T[L] || T.en || {};
    var v = d[k];
    if (v == null && T.en) v = T.en[k];
    return v == null ? "" : String(v);
  }

  function fmtDate(iso) {
    var d = new Date(String(iso || ""));
    if (isNaN(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat(LOCALE[L] || "en-GB", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
      }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function screen(name) {
    cur = name;
    for (var i = 0; i < SCREENS.length; i++) show("s_" + SCREENS[i], SCREENS[i] === name);
  }

  // Все тексты текущего языка + то, что зависит от ответа сервера.
  function paint() {
    document.documentElement.lang = L;
    document.title = "Avail — " + t("title");
    el("lang").value = L;
    txt("lang_label", t("lang"));
    txt("loading_text", t("loading"));
    txt("nolink_title", t("nolink_title"));
    txt("nolink_text", t("nolink_text"));
    txt("nolink_home", t("home"));
    txt("signin_title", t("signin_title"));
    txt("signin_btn", view.expired ? t("open_btn") : t("signin_btn"));
    el("signin_btn").href = view.expired ? "/app/" : "/app/#/home/profile/login";
    txt("signin_text", view.expired ? t("signin_expired") : t("signin_text"));
    txt("signin_hint", t("signin_hint"));
    txt("pending_title", t("title"));
    txt("intro_a", t("intro_a"));
    txt("company", view.company || "");
    txt("intro_b", t("intro_b"));
    for (var i = 1; i <= 6; i++) txt("p" + i, t("p" + i).replace("{credits}", String(view.credits || 100)));
    txt("privacy_a", t("privacy_a"));
    txt("privacy_link", t("privacy_link"));
    txt("privacy_b", t("privacy_b"));
    txt("agree_text", t("agree"));
    txt("allow", busy && cur === "pending" ? t("sending") : t("allow"));
    el("allow").disabled = busy || !el("agree").checked;
    txt("given_title", view.just ? t("done_title") : t("given_title"));
    txt("given_text", view.just ? t("done_text") : "");
    show("given_text", !!view.just);
    var gd = fmtDate(view.givenAt);
    txt("given_date", gd ? t("given_date").replace("{date}", gd) : "");
    show("given_date", !view.just && !!gd);
    txt("revoke", t("revoke"));
    txt("revoke_q", t("revoke_q"));
    txt("revoke_yes", busy && cur === "given" ? t("sending") : t("revoke_yes"));
    txt("revoke_no", t("revoke_no"));
    el("revoke_yes").disabled = busy;
    if (view.kind === "revoked") {
      txt("closed_title", t("revoked_title"));
      txt("closed_text", t("revoked_text"));
    } else {
      txt("closed_title", t("closed_title"));
      txt("closed_text", t("closed_text"));
    }
    txt("closed_home", t("home"));
    txt("wrong_title", t("wrong_title"));
    txt("wrong_text", t("wrong_text"));
    txt("wrong_btn", t("signin_btn"));
    txt("wrong_hint", t("signin_hint"));
    txt("invalid_title", t("invalid_title"));
    txt("invalid_text", t("invalid_text"));
    txt("invalid_home", t("home"));
    txt("blocked_title", t("blocked_title"));
    txt("blocked_text", t("blocked_text"));
    txt("error_title", t("error_title"));
    txt("error_text", t(view.msg || "net"));
    txt("retry", t("retry"));
    show("revoke_box", cur === "given" && !!view.confirm);
    show("revoke", cur === "given" && !view.confirm && view.canRevoke !== false);
    txt("pending_msg", view.pendingMsg ? t(view.pendingMsg) : "");
    show("pending_msg", !!view.pendingMsg);
    txt("given_msg", view.givenMsg ? t(view.givenMsg) : "");
    show("given_msg", !!view.givenMsg);
    txt("terms", t("terms"));
    txt("privacy", t("privacy"));
  }

  function go(name, v) {
    view = v || { kind: name };
    screen(name);
    paint();
  }

  // ---------- сервер ----------
  // → Promise<{status, json}>; сеть упала / нет ответа → reject.
  function call(fn, body, token) {
    var ctl = null, timer = null;
    try { ctl = typeof AbortController !== "undefined" ? new AbortController() : null; } catch (e) { ctl = null; }
    var init = {
      method: "POST",
      headers: {
        "apikey": ANON,
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };
    if (ctl) {
      init.signal = ctl.signal;
      timer = setTimeout(function () { try { ctl.abort(); } catch (e) { /* ничего */ } }, TIMEOUT_MS);
    }
    return fetch(API + fn, init).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.text().then(function (s) {
        var j = null;
        try { j = JSON.parse(s); } catch (e) { j = null; }
        return { status: r.status, json: j };
      });
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  function signin(expired) {
    usedToken = null;
    go("signin", { kind: "signin", expired: !!expired });
  }

  // Ответ ConsentPublic или отказ → экран. where: "get" | "give" | "revoke".
  function apply(res, where) {
    var j = res && res.json;
    if (res && res.status === 401) return signin(true);
    if (!j || typeof j !== "object" || Array.isArray(j)) return failed(where, "net");
    if (j.ok === false) return refusal(j, where);
    var st = String(j.state || "");
    if (st === "pending") {
      el("agree").checked = false;
      return go("pending", {
        kind: "pending",
        company: typeof j.company_name === "string" ? j.company_name : "",
        credits: num(j.monthly_credits),
      });
    }
    if (st === "given") {
      sdel(SS, RELOAD_KEY);
      return go("given", {
        kind: "given",
        just: where === "give",
        givenAt: j.given_at,
        canRevoke: j.can_revoke !== false,
      });
    }
    if (st === "revoked") return go("closed", { kind: "revoked" });
    if (st === "expired" || st === "cancelled") return go("closed", { kind: st });
    if (st === "wrong_account") return go("wrong", { kind: "wrong" });
    if (st === "invalid") return go("invalid", { kind: "invalid" });
    return failed(where, "net");
  }

  function num(x) {
    return typeof x === "number" && isFinite(x) && x > 0 ? Math.min(Math.floor(x), 100000) : 100;
  }

  function refusal(j, where) {
    var err = String(j.error || ""), reason = String(j.reason || "");
    if (err === "invalid" && j.field === "text_version" && reason === "stale") {
      // Текст согласия на сервере новее страницы: перезагрузить ОДИН раз.
      if (sget(SS, RELOAD_KEY) !== "1" && sset(SS, RELOAD_KEY, "1")) {
        try { location.reload(); return paint(); } catch (e) { /* ниже — сообщение */ }
      }
      return failed(where, "stale");
    }
    if (err === "wrong_state") {
      if (reason === "consent_expired") return go("closed", { kind: "expired" });
      if (reason === "consent_revoked") return go("closed", { kind: "revoked" });
      if (reason === "consent_cancelled") return go("closed", { kind: "cancelled" });
      return go("blocked", { kind: "blocked" });
    }
    if (err === "forbidden") {
      if (reason === "wrong_account") return go("wrong", { kind: "wrong" });
      return signin(false);
    }
    if (err === "auth" || err === "reauth_required") return signin(true);
    if (err === "cap_reached") return failed(where, "busy");
    return failed(where, "net");
  }

  // Сбой: при загрузке — экран «Не получилось», при нажатии кнопки —
  // сообщение под ней (экран остаётся).
  function failed(where, msg) {
    if (where === "give" && cur === "pending") {
      view.pendingMsg = msg;
      return paint();
    }
    if (where === "revoke" && cur === "given") {
      view.givenMsg = msg;
      return paint();
    }
    go("error", { kind: "error", msg: msg });
  }

  function load() {
    busy = false;
    if (!code) return go("nolink", { kind: "nolink" });
    var s = readSession();
    if (!s || s.anon) return signin(false);
    if (s.expired) return signin(true);
    usedToken = s.token;
    go("loading", { kind: "loading" });
    call("crm_public_consent_get", { p_code: code }, s.token).then(function (r) {
      apply(r, "get");
    }, function () {
      failed("get", "net");
    });
  }

  // Действие кнопкой (give / revoke) с тем же входом.
  function act(fn, body, where) {
    if (busy) return;
    var s = readSession();
    if (!s || s.anon) return signin(false);
    if (s.expired) return signin(true);
    busy = true;
    if (where === "give") view.pendingMsg = null;
    else view.givenMsg = null;
    paint();
    call(fn, body, s.token).then(function (r) {
      busy = false;
      apply(r, where);
    }, function () {
      busy = false;
      failed(where, "net");
    });
  }

  // Вход появился или сменился в другой вкладке → продолжаем сами.
  function recheck() {
    if (cur !== "signin" && cur !== "wrong") return;
    var s = readSession();
    if (!s || s.anon || s.expired) return;
    if (s.token === usedToken) return; // тот же вход — ответ был бы тем же
    load();
  }

  function start() {
    var sel = el("lang");
    sel.addEventListener("change", function () {
      if (!okLang(sel.value)) return;
      L = sel.value;
      sset(LS, "avail.lang", L);
      paint();
    });
    var agree = el("agree");
    agree.addEventListener("change", function () {
      view.pendingMsg = null;
      paint();
    });
    el("allow").addEventListener("click", function () {
      if (!agree.checked) return;
      act("crm_public_consent_give", { p_code: code, p_text_version: VERSION, p_lang: L }, "give");
    });
    el("revoke").addEventListener("click", function () {
      view.confirm = true;
      view.givenMsg = null;
      paint();
    });
    el("revoke_no").addEventListener("click", function () {
      view.confirm = false;
      paint();
    });
    el("revoke_yes").addEventListener("click", function () {
      act("crm_public_consent_revoke", { p_code: code }, "revoke");
    });
    el("retry").addEventListener("click", function () {
      if (view.msg === "stale") {
        try { location.reload(); return; } catch (e) { /* ниже */ }
      }
      load();
    });
    window.addEventListener("storage", function (e) {
      if (!e || e.key == null || e.key === SESSION_KEY) recheck();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "hidden") recheck();
    });
    load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
