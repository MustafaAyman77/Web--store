// ==========================================================================
// التحقق من أرقام الهاتف المصرية: 11 رقمًا تبدأ بـ 010/011/012/015
// يقبل الصيغ الشائعة (+20 / 0020 / أرقام عربية / مسافات وشرطات)
// ==========================================================================

export function normalizePhone(raw) {
  let s = String(raw ?? "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  s = s.replace(/[\s\-().]/g, "");
  if (s.startsWith("+20")) s = "0" + s.slice(3);
  else if (s.startsWith("0020")) s = "0" + s.slice(4);
  return s;
}

/** @returns رقم مطبّع صحيح أو null */
export function validateEgyptianPhone(raw) {
  const s = normalizePhone(raw);
  if (!/^[0-9]+$/.test(s)) return null;
  if (s.length !== 11) return null;
  if (s.slice(0, 2) !== "01") return null;
  if (!["0", "1", "2", "5"].includes(s[2])) return null;
  return s;
}
