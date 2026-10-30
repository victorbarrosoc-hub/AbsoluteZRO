"use client";
/**
 * Apagar na Criação (titular, 30/10/2026: "uma opção fácil de excluir o projeto"), igual nas listas de Roteiros e de
 * Fluxos:
 * - iPhone: deslizar o cartão para a esquerda mostra o "Apagar" vermelho (passar do meio apaga direto, como no Mail);
 *   segurar o cartão abre a folha com "Apagar".
 * - Computador: o "•••" do cartão (aparece com o mouse em cima ou no foco) e o botão direito abrem "Mandar para a
 *   lixeira".
 * - Apagar = mandar para a lixeira: some da lista na hora e o aviso "Apagado · Desfazer" fica 6 s. Sem pergunta, porque
 *   desfaz; se o item está num card ou tem link vivo, a folha, o menu e o aviso dizem numa linha.
 * - Na lixeira: "Restaurar" e, para administração e gestão, "Apagar de vez" (com pergunta; roteiro com versão salva
 *   fica guardado).
 * O gesto mexe só no estilo do cartão (nada de estado do React por quadro); o React recebe ao soltar.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { type AcaoLixeira, avisoAoApagar, type ItemLixeira, NOME_DO_TIPO, pedidoDaLixeira, POR_QUE_FICA, saiDeVez } from "@/lib/criacao/lixeira";
import { ABERTO_PX, aoSoltar, deslocamento, intencao, SEGURAR_MS } from "./deslizar";

const AVISO_MS = 6000;
const SAIDA_MS = 220;
const calmo = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const nada = () => () => {};
const useNoNavegador = () =>
  useSyncExternalStore(
    nada,
    () => true,
    () => false,
  );

type Aviso = { n: number; texto: string; apoio?: string | null; desfazer?: () => void; tom?: "erro" };
type Menu =
  | { item: ItemLixeira; href: string; modo: "folha" }
  /** `direita`: o canto direito do menu em x (o "•••"); `ponteiro`: nasce em x (botão direito). */
  | { item: ItemLixeira; href: string; modo: "menu"; x: number; y: number; alinhar: "direita" | "ponteiro"; volta: HTMLElement | null };
type Gesto = {
  id: number;
  x0: number;
  y0: number;
  t: number;
  base: number;
  x: number;
  v: number;
  largura: number;
  modo: "toque" | "deslizar" | "rolar";
  timer: number;
};

type Ctx = {
  estado: (id: string) => "saindo" | "fora" | undefined;
  apagar: (item: ItemLixeira) => void;
  restaurar: (item: ItemLixeira) => void;
  deVez: (item: ItemLixeira) => void;
  aberto: string | null;
  setAberto: (id: string | null) => void;
  abrirMenu: (m: Menu) => void;
};
const Contexto = createContext<Ctx | null>(null);
const useLixeira = () => {
  const c = useContext(Contexto);
  if (!c) throw new Error("Cartão da lixeira fora de <ListaLixeira>.");
  return c;
};

async function pedir(item: ItemLixeira, acao: AcaoLixeira): Promise<{ ok: boolean; mensagem?: string }> {
  const { url, corpo } = pedidoDaLixeira(item.tipo, item.id, acao);
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const c = (await r.json().catch(() => null)) as { mensagem?: string } | null;
    return { ok: r.ok, mensagem: c?.mensagem };
  } catch {
    return { ok: false, mensagem: "Sem conexão. Tente de novo." };
  }
}

/**
 * A lista (ou a lixeira) de um tipo. `apagouAgora` = o item que o editor ou o canvas acabou de mandar para a lixeira
 * (`?apagou=<id>`): a lista abre com o "Apagado · Desfazer" dele.
 */
