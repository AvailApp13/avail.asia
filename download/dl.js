// avail.asia/download: сразу уводит в нужный магазин по устройству.
// iPhone / iPad (в т.ч. iPadOS, который притворяется Mac) → App Store,
// Android → Google Play. Остальным (компьютер) остаётся страница со значками.
(function () {
  "use strict";
  var IOS = "https://apps.apple.com/app/id6466668151";
  var ANDROID = "https://play.google.com/store/apps/details?id=com.asiaavail.avail";
  var ua = navigator.userAgent || "";
  var ipadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || ipadOS) { location.replace(IOS); return; }
  if (/Android/.test(ua)) { location.replace(ANDROID); return; }
  var texts = { ru: "Скачайте бесплатное приложение", th: "ดาวน์โหลดแอปฟรี" };
  var lang = (navigator.language || "en").slice(0, 2);
  document.addEventListener("DOMContentLoaded", function () {
    if (texts[lang]) document.getElementById("txt").textContent = texts[lang];
  });
})();
