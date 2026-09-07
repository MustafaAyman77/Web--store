# أسواق البسيط 🛒

متجر إلكتروني محلي لسوبر ماركت **أسواق البسيط** —
شارع الحجاز، مدينة مغاغة، محافظة المنيا — مفتوح 24 ساعة.

> نسخة Demo محلية: واجهة عربية كاملة (RTL) + سيرفر Express حقيقي + SQLite —
> يعمل كله على الجهاز بدون أي استضافة أو خدمات خارجية.

## المعمارية

```
CUSTOMER → FRONTEND → LOCAL EXPRESS API → SQLite DB → Telegram (معطّل الآن)
```

## هيكل المشروع

```
├── frontend/               # الواجهة (HTML + CSS + JS بدون مكتبات)
│   ├── index.html          # الرئيسية
│   ├── products.html       # المنتجات: بحث + فلترة + ترتيب
│   ├── checkout.html       # إتمام الطلب
│   ├── success.html        # نجاح الطلب
│   ├── css/                # variables/base/layout/components/sections/shop/checkout
│   └── js/                 # config/data/cart/api/ui/shop/orders/checkout/success/app
├── backend/                # Node.js + Express + SQLite
│   ├── src/
│   │   ├── server.js       # نقطة التشغيل
│   │   ├── app.js          # التطبيق (API + تقديم الواجهة)
│   │   ├── config/env.js
│   │   ├── database/       # database.js + schema.sql + seed.js + seed-data.js
│   │   ├── routes/         # products/orders/customers/admin
│   │   ├── controllers/
│   │   ├── services/       # order.service.js + telegram.service.js (جاهز، معطّل)
│   │   ├── middleware/     # error + auth
│   │   └── utils/          # phone/order-number/api-error/async-handler
│   ├── data/               # basit-market.db (تُبنى محليًا — لا تدخل Git)
│   ├── .env / .env.example
│   └── package.json
└── README.md
```

## 1. متطلبات التشغيل

- **Node.js 22+** (نستخدم `node:sqlite` المدمجة — بدون أي إعداد إضافي).
- تحقق: `node -v` → يجب أن تكون `v22` أو أحدث.

## 2. التشغيل (3 أوامر)

```bash
cd backend
npm install
npm run seed    # بناء قاعدة البيانات + 35 منتجًا تجريبيًا + حساب أدمن
npm run dev     # تشغيل السيرفر مع إعادة التحميل التلقائي
```

ثم افتح: **http://localhost:3000** (الموقع + الـ API من نفس البورت).

> `npm start` للتشغيل العادي. `npm run seed:force` لإعادة بناء البيانات من الصفر.

## 3. Environment Variables

انسخ `backend/.env.example` إلى `backend/.env` (تم ذلك تلقائيًا عند أول تثبيت):

| المتغير | الوصف | الافتراضي |
|---|---|---|
| `PORT` | بورت السيرفر | `3000` |
| `DATABASE_PATH` | مسار ملف SQLite | `./data/basit-market.db` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | دخول الأدمن (تُشفَّر عند الـ seed) | `admin` / `admin123` (Demo — غيّرها) |
| `DELIVERY_ENABLED` | قبول التوصيل (`false` = استلام فقط) | `true` |
| `DELIVERY_FEE` | رسوم التوصيل (تُحدد لاحقًا) | `0` |
| `TELEGRAM_ENABLED` | تفعيل إشعارات Telegram لصاحب المحل | `false` |
| `TELEGRAM_BOT_TOKEN` | توكن البوت (في `.env` فقط — لا يدخل Git) | فارغ |
| `TELEGRAM_CHAT_ID` | شات صاحب المحل (في `.env` فقط) | فارغ |
| `TELEGRAM_TIMEOUT_MS` | مهلة الاتصال بـ Telegram | `10000` |

⚠️ ملف `.env` وقاعدة البيانات لا يدخلان Git أبدًا. لا توجد أسرار في الواجهة.

