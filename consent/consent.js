// Заглушка страницы согласия avail.asia/consent/ (CRM, этап 9 — позже;
// docs/crm/phase5_contract.md §11.5). Только текст на 8 языках: ни
// запросов к серверу, ни форм, ни записи в хранилище, кроме выбора языка
// (avail.lang — общий ключ с сайтом). Всё через textContent.
(function () {
  "use strict";

  var LANGS = ["ru", "en", "th", "zh", "vi", "id", "ms", "km"];
  var T = {
    ru: { lang: "Язык", badge: "Скоро", title: "Согласие на загрузку объявлений",
      text: "Здесь вы сможете разрешить команде Avail загрузить ваши объявления за вас. Эта страница заработает позже.",
      home: "На главную Avail" },
    en: { lang: "Language", badge: "Coming soon", title: "Consent to upload your listings",
      text: "Here you will be able to let the Avail team upload your listings for you. This page will start working later.",
      home: "Go to Avail" },
    th: { lang: "ภาษา", badge: "เร็ว ๆ นี้", title: "ความยินยอมให้ลงประกาศแทน",
      text: "ที่นี่คุณจะอนุญาตให้ทีม Avail ลงประกาศแทนคุณได้ หน้านี้จะเปิดใช้งานในภายหลัง",
      home: "ไปที่หน้าแรก Avail" },
    zh: { lang: "语言", badge: "即将推出", title: "同意代为上传信息",
      text: "您将可以在这里允许 Avail 团队代您上传信息。此页面稍后开放。",
      home: "前往 Avail 首页" },
    vi: { lang: "Ngôn ngữ", badge: "Sắp có", title: "Đồng ý cho đăng tin giúp",
      text: "Tại đây bạn sẽ có thể cho phép đội ngũ Avail đăng tin giúp bạn. Trang này sẽ hoạt động sau.",
      home: "Về trang chủ Avail" },
    id: { lang: "Bahasa", badge: "Segera hadir", title: "Persetujuan unggah iklan",
      text: "Di sini Anda nanti bisa mengizinkan tim Avail mengunggah iklan Anda. Halaman ini akan aktif nanti.",
      home: "Ke beranda Avail" },
    ms: { lang: "Bahasa", badge: "Akan datang", title: "Persetujuan memuat naik iklan",
      text: "Di sini anda akan dapat membenarkan pasukan Avail memuat naik iklan anda. Halaman ini akan berfungsi kemudian.",
      home: "Ke laman utama Avail" },
    km: { lang: "ភាសា", badge: "ឆាប់ៗនេះ", title: "ការយល់ព្រមឱ្យដាក់ការផ្សាយជំនួស",
      text: "នៅទីនេះ អ្នកនឹងអាចអនុញ្ញាតឱ្យក្រុម Avail ដាក់ការផ្សាយជំនួសអ្នក។ ទំព័រនេះនឹងដំណើរការនៅពេលក្រោយ។",
      home: "ទៅទំព័រដើម Avail" },
  };

  var ok = function (l) { return LANGS.indexOf(l) >= 0; };
  var two = function (x) {
    var l = String(x || "").slice(0, 2).toLowerCase();
    return l === "in" ? "id" : l;
  };
  var el = function (id) { return document.getElementById(id); };

  function pick() {
    var q = null;
    try { q = new URLSearchParams(location.search || "").get("lang"); } catch (e) { q = null; }
    var l = two(q);
    if (ok(l)) return l;
    try { l = localStorage.getItem("avail.lang"); } catch (e) { l = null; }
    if (ok(l)) return l;
    var nav = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < nav.length; i++) {
      l = two(nav[i]);
      if (ok(l)) return l;
    }
    return "en";
  }

  var L = pick();

  function render() {
    var t = T[L];
    document.documentElement.lang = L;
    document.title = "Avail — " + t.title;
    el("lang").value = L;
    el("lang_label").textContent = t.lang;
    el("badge").textContent = t.badge;
    el("title").textContent = t.title;
    el("text").textContent = t.text;
    el("home").textContent = t.home;
  }

  function start() {
    var sel = el("lang");
    sel.addEventListener("change", function () {
      if (!ok(sel.value)) return;
      L = sel.value;
      try { localStorage.setItem("avail.lang", L); } catch (e) { /* приватное окно */ }
      render();
    });
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
