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
  popularity     INTEGER NOT NULL DEFAULT 50,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,               -- UUID
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL UNIQUE,           -- رقم مصري 11 رقمًا
  address    TEXT DEFAULT '',
  area       TEXT DEFAULT '',
  landmark   TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

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
  price        REAL NOT NULL,                -- سعر الوحدة وقت الشراء
  subtotal     REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS admins (
  id            TEXT PRIMARY KEY,            -- UUID
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,               -- bcrypt — لا يُعرض عبر API أبدًا
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