## 4. الـ API

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/api/health` | فحص السيرفر |
| GET | `/api/config` | إعدادات عامة (بدون أسرار) |
| GET | `/api/products` | المنتجات + `?category=&search=&available=&featured=&offer=` |
| GET | `/api/products/:id` | منتج واحد |
| POST | `/api/orders` | إنشاء طلب `{items:[{productId,quantity}], customer, fulfillmentMethod, notes}` |
| GET | `/api/orders/:ref` | طلب بالـ UUID أو رقم الطلب |
| GET | `/api/customers?phone=` | بحث عن عميل |
| POST | `/api/admin/login` | دخول الأدمن → Token |
| GET | `/api/admin/orders` | كل الطلبات 🔒 |
| PATCH | `/api/admin/orders/:ref/status` | تغيير الحالة 🔒 |

صيغة الرد: `{success: true, data: {...}}` أو `{success: false, error: {code, message}}`.

## 5. اختبار سريع (curl)

```bash
# الصحة والمنتجات
curl localhost:3000/api/health
curl "localhost:3000/api/products?search=بيبسي"

# إنشاء طلب (السعر يُحسب من الـDB — أي سعر مرسل يُتجاهل)
curl -X POST localhost:3000/api/orders -H 'Content-Type: application/json' -d '{
  "items": [{"productId": "p01", "quantity": 2}],
  "customer": {"name": "عميل تجريبي", "phone": "01001234567", "address": "شارع الحجاز"},
  "fulfillmentMethod": "delivery", "notes": ""
}'

