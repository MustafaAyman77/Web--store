// ==========================================================================
// خطأ API موحد: { success:false, error:{ code, message } } + status مناسب
// ==========================================================================

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static badRequest(code, message) {
    return new ApiError(400, code, message);
  }
  static unauthorized(message = "غير مصرّح — سجّل الدخول أولًا.") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }
  static notFound(code, message) {
    return new ApiError(404, code, message);
  }
  static conflict(code, message) {
    return new ApiError(409, code, message);
  }
  static forbidden(code, message) {
    return new ApiError(403, code, message);
  }
  static tooManyRequests(code, message) {
    return new ApiError(429, code, message);
  }
  static internal(code, message) {
    return new ApiError(500, code, message);
  }
}

export default ApiError;
