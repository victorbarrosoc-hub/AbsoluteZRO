// O Set da Absolute ZRO no TPeasy (ADR 0032 da Absolute ZRO): quem da equipe e dos contatos está online, em qual app,
// e as conversas (diretas e do projeto). É a aba em comum de todas as plataformas: aqui, a última aba da barra, como
// no iOS. A folha é o <zro-set modo="folha"> publicado pela Absolute ZRO (tela cheia no iPhone, lateral no
// computador), vestida com as cores do TPeasy (app.css, --zro-set-*). Ele fala com /api/zro/set, o repasse do próprio
// TPeasy (api/zro/set.mjs), que acrescenta o token da conta no servidor. O token nunca chega a esta página.
// A entrada só aparece depois que o Set respondeu (conta com o escopo zro.set); sem login, login antigo ou sem rede,
// ela não existe, e o resto do app segue igual.


export const SCRIPT_SET = "https://absolutezro.com/set/v1/zro-set.js";

/**
 * Liga as entradas do app (botões com data-set) ao widget: aparecem com o primeiro estado, somem sem login, levam o
 * balão das não lidas e dos pedidos e abrem ou fecham a folha. Sem DOM de verdade (o teste usa objetos simples).
 */
export function ligarSet(el, entradas) {
  const cada = (f) => {
    for (const e of entradas) f(e);
  };
  const balao = (n, rotulo) =>
    cada((e) => {
      const b = e.querySelector?.("[data-set-balao]");
      if (b) {
        b.hidden = !n;
        b.textContent = n ? (n > 99 ? "99+" : String(n)) : "";
      }
      e.setAttribute("aria-label", rotulo);
    });
  cada((e) => {
    e.hidden = true;
    e.setAttribute("aria-haspopup", "dialog");
    e.setAttribute("aria-expanded", "false");
    e.addEventListener("click", (ev) => {
      ev.preventDefault?.();
      if (el.aberto) el.fecharSet?.();
      else el.abrirSet?.();
    });
  });
  el.addEventListener("zro-set:estado", (ev) => {
    const d = ev.detail || {};
    const n = (d.naoLidas || 0) + (d.pedidos || 0);
    cada((e) => (e.hidden = false));
    balao(n, `Set${d.online ? `, ${d.online} online` : ""}${n ? `, ${n} ${n === 1 ? "novidade" : "novidades"}` : ""}`);
  });
  el.addEventListener("zro-set:sem-login", () => {
    cada((e) => (e.hidden = true));
    balao(0, "Set");
  });
  el.addEventListener("zro-set:aberto", () => cada((e) => e.setAttribute("aria-expanded", "true")));
  el.addEventListener("zro-set:fechado", () => cada((e) => e.setAttribute("aria-expanded", "false")));
}

let el = null;
let carregou = null;

function criar(zro) {
  el?.remove();
  el = null;
  if (zro.estado !== "dentro") return;
  el = document.createElement("zro-set");
  el.setAttribute("modo", "folha");
  el.setAttribute("api", "/api/zro/set");
  // versão antiga do widget (sem o modo folha) não aparece nem fala com ninguém: a entrada fica escondida
  el.style.display = "none";
  // cada entrada é recriada com a conta (os ouvintes antigos saem junto)
  for (const e of document.querySelectorAll("[data-set]")) e.replaceWith(e.cloneNode(true));
  ligarSet(el, [...document.querySelectorAll("[data-set]")]);
  document.body.append(el);
}

/**
 * Monta o Set depois de saber da conta (como a Z: o /eu já renovou o token). `zro` é o estado da conta (app/js/zro.js)
 * e `on` o aviso de mudança (app/js/data.js): vêm do main.js, e este módulo fica sem efeito ao carregar.
 */
export async function iniciarSet(zro, on) {
  if (!document.querySelector("[data-set]") || zro.estado === "?") return;
  try {
    carregou ??= import(SCRIPT_SET);
    await carregou;
  } catch {
    carregou = null;
    return;
  }
  if (!customElements.get("zro-set")) return;
  criar(zro);
  // entrou ou saiu da conta: o Set começa de novo com a conta de agora
  let antes = `${zro.estado}:${zro.pessoa?.email || ""}`;
  on("zro", () => {
    const agora = `${zro.estado}:${zro.pessoa?.email || ""}`;
    if (agora === antes) return;
    antes = agora;
    criar(zro);
  });
}