# دخول الأدمن ثم عرض الطلبات
TOKEN=$(curl -s -X POST localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl "localhost:3000/api/admin/orders" -H "Authorization: Bearer $TOKEN"
```

## 6. إشعارات Telegram لصاحب المحل 📨 (المرحلة 5)

كل طلب جديد يُحفظ في قاعدة البيانات أولًا، ثم يُرسل إشعار عربي منسق
لشات صاحب المحل — والعميل لا يرى أي شيء عن Telegram.

- حالة الإرسال تُسجَّل لكل طلب: `pending / sending / sent / failed / disabled`.
- فشل Telegram **لا يُفشل الطلب أبدًا** — الطلب يظل محفوظًا وناجحًا.
- منع التكرار: الطلب المُرسل لا يُعاد إرساله إلا بطلب صريح (`force`).

### التفعيل (بوت تجريبي أو بوت المحل لاحقًا)

```bash
# 1) أنشئ بوتًا من @BotFather وخُذ التوكن
# 2) ابدأ محادثة مع البوت، ثم اعرف الـ Chat ID من:
#    https://api.telegram.org/bot<TOKEN>/getUpdates
# 3) ضع القيم في backend/.env فقط (لا تدخل Git أبدًا):
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=ضع_التوكن_هنا
TELEGRAM_CHAT_ID=ضع_الشات_هنا

# 4) أعد تشغيل السيرفر ثم جرّب:
TOKEN=$(curl -s -X POST localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
curl -X POST localhost:3000/api/admin/telegram/test -H "Authorization: Bearer $TOKEN"

# 5) إعادة إرسال إشعار طلب فشل (اختياري force):
curl -X POST localhost:3000/api/admin/orders/BS-20260907-0001/telegram/retry \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
```

> تغيير البوت لاحقًا = تغيير سطرين في `.env` فقط — بدون أي تعديل في الواجهة.

## 7. لوحة التحكم `/admin` 📊 (المرحلة 6)

لوحة عربية RTL لصاحب المحل — مخفية تمامًا عن واجهة الزبائن، تعمل على الموبايل والكمبيوتر.

- **الدخول:** `http://localhost:3000/admin/login` — بيانات التطوير: `admin` / `admin123`
  (تُغيَّر من `ADMIN_USERNAME` / `ADMIN_PASSWORD` في `backend/.env` — كلمة المرور مخزنة **bcrypt hash** فقط)
- **الجلسة:** توكن يُحفظ في المتصفح، كل `/api/admin/*` محمي، وأي `401` يرجعك لصفحة الدخول تلقائيًا.
- **الصفحات:** الرئيسية (عدادات + إيراد اليوم + تنبيه المخزون) • الطلبات (بحث/فلترة/ترقيم) •
  تفاصيل الطلب (تغيير الحالة + إعادة إشعار Telegram) • المنتجات (إضافة/تعديل/إيقاف/حذف ناعم) •
  العملاء (نشاط + سجل طلبات).
- **حالات الطلب** (يفرضها الـBackend): `new → confirmed → preparing → ready → out_for_delivery → completed`
  + `cancelled` من أي حالة غير نهائية. `completed/cancelled` نهائيتان.
- **المخزون:** تنبيه للمنتجات ≤ 5 قطع؛ حذف المنتج = إيقاف ناعم (الطلبات القديمة تحتفظ بأسعارها).
- **الجرس 🔔:** يحدّث عدد الطلبات الجديدة كل 30 ثانية (Polling بسيط — بدون Push).
- **التدقيق:** جدول `audit_logs` يسجل (الدخول/الخروج/تغيير الحالات/عمليات المنتجات).

```bash
# مثال: عدادات اللوحة
curl -s http://localhost:3000/api/admin/dashboard -H "Authorization: Bearer $TOKEN"
```

## 8. المنتجات والمخزون 📦 (المرحلة 7)

نظام عملي يومي لصاحب المحل — مربوط بنفس قاعدة البيانات:

- **الأقسام من الـBackend:** `GET /api/categories` (الواجهة) + إدارة كاملة في `/admin/categories`
  (إضافة/تعديل/تعطيل/ترتيب — بلا حذف لحماية البيانات القديمة).
- **المنتجات:** بحث + فلاتر (متاحة/غير متاحة/نفدت/منخفضة/عروض/مميزة) + ترتيب (الأحدث/السعر/المخزون) +
  عمليات جماعية (تفعيل/تعطيل) + `old_price ≥ price` يُفرض في السيرفر + نسبة خصم موحدة.
- **المخزون `/admin/inventory`:** عدادات (الإجمالي/المتاحة/المنخفضة/النافذة) + تعديل بسجل
  (إضافة/خصم/ضبط + سبب) + سجل حركات لكل منتج `inventory_movements`.
- **ربط الطلبات:** خصم تلقائي عند إنشاء الطلب (داخل Transaction) + منع البيع فوق المتاح
  (`INSUFFICIENT_STOCK`) + إعادة المخزون مرة واحدة عند الإلغاء.
- **واجهة العميل:** "🔴 نفد المخزون" بدون زر شراء + أسعار حية من الـDB كل تحميل (لا كاش قديم).

```bash
# ملخص المخزون + تعديل + سجل
curl -s http://localhost:3000/api/admin/inventory -H "Authorization: Bearer $TOKEN"
curl -s -X POST http://localhost:3000/api/admin/inventory/p01/adjust -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"mode":"add","quantity":5,"reason":"استلام بضاعة"}'
```

## 9. رحلة المستخدم الكاملة

الرئيسية ← المنتجات (بحث/فلتر/ترتيب) ← التفاصيل ← السلة ←
إتمام الطلب (توصيل/استلام + مراجعة) ← `POST /api/orders` ← حفظ في SQLite ←
رقم طلب `BS-YYYYMMDD-NNNN` ← صفحة النجاح ← استرجاع من الـ API.

> الواجهة تكتشف السيرفر تلقائيًا (`mode: "auto"` في `frontend/js/config.js`) —
> لو السيرفر مطفي تعمل بوضع Demo محلي، ولو شغال تستخدمه كمصدر أساسي.

## 10. قواعد الأمان المطبقة

- الأسعار والإجماليات تُحسب في السيرفر فقط (مقاومة للتلاعب) داخل Transaction.
- كلمات المرور مشفَّرة (bcrypt) ولا تُعرض عبر أي API.
- لا Bot Token ولا أسرار في الواجهة أو الـ Git — فقط `backend/.env` (مستبعد).
- التحقق من التوفر والمخزون والهاتف المصري (11 رقمًا) في السيرفر.

## 11. الإيقاف والتشغيل

- الإيقاف: `Ctrl+C` في نافذة السيرفر.
- التشغيل مجددًا: `cd backend && npm run dev` (البيانات محفوظة في `data/`).
- تصفير البيانات: `npm run seed:force`.

## 9. التوصيات الذكية 🧠 (المرحلة 8)

- `GET /api/recommendations?customerPhone=01xxxxxxxxx&cartProductIds=p01,p02&category=beverages&limit=6`
  - عميل جديد → الأكثر طلبًا (🔥) — عميل راجع (برقم هاتفه) → الأكثر تكرارًا + جديد في أقسامه المفضلة.
  - أسباب مرجحة: frequent ‏(50) ← cart_related ‏(40) ← new/offer_in_favorite ‏(30/25) ← similar ‏(15) ← popular/new/offer ‏(10) ← featured ‏(5).
  - `boughtBefore` + `purchaseCounts` للتخصيص — ولا تسرّب أي بيانات خاصة (لا عناوين ولا هواتف ولا مبالغ).
- سجل الشراء يُبنى تلقائيًا من الطلبات (غير الملغاة) برقم الهاتف كمفتاح.
- الواجهة: 3 أقسام بالرئيسية (الأكثر طلبًا / وصل حديثًا / مختارات على ذوقك) + ترشيحات في السلة وصفحة الدفع ونافذة المنتج + شارة 🆕 + ❤️ اشتريته قبل كده.
- رقم الهاتف يُتذكَّر على جهاز العميل فقط لتخصيص الاقتراحات وتعبئة الدفع تلقائيًا.
- الإدارة: فرز العملاء (الأكثر شراءً/طلبًا) + الحالة (نشط/غير نشط/موقوف) مع حظر الطلبات للموقوفين + ملاحظات داخلية + أكثر المنتجات والأقسام المفضلة.

## 10. حسابات العملاء 🔑 (المرحلة 9)

- **ضيف + حساب اختياري**: الـGuest Checkout يعمل كما هو بدون أي تغيير — والحساب دعوة اختيارية بعد الطلب، never شرطًا.
- **الدخول برقم الهاتف + OTP** (بدون Password):
  - `POST /api/auth/send-otp` ← `{phone}` — مهلة إعادة إرسال + Rate Limiting.
  - `POST /api/auth/verify-otp` ← `{phone, code, name?}` — يُفعّل الحساب على **نفس العميل** (طلبات الضيف القديمة تظهر تلقائيًا) + جلسة في HttpOnly Cookie.
  - `POST /api/auth/logout` — إبطال فوري للجلسة.
- **حسابي** (`/account.html` + `/login.html`): `GET /api/me` — `GET /api/me/orders` — `GET /api/me/orders/:orderNumber` (طلباتي فقط — 404 لطلبات الآخرين) — `PATCH /api/me/profile` (بدون تغيير الهاتف) — `POST /api/me/deactivate` (تعطيل مع حفظ الطلبات).
- **إعادة الطلب 🔁**: من تفاصيل الطلب — تُضاف المتاحة حاليًا **بالأسعار الحالية** من الـDB، والغير متاحة تُتخطى مع تنبيه.
- **التوصيات**: المسجل → تاريخه من الجلسة (لا يُعتمد على هاتف الـFrontend) — الضيف → الرائجة + الجديدة + العروض.
- **الإدارة** (`/admin/customers`): حالة الحساب (ضيف/مسجل/موقوف) + تفعيل/تعطيل الحساب + الحظر — **ولا يرى أحد الـOTP أبدًا** (يُخزَّن Hash فقط).
- **الأمان**: OTP ‏(6 أرقام، 5 دقائق، 5 محاولات ثم إبطال) + Rate Limiting ‏(IP/هاتف) + HttpOnly + SameSite=Lax ‏(Secure في Production‏) + Security Headers + توحيد أرقام الهواتف المصرية.
- **⚠️ Demo Authentication**: في التطوير فقط (`OTP_PROVIDER=demo`) رمز ثابت يظهر في Backend logs فقط — ممنوع في Production، والبنية جاهزة لمزود SMS حقيقي (`services/otp/providers/`) بدون إعادة كتابة.
- متغيرات جديدة: `CUSTOMER_AUTH_ENABLED` — `OTP_PROVIDER/EXPIRATION/MAX_ATTEMPTS/RESEND_COOLDOWN` — `SESSION_TTL_HOURS` — `SESSION_SECRET` ‏(سر — `.env` فقط، لا يدخل Git‏).

## 11. تتبع الطلبات والإشعارات 📦 (المرحلة 10)

- **تتبع الضيف** (`/track-order.html`): رقم طلب + هاتف مطابق → `POST /api/orders/track` (خطأ موحّد لا يكشف أي جزء) — Timeline عربي + تطور الطلب بالتوقيتات + "آخر تحديث منذ..." + تحديث تلقائي (30 ثانية من `/api/config`) يتوقف عند التسليم/الإلغاء/مغادرة الصفحة.
- **المسجل**: طلباته من الجلسة (`/api/me/orders/:n` + تاريخ الحالات) + 🔔 جرس الهيدر بعدد غير المقروء (يُحدَّث كل دقيقة).
- **الإشعارات الداخلية**: جدول `notifications` ‏(UNIQUE لمنع التكرار‏) — تُنشأ داخل Transaction تغيير الحالة (طلب → تاريخ → إشعار، أو لا شيء) — `GET /api/notifications` ‏(صفحات‏) — `unread-count` — `PATCH :id/read` ‏(طلباتي فقط‏) — `read-all`.
- **الأمان**: 🛡️ أُزيل المسار العام `GET /api/orders/:ref` الذي كان يكشف أي طلب برقمه (ثغرة من مرحلة سابقة) — لا كشف برقم الطلب وحده أبدًا + حد معدل للتتبع.
- **Telegram**: كما هو (إشعار الإنشاء للمالك فقط) — لا يتدخل في حالات الطلب ولا يُفشلها.
- متغيرات: `ORDER_TRACKING_ENABLED` — `NOTIFICATIONS_ENABLED` — `ORDER_STATUS_POLL_INTERVAL_SECONDS`.

## 12. إعدادات المتجر والتوصيل 🏪 (المرحلة 11)

- **إعدادات مركزية** (صف واحد + إدارة من `/admin/settings`): الاسم/العنوان/الهاتف/الوصف/الشعار — استقبال الطلبات — وضع الصيانة (الموقع كله، والإدارة تظل تعمل) — 24/7 (يتحكم في نص الهيدر) — التوصيل/الاستلام ON/OFF — الحد الأدنى — التوصيل المجاني فوق مبلغ — رسم افتراضي — وقت التجهيز المتوقع — ملاحظة للعميل.
- **مناطق التوصيل** (`/admin/delivery` + `GET /api/delivery-zones`): رسم + حد أدنى + وقت متوقع لكل منطقة — حذف ذكي (مرتبطة بطلبات → تعطيل بدل الحذف). البيانات الحالية **تجريبية** وتُستبدل من الإدارة.
- **الطلبات**: `POST /api/orders/quote` (نفس حساب الإنشاء للعرض) — البوابات (صيانة/طلبات/توصيل/استلام) + المنطقة (موجودة/مفعلة) + الحد الأدنى + الرسم من الـDB + المجاني فوق العتبة — لقطة (zone id/name/fee) داخل كل طلب — أكواد واضحة (`ZONE_REQUIRED`/`MINIMUM_ORDER`/`NO_FULFILLMENT`...).
- **الـCheckout**: خيارات الاستلام تُبنى من الإعدادات — اختيار المنطقة يعرض الرسم/الحد/الوقت — الإجمالي من `/quote` — رسالة واضحة عند إيقاف الطلبات (السلة محفوظة).
- **Telegram**: يضيف منطقة التوصيل للطلبات الموصلة — نفس البنية (فشله لا يُفشل الطلب).
- القيم الأولية من `.env` (`DELIVERY_ENABLED/FEE`) ثم تُدار من DB — لا أسعار/حالات ثابتة في الكود.

## خارطة الطريق

- [x] المراحل 1–3: الواجهة كاملة
- [x] المرحلة 4: Backend محلي + SQLite + REST API ✅ (أنت هنا)
- [x] المرحلة 5: Telegram Bot للإشعارات (يُفعَّل بمتغيرين في `.env` فقط)
- [x] المرحلة 6: لوحة تحكم `/admin` (طلبات/منتجات/عملاء + مخزون + تدقيق)
- [x] المرحلة 7: إدارة منتجات ومخزون كاملة (أقسام + حركات + خصم/استرجاع تلقائي)
- [x] المرحلة 8: التوصيات الذكية 🧠 (سجل شراء + ترشيحات + تخصيص + حظر عملاء)
- [x] المرحلة 9: حسابات العملاء 🔑 (OTP + جلسات + طلباتي + إعادة الطلب)
- [x] المرحلة 10: تتبع الطلبات والإشعارات 📦 (ضيف/مسجل + تاريخ حالات + جرس)
- [x] المرحلة 11: إعدادات المتجر والتوصيل 🏪 (بوابات + مناطق + رسوم من الـDB) ✅ (أنت هنا)
- [ ] لاحقًا: نقل أونلاين + دفع
