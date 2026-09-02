import { useCallback, useMemo, useRef, useState } from "react";

export function preTesteErrorMessage(error) {
  const message = error?.data?.message || error?.message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : "Não foi possível concluir sua inscrição. Revise as respostas e tente novamente.";
}

export function isPreTesteQuestionAnswered(question, answers) {
  const answer = answers?.[question.id];
  if (question.tipo === "multipla_escolha") {
    if (question.modo_resposta === "respostas_multiplas") {
      return (
        Array.isArray(answer?.alternativas_ids) &&
        answer.alternativas_ids.length > 0
      );
    }
    return Number.isInteger(Number(answer?.alternativa_id));
  }
  return Boolean(String(answer?.resposta_texto || "").trim());
}

export function buildPreTesteEnrollmentPayload(preTeste, answers) {
  const questions = Array.isArray(preTeste?.perguntas)
    ? preTeste.perguntas
    : [];

  return {
    versao_id: Number(preTeste?.versao_id),
    respostas: questions.map((question) => ({
      pergunta_id: Number(question.id),
      ...(question.tipo === "multipla_escolha"
        ? question.modo_resposta === "respostas_multiplas"
          ? {
              alternativas_ids: answers?.[question.id]?.alternativas_ids || [],
            }
          : {
              alternativa_id: Number(answers?.[question.id]?.alternativa_id),
            }
        : {
            resposta_texto: String(
              answers?.[question.id]?.resposta_texto || "",
            ).trim(),
          }),
    })),
  };
}

export async function executePreTesteOperation(operation, reload) {
  await operation();
  return reload();
}

export function usePreTesteEnrollmentSubmission({
  preTeste,
  answers,
  onSubmit,
}) {
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionInProgressRef = useRef(false);
  const questions = useMemo(
    () => (Array.isArray(preTeste?.perguntas) ? preTeste.perguntas : []),
    [preTeste?.perguntas],
  );
  const allAnswered =
    questions.length > 0 &&
    questions.every((question) =>
      isPreTesteQuestionAnswered(question, answers),
    );

  const resetSubmission = useCallback(() => {
    setError("");
    setAttempted(false);
    setSubmitting(false);
    submissionInProgressRef.current = false;
  }, []);

  const submit = useCallback(async () => {
    if (submissionInProgressRef.current) {
      return false;
    }

    setAttempted(true);
    setError("");

    if (!allAnswered) {
      setError("Responda todas as perguntas antes de continuar.");
      return false;
    }

    submissionInProgressRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(buildPreTesteEnrollmentPayload(preTeste, answers));
      return true;
    } catch (submitError) {
      setError(preTesteErrorMessage(submitError));
      return false;
    } finally {
      submissionInProgressRef.current = false;
      setSubmitting(false);
    }
  }, [allAnswered, answers, onSubmit, preTeste]);

  return {
    allAnswered,
    attempted,
    error,
    resetSubmission,
    submit,
    submitting,
  };
}
