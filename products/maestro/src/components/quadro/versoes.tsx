"use client";
/**
 * As versões do card na ficha do Quadro: v1, v2… com a fonte e o link para abrir, e um campo para colar a próxima. É
 * o mesmo caminho do lote (`useNovaVersao` → `novaVersaoAcao` → `maestro.versao_criar`): a versão é do card, então o
 * lote que tiver o card já a mostra. Leitura vê a lista, sem o campo. Fica dentro do formulário da ficha, por isso não
 * tem <form> próprio: Enter no campo adiciona (e não envia a ficha). Versão do Drive: "Gerar versões" com o Relay
 * (em destaque quando aprovada, só quando um computador da conta converte; com app antigo, o pedido para atualizar)
 * e os entregáveis dela embaixo (`components/relay`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { versoesDoCardAcao } from "@/app/(app)/app/aprovacoes/acoes";
import { NOME_DA_FONTE, type TipoFonte } from "@/lib/revisao/fontes/detectar";
import type { VersaoDoCard } from "@/lib/revisao/equipe";
import { Icone, type NomeIcone } from "@/components/icones";
import { useNovaVersao } from "@/components/revisao/nova-versao";
import { AvisoAtualizar, BotaoGerar, ListaEntregaveis, useEntregaveis } from "@/components/relay/entregas";
import { GerarVersoes } from "@/components/relay/gerar-versoes";
import { NavegadorDrive } from "@/components/arquivos/navegador";
import { useRecursoSobedesce } from "@/components/arquivos/recursos-sobedesce";
import { Folha, useFecharFolha } from "@/components/folha";
import type { PastaDoCard } from "@/lib/quadro/pastas";
import { FolhaEntrega } from "./entrega";

const ICONE: Record<TipoFonte | "roteiro", NomeIcone> = {
  drive: "nuvem",
  youtube: "tocar",
  vimeo: "tocar",
  dropbox: "nuvem",
  mp4: "filme",
  hls: "filme",
  link: "link",
  roteiro: "criacao",
};

const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** O nome do arquivo sem a extensão, como nome da versão. */
const nomeDaVersao = (nome: string) => nome.replace(/\.[A-Za-z0-9]{2,5}$/, "").slice(0, 200);
const linkDoArquivo = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

/** "Escolher no Drive" na ficha: o navegador do Drive do Maestro como seletor, só vídeos. */
function FolhaEscolher({ sobedesce, aoFechar, aoEscolher }: { sobedesce: string; aoFechar: () => void; aoEscolher: (id: string, nome: string) => void }) {
  return (
    <Folha rotulo="Escolher no Drive" aoFechar={aoFechar} className="pc-folha">
      <EscolherConteudo sobedesce={sobedesce} aoEscolher={aoEscolher} />
    </Folha>
  );
}
function EscolherConteudo({ sobedesce, aoEscolher }: { sobedesce: string; aoEscolher: (id: string, nome: string) => void }) {
  const fechar = useFecharFolha();
  return (
    <div className="pc-folha__corpo">
      <div className="pc-folha__topo">
        <h2>Escolher no Drive</h2>
        <button type="button" className="q-icone-btn" onClick={fechar} aria-label="Fechar">
          <Icone nome="fechar" size={18} />
        </button>
      </div>
      <NavegadorDrive
        modo="escolher"
        sobedesce={sobedesce}
        aoEscolher={(f) => {
          aoEscolher(f.id, f.name);
          fechar();
        }}
      />
    </div>
  );
}

