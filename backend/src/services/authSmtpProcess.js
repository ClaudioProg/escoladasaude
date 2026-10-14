"use strict";

// Processo de vida curta e sem stdout/stderr. Segredos chegam somente pelo IPC.
const nodemailer = require("nodemailer");
const { controlled, validConfig } = require("./authSmtpSender");
let received = false;
process.once("message", async ({ config, payload } = {}) => {
  if (received) return;
  received = true;
  let transport;
  let outcome = { kind: "indeterminate" };
  try {
    if (!validConfig(config) || !payload || Object.keys(payload).some(k => !["to", "subject", "text"].includes(k))) throw new Error("INVALID");
    transport = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure,
      requireTLS: !config.secure, auth: { user: config.smtpUser, pass: config.smtpPass },
      pool: false, logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
      dnsTimeout: 10000, connectionTimeout: 20000, greetingTimeout: 10000, socketTimeout: 30000,
      tls: { rejectUnauthorized: true, servername: config.host } });
    const info = await transport.sendMail({ from: { name: config.fromName, address: config.fromAddr },
      to: payload.to, subject: payload.subject, text: payload.text,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}) });
    outcome = !info.dryRun && Array.isArray(info.accepted) && info.accepted.length === 1 &&
      String(info.accepted[0]).toLowerCase() === payload.to.toLowerCase() && !(info.rejected?.length)
      ? { kind: "accepted" } : { kind: "indeterminate" };
  } catch (error) {
    const status = Number.isInteger(error?.responseCode) ? error.responseCode : null;
    outcome = status >= 500 && status <= 599 ? { kind: "permanent", smtpStatus: status }
      : status >= 400 && status < 500 ? { kind: "temporary", smtpStatus: status } : { kind: "indeterminate" };
  } finally {
    transport?.close();
    payload = null; config = null;
    // Resultado sem resposta SMTP, email, token, URL, messageId, chave ou causa.
    if (process.send) process.send(controlled(outcome), () => process.exit(0));
    else process.exit(1);
  }
});
process.once("disconnect", () => process.exit(1));
