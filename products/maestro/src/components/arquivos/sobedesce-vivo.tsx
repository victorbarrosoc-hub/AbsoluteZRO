"use client";
/**
 * O SOBEDESCE vivo no shell (titular, 30/10/2026: Arquivos abre "como a aba Drive do Sobedesce funciona"). O quadro
 * (`/app/?no=maestro`, src/lib/sobedesce/embutido.ts) nasce na primeira visita a /app/arquivos e fica montado enquanto a
 * aba do navegador viver: sair para o Quadro e voltar não recarrega e um envio continua andando. Só aparece em
 * /app/arquivos; nas outras seções fica escondido (o envio segue) e o ponto em "Arquivos" (e em "Mais", no celular)
 * avisa que há envio andando. Fechar a aba com envio andando pede confirmação ao navegador.
 *
 * Os recados do quadro passam por `lerRecado` (origem exata do SOBEDESCE, forma conferida) e só valem vindos da janela
 * do quadro. O tema segue o do Maestro (nunca o do aparelho): muda o `data-theme`, vai o recado `tema`.
 *
 * Sem o recado `pronto` (SOBEDESCE fora do ar, endereço que recusa o quadro, Maestro fora de maestro.absolutezro.com),
 * a aba mostra um aviso curto com o link para o SOBEDESCE, nunca um quadro quebrado.
 */
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { comPasta, enderecoDoQuadro, lerRecado, SOBEDESCE_APP, SOBEDESCE_ORIGEM, temaDoQuadro, type PastaAberta } from "@/lib/sobedesce/embutido";
import { Icone } from "@/components/icones";
import { useTema } from "@/components/use-tema";
import "@/app/arquivos-sobedesce.css";

export const ROTA_ARQUIVOS = "/app/arquivos";
/** Depois do `load` do quadro, quanto esperar o `pronto` antes do aviso (o app manda o recado antes do `load`). */
const FOLGA_DO_PRONTO = 4000;
/** Sem `load` nenhum (rede parada), o aviso aparece depois disto. */
const ESPERA_MAXIMA = 25000;

type Estado = { fase: "abrindo" | "pronto" | "falhou"; andando: number; pasta: PastaAberta | null };

/* O estado do quadro, fora do React (a tela de Arquivos e o shell leem o mesmo). */
let estado: Estado = { fase: "abrindo", andando: 0, pasta: null };
const ouvintes = new Set<() => void>();
function mudar(parcial: Partial<Estado>) {
  estado = { ...estado, ...parcial };
  for (const f of ouvintes) f();
}
function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}
const INICIAL: Estado = { fase: "abrindo", andando: 0, pasta: null };

/** O estado do quadro (fase, envios andando e a pasta aberta no Drive). */
export function useSobedesce(): Estado {
  return useSyncExternalStore(
    assinar,
    () => estado,
    () => INICIAL,
  );
}

/* Quem abre uma pasta no quadro (a tela de Arquivos chama; o quadro registra). */
let abrirNoQuadro: ((id: string) => void) | null = null;

/** Abre a pasta no quadro: só o `#drive/<id>` muda (o SOBEDESCE navega sem recarregar). */
export function abrirPasta(id: string) {
  abrirNoQuadro?.(id);
}

export function SobedesceVivo() {
  const caminho = usePathname();
  const visivel = caminho === ROTA_ARQUIVOS;
  const [montado, setMontado] = useState(false);
  if (visivel && !montado) setMontado(true);
  if (!montado) return null;
  return <Quadro visivel={visivel} />;
}

