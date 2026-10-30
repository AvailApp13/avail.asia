#!/usr/bin/env python3
"""Страницы avail.asia под поиск Google, Яндекса и Bing.

  python3 seo/build_seo.py OUT [--ping]

Каждую ночь (workflow .github/workflows/seo.yml в репозитории сайта
AvailApp13/avail.asia) берёт живые объявления из базы — тем же открытым
ключом, что и страница объявления на сайте, только безопасные поля — и
пересобирает в папке сайта OUT:

- /<язык>/<город>/                 — город: разделы и районы;
- /<язык>/<город>/<раздел>/        — например «Аренда квартир, Пхукет»;
- /<язык>/<город>/<раздел>/<район>/ — «Аренда квартир — Банг Тао, Пхукет»;
- /<язык>/<город>/prices/          — «Цены на Пхукете» за текущий месяц;
- /a/<id>/                         — страница каждого объявления: фото и
  цена в превью WhatsApp/Facebook/LINE, разметка для поиска; приложение
  открывает её само (apple-app-site-association: /a/*);
- sitemap-seo.xml и ключ IndexNow (сигнал Bing и Яндексу).

Всё, что собрано в прошлый раз и больше не нужно (объявление сняли),
удаляется по списку .seo-manifest.json. Остальной сайт не трогается.
Без телефонов и почты продавцов: связь — только через Avail.
"""
import datetime
import hashlib
import html
import json
import os
import re
import sys
import urllib.request

SUPA = "https://paikboidnrgthyxpwdrk.supabase.co"
# Открытый (anon) ключ — тот же, что в site/a/index.html и в приложении.
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB"
        "haWtib2lkbnJndGh5eHB3ZHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0OTM2NDksImV"
        "4cCI6MjA5NjA2OTY0OX0.4RcHFtSg1lxytBEk4HrWaN_dtmshcTfVWd2VVf8LaO4")
ORIGIN = "https://avail.asia"
LANGS = ["ru", "en", "th", "zh", "id", "ms", "vi", "km"]
DEFAULT_LANG = "en"
MANIFEST = ".seo-manifest.json"
APP_STORE = "https://apps.apple.com/app/id6466668151"
PLAY = "https://play.google.com/store/apps/details?id=com.asiaavail.avail"
TZ = datetime.timezone(datetime.timedelta(hours=7))  # Бангкок

# ---- Справочники ----------------------------------------------------------

CITIES = {"Phuket": {"slug": "phuket", "ru": "Пхукет", "en": "Phuket", "th": "ภูเก็ต",
                     "zh": "普吉岛", "id": "Phuket", "ms": "Phuket", "vi": "Phuket", "km": "ភូកេត"}}

# Районы Пхукета: русские — как в справочнике CRM (0082), тайские и
# китайские — общепринятые; остальные языки пишут латиницей.
DISTRICTS = {
    "Bang Tao": ("Банг Тао", "บางเทา", "邦涛"), "Patong": ("Патонг", "ป่าตอง", "芭东"),
    "Karon": ("Карон", "กะรน", "卡伦"), "Kata": ("Ката", "กะตะ", "卡塔"),
    "Kata Noi": ("Ката Ной", "กะตะน้อย", "小卡塔"), "Rawai": ("Раваи", "ราไวย์", "拉威"),
    "Nai Harn": ("Най Харн", "ในหาน", "奈汉"), "Chalong": ("Чалонг", "ฉลอง", "查龙"),
    "Kamala": ("Камала", "กมลา", "卡马拉"), "Surin": ("Сурин", "สุรินทร์", "苏林"),
    "Nai Yang": ("Най Янг", "ในยาง", "奈扬"), "Mai Khao": ("Май Кхао", "ไม้ขาว", "迈考"),
    "Nai Thon": ("Най Тон", "ในทอน", "奈通"), "Layan": ("Лаян", "ลายัน", "拉扬"),
    "Phuket Town": ("Пхукет-Таун", "เมืองภูเก็ต", "普吉镇"), "Kathu": ("Кату", "กะทู้", "卡图"),
    "Panwa": ("Панва", "พันวา", "攀瓦"), "Thalang": ("Таланг", "ถลาง", "他朗"),
    "Pa Khlok": ("Па Клок", "ป่าคลอก", "帕克洛"), "Cherng Talay": ("Черинг Талай", "เชิงทะเล", "称塔莱"),
    "Kalim": ("Калим", "กะหลิม", "卡林"), "Ao Po": ("Ао По", "อ่าวปอ", "奥波"),
    "Koh Kaew": ("Ко Кэу", "เกาะแก้ว", "阁蒄"), "Wichit": ("Вичит", "วิชิต", "威集"),
    "Cape Yamu": ("Мыс Яму", "แหลมยามู", "亚目角"),
}

