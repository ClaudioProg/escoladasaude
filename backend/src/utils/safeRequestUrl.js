"use strict";

function safeRequestUrl(req) {
  const url = String(req?.originalUrl || req?.url || "");
  if (/^\/api\/relatorio(?:\/|\?|$)/i.test(url)) {
    return url.split("?")[0];
  }
  return url;
}

module.exports = { safeRequestUrl };
