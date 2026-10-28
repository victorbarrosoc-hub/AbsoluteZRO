"use client";
/**
 * Importar planilha (Ajustes → Importar): escolher o que importar, o arquivo .csv, conferir as colunas (achadas pelos
 * cabeçalhos em português) e a prévia linha a linha, e só então "Importar". Nada é gravado antes da confirmação; o
 * relatório diz o que foi criado, atualizado, igual e pulado.
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { importarAcao, type EstadoImportar } from "@/app/(app)/app/ajustes/importar/acoes";
import { CAMPOS, TIPOS, type TipoImport } from "@/lib/importar/csv";
import { Icone } from "./icones";

const NOME_ACAO = { criar: "Novo", atualizar: "Atualiza", igual: "Igual", erro: "Pula" } as const;
const TOM_ACAO = { criar: "ok", atualizar: "enviado", igual: "rascunho", erro: "recusado" } as const;

function Enviar({ rotulo, classe = "glass-btn glass-btn--ink", passo }: { rotulo: string; classe?: string; passo: "previa" | "confirmar" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="passo" value={passo} className={classe} disabled={pending} aria-busy={pending || undefined}>
      {pending ? "Lendo…" : rotulo}
    </button>
  );
}

export function Importador() {
  const [estado, enviar] = useActionState<EstadoImportar, FormData>(importarAcao, undefined);
  const [tipo, setTipo] = useState<TipoImport>(estado?.tipo ?? "clientes");
  const p = estado?.previa;
  const r = estado?.relatorio;
  // O mapa editado vale só para a prévia em que foi editado (a próxima prévia traz o mapa conferido).
  const base = p ? `${p.sha256}:${JSON.stringify(p.mapa)}` : "";
  const [edicao, setEdicao] = useState<{ base: string; m: Record<string, number | null> } | null>(null);
  const mapa = edicao && edicao.base === base ? edicao.m : null;
  const mapaAtual = mapa ?? p?.mapa ?? null;
  const vista = estado?.tipo ?? tipo;

  if (r)
    return (
      <section className="ficha importar" aria-label="Relatório da importação">
        <strong className="ficha__titulo">
          <Icone nome="check" size={18} /> Importação feita
        </strong>
        <div className="importar__resumo">
          <span className="selo" data-status="ok">
            <i aria-hidden="true" /> {r.criados} novos
          </span>
          <span className="selo" data-status="enviado">
            <i aria-hidden="true" /> {r.atualizados} atualizados
          </span>
          <span className="selo" data-status="rascunho">
            <i aria-hidden="true" /> {r.iguais} iguais
          </span>
          <span className="selo" data-status={r.ignorados ? "recusado" : "rascunho"}>
            <i aria-hidden="true" /> {r.ignorados} pulados
          </span>
        </div>
        {r.erros.length ? (
          <ul className="importar__historico" aria-label="Linhas puladas">
            {r.erros.slice(0, 30).map((e) => (
              <li key={e.linha}>
                <b className="num">Linha {e.linha}</b> <span>{e.erro}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="acoes">
          <a className="glass-btn glass-btn--ink" href={`/app/${vista === "equipamentos" ? "inventario" : vista}`}>
            Ver {TIPOS.find((t) => t.k === vista)?.nome.toLowerCase()}
          </a>
          <a className="glass-btn" href="/app/ajustes/importar">
            Importar outra
          </a>
        </div>
      </section>
    );

  return (
    <form action={enviar} className="importar" key={p ? `p-${p.sha256}` : "inicio"}>
      {p ? (
        <>
          <input type="hidden" name="tipo" value={vista} />
          {/* textarea (não input): um input escondido perde as quebras de linha do arquivo */}
          <textarea name="texto" defaultValue={estado?.texto ?? ""} hidden readOnly aria-hidden="true" />
          <input type="hidden" name="arquivo_nome" value={estado?.arquivo ?? ""} />
          <input type="hidden" name="sha" value={p.sha256} />
          <input type="hidden" name="mapa" value={JSON.stringify(mapaAtual ?? {})} />
          <section className="ficha" aria-label="Colunas">
            <strong className="ficha__titulo">
              {estado?.arquivo} · {p.total} linha{p.total === 1 ? "" : "s"}
            </strong>
            <div className="importar__mapa">
              {CAMPOS[vista].map((c) => (
                <label key={c.k}>
                  <span>
                    {c.nome}
                    {c.obrigatorio ? " *" : ""}
                  </span>
                  <select
                    value={mapaAtual?.[c.k] ?? ""}
                    onChange={(e) => setEdicao({ base, m: { ...(mapaAtual ?? {}), [c.k]: e.target.value === "" ? null : Number(e.target.value) } })}
                  >
                    <option value="">—</option>
                    {p.cabecalho.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {mapa ? <Enviar rotulo="Conferir de novo" classe="glass-btn glass-btn--sm" passo="previa" /> : null}
          </section>

          <div className="importar__resumo" role="status">
            <span className="selo" data-status="ok">
              <i aria-hidden="true" /> {p.contagem.criar} novos
            </span>
            <span className="selo" data-status="enviado">
              <i aria-hidden="true" /> {p.contagem.atualizar} atualizam
            </span>
            <span className="selo" data-status="rascunho">
              <i aria-hidden="true" /> {p.contagem.igual} iguais
            </span>
            <span className="selo" data-status={p.contagem.erro ? "recusado" : "rascunho"}>
              <i aria-hidden="true" /> {p.contagem.erro} com erro
            </span>
          </div>
          {p.faltando.length ? (
            <p className="erro" role="alert">
              Escolha a coluna de: {p.faltando.join(", ")}.
            </p>
          ) : null}

          <div className="importar__tabela">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>O que faz</th>
                  {CAMPOS[vista]
                    .filter((c) => mapaAtual?.[c.k] != null)
                    .slice(0, 5)
                    .map((c) => (
                      <th key={c.k}>{c.nome}</th>
                    ))}
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {p.linhas.map((l) => (
                  <tr key={l.n} data-erro={l.acao === "erro" || undefined}>
                    <td className="num">{l.n}</td>
                    <td>
                      <span className="selo" data-status={TOM_ACAO[l.acao]}>
                        <i aria-hidden="true" /> {NOME_ACAO[l.acao]}
                      </span>
                    </td>
                    {CAMPOS[vista]
                      .filter((c) => mapaAtual?.[c.k] != null)
                      .slice(0, 5)
                      .map((c) => {
                        const v = l.dados[c.k];
                        return <td key={c.k}>{Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)}</td>;
                      })}
                    <td className="importar__msg">{l.erros.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.total > p.linhas.length ? (
            <p className="sutil">
              Mostrando {p.linhas.length} de {p.total} linhas (todas as com erro).
            </p>
          ) : null}

          {estado?.mensagem ? (
            <p className="erro" role="alert">
              {estado.mensagem}
            </p>
          ) : null}
          <div className="acoes">
            {mapa ? null : p.contagem.criar + p.contagem.atualizar > 0 && !p.faltando.length ? (
              <Enviar
                rotulo={`Importar ${p.contagem.criar + p.contagem.atualizar} linha${p.contagem.criar + p.contagem.atualizar === 1 ? "" : "s"}`}
                passo="confirmar"
              />
            ) : (
              <span className="sutil">Nada para gravar.</span>
            )}
            <a className="glass-btn" href="/app/ajustes/importar">
              Cancelar
            </a>
          </div>
        </>
      ) : (
        <>
          <fieldset className="importar__tipos">
            <legend className="sr-only">O que importar</legend>
            {TIPOS.map((t) => (
              <label key={t.k} className="importar__tipo">
                <input type="radio" name="tipo" value={t.k} checked={tipo === t.k} onChange={() => setTipo(t.k)} />
                <b>{t.nome}</b>
                <small>{t.apoio}</small>
                <a href={`/api/importar/modelo/${t.k}`} download onClick={(e) => e.stopPropagation()}>
                  Baixar modelo
                </a>
              </label>
            ))}
          </fieldset>
          <label className="importar__arquivo">
            <Icone nome="importar" size={22} />
            <span>Arquivo .csv (até 1 MB e 2.000 linhas)</span>
            <input type="file" name="arquivo" accept=".csv,text/csv" required />
          </label>
          {estado?.mensagem ? (
            <p className="erro" role="alert">
              {estado.mensagem}
            </p>
          ) : null}
          <div className="acoes">
            <Enviar rotulo="Conferir" passo="previa" />
          </div>
        </>
      )}
    </form>
  );
}
