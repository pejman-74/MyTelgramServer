'use strict';
 class ExternalError extends Error {
  constructor(message) {
    super("e:" + message);
    this.name = "ExternalError";
  }
}
 class AuthError extends Error {
  constructor(message) {
    super("ae:" + message);
    this.name = "AuthError";
  }
}
module.exports = { AuthError, ExternalError }