// تغليف الـ async route handlers حتى تصل الأخطاء لموحّد الأخطاء
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
