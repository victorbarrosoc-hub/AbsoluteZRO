"use client";
/**
 * Peças pequenas do Quadro: avatar da pessoa, chip do prazo, prioridade, o selo do link (a peça e o cliente), a marca
 * do cliente, o realce da busca, a imagem do topo do card e a folha "Mover para…".
 */
import { useEffect, useRef } from "react";
import { corDoCliente, pedacosDoRealce, rotuloDoSelo, type Selo } from "@/lib/quadro/selos";
import { estadoPrazo, rotuloDia, type ColunaId, type DadosCard } from "@/lib/quadro/metodo";
import type { Coluna } from "@/lib/quadro/colunas";
import type { Referencias } from "@/lib/quadro/servidor";
import { Icone } from "@/components/icones";
import { Folha, useFecharFolha } from "@/components/folha";

function BotaoFechar() {
  const fechar = useFecharFolha();
  return (
    <button type="button" className="glass-btn glass-btn--sm q-folha__fechar" onClick={fechar}>
      Cancelar
    </button>
  );
}

type Pessoa = Referencias["pessoas"][number];

export const iniciaisDe = (nome?: string | null) =>
  (nome ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";

export function AvatarPessoa({ pessoa, tamanho = 24 }: { pessoa: Pessoa | null; tamanho?: number }) {
  if (!pessoa)
    return (
      <span className="q-av q-av--vazio" style={{ width: tamanho, height: tamanho }} title="Sem responsável">
        <Icone nome="mais" size={12} />
      </span>
    );
  return (
    <span className="q-av" style={{ width: tamanho, height: tamanho }} title={pessoa.nome}>
      {pessoa.foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto da conta Absolute ZRO (endereço público)
        <img src={pessoa.foto} alt="" referrerPolicy="no-referrer" />
      ) : (
        iniciaisDe(pessoa.nome)
      )}
    </span>
  );
}

export function ChipPrazo({ d }: { d: Pick<DadosCard, "prazo" | "coluna"> }) {
  const e = estadoPrazo(d);
  if (!e) return null;
  return (
    <span className={`q-chip q-chip--${e}`} title={e === "atrasado" ? "Prazo de entrega passou" : "Prazo de entrega"}>
      <Icone nome="relogio" size={12} />
      {rotuloDia(d.prazo)}
    </span>
  );
}

export function ChipPrioridade({ p }: { p?: DadosCard["prioridade"] }) {
  if (p !== "alta") return null;
  return (
    <span className="q-chip q-chip--alta" title="Prioridade alta">
      <Icone nome="bandeira" size={12} />
      Alta
    </span>
  );
}

/**
 * O selo do link: um só, o mais adiantado (o cliente decidiu > abriu > recebeu > a peça tem link). Ícone + duas
 * palavras; a frase inteira (com a hora e a versão) na dica e para o leitor de tela.
 */
export function SeloDoCard({ selo, aoTocar }: { selo?: Selo; aoTocar?: () => void }) {
  const r = rotuloDoSelo(selo);
  if (!r) return null;
  // por cima do botão de abrir (a dica aparece ao passar o mouse); tocar abre o card do mesmo jeito. Para o leitor de
  // tela a frase vai no nome do botão de abrir.
  return (
    <span className="q-chip q-selo" data-tom={r.tom} title={r.dica} onClick={aoTocar} aria-hidden="true">
      <Icone nome={r.icone} size={12} />
      {r.curto}
    </span>
  );
}

/** A marca do cliente: a sigla num círculo da cor dele (a mesma em toda tela; `corDoCliente`). */
export function MarcaCliente({ id, nome }: { id?: string; nome: string }) {
  const cor = corDoCliente(id);
  if (!cor) return null;
  return (
    <i className="q-cli" data-cor={cor} aria-hidden="true">
      {iniciaisDe(nome)}
    </i>
  );
}

/** O texto com o que casou na busca marcado (sem acento e sem caixa, como o filtro). */
export function Realce({ texto, termos }: { texto: string; termos: string[] }) {
  if (!termos.length) return <>{texto}</>;
  return (
    <>
      {pedacosDoRealce(texto, termos).map(([t, casou], i) =>
        casou ? (
          <mark key={i} className="q-realce">
            {t}
          </mark>
        ) : (
          t
        ),
      )}
    </>
  );
}

/**
 * A imagem do topo do card (capa enviada ou miniatura da peça). O lugar já tem a proporção (16:9) antes de a imagem
 * chegar: carregar não mexe no layout (nem no meio de um arrasto). Sem imagem, nada: o card fica compacto. Se a
 * imagem não vier (sem rede, vídeo tirado do ar), o lugar some pelo DOM, sem estado do React.
 */
export function ImagemDoCard({ src, origem }: { src: string; origem: "capa" | "peca" }) {
  return (
    <div className="q-card__capa" data-origem={origem}>
      {/* eslint-disable-next-line @next/next/no-img-element -- capa da rota com sessão ou miniatura pública da peça */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={(e) => {
          const lugar = e.currentTarget.parentElement;
          if (lugar) lugar.hidden = true;
        }}
      />
    </div>
  );
}

/** Folha "Mover para…": as colunas vivas, a atual marcada. No celular é o jeito de mover; no computador, o atalho. */
export function MoverPara({
  colunas,
  atual,
  aoEscolher,
  aoFechar,
}: {
  colunas: Coluna[];
  atual: ColunaId;
  aoEscolher: (k: ColunaId) => void;
  aoFechar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button[aria-current='true'], button")?.focus({ preventScroll: true });
  }, []);
  return (
    <Folha rotulo="Mover para" aoFechar={aoFechar} tamanho="acao" className="q-folha">
      <div ref={ref} className="q-folha__corpo">
        <h2 className="q-folha__titulo">Mover para…</h2>
        <ul className="q-folha__lista">
          {colunas.map((c, i) => (
            <li key={c.id}>
              <button type="button" data-col={c.id} data-cor={c.cor} aria-current={c.id === atual} onClick={() => aoEscolher(c.id)}>
                <i className="q-ponto" aria-hidden="true" />
                <span className="q-folha__n">{i + 1}</span>
                {c.nome}
                {c.id === atual ? <span className="q-folha__aqui">Aqui</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <BotaoFechar />
      </div>
    </Folha>
  );
}
