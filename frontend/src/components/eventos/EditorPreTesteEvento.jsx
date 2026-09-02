import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardPlus,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import EventoService from "../../services/eventoService";
import { executePreTesteOperation } from "./preTesteFlowState";

function mensagemErro(error) {
  return (
    error?.data?.message ||
    error?.message ||
    "Não foi possível atualizar o pré-teste."
  );
}

function QuestaoEditor({
  pergunta,
  index,
  total,
  bloqueado,
  onAtualizar,
  onExcluir,
  onMover,
  onAdicionarAlternativa,
  onAtualizarAlternativa,
  onExcluirAlternativa,
  onMoverAlternativa,
}) {
  const [tipo, setTipo] = useState(pergunta.tipo);
  const [modoResposta, setModoResposta] = useState(
    pergunta.modo_resposta || "resposta_unica",
  );
  const [enunciado, setEnunciado] = useState(pergunta.enunciado);
  const [novaAlternativa, setNovaAlternativa] = useState("");

  useEffect(() => {
    setTipo(pergunta.tipo);
    setModoResposta(pergunta.modo_resposta || "resposta_unica");
    setEnunciado(pergunta.enunciado);
  }, [pergunta.enunciado, pergunta.modo_resposta, pergunta.tipo]);

  return (
    <article className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300">
          Pergunta {index + 1} —{" "}
          {tipo === "multipla_escolha" ? "Múltipla escolha" : "Dissertativa"}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onMover(index, index - 1)}
            disabled={bloqueado || index === 0}
            aria-label="Mover pergunta para cima"
            className="rounded-lg border p-1.5 disabled:opacity-40 dark:border-slate-700"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMover(index, index + 1)}
            disabled={bloqueado || index === total - 1}
            aria-label="Mover pergunta para baixo"
            className="rounded-lg border p-1.5 disabled:opacity-40 dark:border-slate-700"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onExcluir(pergunta.id)}
            disabled={bloqueado}
            aria-label="Excluir pergunta"
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-40 dark:border-rose-900"
          >
            <Trash2 className="h-4 w-4" /> Excluir pergunta
          </button>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-3">
        <label className="grid max-w-xs gap-1 text-xs font-bold">
          Tipo
          <select
            value={tipo}
            onChange={(event) => setTipo(event.target.value)}
            disabled={bloqueado}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="multipla_escolha">Múltipla escolha</option>
            <option value="dissertativa">Dissertativa</option>
          </select>
        </label>
        {tipo === "multipla_escolha" && (
          <fieldset className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <legend className="px-1 text-xs font-black">
              Tipo de resposta
            </legend>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="radio"
                name={`modo-resposta-${pergunta.id}`}
                checked={modoResposta === "resposta_unica"}
                onChange={() => setModoResposta("resposta_unica")}
                disabled={bloqueado}
              />
              Apenas uma alternativa
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="radio"
                name={`modo-resposta-${pergunta.id}`}
                checked={modoResposta === "respostas_multiplas"}
                onChange={() => setModoResposta("respostas_multiplas")}
                disabled={bloqueado}
              />
              Uma ou mais alternativas
            </label>
          </fieldset>
        )}
        <label className="grid min-w-0 gap-1 text-xs font-bold">
          Enunciado da pergunta
          <textarea
            value={enunciado}
            onChange={(event) => setEnunciado(event.target.value)}
            disabled={bloqueado}
            maxLength={5000}
            rows={4}
            className="min-h-28 w-full min-w-0 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-950 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            onAtualizar(pergunta.id, {
              tipo,
              enunciado,
              modo_resposta: tipo === "multipla_escolha" ? modoResposta : null,
            })
          }
          disabled={bloqueado || !enunciado.trim()}
          className="inline-flex w-fit items-center justify-center gap-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-950"
        >
          <Save className="h-4 w-4" /> Salvar
        </button>
      </div>

      {tipo === "multipla_escolha" && (
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
          <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
            Alternativas — mínimo de duas opções disponíveis.
          </p>
          {(pergunta.alternativas || []).map(
            (alternativa, alternativaIndex) => (
              <div
                key={alternativa.id}
                className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onMoverAlternativa(
                        pergunta,
                        alternativaIndex,
                        alternativaIndex - 1,
                      )
                    }
                    disabled={bloqueado || alternativaIndex === 0}
                    aria-label="Mover alternativa para cima"
                    className="rounded-lg border p-1.5 disabled:opacity-40 dark:border-slate-700"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onMoverAlternativa(
                        pergunta,
                        alternativaIndex,
                        alternativaIndex + 1,
                      )
                    }
                    disabled={
                      bloqueado ||
                      alternativaIndex === pergunta.alternativas.length - 1
                    }
                    aria-label="Mover alternativa para baixo"
                    className="rounded-lg border p-1.5 disabled:opacity-40 dark:border-slate-700"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  defaultValue={alternativa.texto}
                  disabled={bloqueado}
                  maxLength={2000}
                  onBlur={(event) => {
                    const texto = event.target.value.trim();
                    if (texto && texto !== alternativa.texto) {
                      onAtualizarAlternativa(alternativa.id, { texto });
                    }
                  }}
                  aria-label={`Alternativa ${alternativaIndex + 1}`}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
                <button
                  type="button"
                  onClick={() => onExcluirAlternativa(alternativa.id)}
                  disabled={bloqueado}
                  aria-label="Excluir alternativa"
                  className="rounded-xl border border-rose-200 px-3 py-2 text-rose-700 disabled:opacity-40 dark:border-rose-900"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ),
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={novaAlternativa}
              onChange={(event) => setNovaAlternativa(event.target.value)}
              disabled={bloqueado}
              maxLength={2000}
              placeholder="Nova alternativa"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              type="button"
              disabled={bloqueado || !novaAlternativa.trim()}
              onClick={async () => {
                await onAdicionarAlternativa(pergunta.id, {
                  texto: novaAlternativa,
                });
                setNovaAlternativa("");
              }}
              className="inline-flex items-center justify-center gap-1 rounded-xl bg-fuchsia-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
        </div>
      )}

      {tipo === "dissertativa" && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
          O participante responderá esta pergunta em texto livre.
        </p>
      )}
    </article>
  );
}

