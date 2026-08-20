import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import PropTypes from "prop-types";
import { ClipboardCheck, Loader2, Send } from "lucide-react";

import Modal from "../ui/Modal";

function mensagemAmigavel(error) {
  const message = error?.data?.message || error?.message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : "Não foi possível concluir sua inscrição. Revise as respostas e tente novamente.";
}

export default function ModalPreTesteInscricao({
  open,
  preTeste,
  eventoTitulo = "",
  enviando = false,
  onClose,
  onSubmit,
}) {
  const uid = useId();
  const titleId = `pre-teste-inscricao-title-${uid}`;
  const descriptionId = `pre-teste-inscricao-description-${uid}`;
  const [respostas, setRespostas] = useState({});
  const [erro, setErro] = useState("");
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [submetendoInterno, setSubmetendoInterno] = useState(false);
  const submissaoEmCursoRef = useRef(false);
  const processando = enviando || submetendoInterno;

  const perguntas = useMemo(
    () => (Array.isArray(preTeste?.perguntas) ? preTeste.perguntas : []),
    [preTeste?.perguntas],
  );

  useEffect(() => {
    if (open) {
      setRespostas({});
      setErro("");
      setTentouEnviar(false);
      setSubmetendoInterno(false);
      submissaoEmCursoRef.current = false;
    }
  }, [open, preTeste?.versao_id]);

  const respondida = useCallback(
    (pergunta) => {
      const resposta = respostas[pergunta.id];
      if (pergunta.tipo === "multipla_escolha") {
        return Number.isInteger(Number(resposta?.alternativa_id));
      }
      return Boolean(String(resposta?.resposta_texto || "").trim());
    },
    [respostas],
  );

  const todasRespondidas = perguntas.length > 0 && perguntas.every(respondida);

  const handleSubmit = useCallback(async () => {
    if (submissaoEmCursoRef.current) {
      return;
    }

    setTentouEnviar(true);
    setErro("");

    if (!todasRespondidas) {
      setErro("Responda todas as perguntas antes de continuar.");
      return;
    }

    const payload = {
      versao_id: Number(preTeste.versao_id),
      respostas: perguntas.map((pergunta) => ({
        pergunta_id: Number(pergunta.id),
        ...(pergunta.tipo === "multipla_escolha"
          ? {
              alternativa_id: Number(
                respostas[pergunta.id]?.alternativa_id,
              ),
            }
          : {
              resposta_texto: String(
                respostas[pergunta.id]?.resposta_texto || "",
              ).trim(),
            }),
      })),
    };

    submissaoEmCursoRef.current = true;
    setSubmetendoInterno(true);
    try {
      await onSubmit?.(payload);
    } catch (error) {
      setErro(mensagemAmigavel(error));
    } finally {
      submissaoEmCursoRef.current = false;
      setSubmetendoInterno(false);
    }
  }, [onSubmit, perguntas, preTeste?.versao_id, respostas, todasRespondidas]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      size="lg"
      scroll="content"
      mobileFullScreen
      initialFocusSelector="[data-pre-teste-primeiro-campo='true']"
      preventCloseWhenBusy={processando}
      closeOnBackdrop={!processando}
      closeOnEscape={!processando}
    >
      <Modal.Header className="border-b border-slate-200 bg-gradient-to-r from-fuchsia-950 via-violet-900 to-indigo-800 px-5 py-5 text-white dark:border-slate-800 sm:px-6">
        <div className="flex items-start gap-3 pr-10">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
            <ClipboardCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 id={titleId} className="text-xl font-black">
              Antes de concluir sua inscrição
            </h2>
            {eventoTitulo && (
              <p className="mt-1 text-sm font-semibold text-white/80">
                {eventoTitulo}
              </p>
            )}
          </div>
        </div>
      </Modal.Header>

      <Modal.Body className="space-y-5 px-4 py-5 sm:px-6">
        <div
          id={descriptionId}
          className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4 text-sm leading-relaxed text-fuchsia-950 dark:border-fuchsia-900/60 dark:bg-fuchsia-950/25 dark:text-fuchsia-100"
        >
          Este evento possui um pré-teste diagnóstico. Responda às perguntas
          abaixo para concluir sua inscrição. O pré-teste não possui caráter de
          aprovação ou reprovação.
        </div>

        <div className="space-y-4">
          {perguntas.map((pergunta, index) => {
            const invalida = tentouEnviar && !respondida(pergunta);
            return (
              <fieldset
                key={pergunta.id}
                className={`rounded-2xl border p-4 ${
                  invalida
                    ? "border-rose-400 bg-rose-50/60 dark:border-rose-800 dark:bg-rose-950/20"
                    : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                }`}
              >
                <legend className="px-1 text-sm font-extrabold text-slate-900 dark:text-white">
                  {index + 1}. {pergunta.enunciado}
                  <span className="ml-1 text-rose-600" aria-hidden="true">
                    *
                  </span>
                </legend>

                {pergunta.tipo === "multipla_escolha" ? (
                  <div className="mt-3 space-y-2">
                    {(pergunta.alternativas || []).map((alternativa, altIndex) => (
                      <label
                        key={alternativa.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition hover:border-fuchsia-400 hover:bg-fuchsia-50 dark:border-slate-800 dark:hover:border-fuchsia-700 dark:hover:bg-fuchsia-950/20"
                      >
                        <input
                          type="radio"
                          name={`pre-teste-${preTeste?.versao_id}-${pergunta.id}`}
                          value={alternativa.id}
                          checked={
                            Number(respostas[pergunta.id]?.alternativa_id) ===
                            Number(alternativa.id)
                          }
                          onChange={() =>
                            setRespostas((atual) => ({
                              ...atual,
                              [pergunta.id]: {
                                alternativa_id: Number(alternativa.id),
                              },
                            }))
                          }
                          data-pre-teste-primeiro-campo={
                            index === 0 && altIndex === 0 ? "true" : undefined
                          }
                          className="mt-0.5 h-4 w-4 accent-fuchsia-700"
                        />
                        <span>{alternativa.texto}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={respostas[pergunta.id]?.resposta_texto || ""}
                    onChange={(event) =>
                      setRespostas((atual) => ({
                        ...atual,
                        [pergunta.id]: {
                          resposta_texto: event.target.value,
                        },
                      }))
                    }
                    rows={4}
                    maxLength={10000}
                    data-pre-teste-primeiro-campo={
                      index === 0 ? "true" : undefined
                    }
                    aria-invalid={invalida}
                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 dark:border-slate-700 dark:bg-slate-900"
                    placeholder="Digite sua resposta"
                  />
                )}

                {invalida && (
                  <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    Esta pergunta é obrigatória.
                  </p>
                )}
              </fieldset>
            );
          })}
        </div>

        {erro && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100"
          >
            {erro}
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={processando}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={processando}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-fuchsia-700 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-fuchsia-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {processando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {processando
              ? "Concluindo inscrição..."
              : "Enviar pré-teste e concluir inscrição"}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

ModalPreTesteInscricao.propTypes = {
  open: PropTypes.bool.isRequired,
  preTeste: PropTypes.shape({
    versao_id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    perguntas: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        tipo: PropTypes.oneOf(["multipla_escolha", "dissertativa"]),
        enunciado: PropTypes.string,
        alternativas: PropTypes.arrayOf(
          PropTypes.shape({
            id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
            texto: PropTypes.string,
          }),
        ),
      }),
    ),
  }),
  eventoTitulo: PropTypes.string,
  enviando: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