export function ListaLixeira({ children, apagouAgora = null }: { children: ReactNode; apagouAgora?: ItemLixeira | null }) {
  const router = useRouter();
  const [estados, setEstados] = useState<ReadonlyMap<string, "saindo" | "fora">>(new Map());
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirmar, setConfirmar] = useState<ItemLixeira | null>(null);
  const n = useRef(0);

  const marcar = useCallback((id: string, e: "saindo" | "fora" | null) => {
    setEstados((m) => {
      const x = new Map(m);
      if (e) x.set(id, e);
      else x.delete(id);
      return x;
    });
  }, []);
  const avisar = useCallback((a: Omit<Aviso, "n">) => setAviso({ ...a, n: ++n.current }), []);
  /** Tira da tela com a saída (o cartão encolhe) e só então some de vez. */
  const tirar = useCallback(
    (id: string) => {
      marcar(id, "saindo");
      // só some de vez se ainda está saindo (o servidor pode ter recusado e devolvido antes)
      setTimeout(() => setEstados((m) => (m.get(id) === "saindo" ? new Map(m).set(id, "fora") : m)), calmo() ? 0 : SAIDA_MS);
    },
    [marcar],
  );

  const desfazer = useCallback(
    async (item: ItemLixeira) => {
      const r = await pedir(item, "restaurar");
      if (!r.ok) return avisar({ texto: r.mensagem ?? "Não deu para desfazer.", tom: "erro" });
      marcar(item.id, null);
      router.refresh();
    },
    [avisar, marcar, router],
  );

  const apagar = useCallback(
    async (item: ItemLixeira) => {
      setAberto(null);
      tirar(item.id);
      const r = await pedir(item, "apagar");
      if (!r.ok) {
        marcar(item.id, null);
        return avisar({ texto: r.mensagem ?? "Não deu para apagar.", tom: "erro" });
      }
      avisar({ texto: "Apagado", apoio: avisoAoApagar(item), desfazer: () => void desfazer(item) });
      router.refresh();
    },
    [avisar, desfazer, marcar, router, tirar],
  );

  const restaurar = useCallback(
    async (item: ItemLixeira) => {
      tirar(item.id);
      const r = await pedir(item, "restaurar");
      if (!r.ok) {
        marcar(item.id, null);
        return avisar({ texto: r.mensagem ?? "Não deu para restaurar.", tom: "erro" });
      }
      avisar({ texto: "Restaurado" });
      router.refresh();
    },
    [avisar, marcar, router, tirar],
  );

  const apagarDeVez = useCallback(
    async (item: ItemLixeira) => {
      setConfirmar(null);
      tirar(item.id);
      const r = await pedir(item, "de_vez");
      if (!r.ok) {
        marcar(item.id, null);
        return avisar({ texto: r.mensagem ?? "Não deu para apagar de vez.", tom: "erro" });
      }
      avisar({ texto: "Apagado de vez" });
      router.refresh();
    },
    [avisar, marcar, router, tirar],
  );

  // veio do editor ou do canvas: o aviso com Desfazer e o endereço volta a ser o da lista
  const chegou = useRef(false);
  useEffect(() => {
    if (chegou.current) return;
    chegou.current = true;
    const q = new URL(window.location.href);
    if (q.searchParams.has("apagou")) {
      q.searchParams.delete("apagou");
      window.history.replaceState(window.history.state, "", q);
    }
    if (!apagouAgora) return;
    avisar({ texto: "Apagado", apoio: avisoAoApagar(apagouAgora), desfazer: () => void desfazer(apagouAgora) });
  }, [apagouAgora, avisar, desfazer]);

  // Depois de deslizar ou segurar, o toque não abre o cartão; com o "Apagar" à mostra, o toque fecha. Na captura da
  // janela: antes da troca de seção (`movimento.tsx`, captura do documento) e do next/link.
  const abertoRef = useRef(aberto);
  useEffect(() => {
    abertoRef.current = aberto;
  });
  useEffect(() => {
    const clique = (e: MouseEvent) => {
      const alvo = e.target as Element | null;
      const el = alvo?.closest?.<HTMLElement>(".lx-cartao[data-item]");
      if (!el || alvo?.closest(".lx-mais, .lx-fundo")) return;
      const id = el.dataset.item!;
      if (!("engolir" in el.dataset) && abertoRef.current !== id) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      delete el.dataset.engolir;
      if (abertoRef.current === id) setAberto(null);
    };
    window.addEventListener("click", clique, true);
    return () => window.removeEventListener("click", clique, true);
  }, []);

  // um cartão aberto (mostrando o "Apagar") fecha com um toque fora dele
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.(`[data-item="${CSS.escape(aberto)}"]`)) setAberto(null);
    };
    document.addEventListener("pointerdown", fora, true);
    return () => document.removeEventListener("pointerdown", fora, true);
  }, [aberto]);

  const ctx = useMemo<Ctx>(
    () => ({
      estado: (id) => estados.get(id),
      apagar: (i) => void apagar(i),
      restaurar: (i) => void restaurar(i),
      deVez: setConfirmar,
      aberto,
      setAberto,
      abrirMenu: setMenu,
    }),
    [estados, apagar, restaurar, aberto],
  );

  return (
    <Contexto.Provider value={ctx}>
      {children}
      {menu?.modo === "folha" ? <FolhaDoCartao menu={menu} apagar={() => void apagar(menu.item)} aoFechar={() => setMenu(null)} /> : null}
      {menu?.modo === "menu" ? <MenuDoCartao menu={menu} apagar={() => void apagar(menu.item)} fechar={() => setMenu(null)} /> : null}
      {confirmar ? <FolhaDeVez item={confirmar} sim={() => void apagarDeVez(confirmar)} aoFechar={() => setConfirmar(null)} /> : null}
      {aviso ? <AvisoLixeira key={aviso.n} aviso={aviso} fechar={() => setAviso((a) => (a?.n === aviso.n ? null : a))} /> : null}
    </Contexto.Provider>
  );
}

