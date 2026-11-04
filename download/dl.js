// avail.asia/download: сразу уводит в нужный магазин по устройству.
// iPhone / iPad (в т.ч. iPadOS, который притворяется Mac) → App Store,
// Android → Google Play. Остальным (компьютер) остаётся страница со значками.
//
// Перед переходом записывает обезличенный переход в счётчик
// (public.download_hit, миграция 0091): платформа, источник, метка
// кампании, была ли метка платной рекламы, встроенный браузер приложения.
// Источник: ?s= или utm_source; иначе по метке рекламы (ttclid → tiktok),
// по встроенному браузеру (TikTok, Instagram, Facebook, LINE) или по
// сайту, с которого пришли. Счётчик не задерживает переход дольше 0,4 с.
// В Google Play источник уходит меткой referrer — в Play Console видно,
// сколько установок пришло из TikTok и т. д.
// Метка Meta (fbclid — переходы из Facebook/Instagram) уходит в счётчик
// отдельно: сервер передаёт такие переходы в Meta Conversions API, чтобы
// видеть, какая реклама приводит людей (миграция 0093, функция meta-capi).
(function () {
  "use strict";
  var IOS = "https://apps.apple.com/app/id6466668151";
  var ANDROID = "https://play.google.com/store/apps/details?id=com.asiaavail.avail";
  var API = "https://paikboidnrgthyxpwdrk.supabase.co/rest/v1/rpc/download_hit";
  // Публичный ключ anon — тот же, что в приложении и на страницах /i/, /p/.
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWtib2lkbnJndGh5eHB3ZHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTM2NDksImV4cCI6MjA5NjA2OTY0OX0.4RcHFtSg1lxytBEk4HrWaN_dtmshcTfVWd2VVf8LaO4";

  var ua = navigator.userAgent || "";
  var q;
  try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return null; } }; }

  function clean(v, re) {
    v = (v || "").toLowerCase();
    return re.test(v) ? v : "";
  }

  var inApp = /musical_ly|bytedance|tiktok/i.test(ua) ? "tiktok"
    : /Instagram/.test(ua) ? "instagram"
    : /FBAN|FBAV/.test(ua) ? "facebook"
    : /Line\//.test(ua) ? "line"
    : "";

  var ref = "";
  try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) { ref = ""; }
  var refSource = /tiktok/.test(ref) ? "tiktok"
    : /instagram/.test(ref) ? "instagram"
    : /facebook|fb\.com/.test(ref) ? "facebook"
    : /google\./.test(ref) ? "google"
    : /youtube|youtu\.be/.test(ref) ? "youtube"
    : /threads\./.test(ref) ? "threads"
    : /line\.me/.test(ref) ? "line"
    : /whatsapp/.test(ref) ? "whatsapp"
    : "";

  var paid = !!(q.get("ttclid") || q.get("gclid") ||
    /^(cpc|paid|ads?)$/i.test(q.get("utm_medium") || ""));
  var source = clean(q.get("s") || q.get("utm_source"), /^[a-z0-9_]{1,20}$/)
    || (q.get("ttclid") ? "tiktok" : "")
    || (q.get("gclid") ? "google" : "")
    || inApp || refSource || (q.get("fbclid") ? "meta" : "") || "direct";
  var fbclid = q.get("fbclid") || "";
  if (!/^[A-Za-z0-9_-]{8,500}$/.test(fbclid)) fbclid = "";
  var campaign = (q.get("c") || q.get("utm_campaign") || "");
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(campaign)) campaign = "";

  var ipadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  var platform = (/iPhone|iPad|iPod/.test(ua) || ipadOS) ? "ios"
    : /Android/.test(ua) ? "android" : "other";

  // Метка для Google Play (видна в Play Console → источники установок).
  var playRef = "utm_source=" + source + "&utm_medium=" + (paid ? "paid" : "social") +
    (campaign ? "&utm_campaign=" + campaign : "");
  var target = platform === "ios" ? IOS
    : platform === "android" ? ANDROID + "&referrer=" + encodeURIComponent(playRef)
    : "";

  var gone = false;
  function go() {
    if (gone || !target) return;
    gone = true;
    location.replace(target);
  }

  // Записать переход; keepalive — запрос дойдёт, даже если страница уже ушла.
  try {
    fetch(API, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "apikey": ANON,
        "Authorization": "Bearer " + ANON
      },
      body: JSON.stringify({
        p_platform: platform, p_source: source, p_campaign: campaign || null,
        p_paid: paid, p_in_app: inApp || null, p_fbclid: fbclid || null
      })
    }).then(go, go);
  } catch (e) { /* без счётчика — просто переход */ }
  if (target) setTimeout(go, 400);

  var texts = { ru: "Скачайте бесплатное приложение", th: "ดาวน์โหลดแอปฟรี" };
  var lang = (navigator.language || "en").slice(0, 2);
  document.addEventListener("DOMContentLoaded", function () {
    if (texts[lang]) document.getElementById("txt").textContent = texts[lang];
  });
})();