CATS = {
    "apartments-rent": {"ru": "Аренда квартир", "en": "Apartments for rent", "th": "ห้องพัก คอนโดให้เช่า",
                        "zh": "公寓出租", "id": "Sewa apartemen", "ms": "Sewa apartmen",
                        "vi": "Cho thuê căn hộ", "km": "ផ្ទះល្វែងសម្រាប់ជួល"},
    "apartments-sale": {"ru": "Продажа квартир", "en": "Apartments for sale", "th": "คอนโดขาย",
                        "zh": "公寓出售", "id": "Apartemen dijual", "ms": "Apartmen untuk dijual",
                        "vi": "Bán căn hộ", "km": "ផ្ទះល្វែងលក់"},
    "villas-rent": {"ru": "Аренда вилл", "en": "Villas for rent", "th": "วิลล่าให้เช่า", "zh": "别墅出租",
                    "id": "Sewa vila", "ms": "Sewa vila", "vi": "Cho thuê biệt thự", "km": "វីឡាសម្រាប់ជួល"},
    "villas-sale": {"ru": "Продажа вилл", "en": "Villas for sale", "th": "วิลล่าขาย", "zh": "别墅出售",
                    "id": "Vila dijual", "ms": "Vila untuk dijual", "vi": "Bán biệt thự", "km": "វីឡាលក់"},
    "houses-rent": {"ru": "Аренда домов", "en": "Houses for rent", "th": "บ้านให้เช่า", "zh": "房屋出租",
                    "id": "Sewa rumah", "ms": "Sewa rumah", "vi": "Cho thuê nhà", "km": "ផ្ទះសម្រាប់ជួល"},
    "bikes-rent": {"ru": "Аренда байков", "en": "Scooter and bike rental", "th": "เช่ามอเตอร์ไซค์",
                   "zh": "摩托车租赁", "id": "Sewa motor", "ms": "Sewa motosikal",
                   "vi": "Thuê xe máy", "km": "ជួលម៉ូតូ"},
    "cars-rent": {"ru": "Аренда авто", "en": "Car rental", "th": "เช่ารถยนต์", "zh": "汽车租赁",
                  "id": "Sewa mobil", "ms": "Sewa kereta", "vi": "Thuê ô tô", "km": "ជួលឡាន"},
    "tours": {"ru": "Туры и экскурсии", "en": "Tours and excursions", "th": "ทัวร์", "zh": "旅游和观光",
              "id": "Tur dan ekskursi", "ms": "Lawatan", "vi": "Tour du lịch", "km": "ដំណើរកម្សាន្ត"},
}
GENERIC_CAT = {"ru": "Объявления", "en": "Listings", "th": "ประกาศ", "zh": "信息", "id": "Iklan",
               "ms": "Iklan", "vi": "Tin đăng", "km": "ការផ្សាយ"}

