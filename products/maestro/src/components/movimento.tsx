"use client";
/**
 * O movimento entre seções. A troca é da casa, com a View Transitions API chamada aqui (não pelo `<ViewTransition>` do
 * React): no Safari do iPhone o par "sai/entra" do React deixava a tela velha e a nova uma sobre a outra (o WebKit cria
 * as duas metades de cada grupo e pintava a seção nova antes da foto). Agora:
 *
 * 1. o clique num link de seção (`/app/...`, outra página) é segurado na fase de captura; a seção atual vira o grupo
 *    `m-sai` e a navegação do Next corre DENTRO da transição (o navegador mostra a foto da seção velha enquanto isso);
 * 2. quando a seção nova monta (o invólucro `.m-pagina` com o caminho dela), ela vira o grupo `m-entra`. Se o que
 *    chegou é só o esqueleto, espera um pouco pelo conteúdo: esqueleto só quando há espera de verdade;
 * 3. a velha some em 110 ms e só então a nova entra deslizando (frente = da direita, volta = da esquerda, sem
 *    direção = sobe 8 px). As duas nunca aparecem juntas (motion.css; e2e/transicao.spec.ts mede quadro a quadro).
 *
 * Sem a API, com "reduzir movimento", com tecla modificadora, link de fora ou da mesma página, o Next navega sozinho,
 * na hora. A cápsula, o topo e a barra ficam parados (grupos próprios em motion.css).
 *
 * Os números grandes (Hoje, Números) sobem até o valor ao chegar na seção: o texto do servidor é o valor final e a
 * contagem só reescreve o nó de texto por alguns quadros, direto no DOM, sem render do React.
 */
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, type ReactNode } from "react";

type Sentido = "frente" | "volta" | "troca";
type Roteador = ReturnType<typeof useRouter>;

/** Quanto a troca segura a foto da seção velha: até a seção nova montar e, se veio o esqueleto, pelo conteúdo. */
const ESPERA_SECAO = 900;
const ESPERA_CONTEUDO = 320;

/** Só páginas do app (rotas de API, o stream do Drive e downloads seguem o caminho normal do navegador). */
function ehSecao(url: URL) {
  return url.origin === location.origin && url.pathname.startsWith("/app/") && !url.pathname.startsWith("/app/stream/");
}

/** Frente ou volta: `data-sentido` do link (cápsula e barra) ou a ordem na navegação em que ele está. */
function sentidoDoLink(a: HTMLAnchorElement): Sentido {
  const s = a.dataset.sentido;
  if (s === "frente" || s === "volta") return s;
  const nav = a.closest("nav");
  const atual = nav?.querySelector<HTMLElement>('[aria-current="page"]') ?? nav?.querySelector<HTMLElement>("[aria-current]");
  if (!atual || atual === a) return "troca";
  return atual.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING ? "frente" : "volta";
}

let ativa: ViewTransition | null = null;

function esperarSecao(caminho: string): Promise<HTMLElement | null> {
  const main = document.getElementById("conteudo");
  if (!main) return Promise.resolve(null);
  const t0 = performance.now();
  return new Promise((pronto) => {
    let fim = 0;
    const olhar = () => {
      const nova = [...main.querySelectorAll<HTMLElement>(":scope > .m-pagina")].find((el) => el.dataset.caminho === caminho) ?? null;
      const esqueleto = nova?.querySelector(':scope > [aria-busy="true"]');
      if (nova && (!esqueleto || performance.now() - t0 > ESPERA_CONTEUDO)) return terminar(nova);
    };
    const obs = new MutationObserver(olhar);
    const terminar = (el: HTMLElement | null) => {
      obs.disconnect();
      clearTimeout(fim);
      clearTimeout(meio);
      pronto(el);
    };
    obs.observe(main, { childList: true, subtree: true });
    // o esqueleto que chegou primeiro: passado o tempo, entra ele mesmo (há espera de verdade)
    const meio = window.setTimeout(olhar, ESPERA_CONTEUDO + 5);
    fim = window.setTimeout(() => {
      const nova = [...main.querySelectorAll<HTMLElement>(":scope > .m-pagina")].find((el) => el.dataset.caminho === caminho) ?? null;
      terminar(nova);
    }, ESPERA_SECAO);
    olhar();
  });
}