export default function EditorPreTesteEvento({ eventoId, onChange }) {
  const [config, setConfig] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [possuiPreTeste, setPossuiPreTeste] = useState(false);
  const [novoTipo, setNovoTipo] = useState("multipla_escolha");
  const [novoModoResposta, setNovoModoResposta] = useState("resposta_unica");
  const [novoEnunciado, setNovoEnunciado] = useState("");
  const [criandoPergunta, setCriandoPergunta] = useState(false);

  const carregar = useCallback(async () => {
    if (!eventoId) {
      return;
    }
    setCarregando(true);
    setErro("");
    try {
      const dados = await EventoService.preTeste.admin.carregar(eventoId);
      setConfig(dados);
      setPossuiPreTeste(Boolean(dados?.ativo || dados?.rascunho));
    } catch (error) {
      setErro(mensagemErro(error));
    } finally {
      setCarregando(false);
    }
  }, [eventoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (config) {
      onChange?.({ ...config, selecionado: possuiPreTeste });
    }
  }, [config, onChange, possuiPreTeste]);

  const executar = useCallback(
    async (operacao) => {
      setSalvando(true);
      setErro("");
      try {
        await executePreTesteOperation(operacao, carregar);
      } catch (error) {
        setErro(mensagemErro(error));
        throw error;
      } finally {
        setSalvando(false);
      }
    },
    [carregar],
  );

  const rascunho = config?.rascunho || null;
  const perguntas = useMemo(
    () => (Array.isArray(rascunho?.perguntas) ? rascunho.perguntas : []),
    [rascunho?.perguntas],
  );

  const selecionarNao = useCallback(async () => {
    setPossuiPreTeste(false);
    try {
      if (config?.configurado) {
        await executar(() =>
          EventoService.preTeste.admin.definirAtivo(eventoId, false, {
            descartarRascunho: true,
          }),
        );
      }
    } catch (error) {
      setPossuiPreTeste(Boolean(config?.ativo));
      throw error;
    }
  }, [config?.ativo, config?.configurado, eventoId, executar]);

  const selecionarSim = useCallback(async () => {
    setPossuiPreTeste(true);
    try {
      if (!rascunho) {
        await executar(() =>
          EventoService.preTeste.admin.criarRascunho(eventoId),
        );
      }
    } catch (error) {
      setPossuiPreTeste(Boolean(config?.ativo));
      throw error;
    }
  }, [config?.ativo, eventoId, executar, rascunho]);

  const moverPergunta = useCallback(
    (origem, destino) => {
      if (destino < 0 || destino >= perguntas.length) {
        return;
      }
      const ids = perguntas.map((item) => item.id);
      [ids[origem], ids[destino]] = [ids[destino], ids[origem]];
      executar(() =>
        EventoService.preTeste.admin.reordenarPerguntas(rascunho.id, ids),
      ).catch(() => {});
    },
    [executar, perguntas, rascunho?.id],
  );

  const moverAlternativa = useCallback(
    (pergunta, origem, destino) => {
      const alternativas = pergunta.alternativas || [];
      if (destino < 0 || destino >= alternativas.length) {
        return;
      }
      const ids = alternativas.map((item) => item.id);
      [ids[origem], ids[destino]] = [ids[destino], ids[origem]];
      executar(() =>
        EventoService.preTeste.admin.reordenarAlternativas(pergunta.id, ids),
      ).catch(() => {});
    },
    [executar],
  );

  if (carregando) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando pré-teste...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/70 p-4 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/20">
        <h4 className="font-black text-fuchsia-950 dark:text-fuchsia-100">
          Pré-teste antes da inscrição
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-fuchsia-900/80 dark:text-fuchsia-200/80">
          Instrumento diagnóstico, sem nota, peso, aprovação ou reprovação. O
          tipo de resposta define somente quantas alternativas o participante
          pode selecionar. Todas as perguntas são obrigatórias.
        </p>

        <fieldset className="mt-3">
          <legend className="text-sm font-extrabold">
            Este evento possui pré-teste?
          </legend>
          <div className="mt-2 flex gap-4">
            <label className="inline-flex items-center gap-2 text-sm font-bold">
              <input
                type="radio"
                name="evento-possui-pre-teste"
                checked={!possuiPreTeste}
                disabled={salvando}
                onChange={() => selecionarNao().catch(() => {})}
              />
              Não
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-bold">
              <input
                type="radio"
                name="evento-possui-pre-teste"
                checked={possuiPreTeste}
                disabled={salvando}
                onChange={() => selecionarSim().catch(() => {})}
              />
              Sim
            </label>
          </div>
        </fieldset>
      </div>

      {!possuiPreTeste ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
          A inscrição seguirá o fluxo atual, sem perguntas adicionais.
        </p>
      ) : (
        <div className="space-y-3">
          {config?.ativo && config?.versao_publicada && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
              <CheckCircle2 className="h-4 w-4" /> Versão{" "}
              {config.versao_publicada.numero_versao} ativa.
            </div>
          )}

          {!rascunho && config?.versao_publicada && (
            <button
              type="button"
              disabled={salvando}
              onClick={() =>
                executar(() =>
                  EventoService.preTeste.admin.criarRascunho(eventoId),
                ).catch(() => {})
              }
              className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-300 bg-white px-4 py-2.5 text-sm font-extrabold text-fuchsia-800 disabled:opacity-50 dark:border-fuchsia-800 dark:bg-slate-950 dark:text-fuchsia-200"
            >
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ClipboardPlus className="h-4 w-4" />
              )}
              Criar nova versão para editar
            </button>
          )}

          {rascunho && (
            <>
              <div className="space-y-3">
                {perguntas.map((pergunta, index) => (
                  <QuestaoEditor
                    key={pergunta.id}
                    pergunta={pergunta}
                    index={index}
                    total={perguntas.length}
                    bloqueado={salvando}
                    onAtualizar={(perguntaId, dados) =>
                      executar(() =>
                        EventoService.preTeste.admin.atualizarPergunta(
                          rascunho.id,
                          perguntaId,
                          dados,
                        ),
                      ).catch(() => {})
                    }
                    onExcluir={(perguntaId) =>
                      executar(() =>
                        EventoService.preTeste.admin.excluirPergunta(
                          rascunho.id,
                          perguntaId,
                        ),
                      ).catch(() => {})
                    }
                    onMover={moverPergunta}
                    onAdicionarAlternativa={(perguntaId, dados) =>
                      executar(() =>
                        EventoService.preTeste.admin.adicionarAlternativa(
                          perguntaId,
                          dados,
                        ),
                      )
                    }
                    onAtualizarAlternativa={(alternativaId, dados) =>
                      executar(() =>
                        EventoService.preTeste.admin.atualizarAlternativa(
                          alternativaId,
                          dados,
                        ),
                      ).catch(() => {})
                    }
                    onExcluirAlternativa={(alternativaId) =>
                      executar(() =>
                        EventoService.preTeste.admin.excluirAlternativa(
                          alternativaId,
                        ),
                      ).catch(() => {})
                    }
                    onMoverAlternativa={moverAlternativa}
                  />
                ))}
              </div>

              <div className="w-full min-w-0 rounded-2xl border border-dashed border-fuchsia-300 p-4 dark:border-fuchsia-800">
                <p className="mb-2 flex items-center gap-2 text-sm font-black">
                  <ClipboardPlus className="h-4 w-4" /> Nova pergunta
                </p>
                {!criandoPergunta ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="grid w-full max-w-xs gap-1 text-xs font-bold">
                      Tipo
                      <select
                        value={novoTipo}
                        onChange={(event) => setNovoTipo(event.target.value)}
                        disabled={salvando}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <option value="multipla_escolha">
                          Múltipla escolha
                        </option>
                        <option value="dissertativa">Dissertativa</option>
                      </select>
                    </label>
                    {novoTipo === "multipla_escolha" && (
                      <label className="grid w-full max-w-xs gap-1 text-xs font-bold">
                        Tipo de resposta
                        <select
                          value={novoModoResposta}
                          onChange={(event) =>
                            setNovoModoResposta(event.target.value)
                          }
                          disabled={salvando}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="resposta_unica">
                            Apenas uma alternativa
                          </option>
                          <option value="respostas_multiplas">
                            Uma ou mais alternativas
                          </option>
                        </select>
                      </label>
                    )}
                    <button
                      type="button"
                      disabled={salvando}
                      onClick={() => setCriandoPergunta(true)}
                      className="inline-flex items-center justify-center gap-1 rounded-xl bg-fuchsia-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" /> Adicionar pergunta
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 grid min-w-0 gap-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/40 p-4 dark:border-fuchsia-900 dark:bg-fuchsia-950/10">
                    <p className="text-xs font-black uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-300">
                      Pergunta {perguntas.length + 1} —{" "}
                      {novoTipo === "multipla_escolha"
                        ? "Múltipla escolha"
                        : "Dissertativa"}
                    </p>
                    <label className="grid min-w-0 gap-1 text-xs font-bold">
                      Enunciado da pergunta
                      <textarea
                        value={novoEnunciado}
                        onChange={(event) =>
                          setNovoEnunciado(event.target.value)
                        }
                        disabled={salvando}
                        maxLength={5000}
                        rows={4}
                        placeholder="Digite o enunciado completo"
                        className="min-h-28 w-full min-w-0 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-950 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </label>
                    {novoTipo === "dissertativa" && (
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        O participante responderá esta pergunta em texto livre.
                      </p>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        disabled={salvando || !novoEnunciado.trim()}
                        onClick={async () => {
                          try {
                            await executar(() =>
                              EventoService.preTeste.admin.adicionarPergunta(
                                rascunho.id,
                                {
                                  tipo: novoTipo,
                                  modo_resposta:
                                    novoTipo === "multipla_escolha"
                                      ? novoModoResposta
                                      : null,
                                  enunciado: novoEnunciado,
                                },
                              ),
                            );
                            setNovoEnunciado("");
                            setCriandoPergunta(false);
                          } catch {
                            // mensagem exibida no próprio editor
                          }
                        }}
                        className="inline-flex items-center justify-center gap-1 rounded-xl bg-fuchsia-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" /> Salvar pergunta
                      </button>
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => {
                          setNovoEnunciado("");
                          setCriandoPergunta(false);
                        }}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100">
                As alterações do pré-teste ficam salvas em uma versão de
                rascunho. Elas não alteram o estado publicado ou despublicado do
                evento.
              </p>

              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                <p className="text-sm font-black text-amber-950 dark:text-amber-100">
                  Disponibilizar alterações aos participantes
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                  Os botões de salvar acima persistem somente esta versão de
                  rascunho. Publique a versão quando ela estiver pronta para
                  substituir o pré-teste atualmente disponível.
                </p>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() =>
                    executar(() =>
                      EventoService.preTeste.admin.publicar(rascunho.id),
                    ).catch(() => {})
                  }
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {salvando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Publicar esta versão do pré-teste
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {erro && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-100"
        >
          {erro}
        </div>
      )}
    </div>
  );
}

QuestaoEditor.propTypes = {
  pergunta: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  bloqueado: PropTypes.bool.isRequired,
  onAtualizar: PropTypes.func.isRequired,
  onExcluir: PropTypes.func.isRequired,
  onMover: PropTypes.func.isRequired,
  onAdicionarAlternativa: PropTypes.func.isRequired,
  onAtualizarAlternativa: PropTypes.func.isRequired,
  onExcluirAlternativa: PropTypes.func.isRequired,
  onMoverAlternativa: PropTypes.func.isRequired,
};

EditorPreTesteEvento.propTypes = {
  eventoId: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    .isRequired,
  onChange: PropTypes.func,
};
