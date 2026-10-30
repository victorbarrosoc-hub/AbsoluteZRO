// A Z, a IA do ecossistema Absolute ZRO, numa tela só dela (#z). Desde 29/10/2026 (titular; Plano de Integração §7–8)
// não é aba da barra nem a tela de entrada (o app abre em Roteiros): abre pelo anel discreto do topo de Roteiros. O
// painel é o <zro-ia> da Absolute ZRO; ele fala com /api/zro/ia, o repasse do próprio TPeasy (api/zro/ia.mjs), que
// acrescenta o token da conta no servidor. O token nunca chega a esta página.
// A Z conversa e lê os dados da conta; não mexe nos roteiros (eles continuam só neste aparelho). Sem as funções /api/zro
// (offline, arquivo, servidor estático) ou sem rede para buscar o painel, a aba diz que a Z precisa de internet e leva
// aos Roteiros, que funcionam sem ela.
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
  pe.innerHTML = semLogin ? `<a class="btn btn-blue" href="${esc(linkEntrar("/app/#z"))}">${de ? "Entrar de novo para usar a Z" : "Entrar com Absolute ZRO"}</a>` : "";
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

/** Sem a Z aqui: o recado curto e o caminho para os roteiros, que funcionam sem ela. */
function fora(p) {
  p.innerHTML = '<div class="z-fora"><span class="z-fora-anel" aria-hidden="true"></span><h2>A Z precisa de internet.</h2><p>Os roteiros funcionam sem ela.</p><div class="z-fora-acoes"><button class="btn btn-blue" type="button" data-z="tentar">Tentar de novo</button><button class="btn btn-soft" type="button" data-go="roteiros">Ir para Roteiros</button></div></div>';
  p.querySelector('[data-z="tentar"]').addEventListener("click", () => location.reload());
}

/** Monta a Z na aba dela depois de saber da conta (o /eu já renovou o token: a Z não disputa o refresh token com ele). */
export async function iniciarZ() {
  const p = document.getElementById("zPainel");
  if (!p) return;
  if (zro.estado === "?") return fora(p);
  try {
    carregou ??= import(SCRIPT_Z);
    await carregou;
  } catch {
    carregou = null;
    return fora(p);
  }
  if (!customElements.get("zro-ia")) return fora(p);
  if (!p.querySelector(".z-entrar")) p.insertAdjacentHTML("beforeend", '<div class="z-entrar" hidden></div>');
  criar(p);
  // entrou ou saiu da conta: a Z começa de novo com a conta de agora
  let antes = `${zro.estado}:${zro.pessoa?.email || ""}`;
  on("zro", () => {
    const agora = `${zro.estado}:${zro.pessoa?.email || ""}`;
    if (agora === antes) return rodape(p);
    antes = agora;
    criar(p);
  });
}
