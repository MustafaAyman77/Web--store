-- ==========================================================================
-- أسواق البسيط — SQLite Schema (Demo)
-- ==========================================================================

CREATE TABLE IF NOT EXISTS products (
  id             TEXT PRIMARY KEY,           -- نفس IDs الواجهة (p01.. / o01..)
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  description    TEXT DEFAULT '',
  price          REAL NOT NULL CHECK (price >= 0),
  old_price      REAL,
  unit           TEXT DEFAULT '',
  image          TEXT DEFAULT '',            -- أيقونة العرض (emoji) في الـDemo
  tint           TEXT DEFAULT '',            -- JSON: [color1, color2]
  badge_text     TEXT DEFAULT '',
  badge_tone     TEXT DEFAULT '',            -- offer | hot | new
  available      INTEGER NOT NULL DEFAULT 1, -- 0/1
  featured       INTEGER NOT NULL DEFAULT 0,
  offer          INTEGER NOT NULL DEFAULT 0, -- 1 = عليه عرض/خصم
  stock_quantity INTEGER,                    -- NULL = بدون تتبع مخزون
  low_stock_threshold INTEGER NOT NULL DEFAULT 5, -- إذا وصل المخزون لهذا الحد أو أقل = منخفض
  stock_tracking INTEGER NOT NULL DEFAULT 1, -- 0/1 هل يُتتبع مخزون هذا المنتج؟
  popularity     INTEGER NOT NULL DEFAULT 50,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,               -- UUID
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL UNIQUE,           -- رقم مصري 11 رقمًا = مفتاح التعرف
  email      TEXT DEFAULT '',
  address    TEXT DEFAULT '',
  area       TEXT DEFAULT '',
  landmark   TEXT DEFAULT '',
  notes      TEXT DEFAULT '',                -- ملاحظات داخلية للإدارة فقط
  status     TEXT NOT NULL DEFAULT 'active', -- active | inactive | blocked
  account_enabled INTEGER NOT NULL DEFAULT 0, -- 1 = لديه حساب (اختياري)
  phone_verified  INTEGER NOT NULL DEFAULT 0, -- 1 = تحقق من هاتفه عبر OTP
  last_login_at   TEXT,                      -- آخر دخول ناجح
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- رموز التحقق المؤقتة (المرحلة 9) — يُخزَّن الـHash فقط، never النص الصريح
CREATE TABLE IF NOT EXISTS otp_codes (
  id          TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone, created_at);

-- جلسات العملاء (المرحلة 9) — يُخزَّن Hash التوكن فقط
CREATE TABLE IF NOT EXISTS customer_sessions (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON customer_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_customer ON customer_sessions(customer_id);

-- تاريخ حالات الطلب (المرحلة 10)
CREATE TABLE IF NOT EXISTS order_status_history (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id),
  status     TEXT NOT NULL,
  changed_by TEXT NOT NULL DEFAULT 'system', -- admin | system
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_osh_order ON order_status_history(order_id, created_at);

-- إشعارات العملاء الداخلية (المرحلة 10)
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  order_id    TEXT REFERENCES orders(id),
  type        TEXT NOT NULL, -- order_created | order_confirmed | ... | order_cancelled
  title       TEXT NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  is_read     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (customer_id, order_id, type)
);
CREATE INDEX IF NOT EXISTS idx_notif_customer ON notifications(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(customer_id, is_read);

-- إعدادات المتجر المركزية (المرحلة 11) — صف واحد (id = 1)
CREATE TABLE IF NOT EXISTS store_settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  store_name       TEXT NOT NULL DEFAULT 'أسواق البسيط',
  store_address    TEXT NOT NULL DEFAULT '',
  store_phone      TEXT NOT NULL DEFAULT '',
  store_whatsapp   TEXT NOT NULL DEFAULT '',
  store_description TEXT NOT NULL DEFAULT '',
  store_logo       TEXT NOT NULL DEFAULT '',
  store_latitude   REAL,
  store_longitude  REAL,
  store_open_24_7  INTEGER NOT NULL DEFAULT 1,
  orders_enabled   INTEGER NOT NULL DEFAULT 1,
  delivery_enabled INTEGER NOT NULL DEFAULT 1,
  pickup_enabled   INTEGER NOT NULL DEFAULT 1,
  minimum_order_amount REAL NOT NULL DEFAULT 0,
  free_delivery_threshold REAL NOT NULL DEFAULT 0,
  default_delivery_fee REAL NOT NULL DEFAULT 0,
  estimated_preparation_minutes INTEGER NOT NULL DEFAULT 0,
  customer_order_note TEXT NOT NULL DEFAULT '',
  maintenance_mode INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- مناطق التوصيل (المرحلة 11)
CREATE TABLE IF NOT EXISTS delivery_zones (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  delivery_fee  REAL NOT NULL DEFAULT 0,
  minimum_order_amount REAL NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_zones_enabled ON delivery_zones(enabled);

-- العروض الترويجية (المرحلة 12)
CREATE TABLE IF NOT EXISTS promotions (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL, -- percentage | fixed_discount | fixed_price
  discount_value REAL NOT NULL DEFAULT 0,
  fixed_price   REAL,
  start_at      TEXT, -- UTC 'YYYY-MM-DD HH:MM:SS' أو NULL = فورًا
  end_at        TEXT, -- UTC أو NULL = بدون نهاية
  enabled       INTEGER NOT NULL DEFAULT 1,
  priority      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS promotion_products (
  id            TEXT PRIMARY KEY,
  promotion_id  TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (promotion_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_pp_promo ON promotion_products(promotion_id);
CREATE INDEX IF NOT EXISTS idx_pp_product ON promotion_products(product_id);

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,         -- UUID داخلي
  order_number     TEXT NOT NULL UNIQUE,     -- BS-YYYYMMDD-NNNN للعميل
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  subtotal         REAL NOT NULL,
  delivery_fee     REAL,                     -- NULL = غير محدد/غير مطبق
  total            REAL NOT NULL,
  fulfillment_method TEXT NOT NULL,          -- delivery | pickup
  notes            TEXT DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'new',
  telegram_status  TEXT NOT NULL DEFAULT 'pending', -- pending|sending|sent|failed|disabled
  telegram_message_id INTEGER,
  telegram_sent_at TEXT,
  telegram_error   TEXT,
  stock_deducted INTEGER NOT NULL DEFAULT 0, -- 1 = خُصم المخزون عند إنشاء الطلب
  stock_restored INTEGER NOT NULL DEFAULT 0, -- 1 = أُعيد المخزون بعد الإلغاء (مرة واحدة فقط)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id           TEXT PRIMARY KEY,             -- UUID
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL,
  product_name TEXT NOT NULL,                -- نسخة وقت الشراء
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  price        REAL NOT NULL,                -- سعر الوحدة وقت الشراء (النهائي بعد العرض)
  subtotal     REAL NOT NULL,
  original_price REAL,                      -- السعر الأصلي قبل العرض (لقطة)
  final_price    REAL,                      -- = price (وضوح اللقطة)
  discount_amount REAL NOT NULL DEFAULT 0,  -- الفرق للوحدة الواحدة
  promotion_id   TEXT,                      -- لقطة العرض المطبق (قد يُحذف لاحقًا)
  promotion_name TEXT DEFAULT ''            -- اسم العرض وقت الشراء
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,            -- UUID
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,               -- bcrypt — لا يُعرض عبر API أبدًا
  role          TEXT NOT NULL DEFAULT 'owner', -- owner | manager | staff (مستقبلًا)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT PRIMARY KEY,
  admin_username TEXT NOT NULL,
  action         TEXT NOT NULL,               -- login | order.status | product.create | ...
  entity         TEXT NOT NULL DEFAULT '',    -- order | product | ...
  entity_id      TEXT NOT NULL DEFAULT '',
  meta           TEXT,                        -- JSON إضافي
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,               -- slug ثابت: beverages, snacks, ...
  name       TEXT NOT NULL,                  -- الاسم العربي
  slug       TEXT NOT NULL UNIQUE,
  image      TEXT DEFAULT '',                -- أيقونة/مسار صورة القسم
  active     INTEGER NOT NULL DEFAULT 1,     -- 0/1
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id               TEXT PRIMARY KEY,         -- UUID
  product_id       TEXT NOT NULL REFERENCES products(id),
  type             TEXT NOT NULL,            -- purchase|sale|manual_add|manual_remove|correction|cancel_restore
  quantity         INTEGER NOT NULL,         -- الكمية (موجبة دائمًا)
  previous_quantity INTEGER NOT NULL,
  new_quantity     INTEGER NOT NULL,
  reason           TEXT DEFAULT '',
  admin_username   TEXT DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON inventory_movements(created_at);

-- المرحلة 13: أحداث البحث (تحليلات بدون بيانات شخصية)
CREATE TABLE IF NOT EXISTS search_events (
  id               TEXT PRIMARY KEY,
  customer_id      TEXT REFERENCES customers(id),
  query            TEXT NOT NULL DEFAULT '',
  normalized_query TEXT NOT NULL DEFAULT '',
  results_count    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_search_norm ON search_events(normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_zero ON search_events(results_count, normalized_query);
CREATE INDEX IF NOT EXISTS idx_search_created ON search_events(created_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
