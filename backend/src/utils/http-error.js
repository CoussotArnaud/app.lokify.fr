export default class HttpError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options.code || null;
    this.details = options.details || null;
  }
}