type CartaoProps = {
  item: ItemLixeira;
  href: string;
  /** Quem edita a Criação (podeEditarCriacao). Sem isso, o cartão é só o link. */
  podeApagar: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** Um cartão da lista que se apaga: deslizar e segurar (toque), "•••" e botão direito (mouse e teclado). */
export function CartaoApagavel({ item, href, podeApagar, className = "", style, children }: CartaoProps) {
  const ctx = useLixeira();
  const li = useRef<HTMLLIElement>(null);
  const frente = useRef<HTMLDivElement>(null);
  const mais = useRef<HTMLButtonElement>(null);
  const g = useRef<Gesto | null>(null);
  const ultimoToque = useRef(0);
  const aberto = ctx.aberto === item.id;
  const estado = ctx.estado(item.id);

  const por = useCallback((x: number, animar: boolean) => {
    const el = frente.current;
    if (!el) return;
    el.style.transition = animar ? "" : "none";
    el.style.transform = x ? `translate3d(${x}px, 0, 0)` : "";
  }, []);

  const engolir = (sim: boolean) => {
    if (!li.current) return;
    if (sim) li.current.dataset.engolir = "";
    else delete li.current.dataset.engolir;
  };
  // hidratado (os testes esperam por isto antes do gesto)
  useEffect(() => {
    if (li.current) li.current.dataset.pronto = "";
  }, [podeApagar]);

  // aberto/fechado por fora (outro cartão abriu, toque fora): o cartão volta com a mola
  // (e de volta ao lugar se o apagar não passou no servidor)
  useEffect(() => {
    if (estado || g.current?.modo === "deslizar") return;
    por(aberto ? -ABERTO_PX : 0, true);
    const el = li.current;
    if (!el) return;
    if (aberto) {
      el.dataset.deslizando = "";
      return;
    }
    delete el.dataset.armado;
    const t = setTimeout(() => {
      if (li.current && !g.current) delete li.current.dataset.deslizando;
    }, 320);
    return () => clearTimeout(t);
  }, [aberto, estado, por]);

  if (estado === "fora") return null;
  if (!podeApagar)
    return (
      <li ref={li} className={className} style={style} data-item={item.id}>
        {children}
      </li>
    );

  const soltar = () => {
    const s = g.current;
    g.current = null;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.modo !== "deslizar") return;
    const fim = aoSoltar(s.x, s.largura, s.v);
    if (fim === "apagar") {
      por(-s.largura, true);
      ctx.apagar(item);
      return;
    }
    if (fim === "abrir") {
      por(-ABERTO_PX, true);
      if (!aberto) ctx.setAberto(item.id);
    } else {
      por(0, true);
      if (li.current) delete li.current.dataset.armado;
      if (aberto) ctx.setAberto(null);
      else
        setTimeout(() => {
          if (li.current && !g.current) delete li.current.dataset.deslizando;
        }, 320);
    }
  };

  return (
    <li ref={li} className={`lx-cartao ${className}`.trim()} style={style} data-item={item.id} data-saindo={estado === "saindo" || undefined}>
      <div className="lx-fundo" aria-hidden="true">
        <button type="button" tabIndex={-1} className="lx-fundo__apagar" onClick={() => ctx.apagar(item)}>
          <Icone nome="lixo" size={20} />
          <span>Apagar</span>
        </button>
      </div>
      <div
        ref={frente}
        className="lx-frente"
        onPointerDown={(e) => {
          engolir(false);
          if (e.pointerType === "mouse") return;
          ultimoToque.current = Date.now();
          if (ctx.aberto && ctx.aberto !== item.id) ctx.setAberto(null);
          const base = aberto ? -ABERTO_PX : 0;
          const s: Gesto = {
            id: e.pointerId,
            x0: e.clientX,
            y0: e.clientY,
            t: performance.now(),
            base,
            x: base,
            v: 0,
            largura: li.current?.offsetWidth ?? 320,
            modo: "toque",
            timer: 0,
          };
          s.timer = window.setTimeout(() => {
            if (g.current !== s || s.modo !== "toque") return;
            g.current = null;
            engolir(true);
            navigator.vibrate?.(8);
            ctx.abrirMenu({ item, href, modo: "folha" });
          }, SEGURAR_MS);
          g.current = s;
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (!s || e.pointerId !== s.id) return;
          const dx = e.clientX - s.x0;
          const dy = e.clientY - s.y0;
          if (s.modo === "toque") {
            const i = intencao(dx, dy, s.base < 0);
            if (i === "toque") return;
            clearTimeout(s.timer);
            if (i === "rolar") {
              g.current = null;
              return;
            }
            s.modo = "deslizar";
            engolir(true);
            try {
              frente.current?.setPointerCapture(e.pointerId);
            } catch {}
            if (li.current) li.current.dataset.deslizando = "";
          }
          const agora = performance.now();
          const p = deslocamento(s.base + dx, s.largura);
          s.v = (p.x - s.x) / Math.max(1, agora - s.t);
          s.t = agora;
          s.x = p.x;
          por(p.x, false);
          const el = li.current;
          if (el && p.armado !== "armado" in el.dataset) {
            if (p.armado) el.dataset.armado = "";
            else delete el.dataset.armado;
          }
        }}
        onPointerUp={soltar}
        onPointerCancel={() => {
          const s = g.current;
          if (s?.modo === "deslizar") {
            s.x = s.base;
            s.v = 0;
          }
          soltar();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          // no toque, o segurar já abre a folha; com o mouse, o menu nasce onde clicou
          if (Date.now() - ultimoToque.current < 1200) return;
          ctx.abrirMenu({ item, href, modo: "menu", x: e.clientX, y: e.clientY, alinhar: "ponteiro", volta: mais.current });
        }}
      >
        {children}
      </div>
      <button
        ref={mais}
        type="button"
        className="lx-mais"
        aria-label={`Opções de ${item.titulo}`}
        aria-haspopup="menu"
        title="Mais"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          ctx.abrirMenu({ item, href, modo: "menu", x: r.right, y: r.bottom + 6, alinhar: "direita", volta: e.currentTarget });
        }}
      >
        <Icone nome="pontos" size={18} />
      </button>
    </li>
  );
}

