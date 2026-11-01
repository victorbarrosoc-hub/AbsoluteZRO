// "Entrar com Absolute ZRO". A sessão fica num cookie que o app não lê; aqui só perguntamos "quem sou eu".
// Sem as funções /api/zro (offline, file://, servidor estático), nada muda: o estado fica "?" e a tela é a de antes.
// Nada aqui toca nos roteiros: eles continuam salvos só neste aparelho.
// Perfil único: nome, e-mail e foto são os da conta Absolute ZRO (o /api/zro/eu relê a cada abertura). O TPeasy só
// mostra; para mudar, "Editar na conta Absolute ZRO" abre o Perfil da Absolute ZRO fora do app.
import { emit } from "./data.js";
import { esc, icon } from "./util.js";

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
    // ?visitante=1: sem sessão o site responde 200 { entrou: false } (nada de 401 no console de quem só abriu o app);
    // o site de antes, sem o parâmetro, responde 401, e os dois valem
    const r = await fetch("/api/zro/eu?visitante=1", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    if (!(r.headers.get("content-type") || "").includes("application/json")) return;
    if (r.status === 200) {
      const p = await r.json();
      if (p && p.entrou && typeof p.email === "string") mudar("dentro", p);
      else if (p && p.entrou === false) mudar("fora");
    } else if (r.status === 401) mudar("fora");
  } catch {}
}

export const linkEntrar = (volta = "/app/#ajustes") => `/api/zro/entrar?volta=${encodeURIComponent(volta)}`;
// "Criar conta": o cadastro é sempre na Absolute ZRO (prompt=create); a pessoa volta para cá já logada.
export const linkCriarConta = (volta = "/app/#ajustes") => `${linkEntrar(volta)}&criar=1`;
// Onde o admin libera o TPeasy para a organização.
export const HUB_FERRAMENTAS = "https://absolutezro.com/ferramentas";
export const PERFIL_ZRO = "https://absolutezro.com/perfil";
const httpsSeguro = (u) => typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u);
/** Onde editar nome, e-mail e foto: o zro_conta que veio do login, ou o Perfil da Absolute ZRO. */
export const linkConta = (p) => (p && httpsSeguro(p.conta) ? p.conta : PERFIL_ZRO);
/** Avatar da conta: a foto da Absolute ZRO por cima da inicial (se a foto não carregar, a inicial fica). */
export function avatarHtml(p) {
  const ini = esc((p.nome || p.email || "?").charAt(0).toUpperCase());
  if (!httpsSeguro(p.foto)) return `<span class="avatar is-on">${ini}</span>`;
  return `<span class="avatar is-on com-foto">${ini}<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer" decoding="async" /></span>`;
}
// foto que não carrega (sem rede, foto trocada há pouco): some e fica a inicial
if (typeof document !== "undefined")
  document.addEventListener(
    "error",
    (e) => {
      if (e.target instanceof HTMLImageElement && e.target.parentElement?.classList.contains("avatar")) e.target.remove();
    },
    true,
  );
/**
 * A conta no topo de Roteiros, à vista no celular (antes ela só existia em Ajustes): "Entrar" para quem está fora (volta
 * para Roteiros já logado) e a foto de quem entrou, que abre Ajustes (nome, e-mail e Sair). Sem as funções /api/zro
 * (offline, servidor estático) ou sem a configuração do login, o estado fica "?" e não aparece botão nenhum.
 */
export function atalhoContaHtml(z = zro) {
  if (z.estado === "fora") return `<a class="pill is-small conta-entrar" href="${linkEntrar("/app/")}">${icon("user")}Entrar</a>`;
  if (z.estado === "dentro" && z.pessoa) {
    const quem = esc(z.pessoa.nome || z.pessoa.email || "Conta");
    return `<button class="conta-topo-av" type="button" data-go="ajustes" aria-label="Conta: ${quem}" title="${quem}">${avatarHtml(z.pessoa)}</button>`;
  }
  return "";
}
// Quem entrou pela Absolute ZRO só usa a conta no TPeasy se a organização liberou o app.
export const semAcesso = () => zro.estado === "dentro" && !!zro.pessoa && zro.pessoa.acesso === false;

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