UI = {
    "ru": {"from": "от", "to": "до", "offers": ("предложение", "предложения", "предложений"),
           "all": "Все районы", "prices": "Цены", "prices_title": "Цены на Пхукете — {month}",
           "prices_intro": "Сколько стоит аренда и покупка на Пхукете по районам: по объявлениям в Avail, обновляется каждую ночь. Цена — как указал хозяин: за сутки или за месяц.",
           "district": "Район", "count": "Объявлений", "range": "Цены", "rooms": "комн.", "sea": "м до моря",
           "open": "Открыть в Avail", "write": "Написать хозяину — Avail переведёт на его язык",
           "install": "Скачать Avail", "home": "Avail", "desc_city": "{cats} на Пхукете: {n} {offers} с фото и ценами. Пишите хозяевам на своём языке — Avail переведёт.",
           "desc_list": "{title}. Фото, цены и описание. Пишите хозяину на своём языке — Avail переведёт.",
           "months": ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]},
    "en": {"from": "from", "to": "to", "offers": ("offer", "offers", "offers"), "all": "All districts",
           "prices": "Prices", "prices_title": "Phuket prices — {month}",
           "prices_intro": "How much renting and buying costs in Phuket by district, based on Avail listings and updated every night. Prices are as the owner set them: per day or per month.",
           "district": "District", "count": "Listings", "range": "Prices", "rooms": "rooms", "sea": "m to the sea",
           "open": "Open in Avail", "write": "Message the owner — Avail translates into their language",
           "install": "Get Avail", "home": "Avail", "desc_city": "{cats} in Phuket: {n} {offers} with photos and prices. Message owners in your own language — Avail translates.",
           "desc_list": "{title}. Photos, prices and descriptions. Message the owner in your own language — Avail translates.",
           "months": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]},
    "th": {"from": "เริ่มต้น", "to": "ถึง", "offers": ("รายการ", "รายการ", "รายการ"), "all": "ทุกพื้นที่",
           "prices": "ราคา", "prices_title": "ราคาในภูเก็ต — {month}",
           "prices_intro": "ค่าเช่าและราคาซื้อในภูเก็ตแยกตามพื้นที่ จากประกาศใน Avail อัปเดตทุกคืน ราคาตามที่เจ้าของระบุ: ต่อวันหรือต่อเดือน",
           "district": "พื้นที่", "count": "ประกาศ", "range": "ราคา", "rooms": "ห้อง", "sea": "ม. ถึงทะเล",
           "open": "เปิดใน Avail", "write": "ทักเจ้าของ — Avail แปลเป็นภาษาของเขาให้",
           "install": "ดาวน์โหลด Avail", "home": "Avail", "desc_city": "{cats} ในภูเก็ต: {n} {offers} พร้อมรูปและราคา ทักเจ้าของเป็นภาษาของคุณ — Avail แปลให้",
           "desc_list": "{title} รูป ราคา และรายละเอียด ทักเจ้าของเป็นภาษาของคุณ — Avail แปลให้",
           "months": ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]},
    "zh": {"from": "起", "to": "至", "offers": ("条", "条", "条"), "all": "所有区域", "prices": "价格",
           "prices_title": "普吉岛价格 — {month}",
           "prices_intro": "普吉岛各区域的租房和购房价格，基于 Avail 上的信息，每晚更新。价格按房东填写：按天或按月。",
           "district": "区域", "count": "信息数", "range": "价格", "rooms": "室", "sea": "米到海边",
           "open": "在 Avail 中打开", "write": "联系房东 — Avail 自动翻译成对方的语言",
           "install": "下载 Avail", "home": "Avail", "desc_city": "普吉岛{cats}：{n} {offers}，附照片和价格。用您的语言联系房东 — Avail 自动翻译。",
           "desc_list": "{title}。照片、价格和描述。用您的语言联系房东 — Avail 自动翻译。",
           "months": ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]},
    "id": {"from": "mulai", "to": "hingga", "offers": ("penawaran", "penawaran", "penawaran"), "all": "Semua area",
           "prices": "Harga", "prices_title": "Harga di Phuket — {month}",
           "prices_intro": "Biaya sewa dan beli di Phuket per area, berdasarkan iklan di Avail dan diperbarui setiap malam. Harga sesuai yang ditulis pemilik: per hari atau per bulan.",
           "district": "Area", "count": "Iklan", "range": "Harga", "rooms": "kamar", "sea": "m ke laut",
           "open": "Buka di Avail", "write": "Hubungi pemilik — Avail menerjemahkan ke bahasanya",
           "install": "Unduh Avail", "home": "Avail", "desc_city": "{cats} di Phuket: {n} {offers} dengan foto dan harga. Hubungi pemilik dalam bahasa Anda — Avail menerjemahkan.",
           "desc_list": "{title}. Foto, harga, dan deskripsi. Hubungi pemilik dalam bahasa Anda — Avail menerjemahkan.",
           "months": ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]},
    "ms": {"from": "dari", "to": "hingga", "offers": ("tawaran", "tawaran", "tawaran"), "all": "Semua kawasan",
           "prices": "Harga", "prices_title": "Harga di Phuket — {month}",
           "prices_intro": "Kos sewa dan beli di Phuket mengikut kawasan, berdasarkan iklan di Avail dan dikemas kini setiap malam. Harga seperti yang ditetapkan pemilik: sehari atau sebulan.",
           "district": "Kawasan", "count": "Iklan", "range": "Harga", "rooms": "bilik", "sea": "m ke laut",
           "open": "Buka dalam Avail", "write": "Hubungi pemilik — Avail menterjemah ke bahasanya",
           "install": "Muat turun Avail", "home": "Avail", "desc_city": "{cats} di Phuket: {n} {offers} dengan foto dan harga. Hubungi pemilik dalam bahasa anda — Avail menterjemah.",
           "desc_list": "{title}. Foto, harga dan penerangan. Hubungi pemilik dalam bahasa anda — Avail menterjemah.",
           "months": ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"]},
    "vi": {"from": "từ", "to": "đến", "offers": ("tin", "tin", "tin"), "all": "Tất cả khu vực",
           "prices": "Giá", "prices_title": "Giá ở Phuket — {month}",
           "prices_intro": "Giá thuê và mua ở Phuket theo khu vực, dựa trên tin đăng trên Avail, cập nhật mỗi đêm. Giá theo chủ nhà ghi: theo ngày hoặc theo tháng.",
           "district": "Khu vực", "count": "Tin đăng", "range": "Giá", "rooms": "phòng", "sea": "m đến biển",
           "open": "Mở trong Avail", "write": "Nhắn chủ nhà — Avail dịch sang ngôn ngữ của họ",
           "install": "Tải Avail", "home": "Avail", "desc_city": "{cats} ở Phuket: {n} {offers} có ảnh và giá. Nhắn chủ nhà bằng ngôn ngữ của bạn — Avail sẽ dịch.",
           "desc_list": "{title}. Ảnh, giá và mô tả. Nhắn chủ nhà bằng ngôn ngữ của bạn — Avail sẽ dịch.",
           "months": ["tháng 1", "tháng 2", "tháng 3", "tháng 4", "tháng 5", "tháng 6", "tháng 7", "tháng 8", "tháng 9", "tháng 10", "tháng 11", "tháng 12"]},
    "km": {"from": "ចាប់ពី", "to": "ដល់", "offers": ("ការផ្តល់ជូន", "ការផ្តល់ជូន", "ការផ្តល់ជូន"), "all": "តំបន់ទាំងអស់",
           "prices": "តម្លៃ", "prices_title": "តម្លៃនៅភូកេត — {month}",
           "prices_intro": "តម្លៃជួល និងទិញនៅភូកេតតាមតំបន់ ផ្អែកលើការផ្សាយក្នុង Avail ធ្វើបច្ចុប្បន្នភាពរៀងរាល់យប់។ តម្លៃតាមម្ចាស់កំណត់៖ ក្នុងមួយថ្ងៃ ឬក្នុងមួយខែ។",
           "district": "តំបន់", "count": "ការផ្សាយ", "range": "តម្លៃ", "rooms": "បន្ទប់", "sea": "ម ដល់សមុទ្រ",
           "open": "បើកក្នុង Avail", "write": "ផ្ញើសារទៅម្ចាស់ — Avail បកប្រែជាភាសារបស់គេ",
           "install": "ទាញយក Avail", "home": "Avail", "desc_city": "{cats} នៅភូកេត៖ {n} {offers} មានរូបភាព និងតម្លៃ។ ផ្ញើសារទៅម្ចាស់ជាភាសារបស់អ្នក — Avail បកប្រែ។",
           "desc_list": "{title}។ រូបភាព តម្លៃ និងការពិពណ៌នា។ ផ្ញើសារទៅម្ចាស់ជាភាសារបស់អ្នក — Avail បកប្រែ។",
           "months": ["មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា", "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ"]},
}