/** Um cartão na lixeira: o conteúdo e, embaixo, "Restaurar" e (administração e gestão) "Apagar de vez". */
export function CartaoNaLixeira({
  item,
  podeRestaurar,
  podeDeVez,
  className = "",
  children,
}: {
  item: ItemLixeira;
  podeRestaurar: boolean;
  podeDeVez: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ctx = useLixeira();
  const li = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (li.current) li.current.dataset.pronto = "";
  }, []);
  const estado = ctx.estado(item.id);
  if (estado === "fora") return null;
  const sai = saiDeVez(item);
  return (
    <li ref={li} className={`lx-na-lixeira ${className}`.trim()} data-item={item.id} data-saindo={estado === "saindo" || undefined}>
      {children}
      {podeRestaurar ? (
        <div className="lx-acoes">
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => ctx.restaurar(item)}>
            Restaurar
          </button>
          {podeDeVez && sai ? (
            <button type="button" className="glass-btn glass-btn--sm lx-acoes__perigo" onClick={() => ctx.deVez(item)}>
              Apagar de vez
            </button>
          ) : null}
          {podeDeVez && !sai ? <span className="lx-acoes__nota">{POR_QUE_FICA}</span> : null}
        </div>
      ) : null}
    </li>
  );
}

/** iPhone: segurar o cartão. */
function FolhaDoCartao({ menu, apagar, aoFechar }: { menu: Menu; apagar: () => void; aoFechar: () => void }) {
  const aviso = avisoAoApagar(menu.item);
  return (
    <Folha rotulo={menu.item.titulo} tamanho="acao" className="lx-folha" aoFechar={aoFechar}>
      <CorpoDaFolha menu={menu} apagar={apagar} aviso={aviso} />
    </Folha>
  );
}
function CorpoDaFolha({ menu, apagar, aviso }: { menu: Menu; apagar: () => void; aviso: string | null }) {
  const fechar = useFecharFolha();
  return (
    <div className="lx-folha__corpo">
      <div className="lx-folha__cabeca">
        <span>{NOME_DO_TIPO[menu.item.tipo]}</span>
        <h2>{menu.item.titulo}</h2>
      </div>
      <div className="lx-folha__lista" role="menu" aria-label={menu.item.titulo}>
        <Link role="menuitem" href={menu.href} onClick={fechar}>
          <Icone nome="externo" size={18} /> Abrir
        </Link>
        <button
          type="button"
          role="menuitem"
          className="lx-perigo"
          onClick={() => {
            fechar();
            apagar();
          }}
        >
          <Icone nome="lixo" size={18} /> Apagar
        </button>
      </div>
      {aviso ? <p className="lx-folha__aviso">{aviso}</p> : null}
      <button type="button" className="glass-btn lx-folha__cancelar" onClick={fechar}>
        Cancelar
      </button>
    </div>
  );
}

