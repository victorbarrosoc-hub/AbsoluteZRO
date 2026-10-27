// A Z, a IA do ecossistema Absolute ZRO, no topo de Roteiros (a primeira tela do app, no iPhone e no computador). O
// painel é o <zro-ia> da Absolute ZRO; ele fala com /api/zro/ia, o repasse do próprio TPeasy (api/zro/ia.mjs), que
// acrescenta o token da conta no servidor. O token nunca chega a esta página.
// A Z conversa e lê os dados da conta; não mexe nos roteiros (eles continuam só neste aparelho). Os roteiros seguem
// logo abaixo. Sem as funções /api/zro (offline, arquivo, servidor estático) ou sem rede para buscar o painel: nada aparece.
import { on } from "./data.js";
import { esc } from "./util.js";
import { zro, linkEntrar } from "./zro.js";

export const SCRIPT_Z = "https://absolutezro.com/ia/v1/zro-ia.js";
export const APOIO = "Sobre o roteiro, a gravação ou a sua conta.";
export const SUGESTOES = ["Como deixar meu roteiro mais natural de ler?", "Que velocidade usar no teleprompter?", "Como olhar para a câmera sem parecer lendo?", "Quantos créditos de IA eu tenho?"];

let carregou = null;
let el = null;
let semLogin = false;

function rodape(p) {
  const pe = p.querySelector(".z-entrar");
  if (!pe) return;
  pe.hidden = !semLogin;
  // dentro da conta mas sem a Z (login de antes dela): entrar de novo já pede a permissão da Z
  const de = zro.estado === "dentro";
  pe.innerHTML = semLogin ? `<a class="btn btn-blue" href="${esc(linkEntrar("/app/#roteiros"))}">${de ? "Entrar de novo para usar a Z" : "Entrar com Absolute ZRO"}</a>` : "";
}

function criar(p) {
  el?.remove();
  semLogin = false;
  el = document.createElement("zro-ia");
  el.setAttribute("api", "/api/zro/ia");
  el.setAttribute("apoio", APOIO);
  el.setAttribute("sugestoes", JSON.stringify(SUGESTOES));
  // o TPeasy segue o tema do aparelho; a Z também
  el.setAttribute("tema", "auto");
  if (zro.pessoa?.nome) el.setAttribute("nome", zro.pessoa.nome.split(/\s+/)[0]);
  el.addEventListener("zro-ia:sem-login", () => {
    semLogin = true;
    rodape(p);
  });
  p.prepend(el);
  rodape(p);
}

/** Monta a Z depois de saber da conta (o /eu já renovou o token: a Z não disputa o refresh token com ele). */
export async function iniciarZ() {
  const p = document.getElementById("zPainel");
  if (!p || zro.estado === "?") return;
  try {
    carregou ??= import(SCRIPT_Z);
    await carregou;
  } catch {
    carregou = null;
    return;
  }
  if (!customElements.get("zro-ia")) return;
  if (!p.querySelector(".z-entrar")) p.insertAdjacentHTML("beforeend", '<div class="z-entrar" hidden></div>');
  criar(p);
  p.hidden = false;
  document.documentElement.classList.add("tem-z");
  // entrou ou saiu da conta: a Z começa de novo com a conta de agora
  let antes = `${zro.estado}:${zro.pessoa?.email || ""}`;
  on("zro", () => {
    const agora = `${zro.estado}:${zro.pessoa?.email || ""}`;
    if (agora === antes) return rodape(p);
    antes = agora;
    criar(p);
  });
}
