/* ==========================================================================
   أسواق البسيط — Cart
   نظام السلة: إضافة / حذف / كمية / إجمالي + حفظ في LocalStorage.
   لا يعتمد على أي Backend — جاهز للربط لاحقًا عبر Basit.Api.
   --------------------------------------------------------------------------
   🛡️ حماية مدمجة:
   - رفض المنتجات غير المتوفرة أو غير الموجودة
   - رفض الكميات غير الصالحة والأسعار غير الصالحة
   - LocalStorage تالف → سلة فارغة بدل كسر الموقع
   ========================================================================== */
(function (global) {
  "use strict";

  const storageKey = () => global.BasitConfig.cart.storageKey;
  const maxQty = () => global.BasitConfig.cart.maxQtyPerItem;

  /** عنصر السلة: { key, kind: "product"|"offer", id, qty } */
  let items = [];

  function makeKey(kind, id) {
    return kind + ":" + id;
  }

  function validQty(qty) {
    qty = Math.floor(Number(qty));
    if (!Number.isFinite(qty)) return 0;
    return Math.max(0, Math.min(maxQty(), qty));
  }

  function validPrice(n) {
    n = Number(n);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function load() {
    try {
      const raw = localStorage.getItem(storageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) { items = []; return; }
      // تحقق صارم من شكل كل سطر — أي سطر تالف يُتجاهل
      items = parsed.filter((l) =>
        l && typeof l === "object" &&
        (l.kind === "product" || l.kind === "offer") &&
        typeof l.id === "string" && l.id.length > 0 &&
        validQty(l.qty) > 0
      ).map((l) => ({ key: makeKey(l.kind, l.id), kind: l.kind, id: l.id, qty: validQty(l.qty) }));
    } catch (e) {
      items = []; // تخزين تالف أو غير متاح → نبدأ بسلة فارغة
    }
  }

  function save() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(items));
    } catch (e) { /* التخزين غير متاح — تستمر السلة في الذاكرة فقط */ }
  }

  /** هل الصنف صالح للإضافة؟ (موجود + متوفر + سعر سليم) */
  function isSellable(kind, id) {
    if (kind === "offer") {
      const offer = global.BasitData.getOffer(id);
      return !!(offer && validPrice(offer.newPrice) > 0);
    }
    const product = global.BasitData.getProduct(id);
    if (!product || validPrice(product.price) <= 0) return false;
    return product.available !== false; // الافتراضي متوفر
  }

  /** بيانات العرض الموحدة لسطر السلة (اسم/سعر/أيقونة) */
  function resolveLine(line) {
    if (line.kind === "offer") {
      const offer = global.BasitData.getOffer(line.id);
      if (!offer) return null;
      return {
        key: line.key, kind: "offer", id: line.id, qty: line.qty,
        name: offer.name, desc: offer.items.join(" + "),
        price: validPrice(offer.newPrice),
        oldPrice: offer.oldPrice > offer.newPrice ? validPrice(offer.oldPrice) : null,
        icon: offer.icon, tint: ["#ffedd5", "#fdba74"],
      };
    }
    const product = global.BasitData.getProduct(line.id);
    if (!product) return null;
    return {
      key: line.key, kind: "product", id: line.id, qty: line.qty,
      name: product.name, desc: product.desc,
      price: validPrice(product.price),
      oldPrice: product.oldPrice > product.price ? validPrice(product.oldPrice) : null,
      icon: product.icon, tint: product.tint || ["#f1f5f9", "#e2e8f0"],
    };
  }

  const Cart = {
    load,

    /**
     * إضافة منتج أو عرض للسلة.
     * @returns "added" | "unavailable" | "invalid"
     */
    add(kind, id, qty) {
      if ((kind !== "product" && kind !== "offer") || typeof id !== "string" || !id) {
        return "invalid";
      }
      if (!isSellable(kind, id)) return "unavailable";
      qty = validQty(qty == null ? 1 : qty);
      if (qty < 1) return "invalid";

      const key = makeKey(kind, id);
      const exists = items.find((l) => l.key === key);
      if (exists) {
        exists.qty = Math.min(maxQty(), exists.qty + qty);
      } else {
        items.push({ key, kind, id, qty });
      }
      save();
      return "added";
    },

    remove(key) {
      const before = items.length;
      items = items.filter((l) => l.key !== key);
      if (items.length !== before) save();
    },

    setQty(key, qty) {
      const line = items.find((l) => l.key === key);
      if (!line) return;
      const q = validQty(qty);
      if (q === 0) this.remove(key);
      else { line.qty = q; save(); }
    },

    clear() {
      if (!items.length) return;
      items = [];
      save();
    },

    /** كل سطور السلة مع بيانات العرض */
    lines() {
      return items.map(resolveLine).filter(Boolean);
    },

    /** إجمالي عدد القطع (وليس عدد الأصناف) */
    count() {
      return items.reduce((sum, l) => sum + validQty(l.qty), 0);
    },

    /** عدد الأصناف المختلفة */
    kinds() {
      return items.length;
    },

    /** إجمالي المنتجات */
    subtotal() {
      return this.lines().reduce((sum, l) => sum + l.price * l.qty, 0);
    },

    /** إجمالي التوفير من العروض والخصومات */
    savings() {
      return this.lines().reduce((sum, l) => {
        if (!l.oldPrice || l.oldPrice <= l.price) return sum;
        return sum + (l.oldPrice - l.price) * l.qty;
      }, 0);
    },

    total() {
      return this.subtotal(); // لا توجد رسوم إضافية في هذه المرحلة
    },

    isEmpty() {
      return items.length === 0;
    },
  };

  global.Basit = global.Basit || {};
  global.Basit.Cart = Cart;
})(window);