# ---- Данные ---------------------------------------------------------------

FIELDS = ("id,name,description,translations_name,translations_description,price,currency,"
          "shown_price,shown_currency,photo,city,district,category,subcategory,item_type,"
          "specifications,source_lang,created_at,updated_at")


def fetch_adverts() -> list:
    out, offset, page = [], 0, 1000
    while True:
        url = (f"{SUPA}/rest/v1/adverts?select={FIELDS}&status=eq.active&is_draft=eq.false"
               f"&order=created_at.desc&limit={page}&offset={offset}")
        req = urllib.request.Request(url, headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = json.load(r)
        out += rows
        if len(rows) < page:
            return out
        offset += page


def cat_slug(a: dict) -> str:
    cat, sub, kind = a.get("category") or "", (a.get("subcategory") or "").lower(), a.get("item_type") or ""
    deal = "sale" if kind in ("sale", "sell", "buy") else "rent"
    if cat == "real_estate":
        if sub in ("villa",):
            return "villas-" + deal
        if sub in ("house", "townhouse"):
            return "houses-" + deal
        return "apartments-" + deal
    if cat == "auto":
        return "cars-rent" if sub in ("car", "cars") else "bikes-rent"
    if cat in ("tours", "excursions"):
        return "tours"
    return re.sub(r"[^a-z0-9-]+", "-", f"{cat}-{sub}-{kind}".lower()).strip("-") or "listings"


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def district_name(d: str, lang: str) -> str:
    names = DISTRICTS.get(d)
    if not names:
        return d
    return {"ru": names[0], "th": names[1], "zh": names[2]}.get(lang, d)


def city_name(c: str, lang: str) -> str:
    return CITIES.get(c, {}).get(lang, c)


def tr(a: dict, field: str, lang: str) -> str:
    t = a.get("translations_" + field) or {}
    v = t.get(lang) if isinstance(t, dict) else None
    return (v or a.get(field) or "").strip()


def price_of(a: dict):
    p = a.get("shown_price") or a.get("price")
    cur = a.get("shown_currency") or a.get("currency") or "THB"
    try:
        return float(p), cur
    except (TypeError, ValueError):
        return None, cur


def money(p: float, cur: str) -> str:
    sym = {"THB": "฿", "USD": "$", "EUR": "€", "RUB": "₽"}.get(cur, cur)
    return f"{int(round(p)):,}".replace(",", " ") + " " + sym


def plural(lang: str, n: int) -> str:
    one, few, many = UI[lang]["offers"]
    if lang != "ru":
        return one if n == 1 else few
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def specs_line(a: dict, lang: str) -> str:
    s = a.get("specifications") or {}
    parts = []
    if s.get("rooms"):
        parts.append(f"{s['rooms']} {UI[lang]['rooms']}")
    if s.get("square"):
        parts.append(f"{s['square']} м²" if lang == "ru" else f"{s['square']} m²")
    if s.get("seaMeters"):
        parts.append(f"{s['seaMeters']} {UI[lang]['sea']}")
    return " · ".join(parts)


# ---- Вёрстка --------------------------------------------------------------

CSS = """:root{--bg:#141218;--surface:#1c1b1f;--raised:#25232b;--line:rgba(243,241,247,.09);--fg:#f3f1f7;--muted:#a6a1b2;--pink:#EC3B77;--blue:#3AA5F0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 Manrope,system-ui,-apple-system,"Segoe UI","Noto Sans","Noto Sans Thai","PingFang SC","Noto Sans Khmer",sans-serif}
a{color:inherit}.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.logo{font-weight:800;font-size:20px;text-decoration:none;background:linear-gradient(90deg,var(--pink),var(--blue));-webkit-background-clip:text;background-clip:text;color:transparent}
.langs{display:flex;flex-wrap:wrap;gap:6px;font-size:13px}.langs a{color:var(--muted);text-decoration:none}.langs b{color:var(--fg)}
.crumbs{font-size:13px;color:var(--muted);margin:16px 0 4px}.crumbs a{color:var(--muted)}
h1{font-size:28px;line-height:1.2;margin:4px 0 8px}.lead{color:var(--muted);margin:0 0 18px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}.chip{padding:6px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:14px;background:var(--surface)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;text-decoration:none;display:block}
.card img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:var(--raised)}
.card .b{padding:10px 12px}.price{font-weight:800;font-size:18px}.t{margin:2px 0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.m{color:var(--muted);font-size:13px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:24px 0}.btn{padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700;background:linear-gradient(90deg,var(--pink),var(--blue));color:#fff}.btn.o{background:var(--surface);border:1px solid var(--line);color:var(--fg)}
table{width:100%;border-collapse:collapse;margin:8px 0 24px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600;font-size:13px}
.photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin:12px 0}.photos img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;background:var(--raised)}
.desc{white-space:pre-line;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px}
footer{color:var(--muted);font-size:13px;padding:28px 0;border-top:1px solid var(--line);margin-top:32px}
@media(max-width:520px){h1{font-size:23px}.grid{grid-template-columns:1fr 1fr;gap:10px}.card .b{padding:8px}.price{font-size:16px}}"""


def esc(s) -> str:
    return html.escape(str(s or ""), quote=True)


def page(lang: str, path: str, title: str, desc: str, body: str, *, alternates=None,
         image: str = "", ld=None, html_lang: str = "") -> str:
    url = ORIGIN + path
    alt = ""
    for l, p in (alternates or {}).items():
        alt += f'<link rel="alternate" hreflang="{l}" href="{ORIGIN}{p}">\n'
    if alternates and DEFAULT_LANG in alternates:
        alt += f'<link rel="alternate" hreflang="x-default" href="{ORIGIN}{alternates[DEFAULT_LANG]}">\n'
    lds = "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n'
                  for x in (ld or []))
    img = f'<meta property="og:image" content="{esc(image)}">\n' if image else ""
    return f"""<!doctype html>
<html lang="{html_lang or lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{url}">
{alt}<meta property="og:site_name" content="Avail">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
{img}<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/assets/img/logo.png">
<style>{CSS}</style>
{lds}</head><body><div class="wrap">
{body}
<footer>Avail · avail.asia · <a href="/legal/privacy/">Privacy</a></footer>
</div></body></html>
"""