/** Computador: o "•••" e o botão direito. Vai no <body> (nada de `transform` de um cartão prendendo o `fixed`). */
function MenuDoCartao({ menu, apagar, fechar }: { menu: Extract<Menu, { modo: "menu" }>; apagar: () => void; fechar: () => void }) {
  const noNavegador = useNoNavegador();
  const caixa = useRef<HTMLDivElement>(null);
  const [onde, setOnde] = useState<{ left: number; top: number } | null>(null);
  const aviso = avisoAoApagar(menu.item);

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // pelo "•••": alinhado à direita do botão; pelo botão direito: nasce no ponteiro
    let left = menu.alinhar === "direita" ? menu.x - width : menu.x;
    let top = menu.y;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    if (top + height > window.innerHeight - 12) top = Math.max(12, menu.y - height - 12);

    setOnde({ left, top });
  }, [menu, noNavegador]);
  // o foco entra no primeiro item quando o menu já está no lugar (escondido, o navegador não foca)
  const posto = onde !== null;
  useEffect(() => {
    if (posto) caixa.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [posto]);

  useEffect(() => {
    const sair = (focar: boolean) => {
      fechar();
      if (focar && menu.volta?.isConnected) menu.volta.focus({ preventScroll: true });
    };
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) sair(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        sair(true);
      }
    };
    const rolou = () => sair(false);
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", rolou, { passive: true });
    window.addEventListener("resize", rolou);
    window.addEventListener("blur", rolou);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", rolou);
      window.removeEventListener("resize", rolou);
      window.removeEventListener("blur", rolou);
    };
  }, [fechar, menu]);

  const painel = (
    <div
      ref={caixa}
      className="lx-menu"
      role="menu"
      aria-label={`Opções de ${menu.item.titulo}`}
      style={onde ? { left: onde.left, top: onde.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      <button
        type="button"
        role="menuitem"
        className="lx-perigo"
        onClick={() => {
          fechar();
          apagar();
        }}
      >
        <Icone nome="lixo" size={16} /> Mandar para a lixeira
      </button>
      {aviso ? <p className="lx-menu__aviso">{aviso}</p> : null}
    </div>
  );
  return noNavegador ? createPortal(painel, document.body) : null;
}

/** "Apagar de vez": a única pergunta (não tem volta). */
function FolhaDeVez({ item, sim, aoFechar }: { item: ItemLixeira; sim: () => void; aoFechar: () => void }) {
  return (
    <Folha rotulo="Apagar de vez" tamanho="acao" className="lx-folha" aoFechar={aoFechar}>
      <CorpoDeVez item={item} sim={sim} />
    </Folha>
  );
}
function CorpoDeVez({ item, sim }: { item: ItemLixeira; sim: () => void }) {
  const fechar = useFecharFolha();
  return (
    <div className="lx-folha__corpo">
      <div className="lx-folha__cabeca">
        <span>Apagar de vez?</span>
        <h2>{item.titulo}</h2>
      </div>
      <p className="lx-folha__aviso">Não dá para desfazer.</p>
      <div className="lx-folha__botoes">
        <button type="button" className="glass-btn" onClick={fechar}>
          Cancelar
        </button>
        <button type="button" className="glass-btn glass-btn--ink lx-folha__sim" onClick={sim}>
          Apagar de vez
        </button>
      </div>
    </div>
  );
}

function AvisoLixeira({ aviso, fechar }: { aviso: Aviso; fechar: () => void }) {
  const noNavegador = useNoNavegador();
  useEffect(() => {
    const t = setTimeout(fechar, aviso.desfazer ? AVISO_MS : 4000);
    return () => clearTimeout(t);
  }, [aviso, fechar]);
  const el = (
    <div className="lx-aviso" role={aviso.tom ? "alert" : "status"} data-tom={aviso.tom}>
      <span className="lx-aviso__texto">
        <b>{aviso.texto}</b>
        {aviso.apoio ? <small>{aviso.apoio}</small> : null}
      </span>
      {aviso.desfazer ? (
        <button
          type="button"
          onClick={() => {
            aviso.desfazer?.();
            fechar();
          }}
        >
          Desfazer
        </button>
      ) : null}
    </div>
  );
  return noNavegador ? createPortal(el, document.body) : null;
}
