"use client";
/**
 * Vista Literário em edição: cabeçalho de cena (número, título, INT/EXT, local, período, tempo) e os blocos em linhas,
 * na forma do roteiro literário (ação em parágrafo, fala com o nome acima, lettering e áudio discretos). No computador,
 * todas as cenas, com "Adicionar" no fim de cada uma; no iPhone, uma cena por vez em cartões, com o "+" e o segurar
 * 280 ms para arrastar (o mesmo gesto do Quadro).
 */
import { memo, useRef, useState, type PointerEvent as PE } from "react";
import { apagarCena, moverCena, mudarCena, novaCena, reordenarBloco } from "@/lib/criacao/roteiro/editar";
import { type Cena, INT_EXT, PERIODOS, type TipoBloco } from "@/lib/criacao/roteiro/modelo";
import { formatarTempo, type TempoCena } from "@/lib/criacao/roteiro/tempo";
import { Icone } from "@/components/icones";
import { AdicionarBloco, CampoBloco, CampoTempo } from "./bloco";
import { useEditor } from "./contexto";

const SEGURAR_MS = 280;
const calmo = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const vibrar = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

/**
 * Arrastar para reordenar os blocos de uma cena: com o dedo, segurar a alça 280 ms ergue o cartão (sem o arrastar nativo
 * do HTML); com o mouse, ergue na hora. O cartão segue o ponteiro, os outros abrem espaço com a mola (só transform) e
 * soltar grava a ordem nova. Nada de render do React por quadro.
 */
