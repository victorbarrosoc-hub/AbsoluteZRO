"use client";
/**
 * A tela de um lote para a equipe: as peças numeradas com o estado da decisão, as versões (links colados), a mesa de
 * revisão com a régua e os comentários, o link do cliente (gerar com PIN e validade, copiar, WhatsApp, revogar) e a
 * exportação das notas (CSV e EDL). Tempo real simples: a cada 5 s a página pergunta de novo ao servidor.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { COLUNA, type ColunaKey } from "@/lib/quadro/metodo";
import { NOME_DA_FONTE, resumoDaFonte } from "@/lib/revisao/fontes/detectar";
import type { CardDisponivel, LoteDaEquipe, PecaDaEquipe } from "@/lib/revisao/equipe";
import type { ComentarioVisto, VersaoVista } from "@/lib/revisao/tipos";
import {
  adicionarPecaAcao,
  comentarAcao,
  copiarLinkAcao,
  fecharLoteAcao,
  gerarLinkAcao,
  resolverAcao,
  revogarLinkAcao,
} from "@/app/(app)/app/aprovacoes/acoes";
import { Icone } from "@/components/icones";
import { NavegadorDrive } from "@/components/arquivos/navegador";
import { useMidia } from "@/components/use-midia";
import { ComDriveDaEquipe } from "./drive-equipe";
import { useNovaVersao } from "./nova-versao";
import { Revisor, type NovoComentario } from "./revisor";

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function estadoDaPeca(p: PecaDaEquipe): "aprovado" | "ajuste" | "falta" {
  const d = p.decisoes.find((x) => x.volta === p.volta);
  return d ? d.decisao : "falta";
}

const NOME_ESTADO = { aprovado: "Aprovada", ajuste: "Ajuste pedido", falta: "Esperando" } as const;

/** "Escolher no Drive" (com o SOBEDESCE): o navegador do Drive como seletor, só vídeos. */
function EscolherNoDrive({ sobedesce, aoEscolher, aoFechar }: { sobedesce: string; aoEscolher: (id: string, nome: string) => void; aoFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [aoFechar]);
  return createPortal(
    <div className="rv-escolher" role="dialog" aria-modal="true" aria-label="Escolher no Drive" onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="rv-escolher__caixa">
        <div className="rv-escolher__topo">
          <h2>Escolher no Drive</h2>
          <button type="button" className="glass-btn glass-btn--sm" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" size={16} />
          </button>
        </div>
        <NavegadorDrive modo="escolher" sobedesce={sobedesce} aoEscolher={(f) => aoEscolher(f.id, f.name)} />
      </div>
    </div>,
    document.body,
  );
}

function NovaVersao({ card, driveStream, sobedesce, aoFim }: { card: string; driveStream: boolean; sobedesce: string | null; aoFim: () => void }) {
  const { link, setLink, titulo, setTitulo, fonte: f, pendente, enviar, mensagem } = useNovaVersao(card, aoFim);
  const [escolhendo, setEscolhendo] = useState(false);
  // No celular a lista inteira de fontes não cabe no campo: o placeholder encurta (o resto aparece ao colar).
  const celular = useMidia("(max-width: 600px)");
  return (
    <form
      className="ap-versao"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        enviar();
      }}
      aria-label="Nova versão"
    >
      <div className="ap-versao__linha">
        <Icone nome="link" size={16} />
        <input
          type="url"
          inputMode="url"
          placeholder={celular ? "Cole o link da versão" : "Cole o link: Drive, YouTube, Vimeo, Dropbox, mp4…"}
          aria-label="Link da nova versão"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          maxLength={2000}
        />
        {sobedesce ? (
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => setEscolhendo(true)}>
            <Icone nome="nuvem" size={15} /> Escolher no Drive
          </button>
        ) : null}
        <button type="submit" className="glass-btn glass-btn--ink glass-btn--sm" disabled={pendente || !f?.ok}>
          {pendente ? "Guardando…" : "Nova versão"}
        </button>
      </div>
      {escolhendo && sobedesce ? (
        <EscolherNoDrive
          sobedesce={sobedesce}
          aoFechar={() => setEscolhendo(false)}
          aoEscolher={(id, nome) => {
            setLink(`https://drive.google.com/file/d/${id}/view`);
            setTitulo((t) => t || nome.replace(/\.[A-Za-z0-9]{2,5}$/, "").slice(0, 200));
            setEscolhendo(false);
          }}
        />
      ) : null}
      {f?.ok ? (
        <div className="ap-versao__fonte">
          <span className="selo selo--ok">
            <i aria-hidden="true" />
            {NOME_DA_FONTE[f.tipo]}
          </span>
          <span>{f.tipo === "drive" && sobedesce && !f.chave ? "Toca com tempo automático pelo SOBEDESCE." : resumoDaFonte(f, { driveStream })}</span>
          <input placeholder="Nome (opcional)" aria-label="Nome da versão" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} />
        </div>
      ) : null}
      {mensagem ? (
        <p className="rv-erro" role="alert">
          {mensagem}
        </p>
      ) : null}
    </form>
  );
}