def header(lang: str, paths: dict) -> str:
    links = " ".join(f"<b>{l.upper()}</b>" if l == lang else f'<a href="{p}">{l.upper()}</a>'
                     for l, p in paths.items())
    return f'<header><a class="logo" href="/">Avail</a><nav class="langs">{links}</nav></header>'


def cta(lang: str, open_url: str = "/app/") -> str:
    u = UI[lang]
    return (f'<div class="cta"><a class="btn" href="{open_url}">{esc(u["open"])}</a>'
            f'<a class="btn o" href="{APP_STORE}" rel="noopener">App Store</a>'
            f'<a class="btn o" href="{PLAY}" rel="noopener">Google Play</a></div>')


def card(a: dict, lang: str) -> str:
    p, cur = price_of(a)
    photo = (a.get("photo") or [""])[0]
    name = tr(a, "name", lang)
    meta = " · ".join(x for x in (district_name(a.get("district") or "", lang), specs_line(a, lang)) if x)
    return (f'<a class="card" href="/a/{a["id"]}/"><img loading="lazy" src="{esc(photo)}" alt="{esc(name)}">'
            f'<div class="b"><div class="price">{esc(money(p, cur)) if p else ""}</div>'
            f'<div class="t">{esc(name)}</div><div class="m">{esc(meta)}</div></div></a>')


def itemlist(items: list, lang: str) -> dict:
    return {"@context": "https://schema.org", "@type": "ItemList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{ORIGIN}/a/{a['id']}/",
                                 "name": tr(a, "name", lang)} for i, a in enumerate(items[:100])]}


