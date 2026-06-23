// ✅ frontend/src/pages/ExcluirConta.jsx — v1.0
// Plataforma Escola da Saúde
// Página pública exigida pela Play Store para solicitação de exclusão de conta.

import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import Footer from "../components/layout/Footer";
import useEscolaTheme from "../hooks/useEscolaTheme";
import { apiContaExclusaoSolicitarPublica } from "../services/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function normalizarEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getErrorMessage(error, fallback) {
  const data = error?.response?.data || error?.data || {};

  return data?.message || data?.erro || error?.message || fallback;
}

function SpinnerLocal() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-2px]"
      aria-hidden="true"
    />
  );
}

function BotaoLocal({
  children,
  className = "",
  leftIcon = null,
  loading = false,
  disabled = false,
  variant = "primary",
  ...props
}) {
  const variants = {
    primary:
      "bg-gradient-to-br from-rose-500 via-red-600 to-rose-700 text-white shadow-lg shadow-rose-950/15 hover:brightness-110 focus-visible:ring-rose-500/25",
    secondary:
      "border border-slate-200 bg-white/80 text-slate-800 shadow-sm hover:bg-slate-50 focus-visible:ring-emerald-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.07]",
  };

  return (
    <button
      type="button"
      className={cx(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant] || variants.primary,
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <SpinnerLocal /> : leftIcon}
      {children}
    </button>
  );
}