function PainelLink({ lote, gereLink, aoMudar }: { lote: LoteDaEquipe; gereLink: boolean; aoMudar: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [dias, setDias] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const link = lote.link;

  async function copiar(u: string) {
    try {
      await navigator.clipboard.writeText(u);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      setMsg("Não deu para copiar. Selecione o link e copie.");
    }
  }
  const zap = (u: string) => {
    const texto = `Oi! Seguem as peças de "${lote.titulo}" para você aprovar: ${u}${link?.pin || pin ? " (o PIN eu mando à parte)" : ""}`;
    return `https://wa.me/${lote.cliente.whatsapp ?? ""}?text=${encodeURIComponent(texto)}`;
  };

  if (lote.status === "fechado")
    return (
      <section className="ap-link" aria-label="Link do cliente">
        <p className="ap-link__estado">
          <Icone nome="cadeado" size={16} /> Lote fechado. O link não abre mais.
        </p>
      </section>
    );

  return (
    <section className="ap-link" aria-label="Link do cliente">
      {link ? (
        <>
          <p className="ap-link__estado">
            <span className="ap-luz" aria-hidden="true" /> Link ativo até {dataCurta(link.expira)}
            {link.pin ? " · com PIN" : ""}
            {link.usos ? ` · aberto ${link.usos}×` : " · ainda não aberto"}
          </p>
          {gereLink ? (
            <div className="acoes">
              <button
                type="button"
                className="glass-btn glass-btn--ink glass-btn--sm"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = url ? { ok: true as const, url } : await copiarLinkAcao(lote.id);
                    if (r.ok && r.url) {
                      setUrl(r.url);
                      await copiar(r.url);
                    } else if (!r.ok) setMsg(r.mensagem);
                  })
                }
              >
                <Icone nome={copiado ? "check" : "copiar"} size={16} /> {copiado ? "Copiado" : "Copiar link"}
              </button>
              {url ? (
                <a className="glass-btn glass-btn--sm" href={zap(url)} target="_blank" rel="noreferrer noopener">
                  <Icone nome="whatsapp" size={16} /> WhatsApp
                </a>
              ) : null}
              <button
                type="button"
                className="glass-btn glass-btn--sm"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await revogarLinkAcao(lote.id);
                    if (!r.ok) setMsg(r.mensagem);
                    setUrl(null);
                    aoMudar();
                  })
                }
              >
                Revogar
              </button>
            </div>
          ) : null}
          {url ? <input className="ap-link__url" readOnly value={url} aria-label="Endereço do link" onFocus={(e) => e.currentTarget.select()} /> : null}
        </>
      ) : gereLink ? (
        <form
          className="ap-link__gerar"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const r = await gerarLinkAcao(lote.id, pin, dias);
              if (!r.ok) setMsg(r.mensagem);
              else if (r.url) {
                setUrl(r.url);
                setMsg(null);
                await copiar(r.url);
                aoMudar();
              }
            });
          }}
        >
          <label className="ap-link__pin">
            <Icone nome="cadeado" size={15} />
            <input
              inputMode="numeric"
              pattern="\d{4,8}"
              placeholder="PIN (opcional)"
              aria-label="PIN opcional, de 4 a 8 números"
              value={pin}
              maxLength={8}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <div className="q-segmentos" role="radiogroup" aria-label="Validade">
            {[7, 15, 30].map((d) => (
              <button key={d} type="button" role="radio" aria-checked={dias === d} onClick={() => setDias(d)}>
                {d} dias
              </button>
            ))}
          </div>
          <button type="submit" className="glass-btn glass-btn--ink glass-btn--sm" disabled={pendente || !lote.pecas.length}>
            <Icone nome="link" size={16} /> Gerar link
          </button>
        </form>
      ) : (
        <p className="ap-link__estado">Sem link ativo. Administração e gestão geram o link do cliente.</p>
      )}
      {msg ? (
        <p className="rv-erro" role="alert">
          {msg}
        </p>
      ) : null}
    </section>
  );
}

