/* ==========================================================================
   أسواق البسيط — Cart
   نظام السلة: إضافة / حذف / كمية / إجمالي + حفظ في LocalStorage.
   لا يعتمد على أي Backend — جاهز للربط لاحقًا عبر Basit.Api.
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

  function load() {
    try {
      const raw = localStorage.getItem(storageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      items = Array.isArray(parsed) ? parsed.filter((l) => l && l.id && l.qty > 0) : [];
    } catch (e) {
      items = [];
    }
  }

  function save() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(items));
    } catch (e) { /* التخزين غير متاح — تستمر السلة في الذاكرة فقط */ }
  }

  /** بيانات العرض الموحدة لسطر السلة (اسم/سعر/أيقونة) */
  function resolveLine(line) {
    if (line.kind === "offer") {
      const offer = global.BasitData.getOffer(line.id);
      if (!offer) return null;
      return {
        key: line.key, kind: "offer", id: line.id, qty: line.qty,
        name: offer.name, desc: offer.items.join(" + "),
        price: offer.newPrice, oldPrice: offer.oldPrice,
        icon: offer.icon, tint: ["#ffedd5", "#fdba74"],
      };
    }
    const product = global.BasitData.getProduct(line.id);
    if (!product) return null;
    return {
      key: line.key, kind: "product", id: line.id, qty: line.qty,
      name: product.name, desc: product.desc,
      price: product.price, oldPrice: product.oldPrice || null,
      icon: product.icon, tint: product.tint,
    };
  }

  const Cart = {
    load,

    /** إضافة منتج أو عرض للسلة — يُرجع true عند النجاح */
    add(kind, id, qty) {
      qty = Math.max(1, Math.min(maxQty(), qty || 1));
      const key = makeKey(kind, id);
      const exists = items.find((l) => l.key === key);
      if (exists) {
        exists.qty = Math.min(maxQty(), exists.qty + qty);
      } else {
        // تحقق من وجود الصنف في البيانات قبل الإضافة
        const valid = kind === "offer"
          ? global.BasitData.getOffer(id)
          : global.BasitData.getProduct(id);
        if (!valid) return false;
        items.push({ key, kind, id, qty });
      }
      save();
      return true;
    },

    remove(key) {
      items = items.filter((l) => l.key !== key);
      save();
    },

    setQty(key, qty) {
      const line = items.find((l) => l.key === key);
      if (!line) return;
      line.qty = Math.max(0, Math.min(maxQty(), qty));
      if (line.qty === 0) this.remove(key);
      else save();
    },

    clear() {
      items = [];
      save();
    },

    /** كل سطور السلة مع بيانات العرض */
    lines() {
      return items.map(resolveLine).filter(Boolean);
    },

    /** إجمالي عدد القطع */
    count() {
      return items.reduce((sum, l) => sum + l.qty, 0);
    },

    /** الإجمالي الفرعي (قبل أي خصومات مستقبلية) */
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
      return this.subtotal();
    },

    isEmpty() {
      return items.length === 0;
    },
  };

  global.Basit = global.Basit || {};
  global.Basit.Cart = Cart;
})(window);