function Quadro({ visivel }: { visivel: boolean }) {
  const caixa = useRef<HTMLElement>(null);
  const quadro = useRef<HTMLIFrameElement>(null);
  const tema = useTema();
  // O endereço nasce uma vez (no navegador), no tema do Maestro na hora: depois o tema vai por recado (sem recarregar).
  const [endereco, setEndereco] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const { fase, andando } = useSobedesce();
  if (!endereco && tema) setEndereco(enderecoDoQuadro(tema));

  // Os recados do quadro: só da origem do SOBEDESCE, da janela dele e na forma combinada.
  useEffect(() => {
    const aoReceber = (e: MessageEvent) => {
      const janela = quadro.current?.contentWindow;
      if (!janela || e.source !== janela) return;
      const r = lerRecado(e.origin, e.data);
      if (!r) return;
      if (r.tipo === "pronto") mudar({ fase: "pronto" });
      else if (r.tipo === "envios") mudar({ andando: r.andando });
      else mudar({ pasta: r.pasta });
    };
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, []);

  // O tema mudou no Maestro: o SOBEDESCE muda junto (o quadro já aberto recebe o recado, sem recarregar).
  const temaDoQuadroAgora = useRef<string | null>(null);
  useEffect(() => {
    if (!tema || !endereco) return;
    const t = temaDoQuadro(tema);
    const antes = temaDoQuadroAgora.current ?? new URL(endereco).searchParams.get("tema");
    temaDoQuadroAgora.current = t;
    if (t !== antes) quadro.current?.contentWindow?.postMessage({ tipo: "tema", tema: t }, SOBEDESCE_ORIGEM);
  }, [tema, endereco]);

  // Abrir pasta: o `#` do quadro muda (src do iframe); com o quadro escondido no celular, rola até ele.
  useEffect(() => {
    abrirNoQuadro = (id) => {
      const f = quadro.current;
      const novo = f ? comPasta(f.src || endereco || "", id) : null;
      if (!f || !novo) return;
      f.src = novo;
      if (caixa.current && caixa.current.getBoundingClientRect().top > window.innerHeight * 0.6)
        caixa.current.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    };
    return () => {
      abrirNoQuadro = null;
    };
  }, [endereco]);

  // Sem o `pronto` a tempo: o aviso.
  useEffect(() => {
    if (!endereco || fase !== "abrindo") return;
    const t = window.setTimeout(() => {
      if (estado.fase === "abrindo") mudar({ fase: "falhou" });
    }, ESPERA_MAXIMA);
    return () => clearTimeout(t);
  }, [endereco, fase, tentativa]);
  const aoCarregar = () => {
    window.setTimeout(() => {
      if (estado.fase === "abrindo") mudar({ fase: "falhou" });
    }, FOLGA_DO_PRONTO);
  };

  // Envio andando: o ponto na navegação (data-envios no <html>, CSS em arquivos.css) e o "sair?" ao fechar a aba.
  useEffect(() => {
    const raiz = document.documentElement;
    if (andando > 0) raiz.dataset.envios = String(andando);
    else delete raiz.dataset.envios;
    if (andando <= 0) return;
    const segurar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", segurar);
    return () => {
      window.removeEventListener("beforeunload", segurar);
      delete raiz.dataset.envios;
    };
  }, [andando]);

  // No computador o quadro ocupa a janela até embaixo; no celular, até a barra de baixo. As medidas vão no #conteudo
  // (arquivos-sobedesce.css): a altura do quadro e o respiro de baixo da seção. offsetTop ignora a entrada (transform).
  useLayoutEffect(() => {
    const el = caixa.current;
    const conteudo = document.getElementById("conteudo");
    if (!visivel || !el || !conteudo) return;
    const medir = () => {
      let topo = 0;
      for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) topo += n.offsetTop;
      const barra = document.querySelector<HTMLElement>(".barra");
      const baixo = barra && getComputedStyle(barra).display !== "none" ? barra.offsetHeight + 12 : 20;
      conteudo.style.setProperty("--sd-topo", `${Math.round(topo)}px`);
      conteudo.style.setProperty("--sd-baixo", `${baixo}px`);
    };
    medir();
    // A seção acima do quadro muda de altura ("Ligar a um projeto", um aviso): mede de novo. Seção nova (troca de
    // caminho): observa a nova.
    const ro = new ResizeObserver(medir);
    const observar = () => {
      ro.disconnect();
      for (const p of conteudo.querySelectorAll(":scope > .m-pagina")) ro.observe(p);
      medir();
    };
    observar();
    const mo = new MutationObserver(observar);
    mo.observe(conteudo, { childList: true });
    window.addEventListener("resize", medir);
    return () => {
      mo.disconnect();
      ro.disconnect();
      window.removeEventListener("resize", medir);
      conteudo.style.removeProperty("--sd-topo");
      conteudo.style.removeProperty("--sd-baixo");
    };
  }, [visivel]);

  const tentarDeNovo = () => {
    mudar({ fase: "abrindo" });
    if (tema) {
      temaDoQuadroAgora.current = null;
      setEndereco(enderecoDoQuadro(tema));
    }
    setTentativa((n) => n + 1);
  };

  return (
    <section ref={caixa} className="sd-vivo" hidden={!visivel} aria-label="SOBEDESCE" data-fase={fase}>
      {endereco && fase !== "falhou" ? (
        <iframe
          key={tentativa}
          ref={quadro}
          className="sd-quadro"
          src={endereco}
          title="SOBEDESCE: transferências e Drive"
          allow="clipboard-write; fullscreen"
          onLoad={aoCarregar}
        />
      ) : null}
      {fase === "abrindo" ? (
        <div className="sd-abrindo" aria-busy="true">
          <span className="sd-abrindo__ponto" aria-hidden="true" />
          <span className="sr-only">Abrindo o SOBEDESCE</span>
        </div>
      ) : null}
      {fase === "falhou" ? (
        <div className="sd-falhou" role="status">
          <Icone nome="arquivos" size={28} />
          <p>O SOBEDESCE não abriu aqui.</p>
          <div className="sd-falhou__acoes">
            <a className="glass-btn glass-btn--ink" href={SOBEDESCE_APP} target="_blank" rel="noreferrer noopener">
              <Icone nome="externo" size={15} /> Abrir o SOBEDESCE
            </a>
            <button type="button" className="glass-btn" onClick={tentarDeNovo}>
              Tentar de novo
            </button>
          </div>
        </div>
      ) : null}
      {andando > 0 ? (
        <span className="sr-only" role="status">
          {andando === 1 ? "1 envio andando no SOBEDESCE" : `${andando} envios andando no SOBEDESCE`}
        </span>
      ) : null}
    </section>
  );
}
