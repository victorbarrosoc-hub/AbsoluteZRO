"use client";
/**
 * Versões do roteiro (plano da Criação §4.4): "Salvar versão" congela o rascunho gravado (com nota opcional); a lista
 * mostra cada versão com "Comparar" (a diferença por bloco contra o rascunho) e "Restaurar" (o rascunho volta a ela; a
 * versão nunca muda). Só de inclusão: não há apagar.
 */
import { useState } from "react";
import { compararRoteiros, type Diferenca } from "@/lib/criacao/roteiro/comparar";
import type { Roteiro } from "@/lib/criacao/roteiro/modelo";
import type { RoteiroCompleto, VersaoCompleta, VersaoLista } from "@/lib/criacao/roteiro/servidor";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { Folha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { quando } from "./comum";

type Props = {
  url: string;
  versoes: VersaoLista[];
  setVersoes: (v: VersaoLista[]) => void;
  roteiro: Roteiro;
  editavel: boolean;
  /** Grava o que falta antes de congelar ou restaurar; devolve o rev atual. */
  antes: () => Promise<number>;
  aoRestaurar: (r: RoteiroCompleto) => void;
  aoSalvar: (n: number) => void;
  nomes: Record<string, string>;
  aoFechar: () => void;
};

function Resumo({ d }: { d: Diferenca }) {
  if (d.igual) return <p className="cr-dif__igual">Igual ao rascunho.</p>;
  const itens = [
    ...d.cenasIncluidas.map((c) => ({ k: `ci-${c}`, sinal: "+", rotulo: c, texto: "cena nova", antes: "" })),
    ...d.cenasRemovidas.map((c) => ({ k: `cr-${c}`, sinal: "−", rotulo: c, texto: "cena removida", antes: "" })),
    ...d.incluidos.map((x) => ({ k: `i-${x.id}`, sinal: "+", rotulo: `Cena ${x.cena} · ${x.rotulo}`, texto: x.depois ?? "", antes: "" })),
    ...d.removidos.map((x) => ({ k: `r-${x.id}`, sinal: "−", rotulo: `Cena ${x.cena} · ${x.rotulo}`, texto: x.antes ?? "", antes: "" })),
    ...d.mudados.map((x) => ({ k: `m-${x.id}`, sinal: "~", rotulo: `Cena ${x.cena} · ${x.rotulo}`, texto: x.depois ?? "", antes: x.antes ?? "" })),
  ];
  return (
    <div className="cr-dif">
      <p className="cr-dif__conta num">
        {d.incluidos.length} {d.incluidos.length === 1 ? "incluído" : "incluídos"} · {d.removidos.length} {d.removidos.length === 1 ? "removido" : "removidos"}{" "}
        · {d.mudados.length} {d.mudados.length === 1 ? "mudou" : "mudaram"}
      </p>
      <ul>
        {itens.slice(0, 40).map((x) => (
          <li key={x.k} data-sinal={x.sinal}>
            <span className="cr-dif__sinal" aria-hidden="true">
              {x.sinal}
            </span>
            <span>
              <b>{x.rotulo}</b>
              {x.antes ? <del>{x.antes}</del> : null}
              {x.texto ? <span>{x.texto}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FolhaVersoes(p: Props) {
  const [nota, setNota] = useState("");
  const [indo, setIndo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aberta, setAberta] = useState<{ n: number; dif: Diferenca } | null>(null);
  const [certeza, setCerteza] = useState<number | null>(null);

  async function salvar() {
    setIndo(true);
    setMsg(null);
    try {
      await p.antes();
      const r = await fetch(p.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "versao", nota }) });
      const d = (await r.json()) as { versao?: { n: number }; versoes?: VersaoLista[]; mensagem?: string };
      if (!r.ok || !d.versao) throw new Error(d.mensagem ?? "Não deu para salvar a versão.");
      p.setVersoes(d.versoes ?? []);
      p.aoSalvar(d.versao.n);
      setNota("");
      setMsg(`v${d.versao.n} salva.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu para salvar a versão.");
    } finally {
      setIndo(false);
    }
  }

  async function comparar(n: number) {
    if (aberta?.n === n) return setAberta(null);
    const r = await fetch(`${p.url}?versao=${n}`, { cache: "no-store" });
    const d = (await r.json()) as { versao?: VersaoCompleta };
    if (d.versao) setAberta({ n, dif: compararRoteiros(d.versao.conteudo, p.roteiro) });
  }

  async function restaurar(n: number) {
    setIndo(true);
    setMsg(null);
    try {
      const rev = await p.antes();
      const r = await fetch(p.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "restaurar", n, rev }) });
      const d = (await r.json()) as { roteiro?: RoteiroCompleto; mensagem?: string };
      if (!r.ok || !d.roteiro) throw new Error(d.mensagem ?? "Não deu para restaurar.");
      p.aoRestaurar(d.roteiro);
      setCerteza(null);
      setAberta(null);
      setMsg(`O rascunho voltou à v${n}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu para restaurar.");
    } finally {
      setIndo(false);
    }
  }

  return (
    <Folha rotulo="Versões" aoFechar={p.aoFechar} tamanho="acao" className="cr-versoes">
      <h2 className="cr-folha__titulo">Versões</h2>
      {p.editavel ? (
        <div className="cr-versoes__nova">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (opcional)"
            aria-label="Nota da versão"
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void salvar();
              }
            }}
          />
          <button type="button" className="glass-btn glass-btn--ink" onClick={salvar} disabled={indo}>
            Salvar versão
          </button>
        </div>
      ) : null}
      {msg ? (
        <p className="sutil" role="status">
          {msg}
        </p>
      ) : null}
      {p.versoes.length ? (
        <ol className="cr-versoes__lista">
          {p.versoes.map((v) => (
            <li key={v.id} className="cr-versao">
              <div className="cr-versao__linha">
                <span className="cr-versao__n num">v{v.n}</span>
                <span className="cr-versao__miolo">
                  <span className="cr-versao__nota">{v.nota ?? v.titulo}</span>
                  <span className="cr-versao__meta">
                    {[quando(v.criadoEm), v.criadoPor ? p.nomes[v.criadoPor] : null, formatarTempo(v.duracaoSeg)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <button type="button" className="glass-btn glass-btn--sm" onClick={() => void comparar(v.n)} aria-expanded={aberta?.n === v.n}>
                  Comparar
                </button>
                {p.editavel ? (
                  certeza === v.n ? (
                    <span className="remover__certeza">
                      <button type="button" className="q-perigo" onClick={() => void restaurar(v.n)} disabled={indo}>
                        Restaurar
                      </button>
                      <button type="button" className="q-limpar" onClick={() => setCerteza(null)}>
                        Não
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="glass-btn glass-btn--sm glass-btn--icone"
                      onClick={() => setCerteza(v.n)}
                      title="Restaurar"
                      aria-label={`Restaurar v${v.n}`}
                    >
                      <Icone nome="retorno" size={15} />
                    </button>
                  )
                ) : null}
              </div>
              {aberta?.n === v.n ? <Resumo d={aberta.dif} /> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="nada">Nenhuma versão salva. O rascunho se salva sozinho; a versão congela um momento.</p>
      )}
    </Folha>
  );
}
