"use client";
/**
 * As pastas do Drive no card (titular, 04/11/2026): "Brutos" e "Entrega" como dois chips na ficha. Com a pasta, o chip
 * abre o Drive; sem ela (quem escreve), o chip vazio abre a folha: colar o link da pasta, a sugestão do projeto
 * (02 Bruto / 05 Entregas da estrutura, quando o projeto tem pasta ligada) ou "Escolher no Drive" pelo navegador do
 * Drive do Maestro. Só aparece com o SOBEDESCE no plano (a rota do Quadro também recusa sem ele).
 */
import { useEffect, useState } from "react";
import { CAMPOS_PASTA, enderecoDaPasta, PASTA, pastaDoLink, type CampoPasta, type PastaDoCard, type SugestaoDePastas } from "@/lib/quadro/pastas";
import type { CampoEditavel, DadosCard } from "@/lib/quadro/metodo";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone } from "@/components/icones";
import { NavegadorDrive } from "@/components/arquivos/navegador";

type Por = (campos: Partial<Record<CampoEditavel, unknown>>) => void;

export function PastasDoCard({
  dados,
  podeEscrever,
  sobedesce,
  por,
}: {
  dados: Partial<DadosCard>;
  podeEscrever: boolean;
  /** A origem do app do SOBEDESCE (links do navegador do Drive). */
  sobedesce: string;
  por: Por;
}) {
  const [editando, setEditando] = useState<CampoPasta | null>(null);
  const tem = CAMPOS_PASTA.some((c) => dados[c]);
  if (!tem && !podeEscrever) return null;
  return (
    <section className="pc" aria-label="Pastas no Drive">
      <span className="vc__titulo">Drive</span>
      <div className="pc__chips">
        {CAMPOS_PASTA.map((campo) => {
          const p = dados[campo];
          const { rotulo } = PASTA[campo];
          if (p)
            return (
              <span key={campo} className="pc-chip" data-pasta={campo}>
                <a className="pc-chip__abrir" href={p.url} target="_blank" rel="noreferrer noopener" title={`${p.nome} · abrir no Drive`}>
                  <Icone nome="pasta" size={15} />
                  <b>{rotulo}</b>
                  {p.nome !== rotulo ? <span className="pc-chip__nome">{p.nome}</span> : null}
                  <Icone nome="externo" size={12} className="pc-chip__seta" />
                </a>
                {podeEscrever ? (
                  <button type="button" className="pc-chip__trocar" aria-label={`Trocar a pasta ${rotulo}`} title="Trocar" onClick={() => setEditando(campo)}>
                    <Icone nome="editar" size={13} />
                  </button>
                ) : null}
              </span>
            );
          if (!podeEscrever) return null;
          return (
            <button key={campo} type="button" className="pc-chip pc-chip--vazio" data-pasta={campo} onClick={() => setEditando(campo)}>
              <Icone nome="mais" size={13} />
              {rotulo}
            </button>
          );
        })}
      </div>
      {editando ? (
        <FolhaPasta
          campo={editando}
          atual={dados[editando] ?? null}
          projeto={dados.projeto ?? null}
          sobedesce={sobedesce}
          aoFechar={() => setEditando(null)}
          aoEscolher={(p) => por({ [editando]: p })}
        />
      ) : null}
    </section>
  );
}

