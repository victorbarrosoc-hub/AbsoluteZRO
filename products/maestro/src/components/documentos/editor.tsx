"use client";
/**
 * Editor dos documentos do projeto (porte de checklist-editor, call-sheet-editor, script-editor do ZRO): checklist
 * com saída e retorno, ordem do dia (horário, cronograma, equipe e contatos), roteiro e decupagem (planos). Salva
 * tudo de uma vez; "Imprimir" sai uma folha A4 limpa (`.imprimivel`).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { salvarDocumentoAcao } from "@/app/(app)/app/projetos/[id]/documentos/acoes";
import { dataPorExtenso } from "@/lib/dinheiro";
import {
  andamentoChecklist,
  nomeTipoDoc,
  type Checklist,
  type Conteudo,
  type Decupagem,
  type OrdemDoDia,
  type Roteiro,
  type TipoDoc,
} from "@/lib/documentos/conteudo";
import { Icone } from "../icones";

type Props = {
  id: string;
  tipo: TipoDoc;
  titulo: string;
  data: string | null;
  conteudo: Conteudo;
  projeto: string;
  editavel: boolean;
  marca: string;
};

export function EditorDocumento(p: Props) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(p.titulo);
  const [data, setData] = useState(p.data ?? "");
  const [c, setC] = useState<Conteudo>(p.conteudo);
  const [sujo, setSujo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [indo, ir] = useTransition();
  const mudar = (novo: Conteudo) => (setC(novo), setSujo(true));
  const so = !p.editavel;

  function salvar() {
    setMsg(null);
    ir(async () => {
      const r = await salvarDocumentoAcao(p.id, titulo, data || null, c);
      if (r.ok) {
        setSujo(false);
        setMsg("Salvo.");
        router.refresh();
      } else setMsg(r.mensagem ?? "Não deu para salvar.");
    });
  }

  return (
    <div className="doc">
      <div className="doc__barra">
        {p.editavel ? (
          <button type="button" className="glass-btn glass-btn--ink" onClick={salvar} disabled={indo || !sujo}>
            {indo ? "Salvando…" : sujo ? "Salvar" : "Salvo"}
          </button>
        ) : null}
        <button type="button" className="glass-btn" onClick={() => window.print()}>
          <Icone nome="imprimir" size={18} /> Imprimir
        </button>
        {msg ? (
          <span className="sutil" role="status">
            {msg}
          </span>
        ) : null}
      </div>
      <article className="folha imprimivel">
        <header className="folha__topo">
          <span className="lh-mono">
            {p.marca} · {nomeTipoDoc(p.tipo)}
          </span>
          <input
            className="folha__titulo"
            aria-label="Título"
            value={titulo}
            onChange={(e) => (setTitulo(e.target.value), setSujo(true))}
            readOnly={so}
            maxLength={200}
          />
          <span className="folha__meta">
            {p.projeto}
            {" · "}
            <input
              type="date"
              aria-label="Data"
              value={data}
              onChange={(e) => (setData(e.target.value), setSujo(true))}
              readOnly={so}
              className="folha__data"
            />
            <span className="so-impressao">{data ? dataPorExtenso(data) : ""}</span>
          </span>
        </header>
        {p.tipo === "checklist" ? <EdChecklist c={c as Checklist} mudar={mudar} so={so} /> : null}
        {p.tipo === "ordem_do_dia" ? <EdOrdem c={c as OrdemDoDia} mudar={mudar} so={so} /> : null}
        {p.tipo === "roteiro" ? <EdRoteiro c={c as Roteiro} mudar={mudar} so={so} /> : null}
        {p.tipo === "decupagem" ? <EdDecupagem c={c as Decupagem} mudar={mudar} so={so} /> : null}
      </article>
    </div>
  );
}

type Ed<T> = { c: T; mudar: (c: Conteudo) => void; so: boolean };

function Tirar({ onClick, so }: { onClick: () => void; so: boolean }) {
  return so ? null : (
    <button type="button" className="q-icone-btn nao-imprime" aria-label="Tirar" onClick={onClick}>
      <Icone nome="lixo" size={14} />
    </button>
  );
}

function Mais({ onClick, rotulo, so }: { onClick: () => void; rotulo: string; so: boolean }) {
  return so ? null : (
    <button type="button" className="glass-btn glass-btn--sm nao-imprime" onClick={onClick}>
      <Icone nome="mais" size={15} /> {rotulo}
    </button>
  );
}

function EdChecklist({ c, mudar, so }: Ed<Checklist>) {
  const a = andamentoChecklist(c);
  const it = (i: number, k: keyof Checklist["itens"][number], v: unknown) => mudar({ itens: c.itens.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  return (
    <section className="folha__secao" data-rolagem>
      <p className="sutil">
        {a.total} itens · saíram {a.sairam} · voltaram {a.voltaram}
      </p>
      <table className="folha__tabela">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qtd</th>
            <th>Saiu</th>
            <th>Voltou</th>
            <th className="nao-imprime" />
          </tr>
        </thead>
        <tbody>
          {c.itens.map((x, i) => (
            <tr key={i}>
              <td>
                <input aria-label="Item" value={x.nome} onChange={(e) => it(i, "nome", e.target.value)} readOnly={so} maxLength={120} />
              </td>
              <td className="num">
                <input
                  aria-label="Quantidade"
                  className="num"
                  inputMode="numeric"
                  value={x.qtd}
                  onChange={(e) => it(i, "qtd", Number(e.target.value.replace(/\D/g, "")) || 1)}
                  readOnly={so}
                />
              </td>
              <td>
                <input type="checkbox" aria-label="Saiu" checked={x.saiu} onChange={(e) => it(i, "saiu", e.target.checked)} disabled={so} />
              </td>
              <td>
                <input type="checkbox" aria-label="Voltou" checked={x.voltou} onChange={(e) => it(i, "voltou", e.target.checked)} disabled={so} />
              </td>
              <td className="nao-imprime">
                <Tirar so={so} onClick={() => mudar({ itens: c.itens.filter((_, j) => j !== i) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Mais so={so} rotulo="Item" onClick={() => mudar({ itens: [...c.itens, { nome: "", qtd: 1, saiu: false, voltou: false }] })} />
    </section>
  );
}

function EdOrdem({ c, mudar, so }: Ed<OrdemDoDia>) {
  const set = (k: keyof OrdemDoDia, v: unknown) => mudar({ ...c, [k]: v });
  const linha = <K extends "cronograma" | "equipe" | "contatos">(k: K, i: number, campo: string, v: string) =>
    set(
      k,
      (c[k] as Record<string, string>[]).map((x, j) => (j === i ? { ...x, [campo]: v } : x)),
    );
  return (
    <>
      <section className="folha__grade">
        <label>
          <span className="lh-mono">Chamada</span>
          <input type="time" value={c.chamada ?? ""} onChange={(e) => set("chamada", e.target.value || null)} readOnly={so} />
        </label>
        <label className="folha__largo">
          <span className="lh-mono">Local</span>
          <input value={c.local ?? ""} onChange={(e) => set("local", e.target.value || null)} readOnly={so} maxLength={300} />
        </label>
        <label className="folha__largo nao-imprime">
          <span className="lh-mono">Mapa (link https)</span>
          <input value={c.localUrl ?? ""} onChange={(e) => set("localUrl", e.target.value || null)} readOnly={so} maxLength={500} placeholder="https://" />
        </label>
      </section>
      <section className="folha__secao" data-rolagem>
        <h3 className="lh-mono">Cronograma</h3>
        <table className="folha__tabela">
          <tbody>
            {c.cronograma.map((x, i) => (
              <tr key={i}>
                <td className="folha__hora">
                  <input type="time" aria-label="Hora" value={x.hora} onChange={(e) => linha("cronograma", i, "hora", e.target.value)} readOnly={so} />
                </td>
                <td>
                  <input
                    aria-label="Atividade"
                    value={x.atividade}
                    onChange={(e) => linha("cronograma", i, "atividade", e.target.value)}
                    readOnly={so}
                    maxLength={200}
                  />
                </td>
                <td>
                  <input
                    aria-label="Observação"
                    className="sutil"
                    value={x.obs}
                    onChange={(e) => linha("cronograma", i, "obs", e.target.value)}
                    readOnly={so}
                    maxLength={300}
                  />
                </td>
                <td className="nao-imprime">
                  <Tirar
                    so={so}
                    onClick={() =>
                      set(
                        "cronograma",
                        c.cronograma.filter((_, j) => j !== i),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Mais so={so} rotulo="Horário" onClick={() => set("cronograma", [...c.cronograma, { hora: "", atividade: "", obs: "" }])} />
      </section>
      <section className="folha__secao" data-rolagem>
        <h3 className="lh-mono">Equipe</h3>
        <table className="folha__tabela">
          <tbody>
            {c.equipe.map((x, i) => (
              <tr key={i}>
                <td>
                  <input aria-label="Nome" value={x.nome} onChange={(e) => linha("equipe", i, "nome", e.target.value)} readOnly={so} maxLength={120} />
                </td>
                <td>
                  <input
                    aria-label="Função"
                    className="sutil"
                    value={x.funcao}
                    onChange={(e) => linha("equipe", i, "funcao", e.target.value)}
                    readOnly={so}
                    maxLength={60}
                  />
                </td>
                <td className="folha__hora">
                  <input type="time" aria-label="Chamada" value={x.chamada} onChange={(e) => linha("equipe", i, "chamada", e.target.value)} readOnly={so} />
                </td>
                <td className="nao-imprime">
                  <Tirar
                    so={so}
                    onClick={() =>
                      set(
                        "equipe",
                        c.equipe.filter((_, j) => j !== i),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Mais so={so} rotulo="Pessoa" onClick={() => set("equipe", [...c.equipe, { nome: "", funcao: "", chamada: c.chamada ?? "" }])} />
      </section>
      <section className="folha__secao" data-rolagem>
        <h3 className="lh-mono">Contatos</h3>
        <table className="folha__tabela">
          <tbody>
            {c.contatos.map((x, i) => (
              <tr key={i}>
                <td>
                  <input aria-label="Nome" value={x.nome} onChange={(e) => linha("contatos", i, "nome", e.target.value)} readOnly={so} maxLength={120} />
                </td>
                <td>
                  <input
                    aria-label="Papel"
                    className="sutil"
                    value={x.funcao}
                    onChange={(e) => linha("contatos", i, "funcao", e.target.value)}
                    readOnly={so}
                    maxLength={60}
                  />
                </td>
                <td>
                  <input
                    aria-label="Telefone"
                    type="tel"
                    value={x.telefone}
                    onChange={(e) => linha("contatos", i, "telefone", e.target.value)}
                    readOnly={so}
                    maxLength={30}
                  />
                </td>
                <td className="nao-imprime">
                  <Tirar
                    so={so}
                    onClick={() =>
                      set(
                        "contatos",
                        c.contatos.filter((_, j) => j !== i),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Mais so={so} rotulo="Contato" onClick={() => set("contatos", [...c.contatos, { nome: "", funcao: "", telefone: "" }])} />
      </section>
      <section className="folha__secao">
        <h3 className="lh-mono">Notas</h3>
        <textarea rows={3} value={c.notas ?? ""} onChange={(e) => set("notas", e.target.value || null)} readOnly={so} maxLength={4000} />
      </section>
    </>
  );
}

function EdRoteiro({ c, mudar, so }: Ed<Roteiro>) {
  return (
    <section className="folha__secao">
      <textarea
        className="roteiro"
        rows={24}
        value={c.texto}
        onChange={(e) => mudar({ texto: e.target.value })}
        readOnly={so}
        maxLength={100000}
        aria-label="Roteiro"
      />
    </section>
  );
}

function EdDecupagem({ c, mudar, so }: Ed<Decupagem>) {
  const pl = (i: number, k: string, v: unknown) => mudar({ planos: c.planos.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });
  const feitos = c.planos.filter((x) => x.feito).length;
  return (
    <section className="folha__secao" data-rolagem>
      <p className="sutil">
        {c.planos.length} planos · {feitos} feitos
      </p>
      <table className="folha__tabela">
        <thead>
          <tr>
            <th>Cena</th>
            <th>Plano</th>
            <th>Descrição</th>
            <th>Lente</th>
            <th>Movimento</th>
            <th>Feito</th>
            <th className="nao-imprime" />
          </tr>
        </thead>
        <tbody>
          {c.planos.map((x, i) => (
            <tr key={i}>
              <td className="folha__curta">
                <input aria-label="Cena" value={x.cena} onChange={(e) => pl(i, "cena", e.target.value)} readOnly={so} maxLength={20} />
              </td>
              <td className="folha__curta">
                <input aria-label="Plano" value={x.plano} onChange={(e) => pl(i, "plano", e.target.value)} readOnly={so} maxLength={20} />
              </td>
              <td>
                <input aria-label="Descrição" value={x.descricao} onChange={(e) => pl(i, "descricao", e.target.value)} readOnly={so} maxLength={500} />
              </td>
              <td>
                <input aria-label="Lente" value={x.lente} onChange={(e) => pl(i, "lente", e.target.value)} readOnly={so} maxLength={40} />
              </td>
              <td>
                <input aria-label="Movimento" value={x.movimento} onChange={(e) => pl(i, "movimento", e.target.value)} readOnly={so} maxLength={60} />
              </td>
              <td>
                <input type="checkbox" aria-label="Feito" checked={x.feito} onChange={(e) => pl(i, "feito", e.target.checked)} disabled={so} />
              </td>
              <td className="nao-imprime">
                <Tirar so={so} onClick={() => mudar({ planos: c.planos.filter((_, j) => j !== i) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Mais
        so={so}
        rotulo="Plano"
        onClick={() => {
          const ult = c.planos[c.planos.length - 1];
          mudar({ planos: [...c.planos, { cena: ult?.cena ?? "1", plano: "", descricao: "", lente: "", movimento: "", feito: false }] });
        }}
      />
    </section>
  );
}
