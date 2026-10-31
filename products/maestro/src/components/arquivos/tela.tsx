"use client";
/**
 * A aba Arquivos com o SOBEDESCE no plano: o próprio SOBEDESCE embutido (Transferências e Drive, o quadro mora no shell:
 * components/arquivos/sobedesce-vivo.tsx) e, acima dele, os projetos com a pasta do Drive ("Abrir" leva o quadro à
 * pasta, "Estrutura no Drive" cria e liga) e "Ligar a um projeto" com a pasta aberta no quadro. Só o vínculo
 * projeto → pasta é guardado no Maestro.
 */
import { useState, useTransition } from "react";
import { criarEstruturaAcao, ligarPastaAcao } from "@/app/(app)/app/arquivos/acoes";
import type { ProjetoComPasta } from "@/lib/sobedesce/arquivos";
import { Icone } from "@/components/icones";
import { abrirPasta, useSobedesce } from "./sobedesce-vivo";

/** O selo pequeno de quem é o sistema (leva ao site do SOBEDESCE). Nada de botão de "abrir": a tela já é o SOBEDESCE. */
export function SeloSobedesce({ site }: { site: string }) {
  return (
    <a className="sd-selo" href={site} target="_blank" rel="noreferrer noopener" title="Conheça o SOBEDESCE">
      {/* o ícone do próprio SOBEDESCE (products/sobedesce), estático */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/sobedesce.svg" alt="" width={18} height={18} decoding="async" />
      <span>SOBEDESCE</span>
    </a>
  );
}

export function TelaArquivos({ projetos, escreve }: { projetos: ProjetoComPasta[]; escreve: boolean }) {
  const { pasta } = useSobedesce();
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const [ligar, setLigar] = useState("");

  const estrutura = (id: string) => {
    setOcupado(id);
    setAviso(null);
    iniciar(async () => {
      const r = await criarEstruturaAcao(id, null);
      setOcupado(null);
      if (!r.ok) return setAviso(r.mensagem);
      setAviso(r.criadas ? "Estrutura criada no Drive." : "A estrutura já existia; a pasta foi ligada ao projeto.");
      if (r.pasta) abrirPasta(r.pasta.id);
    });
  };

  const podeLigar = !!pasta && escreve && projetos.length > 0;

  const ligarForm = podeLigar ? (
    <form
      className="sd-ligar"
      aria-label="Ligar a pasta aberta a um projeto"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ligar || !pasta) return;
        const alvo = pasta;
        iniciar(async () => {
          const r = await ligarPastaAcao(ligar, alvo);
          setAviso(r.ok ? `“${alvo.nome}” ligada ao projeto.` : r.mensagem);
          if (r.ok) setLigar("");
        });
      }}
    >
      <span className="sd-ligar__pasta" title={pasta.nome}>
        <Icone nome="pasta" size={15} />
        <span>{pasta.nome}</span>
      </span>
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
  ) : null;

  if (!projetos.length) return null;
  return (
    <>
      <div className="sd-barra">
        <section className="sd-projetos" aria-label="Projetos no Drive">
          <ul data-rolagem>
            {projetos.slice(0, 12).map((p) => (
              <li key={p.id} className="sd-projeto">
                <span className="dv-projeto__icone" data-ligado={p.pasta ? "sim" : "nao"}>
                  <Icone nome="pasta" size={16} />
                </span>
                <span className="dv-projeto__texto">
                  <strong>{p.titulo}</strong>
                  <small>{[p.codigo, p.cliente].filter(Boolean).join(" · ")}</small>
                </span>
                {p.pasta ? (
                  <button type="button" className="glass-btn glass-btn--sm" onClick={() => abrirPasta(p.pasta!.id)} title={`Abrir “${p.pasta.nome}”`}>
                    Abrir
                  </button>
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
        </section>
        {ligarForm}
      </div>
      {aviso ? (
        <p className="dv-aviso" role="status">
          {aviso}
        </p>
      ) : null}
    </>
  );
}