def crumbs_ld(trail: list) -> dict:
    return {"@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [{"@type": "ListItem", "position": i + 1, "name": n, "item": ORIGIN + p}
                                for i, (n, p) in enumerate(trail)]}


def crumbs_html(trail: list) -> str:
    return '<div class="crumbs">' + " › ".join(f'<a href="{p}">{esc(n)}</a>' for n, p in trail) + "</div>"


# ---- Сборка ---------------------------------------------------------------

def build(out: str, ads: list, now: datetime.datetime) -> dict:
    files = {}

    def put(path: str, text: str):
        rel = path.strip("/") + "/index.html" if not path.endswith(".xml") and not path.endswith(".txt") else path.strip("/")
        files[rel] = text

    groups = {}  # (city, cat, district) -> ads
    for a in ads:
        city = a.get("city") or ""
        if city not in CITIES:
            continue
        a["_cat"] = cat_slug(a)
        groups.setdefault((city, a["_cat"], a.get("district") or ""), []).append(a)

    urls = []
    month = now.month - 1
    for city, cinfo in CITIES.items():
        cs = cinfo["slug"]
        city_ads = [a for (c, _, _), xs in groups.items() if c == city for a in xs]
        if not city_ads:
            continue
        cats = sorted({k[1] for k in groups if k[0] == city}, key=lambda c: -sum(
            len(v) for k, v in groups.items() if k[0] == city and k[1] == c))
        for lang in LANGS:
            u = UI[lang]
            cname = city_name(city, lang)
            home = (u["home"], "/")
            base = f"/{lang}/{cs}/"
            # Город
            alts = {l: f"/{l}/{cs}/" for l in LANGS}
            chips = "".join(
                f'<a class="chip" href="{base}{c}/">{esc(CATS.get(c, GENERIC_CAT)[lang])} · '
                f'{sum(len(v) for k, v in groups.items() if k[0] == city and k[1] == c)}</a>' for c in cats)
            chips += f'<a class="chip" href="{base}prices/">{esc(u["prices"])}</a>'
            cat_names = ", ".join(CATS.get(c, GENERIC_CAT)[lang] for c in cats)
            title = f"{cname} — {cat_names} · Avail"
            desc = u["desc_city"].format(cats=cat_names, n=len(city_ads), offers=plural(lang, len(city_ads)))
            trail = [home, (cname, base)]
            body = (header(lang, alts) + crumbs_html(trail) + f"<h1>{esc(cname)}</h1><p class='lead'>{esc(desc)}</p>"
                    + f'<div class="chips">{chips}</div><div class="grid">'
                    + "".join(card(a, lang) for a in city_ads[:60]) + "</div>" + cta(lang))
            put(base, page(lang, base, title, desc, body, alternates=alts,
                           image=(city_ads[0].get("photo") or [""])[0],
                           ld=[crumbs_ld(trail), itemlist(city_ads, lang)]))
            urls.append(base)
            # Раздел и районы
            for c in cats:
                clabel = CATS.get(c, GENERIC_CAT)[lang]
                cpath = f"{base}{c}/"
                c_ads = [a for k, v in groups.items() if k[0] == city and k[1] == c for a in v]
                dists = sorted({k[2] for k in groups if k[0] == city and k[1] == c and k[2]},
                               key=lambda d: -len(groups[(city, c, d)]))
                prices = [p for p, _ in (price_of(a) for a in c_ads) if p]
                pmin = money(min(prices), "THB") if prices else ""
                title = f"{clabel} — {cname}: {len(c_ads)} {plural(lang, len(c_ads))}" + (f" {u['from']} {pmin}" if pmin else "")
                desc = u["desc_list"].format(title=title)
                trail = [home, (cname, base), (clabel, cpath)]
                chips = (f'<span class="chip"><b>{esc(u["all"])}</b></span>' + "".join(
                    f'<a class="chip" href="{cpath}{slug(d)}/">{esc(district_name(d, lang))} · {len(groups[(city, c, d)])}</a>'
                    for d in dists))
                body = (header(lang, {l: f"/{l}/{cs}/{c}/" for l in LANGS}) + crumbs_html(trail)
                        + f"<h1>{esc(clabel)} — {esc(cname)}</h1><p class='lead'>{esc(desc)}</p>"
                        + f'<div class="chips">{chips}</div><div class="grid">'
                        + "".join(card(a, lang) for a in c_ads[:120]) + "</div>" + cta(lang))
                put(cpath, page(lang, cpath, title, desc, body, alternates={l: f"/{l}/{cs}/{c}/" for l in LANGS},
                                image=(c_ads[0].get("photo") or [""])[0], ld=[crumbs_ld(trail), itemlist(c_ads, lang)]))
                urls.append(cpath)
                for d in dists:
                    d_ads = groups[(city, c, d)]
                    dname = district_name(d, lang)
                    dpath = f"{cpath}{slug(d)}/"
                    ps = [p for p, _ in (price_of(a) for a in d_ads) if p]
                    title = (f"{clabel} — {dname}, {cname}: {len(d_ads)} {plural(lang, len(d_ads))}"
                             + (f" {u['from']} {money(min(ps), 'THB')}" if ps else ""))
                    desc = u["desc_list"].format(title=title)
                    trail = [home, (cname, base), (clabel, cpath), (dname, dpath)]
                    others = "".join(
                        f'<a class="chip" href="{cpath}{slug(x)}/">{esc(district_name(x, lang))} · {len(groups[(city, c, x)])}</a>'
                        for x in dists if x != d)
                    body = (header(lang, {l: f"/{l}/{cs}/{c}/{slug(d)}/" for l in LANGS}) + crumbs_html(trail)
                            + f"<h1>{esc(clabel)} — {esc(dname)}, {esc(cname)}</h1><p class='lead'>{esc(desc)}</p>"
                            + '<div class="grid">' + "".join(card(a, lang) for a in d_ads) + "</div>"
                            + f'<div class="chips" style="margin-top:20px">{others}</div>' + cta(lang))
                    put(dpath, page(lang, dpath, title, desc, body,
                                    alternates={l: f"/{l}/{cs}/{c}/{slug(d)}/" for l in LANGS},
                                    image=(d_ads[0].get("photo") or [""])[0], ld=[crumbs_ld(trail), itemlist(d_ads, lang)]))
                    urls.append(dpath)
            # Цены за месяц
            ppath = f"{base}prices/"
            mtitle = u["prices_title"].format(month=f"{u['months'][month]} {now.year}")
            rows = ""
            for c in cats:
                for d in sorted({k[2] for k in groups if k[0] == city and k[1] == c and k[2]}):
                    ps = sorted(p for p, cur in (price_of(a) for a in groups[(city, c, d)]) if p and cur == "THB")
                    if not ps:
                        continue
                    rng = money(ps[0], "THB") + (f" — {money(ps[-1], 'THB')}" if ps[-1] != ps[0] else "")
                    rows += (f'<tr><td><a href="{base}{c}/">{esc(CATS.get(c, GENERIC_CAT)[lang])}</a></td>'
                             f'<td><a href="{base}{c}/{slug(d)}/">{esc(district_name(d, lang))}</a></td>'
                             f"<td>{len(groups[(city, c, d)])}</td><td>{esc(rng)}</td></tr>")
            trail = [home, (cname, base), (u["prices"], ppath)]
            body = (header(lang, {l: f"/{l}/{cs}/prices/" for l in LANGS}) + crumbs_html(trail)
                    + f"<h1>{esc(mtitle)}</h1><p class='lead'>{esc(u['prices_intro'])}</p>"
                    + f"<table><tr><th></th><th>{esc(u['district'])}</th><th>{esc(u['count'])}</th><th>{esc(u['range'])}</th></tr>{rows}</table>"
                    + cta(lang))
            put(ppath, page(lang, ppath, mtitle, u["prices_intro"], body,
                            alternates={l: f"/{l}/{cs}/prices/" for l in LANGS}, ld=[crumbs_ld(trail)]))
            urls.append(ppath)

    # Страница каждого объявления
    for a in ads:
        if (a.get("city") or "") not in CITIES:
            continue
        src = a.get("source_lang") if a.get("source_lang") in LANGS else "en"
        p, cur = price_of(a)
        photos = a.get("photo") or []
        name = (a.get("name") or "").strip()
        cname = city_name(a.get("city") or "", src)
        dname = district_name(a.get("district") or "", src)
        place = ", ".join(x for x in (dname, cname) if x)
        title = f"{name} — {money(p, cur)}" if p else name
        desc = " · ".join(x for x in (place, specs_line(a, src), (a.get("description") or "")[:150]) if x)
        path = f"/a/{a['id']}/"
        trans = {l: {"n": tr(a, "name", l), "d": tr(a, "description", l)} for l in LANGS}
        ld = {"@context": "https://schema.org", "@type": "Product", "name": name,
              "description": (a.get("description") or "")[:500], "image": photos[:5], "url": ORIGIN + path,
              "offers": {"@type": "Offer", "price": p or 0, "priceCurrency": cur, "availability": "https://schema.org/InStock",
                         "url": ORIGIN + path}}
        open_url = f"/a/?id={a['id']}"
        imgs = "".join(f'<img loading="lazy" src="{esc(x)}" alt="{esc(name)}">' for x in photos[:10])
        body = (f'<header><a class="logo" href="/">Avail</a></header>'
                f'<div class="crumbs">{esc(place)}</div><h1 id="n">{esc(name)}</h1>'
                f'<p class="price">{esc(money(p, cur)) if p else ""}</p><p class="m">{esc(specs_line(a, src))}</p>'
                f'<div class="photos">{imgs}</div><div class="desc" id="d">{esc(a.get("description") or "")}</div>'
                f'<div class="cta"><a class="btn" id="w" href="{open_url}">{esc(UI[src]["write"])}</a>'
                f'<a class="btn o" href="{APP_STORE}" rel="noopener">App Store</a>'
                f'<a class="btn o" href="{PLAY}" rel="noopener">Google Play</a></div>'
                # Язык читателя: имя и описание из переводов объявления.
                f'<script>(function(){{var T={json.dumps(trans, ensure_ascii=False)},W={json.dumps({l: UI[l]["write"] for l in LANGS}, ensure_ascii=False)};'
                f'var l=(navigator.language||"en").slice(0,2);if(!T[l])return;document.documentElement.lang=l;'
                f'if(T[l].n)document.getElementById("n").textContent=T[l].n;if(T[l].d)document.getElementById("d").textContent=T[l].d;'
                f'document.getElementById("w").textContent=W[l];}})();</script>')
        put(path, page(src, path, title, desc, body, image=photos[0] if photos else "", ld=[ld], html_lang=src))
        urls.append(path)

    stamp = now.date().isoformat()
    files["sitemap-seo.xml"] = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                + "".join(f"<url><loc>{ORIGIN}{u}</loc><lastmod>{stamp}</lastmod></url>\n" for u in urls)
                                + "</urlset>\n")
    return files