export function LoteEquipe({
  lote,
  disponiveis,
  escreve,
  gereLink,
  pecaInicial,
  driveStream,
  sobedesce = null,
}: {
  lote: LoteDaEquipe;
  disponiveis: CardDisponivel[];
  escreve: boolean;
  gereLink: boolean;
  pecaInicial: string | null;
  driveStream: boolean;
  /** Com o SOBEDESCE no plano: a origem do app (Escolher no Drive e o Drive tocando pela conta da pessoa). */
  sobedesce?: string | null;
}) {
  const router = useRouter();
  const [card, setCard] = useState(pecaInicial && lote.pecas.some((p) => p.card === pecaInicial) ? pecaInicial : (lote.pecas[0]?.card ?? null));
  const [, iniciar] = useTransition();
  const atualizar = useCallback(() => router.refresh(), [router]);
  const peca = lote.pecas.find((p) => p.card === card) ?? lote.pecas[0] ?? null;

  // Tempo real simples: pergunta de novo a cada 5 s com a aba à vista.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => window.clearInterval(id);
  }, [router]);

  const aoComentar = useCallback(
    async (v: VersaoVista, c: NovoComentario) => {
      const r = await comentarAcao(v.id, c);
      if (!r.ok) return r.mensagem;
      router.refresh();
      return null;
    },
    [router],
  );
  const aoResolver = useCallback(
    async (c: ComentarioVisto) => {
      await resolverAcao(c.id, !c.resolvido);
      router.refresh();
    },
    [router],
  );

  const decididas = lote.pecas.filter((p) => estadoDaPeca(p) !== "falta").length;
  const ultimaDecisao = useMemo(() => (peca ? peca.decisoes.find((d) => d.volta === peca.volta) : undefined), [peca]);

  return (
    <div className="pagina ap">
      <header className="pagina__cabeca pagina__cabeca--acao">
        <div>
          <Link className="voltar" href="/app/aprovacoes">
            <Icone nome="voltar" size={15} /> Aprovações
          </Link>
          <h1 className="atitle">
            <strong>{lote.titulo}</strong>
          </h1>
          <p className="apoio">
            {lote.cliente.nome} · {decididas} de {lote.pecas.length} decididas
            {lote.termo ? ` · enviado por ${lote.termo.nome} em ${dataCurta(lote.termo.em)}` : ""}
          </p>
        </div>
        <div className="acoes">
          <a className="glass-btn glass-btn--sm" href={`/app/aprovacoes/${lote.id}/notas?formato=csv`} download>
            <Icone nome="baixar" size={15} /> CSV
          </a>
          <a className="glass-btn glass-btn--sm" href={`/app/aprovacoes/${lote.id}/notas?formato=edl`} download title="Marcadores para o DaVinci Resolve">
            <Icone nome="baixar" size={15} /> EDL
          </a>
          {gereLink && lote.status !== "fechado" ? (
            <button
              type="button"
              className="glass-btn glass-btn--sm"
              onClick={() => {
                if (window.confirm("Fechar o lote? O link do cliente para de abrir."))
                  iniciar(async () => {
                    await fecharLoteAcao(lote.id);
                    atualizar();
                  });
              }}
            >
              Fechar lote
            </button>
          ) : null}
        </div>
      </header>

      <PainelLink lote={lote} gereLink={gereLink} aoMudar={atualizar} />

      <nav className="ap-pecas" aria-label="Peças do lote">
        {lote.pecas.map((p, i) => {
          const e = estadoDaPeca(p);
          return (
            <button
              key={p.card}
              type="button"
              className="ap-peca"
              aria-current={p.card === peca?.card ? "true" : undefined}
              data-estado={e}
              onClick={() => setCard(p.card)}
            >
              <span className="ap-peca__n">{i + 1}</span>
              <span className="ap-peca__nome">{p.titulo}</span>
              <span className="ap-peca__estado" title={NOME_ESTADO[e]}>
                <i aria-hidden="true" />
                <span className="sr-only">{NOME_ESTADO[e]}</span>
              </span>
            </button>
          );
        })}
        {escreve && disponiveis.length && lote.status !== "fechado" ? (
          <select
            className="ap-pecas__mais"
            aria-label="Pôr peça no lote"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v)
                iniciar(async () => {
                  await adicionarPecaAcao(lote.id, v);
                  setCard(v);
                  atualizar();
                });
            }}
          >
            <option value="">+ Peça</option>
            {disponiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tema}
              </option>
            ))}
          </select>
        ) : null}
      </nav>

      {!peca ? (
        <section className="vazio" aria-label="Sem peças">
          <h2>Nenhuma peça neste lote</h2>
          <p>Ponha os cards do cliente que vão para a aprovação.</p>
        </section>
      ) : (
        <section className="ap-detalhe" aria-label={peca.titulo}>
          <header className="ap-detalhe__cabeca">
            <h2>{peca.titulo}</h2>
            <span className="selo" data-col={peca.coluna}>
              <i className="q-ponto" aria-hidden="true" />
              {COLUNA[peca.coluna as ColunaKey]?.nome ?? peca.coluna}
            </span>
            {ultimaDecisao ? (
              <span className={`selo selo--${ultimaDecisao.decisao === "aprovado" ? "ok" : "aviso"}`} title={ultimaDecisao.nota ?? undefined}>
                <i aria-hidden="true" />
                {ultimaDecisao.decisao === "aprovado" ? "Aprovada" : "Ajuste pedido"}
                {ultimaDecisao.nome ? ` por ${ultimaDecisao.nome}` : ""}
              </span>
            ) : null}
            <Link className="ap-detalhe__quadro" href={`/app/quadro?card=${encodeURIComponent(peca.card)}`}>
              Ver no Quadro <Icone nome="seta" size={14} />
            </Link>
          </header>
          {ultimaDecisao?.nota ? <p className="ap-nota">“{ultimaDecisao.nota}”</p> : null}
          {escreve && lote.status !== "fechado" ? <NovaVersao card={peca.card} driveStream={driveStream} sobedesce={sobedesce} aoFim={atualizar} /> : null}
          {peca.versoes.length ? (
            <ComDriveDaEquipe ligado={!!sobedesce}>
              <Revisor
                key={peca.card}
                versoes={peca.versoes}
                modo="equipe"
                podeComentar={escreve}
                aoComentar={aoComentar}
                aoResolver={escreve ? aoResolver : undefined}
              />
            </ComDriveDaEquipe>
          ) : (
            <p className="rv-vazio">Cole o link da primeira versão. Sem vídeo, o cliente decide pelo título.</p>
          )}
        </section>
      )}
    </div>
  );
}