/** A sugestão do projeto (uma leitura por folha aberta; o Drive fora do ar só deixa sem sugestão). */
function useSugestao(projeto: string | null): SugestaoDePastas | null {
  const [s, setS] = useState<{ projeto: string; sugestao: SugestaoDePastas } | null>(null);
  useEffect(() => {
    if (!projeto) return;
    let vivo = true;
    fetch(`/api/quadro/pastas?projeto=${encodeURIComponent(projeto)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ sugestao: SugestaoDePastas }>) : { sugestao: {} }))
      .then((r) => vivo && setS({ projeto, sugestao: r.sugestao ?? {} }))
      .catch(() => vivo && setS({ projeto, sugestao: {} }));
    return () => {
      vivo = false;
    };
  }, [projeto]);
  return projeto && s?.projeto === projeto ? s.sugestao : null;
}

function FolhaPasta(p: {
  campo: CampoPasta;
  atual: PastaDoCard | null;
  projeto: string | null;
  sobedesce: string;
  aoFechar: () => void;
  aoEscolher: (p: PastaDoCard | null) => void;
}) {
  const [navegar, setNavegar] = useState(false);
  return (
    <Folha rotulo={PASTA[p.campo].titulo} aoFechar={p.aoFechar} tamanho={navegar ? "ficha" : "acao"} className="pc-folha">
      <ConteudoPasta {...p} navegar={navegar} setNavegar={setNavegar} />
    </Folha>
  );
}

function ConteudoPasta({
  campo,
  atual,
  projeto,
  sobedesce,
  aoEscolher,
  navegar,
  setNavegar,
}: {
  campo: CampoPasta;
  atual: PastaDoCard | null;
  projeto: string | null;
  sobedesce: string;
  aoEscolher: (p: PastaDoCard | null) => void;
  navegar: boolean;
  setNavegar: (v: boolean) => void;
}) {
  const fechar = useFecharFolha();
  const [link, setLink] = useState("");
  const [erro, setErro] = useState(false);
  const sugestao = useSugestao(projeto)?.[campo];
  const usar = (pasta: PastaDoCard | null) => {
    aoEscolher(pasta);
    fechar();
  };
  const colar = () => {
    const pasta = pastaDoLink(campo, link);
    if (!pasta) return setErro(true);
    usar(pasta);
  };
  return (
    <div className="pc-folha__corpo">
      <div className="pc-folha__topo">
        <h2>{PASTA[campo].titulo}</h2>
        <button type="button" className="q-icone-btn" onClick={fechar} aria-label="Fechar">
          <Icone nome="fechar" size={18} />
        </button>
      </div>
      {navegar ? (
        <NavegadorDrive
          modo="pasta"
          sobedesce={sobedesce}
          extraDaPasta={(aberta) =>
            aberta ? (
              <button
                type="button"
                className="glass-btn glass-btn--sm glass-btn--ink"
                onClick={() => usar({ id: aberta.id, nome: aberta.name.slice(0, 120), url: enderecoDaPasta(aberta.id) })}
              >
                <Icone nome="check" size={14} /> Usar esta pasta
              </button>
            ) : null
          }
        />
      ) : (
        <>
          {sugestao && sugestao.id !== atual?.id ? (
            <button type="button" className="pc-sugestao" onClick={() => usar(sugestao)}>
              <Icone nome="pasta" size={18} />
              <span>
                <b>{sugestao.nome}</b>
                <small>Do projeto</small>
              </span>
              <Icone nome="seta" size={14} />
            </button>
          ) : null}
          <form
            className="pc-colar"
            onSubmit={(e) => {
              e.preventDefault();
              // a folha mora num portal, mas o React leva o submit até o formulário da ficha
              e.stopPropagation();
              colar();
            }}
          >
            <Icone nome="link" size={16} />
            <input
              type="url"
              inputMode="url"
              aria-label="Link da pasta no Drive"
              placeholder="Cole o link da pasta"
              value={link}
              maxLength={2000}
              aria-invalid={erro || undefined}
              onChange={(e) => {
                setLink(e.currentTarget.value);
                setErro(false);
              }}
            />
            <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={!link.trim()}>
              Usar
            </button>
          </form>
          {erro ? (
            <p className="vc__erro" role="alert">
              Esse link não é de uma pasta do Drive.
            </p>
          ) : null}
          <div className="pc-folha__acoes">
            <button type="button" className="glass-btn glass-btn--sm" onClick={() => setNavegar(true)}>
              <Icone nome="nuvem" size={15} /> Escolher no Drive
            </button>
            {atual ? (
              <button type="button" className="glass-btn glass-btn--sm q-perigo" onClick={() => usar(null)}>
                Tirar
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