function instalar(router: Roteador) {
  const aoClicar = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (!ehSecao(url) || url.pathname === location.pathname) return;
    if (!("startViewTransition" in document) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (ativa) {
      // dois toques seguidos: a primeira troca termina na hora e o Next leva à segunda
      ativa.skipTransition();
      return;
    }
    const velha = [...document.querySelectorAll<HTMLElement>("#conteudo > .m-pagina")].at(-1);
    if (!velha) return;

    e.preventDefault(); // o next/link não navega (confere defaultPrevented); os onClick do React rodam normalmente
    const destino = url.pathname + url.search + url.hash;
    const raiz = document.documentElement;
    raiz.dataset.mSentido = sentidoDoLink(a);
    velha.style.viewTransitionName = "m-sai";
    let nova: HTMLElement | null = null;
    let vt: ViewTransition;
    try {
      vt = document.startViewTransition(async () => {
        startTransition(() => router.push(destino));
        nova = await esperarSecao(url.pathname);
        if (nova) nova.style.viewTransitionName = "m-entra";
        // a seção não chegou a tempo: sem animação (a foto sai e o Next mostra quando chegar)
        else vt.skipTransition();
      });
    } catch {
      velha.style.viewTransitionName = "";
      delete raiz.dataset.mSentido;
      router.push(destino);
      return;
    }
    ativa = vt;
    // pular a troca (dois toques seguidos, seção que não chegou) rejeita estas promessas: não é erro
    const nada = () => {};
    vt.ready.catch(nada);
    vt.updateCallbackDone.catch(nada);
    vt.finished.catch(nada).finally(() => {
      if (ativa === vt) ativa = null;
      velha.style.viewTransitionName = "";
      if (nova) (nova as HTMLElement).style.viewTransitionName = "";
      if (!ativa) delete raiz.dataset.mSentido;
    });
  };
  document.addEventListener("click", aoClicar, true);
  return () => document.removeEventListener("click", aoClicar, true);
}

/** O invólucro de cada seção (uma caixa por caminho: é ela que vira `m-sai`/`m-entra`). */
export function Transicao({ children }: { children: ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();
  useEffect(() => instalar(router), [router]);
  return (
    <div className="m-pagina" key={caminho} data-caminho={caminho}>
      {children}
    </div>
  );
}

const NUMEROS = ".hoje-cartao__n, .hoje-caixa__n, .numeros-grande, [data-conta]";
const DURACAO = 700;

/** "R$ 12.345,67" → partes para contar (o primeiro número do texto, no formato do Brasil). */
function partes(texto: string) {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?/.exec(texto);
  if (!m) return null;
  const inteiro = Number(m[1].replace(/\./g, ""));
  const casas = m[2] ? m[2].length - 1 : 0;
  const valor = inteiro + (m[2] ? Number(`0.${m[2].slice(1)}`) : 0);
  if (!Number.isFinite(valor) || valor === 0) return null;
  return { antes: texto.slice(0, m.index), depois: texto.slice(m.index + m[0].length), valor, casas, milhar: m[1].includes(".") || inteiro >= 1000 };
}

/** Ponha no fim da página: ao montar (a página chegou, não o esqueleto), os números grandes dela contam até o valor. */
export function Contar() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = document.getElementById("conteudo");
    if (!main) return;
    const alvos = [...main.querySelectorAll<HTMLElement>(NUMEROS)]
      .filter((el) => el.childNodes.length === 1 && el.firstChild!.nodeType === Node.TEXT_NODE)
      .map((el) => ({ el: el.firstChild as Text, final: el.textContent ?? "", p: partes(el.textContent ?? "") }))
      .filter((a) => a.p);
    if (!alvos.length) return;
    let pedido = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / DURACAO);
      const e = 1 - Math.pow(1 - k, 3);
      for (const { el, final, p } of alvos) {
        if (!el.isConnected) continue;
        if (k >= 1) {
          el.nodeValue = final;
          continue;
        }
        const v = p!.valor * e;
        const n = v.toLocaleString("pt-BR", { minimumFractionDigits: p!.casas, maximumFractionDigits: p!.casas, useGrouping: p!.milhar });
        el.nodeValue = `${p!.antes}${n}${p!.depois}`;
      }
      if (k < 1) pedido = requestAnimationFrame(passo);
    };
    pedido = requestAnimationFrame(passo);
    return () => {
      cancelAnimationFrame(pedido);
      for (const { el, final } of alvos) if (el.isConnected && el.nodeValue !== final) el.nodeValue = final;
    };
  }, []);
  return null;
}
