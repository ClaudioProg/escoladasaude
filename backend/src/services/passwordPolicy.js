"use strict";

const { ZxcvbnFactory } = require("@zxcvbn-ts/core");
const common = require("@zxcvbn-ts/language-common");
const portuguese = require("@zxcvbn-ts/language-pt-br");
const { isCommonPassword } = require("./passwordBlocklist");

const meter = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...portuguese.dictionary },
  graphs: common.adjacencyGraphs,
});
const NAME_PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);

function text(value) {
  return typeof value === "string" ? value.normalize("NFKC").toLowerCase() : "";
}

function dateParts(value) {
  const input = value instanceof Date && !Number.isNaN(value.getTime())
    ? value.toISOString().slice(0, 10)
    : text(value);
  let day;
  let month;
  let year;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (match) [, year, month, day] = match;
  else {
    match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
    if (match) [, day, month, year] = match;
    else return null;
  }
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1]) return null;
  return { day, month, year };
}

function personalInputs(context) {
  const name = text(context.nome);
  const nameTokens = [...new Set(name.split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((token) => [...token].length >= 4 && !NAME_PARTICLES.has(token)))];
  const cpfDigits = text(context.cpf).replace(/\D/g, "");
  const phoneDigits = text(context.celular).replace(/\D/g, "");
  const email = text(context.email);
  const localPart = email.includes("@") ? email.split("@")[0] : "";
  const birth = dateParts(context.dataNascimento);
  const birthDates = birth ? [
    `${birth.day}${birth.month}${birth.year}`,
    `${birth.day}/${birth.month}/${birth.year}`,
    `${birth.year}${birth.month}${birth.day}`,
    `${birth.year}-${birth.month}-${birth.day}`,
  ] : [];
  const userInputs = [...new Set([
    name, ...nameTokens,
    cpfDigits.length === 11 ? cpfDigits : "",
    phoneDigits.length >= 10 && phoneDigits.length <= 13 ? phoneDigits : "",
    email, localPart, ...birthDates,
  ].filter(Boolean))];
  return { nameTokens, cpfDigits, phoneDigits, email, localPart, birth, birthDates, userInputs };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCompleteNumericMatch(password, expectedDigits) {
  if (!expectedDigits) return false;
  const candidates = password.match(/\d(?:[\d .()+-]*\d)?/g) || [];
  return candidates.some((candidate) => candidate.replace(/[ .()+-]/g, "") === expectedDigits);
}

function hasStrongPersonalMatch(password, data) {
  const comparable = password.toLowerCase();
  if (data.cpfDigits.length === 11 && hasCompleteNumericMatch(comparable, data.cpfDigits)) return true;
  if (data.phoneDigits.length >= 10 && data.phoneDigits.length <= 13 &&
    hasCompleteNumericMatch(comparable, data.phoneDigits)) return true;
  if (data.email && comparable.includes(data.email)) return true;
  if ([...data.localPart].length >= 4 && comparable.includes(data.localPart)) return true;
  if (data.birthDates.some((date) => comparable.includes(date))) return true;
  if (data.birth) {
    const year = data.birth.year;
    for (const token of data.nameTokens) {
      const nameYear = new RegExp(`${escapeRegExp(token)}[ ._-]{0,3}${year}|${year}[ ._-]{0,3}${escapeRegExp(token)}`, "u");
      if (nameYear.test(comparable)) return true;
    }
  }
  return false;
}

function rejectionCode(normalizedPassword, context, dependencies = {}) {
  const checkCommon = dependencies.isCommonPassword || isCommonPassword;
  const checkStrength = dependencies.checkStrength || ((password, inputs) => meter.check(password, inputs).score);
  if (checkCommon(normalizedPassword)) return "PASSWORD_TOO_COMMON";
  const personal = personalInputs(context);
  if (hasStrongPersonalMatch(normalizedPassword, personal)) return "PASSWORD_PERSONAL_DATA";
  return checkStrength(normalizedPassword, personal.userInputs) >= 3 ? null : "PASSWORD_PREDICTABLE";
}

module.exports = { rejectionCode, personalInputs, hasStrongPersonalMatch, dateParts };
