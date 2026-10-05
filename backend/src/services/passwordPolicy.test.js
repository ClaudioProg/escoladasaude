"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const argon2 = require("argon2");
const service = require("./passwordService");
const { rejectionCode, personalInputs, hasStrongPersonalMatch } = require("./passwordPolicy");

const password = "O tamanduá observa nuvens distantes em silêncio";
const context = {
  nome: "Maria de Souza",
  cpf: "123.456.789-09",
  email: "maria.souza@exemplo.org",
  celular: "(11) 98765-4321",
  dataNascimento: "1990-07-21",
};
const strongMeter = { isCommonPassword: () => false, checkStrength: () => 4 };

test("score 0 a 2 rejeita; 3 e 4 prosseguem sem categorias artificiais", () => {
  for (const score of [0, 1, 2, 3, 4]) {
    const result = rejectionCode(password, {}, { isCommonPassword: () => false, checkStrength: () => score });
    assert.equal(result, score < 3 ? "PASSWORD_PREDICTABLE" : null);
  }
  assert.equal(rejectionCode("abcabcabcabcabcabc", {}, { isCommonPassword: () => false }), "PASSWORD_PREDICTABLE");
  assert.equal(rejectionCode(password, {}, { isCommonPassword: () => false }), null);
});

test("ordem bloqueia blocklist antes de contexto e medidor", () => {
  let meterCalled = false;
  const result = rejectionCode("12345678909 e outra frase", context, {
    isCommonPassword: () => true,
    checkStrength: () => { meterCalled = true; return 4; },
  });
  assert.equal(result, "PASSWORD_TOO_COMMON");
  assert.equal(meterCalled, false);
});

test("CPF e celular completos bloqueiam com e sem pontuacao", () => {
  for (const candidate of [
    "Azul-12345678909-verde", "Azul-123.456.789-09-verde", "Azul 123 456 789 09 verde",
    "planta11987654321serena", "planta(11)98765-4321serena", "planta11 98765 4321serena",
  ]) {
    assert.equal(rejectionCode(candidate, context, strongMeter), "PASSWORD_PERSONAL_DATA");
  }
  assert.equal(rejectionCode("caminho 4321 sob nuvens", context, strongMeter), null);
});

test("comparacao numerica nao concatena palavras nem aceita substring de numero maior", () => {
  for (const candidate of [
    "lago123texto456texto78909", "lago991234567890977", "lago123@45678909",
    "lago11texto98765texto4321", "lago991198765432177", "lago11/987654321",
  ]) {
    assert.equal(rejectionCode(candidate, context, strongMeter), null, candidate);
  }
});

test("email, local-part significativo e data completa bloqueiam", () => {
  for (const candidate of [
    "SenhaLonga-MARIA.SOUZA@EXEMPLO.ORG", "flores-maria.souza-celestes",
    "Outro caminho 21071990", "Outro caminho 21/07/1990",
    "Outro caminho 19900721", "Outro caminho 1990-07-21",
  ]) {
    assert.equal(rejectionCode(candidate, context, strongMeter), "PASSWORD_PERSONAL_DATA");
  }
  assert.equal(rejectionCode("caminho de 1990 entre flores", context, strongMeter), null);
  assert.equal(rejectionCode("caminho de 21/07 entre flores", context, strongMeter), null);
  assert.equal(rejectionCode("lista de ana sob nuvens", { email: "ana@exemplo.org" }, strongMeter), null);
});

test("nome mais ano e ano mais nome bloqueiam; nome isolado e particulas nao", () => {
  for (const candidate of ["maria_1990 sob o céu", "1990-souza dois caminhos"]) {
    assert.equal(rejectionCode(candidate, context, strongMeter), "PASSWORD_PERSONAL_DATA");
  }
  const data = personalInputs(context);
  assert.deepEqual(data.nameTokens, ["maria", "souza"]);
  assert.equal(data.userInputs.includes("de"), false);
  assert.equal(hasStrongPersonalMatch("maria visita o observatorio sob estrelas distantes", data), false);
  assert.equal(rejectionCode("maria visita o observatorio sob estrelas distantes", context, strongMeter), null);
});

test("campos fora do contexto permitido sao ignorados e nulls funcionam", () => {
  const extra = { nome: null, cpf: null, email: null, celular: null, dataNascimento: null,
    registro: "matricula-secreta", unidade: "hospital", cargo: "medico" };
  assert.equal(rejectionCode("hospital e matricula-secreta", extra, strongMeter), null);
  assert.deepEqual(personalInputs(extra).userInputs, []);
});

test("API publica exige contexto explicito e nao exporta hash direto", async () => {
  assert.deepEqual(Object.keys(service).sort(), [
    "PasswordServiceError", "createNewPasswordHash", "upgradeLegacyPasswordHash", "verifyPassword",
  ].sort());
  await assert.rejects(service.createNewPasswordHash(password), { code: "PASSWORD_INVALID_CONTEXT" });
  await assert.rejects(service.createNewPasswordHash(password, null), { code: "PASSWORD_INVALID_CONTEXT" });
  const hash = await service.createNewPasswordHash(password, {});
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  assert.equal((await service.verifyPassword(password, hash)).authenticated, true);
  const nullFields = { nome: null, cpf: null, email: null, celular: null, dataNascimento: null };
  assert.match(await service.createNewPasswordHash(password, nullFields), /^\$argon2id\$/);
});