def write(out: str, files: dict) -> list:
    """Записать файлы; удалить собранное прошлой ночью и больше не нужное.
    Возвращает адреса страниц, которые изменились (для IndexNow)."""
    mpath = os.path.join(out, MANIFEST)
    old = set()
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as f:
            old = set(json.load(f))
    changed = []
    for rel, text in files.items():
        p = os.path.join(out, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        prev = open(p, encoding="utf-8").read() if os.path.exists(p) else None
        if prev != text:
            with open(p, "w", encoding="utf-8") as f:
                f.write(text)
            if rel.endswith("index.html"):
                changed.append(ORIGIN + "/" + rel[: -len("index.html")])
    for rel in sorted(old - set(files)):
        p = os.path.join(out, rel)
        if os.path.exists(p):
            os.remove(p)
            if rel.endswith("index.html"):
                changed.append(ORIGIN + "/" + rel[: -len("index.html")])
            d = os.path.dirname(p)
            while d != out and os.path.isdir(d) and not os.listdir(d):
                os.rmdir(d)
                d = os.path.dirname(d)
    with open(mpath, "w", encoding="utf-8") as f:
        json.dump(sorted(files), f, ensure_ascii=False, indent=0)
    ensure_sitemap_index(out)
    return changed


def ensure_sitemap_index(out: str):
    """sitemap.xml — список из двух карт: постоянные страницы сайта
    (sitemap-static.xml, пишет build_landing.py) и эти (sitemap-seo.xml)."""
    smap = os.path.join(out, "sitemap.xml")
    static = os.path.join(out, "sitemap-static.xml")
    if os.path.exists(smap) and "<urlset" in open(smap, encoding="utf-8").read() and not os.path.exists(static):
        os.rename(smap, static)  # прежняя карта сайта становится «постоянной»
    parts = [n for n in ("sitemap-static.xml", "sitemap-seo.xml") if os.path.exists(os.path.join(out, n))]
    with open(smap, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "".join(f"<sitemap><loc>{ORIGIN}/{n}</loc></sitemap>\n" for n in parts) + "</sitemapindex>\n")


def indexnow(out: str, urls: list):
    """Сигнал Bing и Яндексу (протокол IndexNow): какие страницы изменились.
    Ключ — не секрет, он лежит файлом в корне сайта."""
    if not urls and any(re.fullmatch(r"[0-9a-f]{32}\.txt", n) for n in os.listdir(out)):
        return
    keys = [n for n in os.listdir(out) if re.fullmatch(r"[0-9a-f]{32}\.txt", n)]
    if not keys:
        # Первый запуск: кладём файл ключа, сигнал — со следующей ночи
        # (поисковик проверяет ключ по адресу на сайте, а он ещё не выложен).
        key = hashlib.sha256(os.urandom(32)).hexdigest()[:32]
        with open(os.path.join(out, key + ".txt"), "w") as f:
            f.write(key)
        print("IndexNow: ключ создан, сигнал со следующего запуска")
        return
    key = keys[0][:-4]
    body = json.dumps({"host": "avail.asia", "key": key, "keyLocation": f"{ORIGIN}/{key}.txt",
                       "urlList": urls[:10000]}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("IndexNow:", r.status, len(urls), "адресов")
    except Exception as e:  # сигнал необязателен: поисковики всё равно придут по карте сайта
        print("IndexNow не ответил:", e)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    now = datetime.datetime.now(TZ)
    ads = fetch_adverts()
    files = build(out, ads, now)
    changed = write(out, files)
    print(f"объявлений: {len(ads)}, страниц: {len(files) - 1}, изменилось: {len(changed)}")
    if "--ping" in sys.argv:
        indexnow(out, changed)


if __name__ == "__main__":
    main()
