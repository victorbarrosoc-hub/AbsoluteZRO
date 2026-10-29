"use client";
/**
 * A aba Arquivos com o SOBEDESCE no plano: os projetos com a pasta do Drive (abrir, "Estrutura no Drive", ligar a pasta
 * aberta) e o navegador do Drive embaixo. Só o vínculo projeto → pasta é guardado no Maestro.
 */
import { useState, useTransition } from "react";
import { criarEstruturaAcao, ligarPastaAcao } from "@/app/(app)/app/arquivos/acoes";
import type { ProjetoComPasta } from "@/lib/sobedesce/arquivos";
import { Icone } from "@/components/icones";
import { linkSobedesce, NavegadorDrive, type Pasta } from "./navegador";

export function TelaArquivos({ projetos, escreve, sobedesce }: { projetos: ProjetoComPasta[]; escreve: boolean; sobedesce: string }) {
  const [abrindo, setAbrindo] = useState<Pasta | null>(null);
  const [chave, setChave] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const [ligar, setLigar] = useState("");

  const abrir = (p: { id: string; nome: string }) => {
    setAbrindo({ id: p.id, name: p.nome });
    setChave((k) => k + 1);
  };
  const estrutura = (id: string) => {
    setOcupado(id);
    setAviso(null);
    iniciar(async () => {
      const r = await criarEstruturaAcao(id, null);
      setOcupado(null);
      if (!r.ok) return setAviso(r.mensagem);
      setAviso(r.criadas ? "Estrutura criada no Drive." : "A estrutura já existia; a pasta foi ligada ao projeto.");
      if (r.pasta) abrir(r.pasta);
    });
  };

  return (
    <>
      {projetos.length ? (
        <section className="dv-projetos" aria-label="Projetos no Drive">
          <h2 className="dv-titulo">Projetos</h2>
          <ul>
            {projetos.slice(0, 12).map((p) => (
              <li key={p.id} className="dv-projeto">
                <span className="dv-projeto__icone" data-ligado={p.pasta ? "sim" : "nao"}>
                  <Icone nome="pasta" size={18} />
                </span>
                <span className="dv-projeto__texto">
                  <strong>{p.titulo}</strong>
                  <small>{[p.codigo, p.cliente].filter(Boolean).join(" · ")}</small>
                </span>
                {p.pasta ? (
                  <span className="dv-projeto__acoes">
                    <button type="button" className="glass-btn glass-btn--sm" onClick={() => abrir(p.pasta!)}>
                      Abrir
                    </button>
                    <a
                      className="glass-btn glass-btn--sm"
                      href={linkSobedesce(sobedesce, p.pasta, true)}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="Abrir no SOBEDESCE"
                    >
                      <Icone nome="externo" size={14} />
                    </a>
                  </span>
                ) : escreve ? (
                  <button
                    type="button"
                    className="glass-btn glass-btn--sm"
                    disabled={ocupado === p.id}
                    onClick={() => estrutura(p.id)}
                    title="Maestro/Cliente/Projeto com 01 Briefing a 05 Entregas"
                  >
                    {ocupado === p.id ? "Criando…" : "Estrutura no Drive"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {aviso ? (
            <p className="dv-aviso" role="status">
              {aviso}
            </p>
          ) : null}
        </section>
      ) : null}
      <NavegadorDrive
        key={chave}
        sobedesce={sobedesce}
        inicial={abrindo}
        extraDaPasta={(pasta) =>
          pasta && escreve && projetos.length ? (
            <form
              className="dv-ligar"
              onSubmit={(e) => {
                e.preventDefault();
                if (!ligar) return;
                iniciar(async () => {
                  const r = await ligarPastaAcao(ligar, { id: pasta.id, nome: pasta.name });
                  setAviso(r.ok ? `“${pasta.name}” ligada ao projeto.` : r.mensagem);
                });
              }}
            >
              <select value={ligar} onChange={(e) => setLigar(e.target.value)} aria-label="Projeto">
                <option value="">Ligar a um projeto…</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.titulo}
                  </option>
                ))}
              </select>
              <button type="submit" className="glass-btn glass-btn--sm" disabled={!ligar}>
                Ligar
              </button>
            </form>
          ) : null
        }
      />
    </>
  );
}
