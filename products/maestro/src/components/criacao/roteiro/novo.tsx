"use client";
/**
 * "Novo roteiro" (plano da Criação §4.2): a folha com os 6 modelos em cartões, o título, o vínculo opcional (projeto e/ou
 * card) e a pergunta "Técnico ou Literário primeiro?" (só a vista de começo: o dado é um só). Cria pela Server Action e
 * abre o editor.
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { criarRoteiroAcao } from "@/app/(app)/app/criacao/acoes";
import { FICHAS_MODELOS, type ModeloRoteiro } from "@/lib/criacao/roteiro/modelos";
import { Folha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { textoAlvo } from "./comum";

export type OpcoesVinculo = { projetos: { id: string; codigo: string; titulo: string }[]; cards: { id: string; tema: string; projetoId: string | null }[] };

function Criar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--ink" disabled={pending} aria-busy={pending || undefined}>
      {pending ? "Criando…" : "Criar"}
    </button>
  );
}

function FolhaNovo({ opcoes, aoFechar, projeto, card }: { opcoes: OpcoesVinculo; aoFechar: () => void; projeto?: string; card?: string }) {
  const [estado, enviar] = useActionState(criarRoteiroAcao, undefined);
  const [modelo, setModelo] = useState<ModeloRoteiro>("institucional");
  const ficha = FICHAS_MODELOS.find((f) => f.k === modelo)!;
  const [titulo, setTitulo] = useState("");
  const [projetoId, setProjetoId] = useState(projeto ?? "");
  const [cardId, setCardId] = useState(card ?? "");
  const [vista, setVista] = useState<"literario" | "tecnico">("literario");
  const cards = projetoId ? opcoes.cards.filter((c) => c.projetoId === projetoId || c.id === cardId) : opcoes.cards;
  return (
    <Folha rotulo="Novo roteiro" aoFechar={aoFechar} className="cr-novo">
      <form action={enviar} className="cr-novo__form">
        <h2 className="cr-novo__titulo">Novo roteiro</h2>
        <div className="cr-modelos" role="radiogroup" aria-label="Modelo">
          {FICHAS_MODELOS.map((f) => (
            <button
              key={f.k}
              type="button"
              role="radio"
              aria-checked={modelo === f.k}
              className="cr-modelo"
              data-formato={f.formato}
              onClick={() => setModelo(f.k)}
              title={f.cenas.join(" · ")}
            >
              <span className="cr-modelo__quadro" aria-hidden="true">
                <i />
              </span>
              <span className="cr-modelo__nome">{f.nome}</span>
              <span className="cr-modelo__meta">{[f.formato, textoAlvo(f.alvo) || "livre"].join(" · ")}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="modelo" value={modelo} />
        <label className="q-campo">
          <span>Título</span>
          <input
            name="titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder={ficha.k === "branco" ? "Roteiro" : ficha.nome}
            maxLength={200}
            autoComplete="off"
            aria-invalid={estado?.erros?.titulo ? true : undefined}
          />
        </label>
        <details className="cr-novo__ligar" open={!!(projeto || card) || undefined}>
          <summary>
            <Icone nome="link" size={15} /> Ligar a um projeto ou card
          </summary>
          <div className="cr-novo__selects">
            <label className="q-campo">
              <span>Projeto</span>
              <select name="projeto" value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
                <option value="">Nenhum</option>
                {opcoes.projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.titulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-campo">
              <span>Card</span>
              <select name="card" value={cardId} onChange={(e) => setCardId(e.target.value)}>
                <option value="">Nenhum</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tema}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <div className="cr-novo__pe">
          <div className="q-segmentos" role="radiogroup" aria-label="Começar no">
            {(
              [
                ["literario", "Literário"],
                ["tecnico", "Técnico"],
              ] as const
            ).map(([k, nome]) => (
              <button key={k} type="button" role="radio" aria-checked={vista === k} onClick={() => setVista(k)}>
                {nome}
              </button>
            ))}
          </div>
          <input type="hidden" name="vista" value={vista} />
          <Criar />
        </div>
        {estado?.mensagem ? (
          <p className="form__erro" role="alert">
            {estado.mensagem}
          </p>
        ) : null}
      </form>
    </Folha>
  );
}

/** O botão "Novo roteiro" (a ação principal da Criação) e a folha. `aberto` abre já (?novo=1). */
export function NovoRoteiro({
  opcoes,
  aberto = false,
  projeto,
  card,
  rotulo = "Novo roteiro",
  classe = "glass-btn glass-btn--ink",
}: {
  opcoes: OpcoesVinculo;
  aberto?: boolean;
  projeto?: string;
  card?: string;
  rotulo?: string;
  classe?: string;
}) {
  const [aberta, setAberta] = useState(aberto);
  return (
    <>
      <button type="button" className={classe} onClick={() => setAberta(true)}>
        <Icone nome="mais" size={18} /> {rotulo}
      </button>
      {aberta ? <FolhaNovo opcoes={opcoes} aoFechar={() => setAberta(false)} projeto={projeto} card={card} /> : null}
    </>
  );
}