export function VersoesDoCard({
  card,
  podeEscrever,
  sobedesce = null,
  entrega = null,
}: {
  card: string;
  podeEscrever: boolean;
  /** Com o SOBEDESCE no plano: a origem do app dele ("Escolher no Drive" e "Enviar a entrega"). */
  sobedesce?: string | null;
  /** A pasta "Entrega" do card (src/lib/quadro/pastas.ts): o destino de "Enviar a entrega". */
  entrega?: PastaDoCard | null;
}) {
  const [versoes, setVersoes] = useState<VersaoDoCard[] | null>(null);
  const [vez, setVez] = useState(0);
  const recarregar = useCallback(() => setVez((n) => n + 1), []);
  const { link, setLink, setTitulo, fonte, pendente, enviar, mensagem } = useNovaVersao(card, recarregar);
  const [folha, setFolha] = useState<"escolher" | "entrega" | null>(null);
  // "Enviar a entrega" só quando o SOBEDESCE publicado sabe (contrato 2); senão o botão nem aparece
  const sabeEnviar = useRecursoSobedesce("enviar", !!(podeEscrever && sobedesce && entrega));
  const campoLink = useRef<HTMLInputElement>(null);
  /** Escolhido ou enviado: o campo da versão já preenchido; quem adiciona é a pessoa. */
  const preencher = (id: string, nome: string) => {
    setLink(linkDoArquivo(id));
    setTitulo(nomeDaVersao(nome));
    requestAnimationFrame(() => campoLink.current?.focus({ preventScroll: true }));
  };
  const entregas = useEntregaveis(card);
  const [gerando, setGerando] = useState<VersaoDoCard | null>(null);

  useEffect(() => {
    let vivo = true;
    void versoesDoCardAcao(card).then(
      (r) => vivo && setVersoes(r.ok ? r.versoes : []),
      () => vivo && setVersoes((v) => v ?? []),
    );
    return () => {
      vivo = false;
    };
  }, [card, vez]);

  return (
    <section className="vc" aria-label="Versões" aria-busy={versoes === null || undefined}>
      <span className="vc__titulo">Versões</span>
      {versoes?.length ? (
        <ul className="vc__lista">
          {versoes.map((v) => {
            const daVersao = entregas.lista?.filter((e) => e.versao === v.id) ?? [];
            return (
              <li key={v.id} data-aprovada={v.aprovada || undefined}>
                {v.fonte === "roteiro" ? (
                  // A versão de roteiro (Criação, F7) abre o editor, aqui mesmo.
                  <a className="vc__versao" href={v.url} title="Roteiro · abrir no editor">
                    <span className="vc__n">v{v.n}</span>
                    <Icone nome={ICONE.roteiro} size={15} className="vc__icone" />
                    <span className="vc__nome">
                      {v.titulo ?? "Roteiro"}
                      {v.roteiroN ? ` · roteiro v${v.roteiroN}` : ""}
                    </span>
                    <span className="vc__dia">{dia(v.em)}</span>
                    <Icone nome="seta" size={14} className="vc__abrir" />
                  </a>
                ) : (
                  <a className="vc__versao" href={v.url} target="_blank" rel="noreferrer noopener" title={`${NOME_DA_FONTE[v.fonte]} · abrir em outra aba`}>
                    <span className="vc__n">v{v.n}</span>
                    <Icone nome={ICONE[v.fonte]} size={15} className="vc__icone" />
                    <span className="vc__nome">{v.titulo ?? NOME_DA_FONTE[v.fonte]}</span>
                    {v.aprovada ? (
                      <span className="vc__aprovada">
                        <i aria-hidden="true" />
                        Aprovada
                      </span>
                    ) : null}
                    <span className="vc__dia">{dia(v.em)}</span>
                    <Icone nome="externo" size={14} className="vc__abrir" />
                  </a>
                )}
                {v.fonte === "drive" && v.driveId && (entregas.gerar !== "nao" || daVersao.length) ? (
                  <div className="vc__relay">
                    {entregas.gerar === "sim" ? (
                      <BotaoGerar aprovada={v.aprovada} aoAbrir={() => setGerando(v)} />
                    ) : entregas.gerar === "atualizar" ? (
                      <AvisoAtualizar />
                    ) : null}
                    <ListaEntregaveis
                      itens={daVersao}
                      computador={entregas.computador}
                      aviso={entregas.aviso}
                      podePedir={entregas.podePedir}
                      aoTrocar={entregas.trocar}
                      aoAplicar={entregas.aplicar}
                      rotulo={`Entregáveis da v${v.n}`}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : versoes && !podeEscrever ? (
        <p className="vc__vazio">Nenhuma versão ainda.</p>
      ) : null}
      {podeEscrever ? (
        <>
          <div className="vc__colar">
            <Icone nome="link" size={16} />
            <input
              ref={campoLink}
              type="url"
              inputMode="url"
              data-campo="versao"
              placeholder="Cole o link da versão"
              aria-label="Link da versão"
              title="Drive, YouTube, Vimeo, Dropbox, mp4…"
              value={link}
              maxLength={2000}
              onChange={(e) => {
                setLink(e.currentTarget.value);
                setTitulo("");
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (!pendente) enviar();
              }}
            />
            {fonte?.ok ? (
              <span className="vc__fonte">
                <i aria-hidden="true" />
                {NOME_DA_FONTE[fonte.tipo]}
              </span>
            ) : null}
            <button type="button" className="glass-btn glass-btn--ink glass-btn--sm" disabled={pendente || !fonte?.ok} onClick={enviar}>
              {pendente ? "Guardando…" : "Adicionar"}
            </button>
          </div>
          {sobedesce ? (
            <div className="vc__drive">
              <button type="button" className="glass-btn glass-btn--sm" onClick={() => setFolha("escolher")}>
                <Icone nome="nuvem" size={15} /> Escolher no Drive
              </button>
              {entrega && sabeEnviar ? (
                <button type="button" className="glass-btn glass-btn--sm" onClick={() => setFolha("entrega")} title={`Para a pasta ${entrega.nome}`}>
                  <Icone nome="enviar" size={15} /> Enviar a entrega
                </button>
              ) : null}
            </div>
          ) : null}
          {mensagem ? (
            <p className="vc__erro" role="alert">
              {mensagem}
            </p>
          ) : null}
        </>
      ) : null}
      {folha === "escolher" && sobedesce ? <FolhaEscolher sobedesce={sobedesce} aoFechar={() => setFolha(null)} aoEscolher={preencher} /> : null}
      {folha === "entrega" && entrega ? <FolhaEntrega pasta={entrega} aoFechar={() => setFolha(null)} aoUsar={(a) => preencher(a.id, a.nome)} /> : null}
      {gerando ? (
        <GerarVersoes
          versaoId={gerando.id}
          titulo={`v${gerando.n}${gerando.titulo ? ` · ${gerando.titulo}` : ""}`}
          aoFechar={() => setGerando(null)}
          aoPedir={entregas.aplicar}
        />
      ) : null}
    </section>
  );
}
