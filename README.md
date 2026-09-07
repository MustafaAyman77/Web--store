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

## 7. رحلة المستخدم الكاملة

الرئيسية ← المنتجات (بحث/فلتر/ترتيب) ← التفاصيل ← السلة ←
إتمام الطلب (توصيل/استلام + مراجعة) ← `POST /api/orders` ← حفظ في SQLite ←
رقم طلب `BS-YYYYMMDD-NNNN` ← صفحة النجاح ← استرجاع من الـ API.

> الواجهة تكتشف السيرفر تلقائيًا (`mode: "auto"` في `frontend/js/config.js`) —
> لو السيرفر مطفي تعمل بوضع Demo محلي، ولو شغال تستخدمه كمصدر أساسي.

## 8. قواعد الأمان المطبقة

- الأسعار والإجماليات تُحسب في السيرفر فقط (مقاومة للتلاعب) داخل Transaction.
- كلمات المرور مشفَّرة (bcrypt) ولا تُعرض عبر أي API.
- لا Bot Token ولا أسرار في الواجهة أو الـ Git — فقط `backend/.env` (مستبعد).
- التحقق من التوفر والمخزون والهاتف المصري (11 رقمًا) في السيرفر.

## 9. الإيقاف والتشغيل

- الإيقاف: `Ctrl+C` في نافذة السيرفر.
- التشغيل مجددًا: `cd backend && npm run dev` (البيانات محفوظة في `data/`).
- تصفير البيانات: `npm run seed:force`.

## خارطة الطريق

- [x] المراحل 1–3: الواجهة كاملة
- [x] المرحلة 4: Backend محلي + SQLite + REST API ✅ (أنت هنا)
- [x] المرحلة 5: Telegram Bot للإشعارات (يُفعَّل بمتغيرين في `.env` فقط)
- [ ] لاحقًا: نقل أونلاين + لوحة إدارة + دفع