test("contexto aceita limites em code points e rejeita excedente sem truncar", async () => {
  const limits = { nome: 200, cpf: 32, email: 320, celular: 32, dataNascimento: 32 };
  for (const [field, limit] of Object.entries(limits)) {
    const atLimit = { [field]: "😀".repeat(limit) };
    assert.match(await service.createNewPasswordHash(password, atLimit), /^\$argon2id\$/);
    await assert.rejects(service.createNewPasswordHash(password, { [field]: "😀".repeat(limit + 1) }),
      { code: "PASSWORD_INVALID_CONTEXT" });
  }
});

test("contexto rejeita tipos nao textuais e aceita campos ausentes, null e undefined", async () => {
  for (const field of ["nome", "cpf", "email", "celular", "dataNascimento"]) {
    for (const value of [123, true, {}, []]) {
      await assert.rejects(service.createNewPasswordHash(password, { [field]: value }),
        { code: "PASSWORD_INVALID_CONTEXT" });
    }
  }
  await assert.rejects(service.createNewPasswordHash(password, { dataNascimento: new Date(Date.UTC(1990, 6, 21)) }),
    { code: "PASSWORD_INVALID_CONTEXT" });
  assert.match(await service.createNewPasswordHash(password, {}), /^\$argon2id\$/);
  assert.match(await service.createNewPasswordHash(password, { nome: null, email: undefined }), /^\$argon2id\$/);
});

test("contexto enorme falha antes de chamar zxcvbn", async () => {
  const { ZxcvbnFactory } = require("@zxcvbn-ts/core");
  const originalCheck = ZxcvbnFactory.prototype.check;
  let calls = 0;
  ZxcvbnFactory.prototype.check = function (...args) { calls += 1; return originalCheck.apply(this, args); };
  try {
    await assert.rejects(service.createNewPasswordHash(password, { nome: "x".repeat(100000) }),
      { code: "PASSWORD_INVALID_CONTEXT" });
    assert.equal(calls, 0);
  } finally {
    ZxcvbnFactory.prototype.check = originalCheck;
  }
});

test("codigos e mensagens publicas sao estaveis e sanitizados", async () => {
  await assert.rejects(service.createNewPasswordHash("abcabcabcabcabcabc", {}), {
    code: "PASSWORD_PREDICTABLE", message: "Escolha uma senha menos previsível.",
  });
  const fs = require("node:fs");
  const path = require("node:path");
  const first = fs.readFileSync(path.resolve(__dirname, "../security/password-common-2097.txt"), "utf8").split("\n")[0];
  await assert.rejects(service.createNewPasswordHash(first, {}), {
    code: "PASSWORD_TOO_COMMON", message: "Escolha uma senha menos comum.",
  });
});

test("falhas de politica nao produzem hash e erros nao revelam senha ou PII", async () => {
  const original = argon2.hash;
  argon2.hash = async () => { throw new Error("hash nao deveria executar"); };
  try {
    await assert.rejects(service.createNewPasswordHash("Azul-12345678909-verde", context), (error) => {
      assert.equal(error.code, "PASSWORD_PERSONAL_DATA");
      assert.equal(error.message, "Escolha uma senha que não utilize informações pessoais.");
      for (const secret of ["12345678909", "Maria", "maria.souza", "1990", "Azul"]) {
        assert.equal(error.message.includes(secret), false);
      }
      return true;
    });
  } finally {
    argon2.hash = original;
  }
});

test("validacao local nao chama fetch nem registra senha ou contexto", async () => {
  const originalFetch = global.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  let externalCalls = 0;
  let logs = 0;
  global.fetch = async () => { externalCalls += 1; throw new Error("rede proibida"); };
  console.log = () => { logs += 1; };
  console.error = () => { logs += 1; };
  try {
    await assert.rejects(service.createNewPasswordHash("Azul-12345678909-verde", context), {
      code: "PASSWORD_PERSONAL_DATA",
    });
    assert.equal(externalCalls, 0);
    assert.equal(logs, 0);
  } finally {
    global.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
  }
});

test("falha operacional da politica falha fechado sem revelar conteudo", async () => {
  const hostileContext = {};
  Object.defineProperty(hostileContext, "nome", { get() { throw new Error("segredo interno"); } });
  await assert.rejects(service.createNewPasswordHash(password, hostileContext), (error) => {
    assert.equal(error.code, "PASSWORD_POLICY_OPERATION_FAILED");
    assert.equal(error.message, "Falha na validação da senha.");
    assert.equal(error.message.includes("segredo interno"), false);
    return true;
  });
});

test("upgrade de bcrypt fraco permanece independente da politica 1B", async () => {
  const legacy = await bcrypt.hash("curta", 4);
  const upgraded = await service.upgradeLegacyPasswordHash("curta", legacy);
  assert.equal((await service.verifyPassword("curta", upgraded)).authenticated, true);
});
