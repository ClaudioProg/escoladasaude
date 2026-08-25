"use strict";

const crypto = require("node:crypto");

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const TOUCH_MS = 60 * 1000;
const REASON_RE = /^[a-z0-9_]+$/;

class AuthSessionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function makeToken(cryptoApi = crypto) {
  return cryptoApi.randomBytes(32).toString("base64url");
}

function hashToken(token, cryptoApi = crypto) {
  return cryptoApi.createHash("sha256").update(token, "utf8").digest();
}

function addMs(now, ms) {
  return new Date(now.getTime() + ms);
}

function rows(result) {
  return result?.rows || [];
}

function assertReason(reason) {
  if (!REASON_RE.test(reason)) throw new AuthSessionError("AUTH_SESSION_REASON_INVALID");
}

function createAuthSessionService({ db, cryptoApi = crypto, now = () => new Date() }) {
  if (!db?.tx) throw new Error("AUTH_SESSION_DB_REQUIRED");

  async function getProfiles(executor, usuarioId) {
    const result = await executor.query(
      `SELECT perfil_codigo FROM public.auth_usuario_perfis WHERE usuario_id = $1 ORDER BY perfil_codigo`,
      [usuarioId],
    );
    return rows(result).map((row) => row.perfil_codigo);
  }

  async function createSession({ usuarioId, manterConectado = false, userAgent = null, ip = null, areaInicial = null }) {
    const token = makeToken(cryptoApi);
    const tokenHash = hashToken(token, cryptoApi);
    const createdAt = now();
    const absoluteLimit = manterConectado ? addMs(createdAt, ABSOLUTE_MS) : null;
    const expiresAt = addMs(createdAt, IDLE_MS);
    const id = cryptoApi.randomUUID();

    const session = await db.tx(async (tx) => {
      const user = await tx.query(
        `SELECT id FROM public.usuarios WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [usuarioId],
      );
      if (rows(user).length !== 1) throw new AuthSessionError("AUTH_SESSION_USER_UNAVAILABLE");

      const perfis = await getProfiles(tx, usuarioId);
      let areaAtiva = areaInicial;
      if (areaAtiva !== null && areaAtiva !== undefined) {
        if (!perfis.includes(areaAtiva)) throw new AuthSessionError("AUTH_SESSION_AREA_NOT_GRANTED");
      } else {
        const context = await tx.query(
          `SELECT ultima_area_ativa FROM public.auth_usuario_contexto WHERE usuario_id = $1`,
          [usuarioId],
        );
        areaAtiva = rows(context)[0]?.ultima_area_ativa;
        if (!perfis.includes(areaAtiva)) areaAtiva = "usuario";
      }
      if (!perfis.includes(areaAtiva)) throw new AuthSessionError("AUTH_SESSION_AREA_NOT_GRANTED");

      const active = rows(await tx.query(
        `SELECT id FROM public.auth_sessao
          WHERE usuario_id = $1 AND revogada_em IS NULL AND expira_em > $2
            AND (limite_absoluto_em IS NULL OR limite_absoluto_em > $2)
          ORDER BY criada_em ASC, id ASC FOR UPDATE`,
        [usuarioId, createdAt],
      ));
      for (const old of active.slice(0, Math.max(0, active.length - 4))) {
        await tx.query(
          `UPDATE public.auth_sessao SET revogada_em = $2, motivo_revogacao = 'session_limit'
            WHERE id = $1 AND revogada_em IS NULL`,
          [old.id, createdAt],
        );
      }
      await tx.query(
        `INSERT INTO public.auth_sessao
          (id, usuario_id, token_hash, criada_em, ultimo_uso_em, expira_em,
           limite_absoluto_em, manter_conectado, area_ativa, user_agent, ip_criacao, ultimo_ip)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$10)`,
        [id, usuarioId, tokenHash, createdAt, expiresAt, absoluteLimit, Boolean(manterConectado), areaAtiva, userAgent, ip],
      );
      return { id, usuarioId, areaAtiva, criadaEm: createdAt, expiraEm: expiresAt, limiteAbsolutoEm: absoluteLimit, manterConectado: Boolean(manterConectado) };
    });
    return { token, session };
  }

  async function validateSession(token) {
    const instant = now();
    const tokenHash = hashToken(token, cryptoApi);
    const result = await db.query(
      `SELECT s.id, s.usuario_id, s.area_ativa, s.expira_em, s.limite_absoluto_em,
              s.revogada_em, u.deleted_at
         FROM public.auth_sessao s JOIN public.usuarios u ON u.id = s.usuario_id
        WHERE s.token_hash = $1`, [tokenHash],
    );
    const session = rows(result)[0];
    if (!session || session.revogada_em || session.deleted_at || new Date(session.expira_em) <= instant ||
      (session.limite_absoluto_em && new Date(session.limite_absoluto_em) <= instant)) {
      throw new AuthSessionError("AUTH_SESSION_INVALID");
    }
    const perfis = await getProfiles(db, session.usuario_id);
    if (!perfis.includes("usuario")) throw new AuthSessionError("AUTH_SESSION_INVALID");
    let areaAtiva = session.area_ativa;
    if (!perfis.includes(areaAtiva)) {
      areaAtiva = "usuario";
      await db.query(`UPDATE public.auth_sessao SET area_ativa = $2 WHERE id = $1`, [session.id, areaAtiva]);
    }
    return { id: session.usuario_id, perfis, areaAtiva, sessionId: session.id };
  }

  async function touchSession(sessionId) {
    const instant = now();
    const candidate = addMs(instant, IDLE_MS);
    const result = await db.query(
      `UPDATE public.auth_sessao
          SET ultimo_uso_em = $2,
              expira_em = CASE WHEN limite_absoluto_em IS NULL THEN $3 ELSE LEAST($3, limite_absoluto_em) END
        WHERE id = $1 AND revogada_em IS NULL AND expira_em > $2
          AND (limite_absoluto_em IS NULL OR limite_absoluto_em > $2)
          AND ultimo_uso_em <= $4
        RETURNING id`,
      [sessionId, instant, candidate, addMs(instant, -TOUCH_MS)],
    );
    return { written: rows(result).length === 1 };
  }

  async function revokeSession(sessionId, reason) {
    assertReason(reason);
    const result = await db.query(
      `UPDATE public.auth_sessao SET revogada_em = $2, motivo_revogacao = $3
        WHERE id = $1 AND revogada_em IS NULL RETURNING id`, [sessionId, now(), reason],
    );
    return { revoked: rows(result).length === 1 };
  }

  async function revokeUserSessions(usuarioId, reason, exceptSessionId = null) {
    assertReason(reason);
    const result = await db.query(
      `UPDATE public.auth_sessao SET revogada_em = $2, motivo_revogacao = $3
        WHERE usuario_id = $1 AND revogada_em IS NULL AND ($4::uuid IS NULL OR id <> $4)`,
      [usuarioId, now(), reason, exceptSessionId],
    );
    return { revoked: result?.rowCount || 0 };
  }

  async function changeActiveArea({ sessionId, usuarioId, areaAtiva }) {
    return db.tx(async (tx) => {
      const granted = await getProfiles(tx, usuarioId);
      if (!granted.includes(areaAtiva)) throw new AuthSessionError("AUTH_SESSION_AREA_NOT_GRANTED");
      const changed = await tx.query(
        `UPDATE public.auth_sessao SET area_ativa = $3
          WHERE id = $1 AND usuario_id = $2 AND revogada_em IS NULL RETURNING id`,
        [sessionId, usuarioId, areaAtiva],
      );
      if (rows(changed).length !== 1) throw new AuthSessionError("AUTH_SESSION_INVALID");
      await tx.query(
        `INSERT INTO public.auth_usuario_contexto (usuario_id, ultima_area_ativa, atualizado_em)
         VALUES ($1,$2,$3)
         ON CONFLICT (usuario_id) DO UPDATE SET ultima_area_ativa = EXCLUDED.ultima_area_ativa,
           atualizado_em = EXCLUDED.atualizado_em`, [usuarioId, areaAtiva, now()],
      );
      return { areaAtiva };
    });
  }

  return { createSession, validateSession, touchSession, revokeSession, revokeUserSessions, changeActiveArea };
}

module.exports = { AuthSessionError, createAuthSessionService, hashToken, makeToken, IDLE_MS, ABSOLUTE_MS, TOUCH_MS };
