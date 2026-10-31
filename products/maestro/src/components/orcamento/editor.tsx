"use client";
/**
 * Editor do orçamento (porte de quote-editor/items-editor/custom-item do ZRO): linhas da tabela de preços (com faixa
 * por quantidade e multiplicadores do nicho), linhas livres, deslocamento, desconto e imposto estimado; os totais e a
 * margem pelas mesmas contas do servidor (src/lib/orcamento/motor.ts). Só o rascunho se edita. Salva tudo de uma vez.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { aprovarAcao, salvarEdicaoAcao } from "@/app/(app)/app/orcamentos/acoes";
import { brl, centavosParaCampo, hojeBr, lerNumero, lerReais, porcento } from "@/lib/dinheiro";
import {
  GRUPOS,
  UNIDADES,
  aplicarModelo,
  nomeUnidade,
  parcelasPadrao,
  precificar,
  saudeDaMargem,
  totais,
  type ItemTabela,
  type Modelo,
  type Respostas,
  type Variavel,
} from "@/lib/orcamento/motor";
import type { OrcamentoFicha } from "@/lib/orcamento/orcamentos";
import type { Lugar } from "@/lib/orcamento/deslocamento";
import { Icone } from "../icones";
import { Deslocamento } from "./deslocamento";

type Linha = {
  chave: string;
  precoItemId: string | null;
  descricao: string;
  detalhe: string;
  quantidade: string;
  unidade: string;
  preco: string;
  custo: string;
};

let seq = 0;
const nova = (l: Omit<Linha, "chave">): Linha => ({ ...l, chave: `l${++seq}` });
const daFicha = (i: OrcamentoFicha["itens"][number]) =>
  nova({
    precoItemId: i.precoItemId,
    descricao: i.descricao,
    detalhe: i.detalhe ?? "",
    quantidade: String(i.quantidade).replace(".", ","),
    unidade: i.unidade ?? "",
    preco: centavosParaCampo(i.precoCents),
    custo: centavosParaCampo(i.custoCents),
  });
const numero = (l: Linha) => ({ quantidade: lerNumero(l.quantidade) || 0, precoCents: lerReais(l.preco) || 0, custoCents: lerReais(l.custo) || 0 });

export function EditorOrcamento({
  ficha,
  tabela,
  clientes,
  editavel,
  podeAprovar,
  base,
  baseTexto,
  veiculos,
  servicos,
}: {
  ficha: OrcamentoFicha;
  tabela: { itens: ItemTabela[]; variaveis: Variavel[]; modelos: Modelo[] };
  clientes: { id: string; nome: string }[];
  editavel: boolean;
  podeAprovar: boolean;
  base: Lugar | null;
  baseTexto: string | null;
  veiculos: { id: string; nome: string; kmL: number }[];
  servicos: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    titulo: ficha.titulo,
    categoria: ficha.categoria ?? "",
    clienteId: ficha.clienteId ?? "",
    validade: ficha.validade ?? "",
    periodo: ficha.periodo ?? "",
    escopo: ficha.escopo ?? "",
    pagamento: ficha.pagamento ?? "",
    condicoes: ficha.condicoes ?? "",
    desconto: ficha.descontoCents ? centavosParaCampo(ficha.descontoCents) : "",
    imposto: ficha.impostoPct ? String(ficha.impostoPct).replace(".", ",") : "",
    notasInternas: ficha.notasInternas ?? "",
  });
  const [linhas, setLinhas] = useState<Linha[]>(() => ficha.itens.map(daFicha));
  const [respostas, setRespostas] = useState<Respostas>(ficha.respostas);
  const [sujo, setSujo] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, salvar] = useTransition();
  const [painel, setPainel] = useState<null | "modelo" | "deslocamento" | "aprovar">(null);

  const t = useMemo(() => totais(linhas.map(numero), lerReais(f.desconto) || 0, lerNumero(f.imposto) || 0), [linhas, f.desconto, f.imposto]);
  const saude = saudeDaMargem(t);
  const mudar = (k: keyof typeof f, v: string) => (setF((x) => ({ ...x, [k]: v })), setSujo(true));
  const mudarLinha = (chave: string, k: keyof Linha, v: string) => (
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [k]: v } : l))),
    setSujo(true)
  );
  const ativos = tabela.itens.filter((i) => i.ativo);

  /** Quantidade mudou numa linha da tabela: o preço acompanha a faixa (e o nicho) enquanto ninguém mexeu nele. */
  function mudarQuantidade(l: Linha, v: string) {
    const item = l.precoItemId ? tabela.itens.find((i) => i.id === l.precoItemId) : null;
    if (!item) return mudarLinha(l.chave, "quantidade", v);
    const antes = precificar(item, lerNumero(l.quantidade) || 0, tabela.variaveis, respostas).precoCents;
    const agora = precificar(item, lerNumero(v) || 0, tabela.variaveis, respostas).precoCents;
    setLinhas((ls) =>
      ls.map((x) => (x.chave === l.chave ? { ...x, quantidade: v, preco: lerReais(x.preco) === antes ? centavosParaCampo(agora) : x.preco } : x)),
    );
    setSujo(true);
  }

  function addItem(id: string) {
    const item = tabela.itens.find((i) => i.id === id);
    if (!item) return;
    const { precoCents, detalhe } = precificar(item, 1, tabela.variaveis, respostas);
    setLinhas((ls) => [
      ...ls,
      nova({
        precoItemId: item.id,
        descricao: item.nome,
        detalhe: [item.descricao, detalhe].filter(Boolean).join(" · "),
        quantidade: "1",
        unidade: item.unidade,
        preco: centavosParaCampo(precoCents),
        custo: centavosParaCampo(item.custoCents),
      }),
    ]);
    setSujo(true);
  }

  function addLivre() {
    setLinhas((ls) => [...ls, nova({ precoItemId: null, descricao: "", detalhe: "", quantidade: "1", unidade: "unidade", preco: "", custo: "" })]);
    setSujo(true);
  }

  function mover(chave: string, d: -1 | 1) {
    setLinhas((ls) => {
      const i = ls.findIndex((l) => l.chave === chave);
      const j = i + d;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const c = [...ls];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setSujo(true);
  }

  function enviar() {
    setMsg(null);
    salvar(async () => {
      const r = await salvarEdicaoAcao(ficha.id, {
        ...f,
        clienteId: f.clienteId || null,
        validade: f.validade || null,
        descontoCents: lerReais(f.desconto) || 0,
        impostoPct: lerNumero(f.imposto) || 0,
        itens: linhas.map((l) => ({ precoItemId: l.precoItemId, descricao: l.descricao, detalhe: l.detalhe, unidade: l.unidade, ...numero(l) })),
      });
      if (r.ok) {
        setSujo(false);
        setMsg({ tipo: "ok", texto: "Salvo." });
        router.refresh();
      } else setMsg({ tipo: "erro", texto: r.mensagem ?? "Não deu para salvar." });
    });
  }

  const so = !editavel;
  return (
    <div className="orc">
      <div className="orc__principal">
        <section className="secao">
          <div className="form__grade">
            <div className="form__campo form__campo--largo">
              <label htmlFor="o-titulo">Título</label>
              <input id="o-titulo" value={f.titulo} onChange={(e) => mudar("titulo", e.target.value)} readOnly={so} maxLength={200} />
            </div>
            <div className="form__campo">
              <label htmlFor="o-cliente">Cliente</label>
              <select id="o-cliente" value={f.clienteId} onChange={(e) => mudar("clienteId", e.target.value)} disabled={so}>
                <option value="">Escolha o cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="form__campo">
              <label htmlFor="o-validade">Validade</label>
              <input id="o-validade" type="date" value={f.validade} onChange={(e) => mudar("validade", e.target.value)} readOnly={so} />
            </div>
            <div className="form__campo">
              <label htmlFor="o-categoria">Categoria</label>
              <input
                id="o-categoria"
                value={f.categoria}
                onChange={(e) => mudar("categoria", e.target.value)}
                readOnly={so}
                maxLength={80}
                placeholder="Filme, social, evento…"
              />
            </div>
            <div className="form__campo">
              <label htmlFor="o-periodo">Período</label>
              <input
                id="o-periodo"
                value={f.periodo}
                onChange={(e) => mudar("periodo", e.target.value)}
                readOnly={so}
                maxLength={200}
                placeholder="Captação em novembro"
              />
            </div>
            <div className="form__campo form__campo--largo">
              <label htmlFor="o-escopo">Escopo</label>
              <textarea id="o-escopo" rows={4} value={f.escopo} onChange={(e) => mudar("escopo", e.target.value)} readOnly={so} maxLength={8000} />
            </div>
          </div>
        </section>

        <section className="secao">
          <header className="secao__topo">
            <h2>Itens</h2>
            {editavel ? (
              <div className="acoes">
                {tabela.modelos.length ? (
                  <button type="button" className="glass-btn glass-btn--sm" onClick={() => setPainel(painel === "modelo" ? null : "modelo")}>
                    <Icone nome="grade" size={15} /> Modelo
                  </button>
                ) : null}
                <button type="button" className="glass-btn glass-btn--sm" onClick={() => setPainel("deslocamento")}>
                  <Icone nome="carro" size={15} /> Deslocamento
                </button>
              </div>
            ) : null}
          </header>

          {painel === "modelo" && editavel ? (
            <AplicarModelo
              tabela={tabela}
              respostas={respostas}
              aoAplicar={(modelo, r) => {
                setRespostas(r);
                const geradas = aplicarModelo(modelo, r, tabela.itens, tabela.variaveis).map((g) =>
                  nova({
                    precoItemId: g.precoItemId,
                    descricao: g.descricao,
                    detalhe: g.detalhe ?? "",
                    quantidade: String(g.quantidade).replace(".", ","),
                    unidade: g.unidade,
                    preco: centavosParaCampo(g.precoCents),
                    custo: centavosParaCampo(g.custoCents),
                  }),
                );
                setLinhas((ls) => [...ls, ...geradas]);
                setSujo(true);
                setPainel(null);
              }}
            />
          ) : null}

          {linhas.length ? (
            <div className="itens" role="table" aria-label="Itens do orçamento">
              <div className="itens__cab" role="row">
                <span role="columnheader">Descrição</span>
                <span role="columnheader">Qtd</span>
                <span role="columnheader">Unidade</span>
                <span role="columnheader">Valor unit.</span>
                <span role="columnheader">Custo unit.</span>
                <span role="columnheader" className="num">
                  Total
                </span>
                <span role="columnheader" className="sr-only">
                  Ações
                </span>
              </div>
              {linhas.map((l, i) => {
                const n = numero(l);
                return (
                  <div className="itens__linha" role="row" key={l.chave}>
                    <span className="itens__desc" role="cell">
                      <input
                        aria-label="Descrição"
                        value={l.descricao}
                        onChange={(e) => mudarLinha(l.chave, "descricao", e.target.value)}
                        readOnly={so}
                        maxLength={200}
                        placeholder="Descrição"
                      />
                      <input
                        aria-label="Detalhe"
                        className="itens__detalhe"
                        value={l.detalhe}
                        onChange={(e) => mudarLinha(l.chave, "detalhe", e.target.value)}
                        readOnly={so}
                        maxLength={500}
                        placeholder={so ? "" : "Detalhe (opcional)"}
                      />
                    </span>
                    <span role="cell">
                      <input
                        aria-label="Quantidade"
                        className="num"
                        inputMode="decimal"
                        value={l.quantidade}
                        onChange={(e) => mudarQuantidade(l, e.target.value)}
                        readOnly={so}
                      />
                    </span>
                    <span role="cell">
                      <select aria-label="Unidade" value={l.unidade} onChange={(e) => mudarLinha(l.chave, "unidade", e.target.value)} disabled={so}>
                        {UNIDADES.map((u) => (
                          <option key={u.k} value={u.k}>
                            {u.nome}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span role="cell">
                      <input
                        aria-label="Valor unitário"
                        className="num"
                        inputMode="decimal"
                        value={l.preco}
                        onChange={(e) => mudarLinha(l.chave, "preco", e.target.value)}
                        readOnly={so}
                      />
                    </span>
                    <span role="cell">
                      <input
                        aria-label="Custo unitário"
                        className="num itens__custo"
                        inputMode="decimal"
                        value={l.custo}
                        onChange={(e) => mudarLinha(l.chave, "custo", e.target.value)}
                        readOnly={so}
                      />
                    </span>
                    <span role="cell" className="num itens__total">
                      {brl(Math.round(n.quantidade * n.precoCents))}
                    </span>
                    <span role="cell" className="itens__acoes">
                      {editavel ? (
                        <>
                          <button type="button" className="q-icone-btn" onClick={() => mover(l.chave, -1)} disabled={i === 0} aria-label="Subir" title="Subir">
                            ↑
                          </button>
                          <button
                            type="button"
                            className="q-icone-btn"
                            onClick={() => (setLinhas((ls) => ls.filter((x) => x.chave !== l.chave)), setSujo(true))}
                            aria-label="Tirar linha"
                            title="Tirar"
                          >
                            <Icone nome="lixo" size={15} />
                          </button>
                        </>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="nada">Nenhum item ainda. Puxe da tabela de preços, de um modelo ou escreva uma linha livre.</p>
          )}

          {editavel ? (
            <div className="itens__mais">
              <select aria-label="Adicionar da tabela de preços" value="" onChange={(e) => addItem(e.target.value)}>
                <option value="">+ Da tabela de preços</option>
                {GRUPOS.map((g) => {
                  const doGrupo = ativos.filter((i) => i.grupo === g.k);
                  return doGrupo.length ? (
                    <optgroup key={g.k} label={g.nome}>
                      {doGrupo.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome} · {brl(i.precoCents)}/{nomeUnidade(i.unidade)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
              <button type="button" className="glass-btn glass-btn--sm" onClick={addLivre}>
                <Icone nome="mais" size={15} /> Linha livre
              </button>
            </div>
          ) : null}
        </section>

        <section className="secao">
          <div className="form__grade">
            <div className="form__campo form__campo--largo">
              <label htmlFor="o-pagamento">Pagamento</label>
              <textarea id="o-pagamento" rows={2} value={f.pagamento} onChange={(e) => mudar("pagamento", e.target.value)} readOnly={so} maxLength={2000} />
            </div>
            <div className="form__campo form__campo--largo">
              <label htmlFor="o-condicoes">Condições</label>
              <textarea id="o-condicoes" rows={4} value={f.condicoes} onChange={(e) => mudar("condicoes", e.target.value)} readOnly={so} maxLength={4000} />
              <span className="form__dica">Uma por linha. Saem numeradas no timbrado.</span>
            </div>
            <div className="form__campo form__campo--largo">
              <label htmlFor="o-notas">Notas internas</label>
              <textarea id="o-notas" rows={2} value={f.notasInternas} onChange={(e) => mudar("notasInternas", e.target.value)} readOnly={so} maxLength={4000} />
              <span className="form__dica">Só a equipe vê. Nunca vão para o cliente.</span>
            </div>
          </div>
        </section>
      </div>

      <aside className="orc__lado">
        <section className="secao totais">
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{brl(t.subtotal)}</dd>
            </div>
            <div>
              <dt>
                <label htmlFor="o-desconto">Desconto</label>
              </dt>
              <dd>
                <input
                  id="o-desconto"
                  className="num"
                  inputMode="decimal"
                  value={f.desconto}
                  onChange={(e) => mudar("desconto", e.target.value)}
                  readOnly={so}
                  placeholder="0,00"
                />
              </dd>
            </div>
            <div className="totais__total">
              <dt>Total</dt>
              <dd>{brl(t.total)}</dd>
            </div>
          </dl>
          <div className="totais__interno">
            <span className="totais__titulo">Só a equipe vê</span>
            <dl>
              <div>
                <dt>Custo</dt>
                <dd>{brl(t.custo)}</dd>
              </div>
              <div>
                <dt>
                  <label htmlFor="o-imposto">Imposto estimado (%)</label>
                </dt>
                <dd>
                  <input
                    id="o-imposto"
                    className="num"
                    inputMode="decimal"
                    value={f.imposto}
                    onChange={(e) => mudar("imposto", e.target.value)}
                    readOnly={so}
                    placeholder="0"
                  />
                </dd>
              </div>
              <div>
                <dt>Margem</dt>
                <dd>
                  {brl(t.margem)} · {porcento(t.margemPct)}
                </dd>
              </div>
            </dl>
            <p className="saude" data-tom={saude.tom}>
              <i aria-hidden="true" />
              {saude.rotulo}
              {saude.dica ? <span title={saude.dica}> · sem custo</span> : null}
            </p>
          </div>
          {editavel ? (
            <button type="button" className="glass-btn glass-btn--ink" onClick={enviar} disabled={salvando || !sujo}>
              {salvando ? "Salvando…" : sujo ? "Salvar" : "Salvo"}
            </button>
          ) : null}
          {podeAprovar && !sujo ? (
            <button type="button" className="glass-btn" onClick={() => setPainel("aprovar")} disabled={t.total <= 0}>
              <Icone nome="aprovacoes" size={16} /> Aprovar
            </button>
          ) : null}
          {msg ? (
            <p className={msg.tipo === "ok" ? "aviso-ok" : "erro"} role={msg.tipo === "ok" ? "status" : "alert"}>
              {msg.texto}
            </p>
          ) : null}
        </section>
        {painel === "aprovar" ? <Aprovar id={ficha.id} total={t.total} temCliente={!!ficha.clienteId} aoFechar={() => setPainel(null)} /> : null}
      </aside>

      {painel === "deslocamento" ? (
        <Deslocamento
          orcamentoId={ficha.id}
          base={base}
          baseTexto={baseTexto}
          veiculos={veiculos}
          servicos={servicos}
          aoFechar={() => setPainel(null)}
          aoAdicionar={(l) => {
            setLinhas((ls) => [
              ...ls,
              nova({
                precoItemId: null,
                descricao: l.descricao,
                detalhe: l.detalhe,
                quantidade: "1",
                unidade: l.unidade,
                preco: centavosParaCampo(l.precoCents),
                custo: centavosParaCampo(l.custoCents),
              }),
            ]);
            setSujo(true);
            setPainel(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AplicarModelo({
  tabela,
  respostas,
  aoAplicar,
}: {
  tabela: { itens: ItemTabela[]; variaveis: Variavel[]; modelos: Modelo[] };
  respostas: Respostas;
  aoAplicar: (m: Modelo, r: Respostas) => void;
}) {
  const [id, setId] = useState(tabela.modelos[0]?.id ?? "");
  const modelo = tabela.modelos.find((m) => m.id === id);
  const [r, setR] = useState<Respostas>({ ...(modelo?.respostas ?? {}), ...respostas });
  return (
    <div className="modelo-painel">
      <div className="form__grade">
        <div className="form__campo">
          <label htmlFor="m-modelo">Modelo</label>
          <select
            id="m-modelo"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              const m = tabela.modelos.find((x) => x.id === e.target.value);
              setR({ ...(m?.respostas ?? {}), ...respostas });
            }}
          >
            {tabela.modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
        {tabela.variaveis.map((v) => (
          <div className="form__campo" key={v.chave}>
            <label htmlFor={`m-${v.chave}`}>{v.rotulo}</label>
            {v.tipo === "escolha" ? (
              <select id={`m-${v.chave}`} value={String(r[v.chave] ?? "")} onChange={(e) => setR({ ...r, [v.chave]: e.target.value })}>
                <option value="">—</option>
                {v.opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                    {o.mult && o.mult !== 1 ? ` (×${String(o.mult).replace(".", ",")})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`m-${v.chave}`}
                className="num"
                inputMode="numeric"
                value={String(r[v.chave] ?? "")}
                onChange={(e) => setR({ ...r, [v.chave]: e.target.value.replace(/[^\d,.]/g, "") })}
              />
            )}
          </div>
        ))}
      </div>
      <button type="button" className="glass-btn glass-btn--sm glass-btn--ink" onClick={() => modelo && aoAplicar(modelo, r)} disabled={!modelo}>
        Adicionar as linhas do modelo
      </button>
    </div>
  );
}

function Aprovar({ id, total, temCliente, aoFechar }: { id: string; total: number; temCliente: boolean; aoFechar: () => void }) {
  const router = useRouter();
  const [n, setN] = useState(1);
  const [parcelas, setParcelas] = useState(() => parcelasPadrao(total, 1, hojeBr()).map((p) => ({ ...p, valor: centavosParaCampo(p.valorCents) })));
  const [msg, setMsg] = useState<string | null>(null);
  const [indo, ir] = useTransition();
  const soma = parcelas.reduce((s, p) => s + (lerReais(p.valor) || 0), 0);
  function mudarN(q: number) {
    setN(q);
    setParcelas(parcelasPadrao(total, q, hojeBr()).map((p) => ({ ...p, valor: centavosParaCampo(p.valorCents) })));
  }
  return (
    <section className="secao aprovar">
      <header className="secao__topo">
        <h2>Aprovar</h2>
        <button type="button" className="q-icone-btn" onClick={aoFechar} aria-label="Fechar">
          <Icone nome="fechar" size={16} />
        </button>
      </header>
      {!temCliente ? <p className="erro">Escolha e salve o cliente antes de aprovar.</p> : null}
      <div className="q-segmentos" role="radiogroup" aria-label="Parcelas">
        {[1, 2, 3].map((q) => (
          <button key={q} type="button" role="radio" aria-checked={n === q} onClick={() => mudarN(q)}>
            {q}x
          </button>
        ))}
      </div>
      <ul className="parcelas">
        {parcelas.map((p, i) => (
          <li key={p.rotulo}>
            <span>{p.rotulo}</span>
            <input
              aria-label={`Valor de ${p.rotulo}`}
              className="num"
              inputMode="decimal"
              value={p.valor}
              onChange={(e) => setParcelas(parcelas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
            />
            <input
              aria-label={`Vencimento de ${p.rotulo}`}
              type="date"
              value={p.vencimento}
              onChange={(e) => setParcelas(parcelas.map((x, j) => (j === i ? { ...x, vencimento: e.target.value } : x)))}
            />
          </li>
        ))}
      </ul>
      {soma !== total ? (
        <p className="form__erro">
          As parcelas somam {brl(soma)}; o total é {brl(total)}.
        </p>
      ) : (
        <p className="form__dica">Abre o projeto e lança as parcelas a receber.</p>
      )}
      <button
        type="button"
        className="glass-btn glass-btn--ink"
        disabled={indo || soma !== total || !temCliente}
        onClick={() =>
          ir(async () => {
            const r = await aprovarAcao(
              id,
              parcelas.map((p) => ({ valorCents: lerReais(p.valor) || 0, vencimento: p.vencimento })),
            );
            if (r.ok && r.projetoId) router.push(`/app/projetos/${r.projetoId}`);
            else setMsg(r.mensagem ?? "Não deu para aprovar.");
          })
        }
      >
        {indo ? "Aprovando…" : "Aprovar e abrir o projeto"}
      </button>
      {msg ? (
        <p className="erro" role="alert">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
