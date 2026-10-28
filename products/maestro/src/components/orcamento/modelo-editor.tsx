"use client";
/**
 * Editor de modelo de orçamento (preset por nicho): as linhas são itens da tabela com a fórmula da quantidade
 * (número fixo, ou a resposta de uma variável × multiplicador + soma, com mínimo e máximo). Estruturado, sem eval.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { salvarModeloAcao } from "@/app/(app)/app/ajustes/precos/acoes";
import type { ItemTabela, LinhaModelo, Modelo, Respostas, Variavel } from "@/lib/orcamento/motor";
import { Icone } from "../icones";

type Linha = { itemId: string; modo: "fixo" | "var"; fixo: string; var: string; mult: string; soma: string; min: string; max: string };

const deModelo = (l: LinhaModelo): Linha => ({
  itemId: l.itemId,
  modo: l.qtd.var ? "var" : "fixo",
  fixo: String(l.qtd.fixo ?? 1),
  var: l.qtd.var ?? "",
  mult: l.qtd.mult != null ? String(l.qtd.mult) : "",
  soma: l.qtd.soma != null ? String(l.qtd.soma) : "",
  min: l.qtd.min != null ? String(l.qtd.min) : "",
  max: l.qtd.max != null ? String(l.qtd.max) : "",
});

export function EditorModelo({
  modelo,
  itens,
  variaveis,
  aoFechar,
}: {
  modelo: (Modelo & { descricao: string | null; ativo: boolean }) | null;
  itens: ItemTabela[];
  variaveis: Variavel[];
  aoFechar?: () => void;
}) {
  const router = useRouter();
  const numericas = variaveis.filter((v) => v.tipo === "numero");
  const [nome, setNome] = useState(modelo?.nome ?? "");
  const [nicho, setNicho] = useState(modelo?.nicho ?? "");
  const [descricao, setDescricao] = useState(modelo?.descricao ?? "");
  const [respostas, setRespostas] = useState<Respostas>(modelo?.respostas ?? {});
  const [linhas, setLinhas] = useState<Linha[]>(() => (modelo?.linhas ?? []).map(deModelo));
  const [msg, setMsg] = useState<string | null>(null);
  const [indo, ir] = useTransition();
  const mudar = (i: number, k: keyof Linha, v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));

  function salvar() {
    setMsg(null);
    ir(async () => {
      const r = await salvarModeloAcao(modelo?.id ?? null, {
        nome,
        nicho,
        descricao,
        respostas,
        ativo: true,
        linhas: linhas
          .filter((l) => l.itemId)
          .map((l) => ({
            itemId: l.itemId,
            qtd: l.modo === "var" ? { var: l.var, mult: n(l.mult), soma: n(l.soma), min: n(l.min), max: n(l.max) } : { fixo: n(l.fixo) ?? 1 },
          })),
      });
      if (r.ok) {
        router.refresh();
        if (!modelo) {
          setNome("");
          setLinhas([]);
        }
        setMsg("Salvo.");
        aoFechar?.();
      } else setMsg(r.mensagem ?? "Não deu para salvar.");
    });
  }

  return (
    <div className="modelo-editor">
      <div className="form__grade">
        <div className="form__campo">
          <label htmlFor={`me-nome-${modelo?.id ?? "novo"}`}>Nome</label>
          <input id={`me-nome-${modelo?.id ?? "novo"}`} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Casamento" />
        </div>
        <div className="form__campo">
          <label htmlFor={`me-nicho-${modelo?.id ?? "novo"}`}>Nicho</label>
          <input id={`me-nicho-${modelo?.id ?? "novo"}`} value={nicho} onChange={(e) => setNicho(e.target.value)} maxLength={60} />
        </div>
        <div className="form__campo form__campo--largo">
          <label htmlFor={`me-desc-${modelo?.id ?? "novo"}`}>Descrição</label>
          <input id={`me-desc-${modelo?.id ?? "novo"}`} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} />
        </div>
        {variaveis.map((v) => (
          <div className="form__campo" key={v.chave}>
            <label htmlFor={`me-r-${v.chave}-${modelo?.id ?? "novo"}`}>Padrão: {v.rotulo}</label>
            {v.tipo === "escolha" ? (
              <select
                id={`me-r-${v.chave}-${modelo?.id ?? "novo"}`}
                value={String(respostas[v.chave] ?? "")}
                onChange={(e) => setRespostas({ ...respostas, [v.chave]: e.target.value })}
              >
                <option value="">—</option>
                {v.opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`me-r-${v.chave}-${modelo?.id ?? "novo"}`}
                className="num"
                inputMode="numeric"
                value={String(respostas[v.chave] ?? "")}
                onChange={(e) => setRespostas({ ...respostas, [v.chave]: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              />
            )}
          </div>
        ))}
      </div>
      <ul className="formula">
        {linhas.map((l, i) => (
          <li key={i}>
            <select aria-label="Item" value={l.itemId} onChange={(e) => mudar(i, "itemId", e.target.value)}>
              <option value="">Item…</option>
              {itens.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.nome}
                </option>
              ))}
            </select>
            <select aria-label="Quantidade" value={l.modo} onChange={(e) => mudar(i, "modo", e.target.value)}>
              <option value="fixo">Fixo</option>
              {numericas.length ? <option value="var">Pela resposta</option> : null}
            </select>
            {l.modo === "fixo" ? (
              <input aria-label="Quantidade fixa" className="num" inputMode="decimal" value={l.fixo} onChange={(e) => mudar(i, "fixo", e.target.value)} />
            ) : (
              <>
                <select aria-label="Variável" value={l.var} onChange={(e) => mudar(i, "var", e.target.value)}>
                  <option value="">—</option>
                  {numericas.map((v) => (
                    <option key={v.chave} value={v.chave}>
                      {v.rotulo}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Multiplicar por"
                  title="× (multiplicar)"
                  className="num"
                  inputMode="decimal"
                  placeholder="×1"
                  value={l.mult}
                  onChange={(e) => mudar(i, "mult", e.target.value)}
                />
                <input
                  aria-label="Somar"
                  title="+ (somar)"
                  className="num"
                  inputMode="decimal"
                  placeholder="+0"
                  value={l.soma}
                  onChange={(e) => mudar(i, "soma", e.target.value)}
                />
                <input
                  aria-label="Mínimo"
                  title="mínimo"
                  className="num"
                  inputMode="decimal"
                  placeholder="mín"
                  value={l.min}
                  onChange={(e) => mudar(i, "min", e.target.value)}
                />
              </>
            )}
            <button type="button" className="q-icone-btn" aria-label="Tirar" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>
              <Icone nome="lixo" size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="acoes">
        <button
          type="button"
          className="glass-btn glass-btn--sm"
          onClick={() => setLinhas([...linhas, { itemId: "", modo: "fixo", fixo: "1", var: numericas[0]?.chave ?? "", mult: "", soma: "", min: "", max: "" }])}
        >
          <Icone nome="mais" size={15} /> Linha
        </button>
        <button type="button" className="glass-btn glass-btn--sm glass-btn--ink" onClick={salvar} disabled={indo || !nome.trim()}>
          {indo ? "Salvando…" : "Salvar modelo"}
        </button>
        {msg ? <span className="sutil">{msg}</span> : null}
      </div>
    </div>
  );
}