function useArrasto(lista: React.RefObject<HTMLDivElement | null>, aoSoltar: (de: number, para: number) => void) {
  const g = useRef<{
    el: HTMLElement;
    de: number;
    para: number;
    y0: number;
    alturas: { meio: number; altura: number }[];
    passo: number;
    timer: ReturnType<typeof setTimeout> | null;
    erguido: boolean;
    x0: number;
  } | null>(null);

  const erguer = () => {
    const a = g.current;
    if (!a) return;
    a.erguido = true;
    a.el.classList.add("cr-bloco--erguido");
    vibrar(8);
  };
  const limpar = () => {
    const a = g.current;
    g.current = null;
    if (!a) return;
    if (a.timer) clearTimeout(a.timer);
    const itens = [...(lista.current?.querySelectorAll<HTMLElement>(":scope > .cr-item") ?? [])];
    for (const x of itens) {
      x.style.transform = "";
      x.style.transition = "";
    }
    a.el.classList.remove("cr-bloco--erguido");
    return a;
  };

  const pegar = (e: PE<HTMLElement>, indice: number) => {
    const item = e.currentTarget.closest<HTMLElement>(".cr-item");
    if (!item || !lista.current) return;
    const itens = [...lista.current.querySelectorAll<HTMLElement>(":scope > .cr-item")];
    const caixas = itens.map((x) => x.getBoundingClientRect());
    const passo = caixas.length > 1 ? caixas[1].top - caixas[0].top - caixas[0].height + caixas[indice].height : caixas[indice].height + 10;
    g.current = {
      el: item,
      de: indice,
      para: indice,
      y0: e.clientY,
      x0: e.clientX,
      alturas: caixas.map((c) => ({ meio: c.top + c.height / 2, altura: c.height })),
      passo,
      timer: null,
      erguido: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    if (e.pointerType === "mouse") erguer();
    else g.current.timer = setTimeout(erguer, SEGURAR_MS);
  };

  const mover = (e: PE<HTMLElement>) => {
    const a = g.current;
    if (!a || !lista.current) return;
    const dy = e.clientY - a.y0;
    if (!a.erguido) {
      if (Math.abs(dy) > 8 || Math.abs(e.clientX - a.x0) > 8) limpar();
      return;
    }
    e.preventDefault();
    a.el.style.transition = "none";
    a.el.style.transform = `translateY(${dy}px) scale(1.02)`;
    const centro = a.alturas[a.de].meio + dy;
    let para = a.de;
    for (let i = 0; i < a.alturas.length; i++) {
      if (i < a.de && centro < a.alturas[i].meio) {
        para = i;
        break;
      }
      if (i > a.de && centro > a.alturas[i].meio) para = i;
    }
    a.para = para;
    const itens = [...lista.current.querySelectorAll<HTMLElement>(":scope > .cr-item")];
    itens.forEach((x, i) => {
      if (i === a.de) return;
      x.style.transition = calmo() ? "none" : "transform 0.28s var(--spring)";
      const desloca = a.de < para && i > a.de && i <= para ? -a.passo : a.de > para && i < a.de && i >= para ? a.passo : 0;
      x.style.transform = desloca ? `translateY(${desloca}px)` : "";
    });
  };

  const soltar = () => {
    const a = limpar();
    if (a?.erguido && a.para !== a.de) aoSoltar(a.de, a.para);
  };

  return { pegar, mover, soltar };
}

const CabecaCena = memo(function CabecaCena({ cena: c, numero, tempo, total }: { cena: Cena; numero: number; tempo: TempoCena | undefined; total: number }) {
  const { ops, editavel } = useEditor();
  const set = (campos: Partial<Omit<Cena, "id" | "blocos">>) => ops.mudar((r) => mudarCena(r, c.id, campos));
  const [certeza, setCerteza] = useState(false);
  return (
    <header className="cr-cena__cab">
      <span className="cr-cena__num num" aria-hidden="true">
        {numero}
      </span>
      <div className="cr-cena__miolo">
        <input
          className="cr-cena__titulo"
          value={c.titulo}
          placeholder={c.dica ?? "Título da cena"}
          aria-label={`Título da cena ${numero}`}
          maxLength={200}
          readOnly={!editavel}
          onChange={(e) => set({ titulo: e.target.value })}
        />
        <div className="cr-cena__lugar">
          <select
            className="cr-sel cr-opcional-sel"
            value={c.intExt ?? ""}
            aria-label="Interna ou externa"
            disabled={!editavel}
            data-vazio={!c.intExt || undefined}
            onChange={(e) => set({ intExt: (e.target.value || undefined) as Cena["intExt"] })}
          >
            <option value="">INT/EXT</option>
            {INT_EXT.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <input
            className="cr-local"
            value={c.local ?? ""}
            placeholder="local"
            aria-label="Local"
            maxLength={120}
            readOnly={!editavel}
            onChange={(e) => set({ local: e.target.value || undefined })}
          />
          <select
            className="cr-sel cr-opcional-sel"
            value={c.periodo ?? ""}
            aria-label="Período"
            disabled={!editavel}
            data-vazio={!c.periodo || undefined}
            onChange={(e) => set({ periodo: (e.target.value || undefined) as Cena["periodo"] })}
          >
            <option value="">período</option>
            {PERIODOS.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <CampoTempo
            valor={c.duracaoSeg}
            mudar={(s) => set({ duracaoSeg: s })}
            editavel={editavel}
            placeholder="tempo da cena"
            rotulo="Tempo da cena (fixo)"
          />
        </div>
      </div>
      <span
        className="cr-cena__tempo num"
        data-excede={tempo?.excede || undefined}
        title={tempo?.excede ? "A fala passa do tempo da cena" : "Começo e fim estimados"}
      >
        {tempo ? `${formatarTempo(tempo.inicioSeg)}–${formatarTempo(tempo.inicioSeg + tempo.duracaoSeg)}` : ""}
      </span>
      {editavel ? (
        <span className="cr-cena__acoes">
          <button
            type="button"
            className="cr-icone"
            disabled={numero === 1}
            onClick={() => ops.mudar((r) => moverCena(r, c.id, -1))}
            aria-label="Subir a cena"
            title="Subir"
          >
            <Icone nome="abaixo" size={15} className="cr-gira" />
          </button>
          <button
            type="button"
            className="cr-icone"
            disabled={numero === total}
            onClick={() => ops.mudar((r) => moverCena(r, c.id, 1))}
            aria-label="Descer a cena"
            title="Descer"
          >
            <Icone nome="abaixo" size={15} />
          </button>
          <button
            type="button"
            className="cr-icone"
            data-certeza={certeza || undefined}
            disabled={total <= 1}
            onClick={() => {
              // com texto, o segundo toque confirma (nada de diálogo do navegador)
              const temTexto = c.blocos.some((b) => (b.tipo === "plano" ? b.texto : b.texto)?.trim());
              if (temTexto && !certeza) {
                setCerteza(true);
                setTimeout(() => setCerteza(false), 3000);
                return;
              }
              ops.mudar((r) => apagarCena(r, c.id));
            }}
            aria-label={certeza ? "Toque de novo para apagar a cena" : "Apagar a cena"}
            title={certeza ? "Toque de novo para apagar" : "Apagar a cena"}
          >
            <Icone nome="lixo" size={15} />
          </button>
        </span>
      ) : null}
    </header>
  );
});

export { CabecaCena };

function BlocosDaCena({ cena: c, adicionarNoFim }: { cena: Cena; adicionarNoFim: (cenaId: string, tipo: TipoBloco) => void }) {
  const { ops, editavel } = useEditor();
  const lista = useRef<HTMLDivElement>(null);
  const arrasto = useArrasto(lista, (de, para) => ops.mudar((r) => reordenarBloco(r, c.id, de, para)));
  return (
    <>
      <div className="cr-blocos" ref={lista}>
        {c.blocos.map((b, i) => (
          <div key={b.id} className="cr-item">
            <CampoBloco
              bloco={b}
              variante="literario"
              antes={
                editavel ? (
                  <button
                    type="button"
                    className="cr-alca"
                    aria-label="Segure para arrastar (⌥↑ e ⌥↓ no teclado)"
                    onPointerDown={(e) => arrasto.pegar(e, i)}
                    onPointerMove={arrasto.mover}
                    onPointerUp={arrasto.soltar}
                    onPointerCancel={arrasto.soltar}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <Icone nome="alca" size={16} />
                  </button>
                ) : null
              }
            />
          </div>
        ))}
      </div>
      {editavel ? (
        <div className="cr-cena__pe">
          {c.blocos.length ? null : <p className="cr-cena__vazia">Cena vazia.</p>}
          <AdicionarBloco cenaId={c.id} onAdicionar={adicionarNoFim} />
        </div>
      ) : c.blocos.length ? null : (
        <p className="cr-cena__vazia">Cena vazia.</p>
      )}
    </>
  );
}

export function VistaLiterarioEditor({
  cenas,
  tempos,
  atual,
  irPara,
  adicionarNoFim,
}: {
  cenas: Cena[];
  tempos: TempoCena[];
  /** A cena à vista no iPhone. */
  atual: number;
  irPara: (i: number) => void;
  adicionarNoFim: (cenaId: string, tipo: TipoBloco) => void;
}) {
  const { ops, editavel } = useEditor();
  const c = cenas[atual];
  return (
    <div className="cr-literario">
      <nav className="cr-pager" aria-label="Cenas">
        <button type="button" className="cr-icone" disabled={atual === 0} onClick={() => irPara(atual - 1)} aria-label="Cena anterior">
          <Icone nome="voltar" size={18} />
        </button>
        <span className="cr-pager__nome">
          Cena {atual + 1} de {cenas.length}
          {c?.titulo.trim() ? <b> · {c.titulo.trim()}</b> : null}
        </span>
        <button type="button" className="cr-icone" disabled={atual >= cenas.length - 1} onClick={() => irPara(atual + 1)} aria-label="Próxima cena">
          <Icone nome="seta" size={18} />
        </button>
      </nav>
      {cenas.map((cena, i) => (
        <section key={cena.id} className="cr-cena" data-atual={i === atual || undefined} aria-label={`Cena ${i + 1}`}>
          <CabecaCena cena={cena} numero={i + 1} tempo={tempos[i]} total={cenas.length} />
          <BlocosDaCena cena={cena} adicionarNoFim={adicionarNoFim} />
        </section>
      ))}
      {editavel ? (
        <button
          type="button"
          className="glass-btn cr-nova-cena"
          onClick={() => {
            let id = "";
            ops.mudar((r) => {
              const x = novaCena(r, null);
              id = x.blocoId;
              return x.roteiro;
            });
            irPara(cenas.length);
            if (id) ops.focar({ id });
          }}
        >
          <Icone nome="mais" size={16} /> Cena nova
        </button>
      ) : null}
    </div>
  );
}
