import { useCallback, useEffect, useRef, useState } from "react";

const fileIdentityByObject = new WeakMap();
let nextFileIdentity = 1;

function text(value) {
  return String(value ?? "").trim();
}

function positiveId(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function uniqueSortedIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(positiveId).filter(Boolean))].sort(
    (a, b) => a - b,
  );
}

function uniqueSortedTexts(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(text).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function canonicalDate(value) {
  const match = text(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

function canonicalTime(value) {
  const match = text(value).match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function canonicalTurma(turma = {}) {
  const datas = (Array.isArray(turma.datas) ? turma.datas : [])
    .map((data) => ({
      data: canonicalDate(data?.data),
      horario_inicio: canonicalTime(data?.horario_inicio),
      horario_fim: canonicalTime(data?.horario_fim),
    }))
    .filter((data) => data.data)
    .sort((a, b) =>
      `${a.data}|${a.horario_inicio}|${a.horario_fim}`.localeCompare(
        `${b.data}|${b.horario_inicio}|${b.horario_fim}`,
      ),
    );

  return {
    id: positiveId(turma.id),
    nome: text(turma.nome),
    vagas_total: numberOrZero(turma.vagas_total),
    carga_horaria: numberOrZero(turma.carga_horaria),
    datas,
    // Relações sem posição persistida são conjuntos.
    organizadores: uniqueSortedIds(turma.organizadores),
    // A ordem é preservada: palestrantes e assinantes possuem ordem funcional.
    palestrantes: (Array.isArray(turma.palestrantes) ? turma.palestrantes : [])
      .map((palestrante) => ({
        nome: text(
          typeof palestrante === "string" ? palestrante : palestrante?.nome,
        ),
        usuario_id: positiveId(palestrante?.usuario_id),
      }))
      .filter((palestrante) => palestrante.nome || palestrante.usuario_id),
    assinantes: (Array.isArray(turma.assinantes) ? turma.assinantes : [])
      .map(positiveId)
      .filter(Boolean),
  };
}

export function getStableFileIdentity(file) {
  if (!file || (typeof file !== "object" && typeof file !== "function")) {
    return null;
  }

  if (!fileIdentityByObject.has(file)) {
    fileIdentityByObject.set(file, nextFileIdentity);
    nextFileIdentity += 1;
  }

  return fileIdentityByObject.get(file);
}

function canonicalFile(file) {
  if (!file) {
    return null;
  }

  return {
    identity: getStableFileIdentity(file),
    name: text(file.name),
    size: numberOrZero(file.size),
    lastModified: numberOrZero(file.lastModified),
  };
}

export function createCanonicalEditorSnapshot(payload = {}) {
  const restrito = Boolean(payload.restrito);
  const restritoModo = restrito ? text(payload.restrito_modo) || null : null;

  return JSON.stringify({
    titulo: text(payload.titulo),
    descricao: text(payload.descricao),
    local: text(payload.local),
    tipo: text(payload.tipo),
    unidade_id: positiveId(payload.unidade_id),
    publico_alvo: text(payload.publico_alvo),
    conteudo_programatico: text(payload.conteudo_programatico),
    termo_ativo: Boolean(payload.termo_ativo),
    termo_titulo: payload.termo_ativo ? text(payload.termo_titulo) : "",
    termo_conteudo_html: payload.termo_ativo
      ? text(payload.termo_conteudo_html)
      : "",
    // A ordem visual das turmas é preservada.
    turmas: (Array.isArray(payload.turmas) ? payload.turmas : []).map(
      canonicalTurma,
    ),
    restrito,
    restrito_modo: restritoModo,
    registros_permitidos:
      restritoModo === "lista_registros"
        ? uniqueSortedTexts(payload.registros_permitidos)
        : [],
    cargos_permitidos:
      restritoModo === "cargos"
        ? uniqueSortedIds(payload.cargos_permitidos)
        : [],
    unidades_permitidas:
      restritoModo === "unidades"
        ? uniqueSortedIds(payload.unidades_permitidas)
        : [],
    remover_folder: Boolean(payload.remover_folder),
    remover_programacao: Boolean(payload.remover_programacao),
    folderFile: canonicalFile(payload.folderFile),
    programacaoFile: canonicalFile(payload.programacaoFile),
  });
}

export function createPersistedEditorSnapshot(payload = {}) {
  const persisted = { ...payload };
  delete persisted.folderFile;
  delete persisted.programacaoFile;
  delete persisted.remover_folder;
  delete persisted.remover_programacao;
  return createCanonicalEditorSnapshot(persisted);
}

export function isEditorDirty(currentSnapshot, savedSnapshot) {
  return savedSnapshot !== null && currentSnapshot !== savedSnapshot;
}

export function useEditorSavedSnapshot(currentSnapshotRef) {
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [hydrationRevision, setHydrationRevision] = useState(0);
  const appliedRevisionRef = useRef(0);

  const markEditorHydrated = useCallback(() => {
    setHydrationRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    if (
      hydrationRevision === 0 ||
      appliedRevisionRef.current === hydrationRevision ||
      currentSnapshotRef.current === null
    ) {
      return;
    }

    appliedRevisionRef.current = hydrationRevision;
    setSavedSnapshot(currentSnapshotRef.current);
  }, [currentSnapshotRef, hydrationRevision]);

  return {
    markEditorHydrated,
    savedSnapshot,
    setSavedSnapshot,
  };
}

export function shouldBlockEditorNavigation({
  dirty,
  allowNavigation = false,
}) {
  return Boolean(dirty && !allowNavigation);
}

export function settleBlockedNavigation(blocker, decision) {
  if (blocker?.state !== "blocked") {
    return false;
  }

  if (decision === "confirm") {
    blocker.proceed();
    return true;
  }

  if (decision === "cancel") {
    blocker.reset();
    return true;
  }

  return false;
}

export function confirmBlockedNavigation(blocker) {
  settleBlockedNavigation(blocker, "confirm");
  // ModalConfirmacao interpreta false como "não chame onClose". A própria
  // transição do router desmonta o modal sem converter confirmação em reset.
  return false;
}

export function attachBeforeUnloadGuard(target) {
  const handler = (event) => {
    event.preventDefault();
    event.returnValue = "";
  };

  target.addEventListener("beforeunload", handler);
  return () => target.removeEventListener("beforeunload", handler);
}
