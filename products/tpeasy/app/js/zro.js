// "Entrar com Absolute ZRO". A sessão fica num cookie que o app não lê; aqui só perguntamos "quem sou eu".
// Sem as funções /api/zro (offline, file://, servidor estático), nada muda: o estado fica "?" e a tela é a de antes.
// Nada aqui toca nos roteiros: eles continuam salvos só neste aparelho.
import { emit } from "./data.js";

export const zro = { estado: "?", pessoa: null }; // "?" = não sei, "fora", "dentro"
const temServidor = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";

function mudar(estado, pessoa = null) {
  zro.estado = estado;
  zro.pessoa = pessoa;
  emit("zro", zro);
}

export async function verificarZro() {
  if (!temServidor || !navigator.onLine) return;
  try {
    const r = await fetch("/api/zro/eu", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    if (!(r.headers.get("content-type") || "").includes("application/json")) return;
    if (r.status === 200) {
      const p = await r.json();
      if (p && p.entrou && typeof p.email === "string") mudar("dentro", p);
    } else if (r.status === 401) mudar("fora");
  } catch {}
}

export const linkEntrar = (volta = "/app/#ajustes") => `/api/zro/entrar?volta=${encodeURIComponent(volta)}`;

export async function sairZro() {
  const r = await fetch("/api/zro/sair", { method: "POST", credentials: "same-origin", cache: "no-store" });
  if (!r.ok) throw new Error("Não deu para sair agora.");
  mudar("fora");
}

const AVISOS = {
  recusado: "Entrada cancelada.",
  expirou: "A entrada demorou demais. Tente de novo.",
  erro: "Não deu para entrar agora. Tente de novo.",
  config: "Entrar com Absolute ZRO ainda não está ligado aqui.",
};

// Lê e limpa o ?zro= que as funções deixam na volta (mantém a #aba).
export function avisoDaVolta() {
  const q = new URLSearchParams(location.search);
  const codigo = q.get("zro");
  if (!codigo) return "";
  q.delete("zro");
  const resto = q.toString();
  history.replaceState(null, "", location.pathname + (resto ? `?${resto}` : "") + location.hash);
  return AVISOS[codigo] || "";
}

addEventListener("online", verificarZro);