export default function ExcluirConta() {
  const { isDark } = useEscolaTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const emailNormalizado = useMemo(() => normalizarEmail(email), [email]);

  const solicitarExclusao = useCallback(async () => {
    const emailFinal = normalizarEmail(email);

    if (!emailFinal) {
      setErro("Informe o e-mail cadastrado.");
      return;
    }

    if (!EMAIL_RE.test(emailFinal)) {
      setErro("Informe um e-mail válido.");
      return;
    }

    try {
      setErro("");
      setEnviando(true);

      const response = await apiContaExclusaoSolicitarPublica({
        email: emailFinal,
      });

      setEnviado(true);
      toast.success(
        response?.message ||
          "Se o e-mail estiver cadastrado, enviaremos as instruções para confirmar a exclusão.",
      );
    } catch (error) {
      console.error("[ExcluirConta] falha ao solicitar exclusão", error);
      toast.error(
        getErrorMessage(
          error,
          "Não foi possível solicitar a exclusão da conta.",
        ),
      );
    } finally {
      setEnviando(false);
    }
  }, [email]);

  return (
    <main
      className={cx(
        "flex min-h-screen flex-col transition-colors",
        isDark ? "bg-zinc-950 text-zinc-100" : "bg-slate-50 text-slate-900",
      )}
    >
      <header className="relative px-4 pt-4 sm:px-6" role="banner">
        <div
          className={cx(
            "relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] border backdrop-blur-xl",
            "shadow-[0_30px_120px_-40px_rgba(15,23,42,.85)]",
            isDark
              ? "border-white/10 bg-white/[0.03]"
              : "border-white/70 bg-white/20",
          )}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#ef4444_0%,#be123c_45%,#064e3b_100%)]" />
          {isDark ? <div className="absolute inset-0 bg-black/35" /> : null}

          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='white' fill-opacity='1'%3E%3Ccircle cx='1' cy='1' r='1'/%3E%3C/g%3E%3C/svg%3E\")",
            }}
          />

          <div className="relative px-5 py-7 text-center sm:px-8 md:py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="inline-flex rounded-[1.75rem] bg-white p-3 shadow-xl ring-1 ring-white/80">
                <img
                  src="/logo_escola.png"
                  alt="Logotipo da Escola Municipal de Saúde Pública de Santos"
                  className="h-16 w-16 object-contain sm:h-20 sm:w-20"
                  loading="eager"
                />
              </div>

              <div className="inline-flex items-center gap-2 text-xs font-semibold text-white/90">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Portal oficial • privacidade e conta</span>
              </div>

              <h1 className="max-w-6xl text-2xl font-black tracking-[-0.035em] text-white md:text-4xl">
                Exclusão de conta
              </h1>

              <p className="max-w-2xl text-sm leading-relaxed text-white/90 md:text-base">
                Solicite a exclusão da conta vinculada à Plataforma Escola da
                Saúde. A confirmação será enviada ao e-mail cadastrado.
              </p>
            </div>
          </div>
        </div>
      </header>

      <section id="conteudo" className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section
            className={cx(
              "rounded-[2rem] border p-5 shadow-sm md:p-7",
              isDark
                ? "border-white/10 bg-zinc-900/50"
                : "border-slate-200 bg-white",
            )}
            aria-labelledby="titulo-form-exclusao"
          >
            <div className="mb-6 flex items-start gap-3">
              <div
                className={cx(
                  "grid h-12 w-12 shrink-0 place-items-center rounded-2xl border",
                  isDark
                    ? "border-rose-900/40 bg-rose-950/25 text-rose-200"
                    : "border-rose-100 bg-rose-50 text-rose-700",
                )}
              >
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </div>

              <div>
                <h2 id="titulo-form-exclusao" className="text-xl font-black">
                  Solicitar exclusão
                </h2>
                <p
                  className={cx(
                    "mt-1 text-sm leading-relaxed",
                    isDark ? "text-zinc-400" : "text-slate-600",
                  )}
                >
                  Informe o e-mail usado no cadastro. Por segurança, a
                  plataforma não informa se o e-mail existe ou não.
                </p>
              </div>
            </div>

            {enviado ? (
              <div
                className={cx(
                  "rounded-3xl border p-5",
                  isDark
                    ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900",
                )}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5" aria-hidden="true" />
                  <div>
                    <p className="font-black">Solicitação recebida</p>
                    <p className="mt-1 text-sm leading-relaxed">
                      Se <strong>{emailNormalizado}</strong> estiver cadastrado,
                      enviaremos um e-mail com o link de confirmação da
                      exclusão. Verifique também a caixa de spam.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  solicitarExclusao();
                }}
              >
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-extrabold"
                  >
                    E-mail cadastrado
                  </label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setErro("");
                      }}
                      autoComplete="email"
                      className={cx(
                        "min-h-[48px] w-full rounded-2xl border py-3 pl-12 pr-4 text-sm font-semibold outline-none transition focus:ring-4",
                        erro
                          ? "border-rose-300 focus:ring-rose-500/20"
                          : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-white/10",
                        isDark
                          ? "bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500"
                          : "bg-white text-slate-950 placeholder:text-slate-400",
                      )}
                      placeholder="nome@email.com"
                      disabled={enviando}
                      aria-invalid={!!erro}
                      aria-describedby={erro ? "erro-email" : undefined}
                    />
                  </div>
                  {erro ? (
                    <p id="erro-email" className="mt-1 text-xs text-rose-600">
                      {erro}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <BotaoLocal
                    type="submit"
                    loading={enviando}
                    disabled={enviando}
                    className="w-full sm:w-auto"
                    leftIcon={<LockKeyhole className="h-4 w-4" aria-hidden="true" />}
                  >
                    {enviando ? "Enviando..." : "Solicitar exclusão"}
                  </BotaoLocal>

                  <BotaoLocal
                    variant="secondary"
                    onClick={() => navigate("/login")}
                    className="w-full sm:w-auto"
                    leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
                  >
                    Voltar ao login
                  </BotaoLocal>
                </div>
              </form>
            )}
          </section>

          <aside
            className={cx(
              "rounded-[2rem] border p-5 shadow-sm md:p-7",
              isDark
                ? "border-white/10 bg-white/[0.04]"
                : "border-slate-200 bg-white",
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cx(
                  "grid h-12 w-12 shrink-0 place-items-center rounded-2xl border",
                  isDark
                    ? "border-amber-900/40 bg-amber-950/25 text-amber-200"
                    : "border-amber-100 bg-amber-50 text-amber-700",
                )}
              >
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>

              <div>
                <h2 className="text-lg font-black">Antes de confirmar</h2>
                <p
                  className={cx(
                    "mt-2 text-sm leading-relaxed",
                    isDark ? "text-zinc-400" : "text-slate-600",
                  )}
                >
                  Após a confirmação pelo link enviado por e-mail, seus dados
                  pessoais de cadastro serão removidos ou anonimizados. Alguns
                  registros institucionais poderão ser preservados quando
                  necessários para obrigações administrativas, auditoria,
                  certificados, presenças e segurança da informação.
                </p>
              </div>
            </div>

            <div
              className={cx(
                "mt-5 rounded-3xl border p-4 text-sm leading-relaxed",
                isDark
                  ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-100"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900",
              )}
            >
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4" aria-hidden="true" />
                <p>
                  Este formulário é público para permitir que o usuário solicite
                  a exclusão mesmo sem o aplicativo instalado.
                </p>
              </div>
            </div>

            <p className="mt-5 text-sm">
              <Link
                to="/privacidade"
                className="font-extrabold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-300"
              >
                Consultar política de privacidade
              </Link>
            </p>
          </aside>
        </div>
      </section>

      <Footer />
    </main>
  );
}
