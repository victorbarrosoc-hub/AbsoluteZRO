"use client";
/**
 * "Enviar" do Roteiro (plano da Criação §5, fase F3). A ação principal do editor para administração e gestão. Tudo sai
 * de uma VERSÃO SALVA (imutável, com sha256): se ainda não há versão, ou o rascunho mudou depois da última, a folha
 * oferece salvar a próxima antes (ou mandar a última como está). Cada envio fica na auditoria (`roteiro.enviado`).
 *
 * - Para o TPeasy: só as falas, por pessoa, prontas para gravar. Com o TPeasy no plano (`tpeasy`, F8), a ação principal
 *   é **Enviar ao TPeasy**: pela Absolute ZRO direto na caixa de entrada do TPeasy da pessoa (ou de quem da organização
 *   usa o TPeasy), que entra em Roteiros ao abrir o app, marcado "Do Maestro"; a folha mostra "Enviado ao TPeasy · v3 ·
 *   agora" (e "Recebido") com Reenviar. Os outros jeitos ficam recolhidos. Sem o TPeasy, uma linha curta diz por quê e
 *   ficam Compartilhar (folha do sistema, com o `.txt` quando o aparelho aceita arquivo), Copiar, Baixar `.txt` e o
 *   backup do TPeasy (id estável: atualiza o mesmo roteiro lá).
 * - PDF para a edição: a folha A4 na vista Edição (cenas com tempo, lettering, áudio e falas).
 * - AEON: o arquivo `maestro.roteiro/1`, SÓ quando o AEON está aberto para a pessoa (`podeMandarParaAeon`, gate do
 *   HUB). Hoje fechado: não aparece.
 * - PDF: Literário, Técnico ou Teleprompter.
 * - Para o cliente aprovar (F7): a versão vira peça do link de aprovação do CARD (`ParaOCliente` em `cliente.tsx`);
 *   sem card, a folha liga um; sem lote, nasce o do cliente do card; sem link, o link nasce. Copia o link no fim.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { lerRoteiro, type Roteiro } from "@/lib/criacao/roteiro/modelo";
import { arquivoParaEdicao, type DestinoSaida, type FormatoSaida, mesmoConteudo, paraRoteiroMaestro, saidaTpeasy } from "@/lib/criacao/roteiro/saidas";
import type { Envio, VersaoCompleta, VersaoLista } from "@/lib/criacao/roteiro/servidor";
import type { EnvioTpeasy, EstadoTpeasy } from "@/lib/criacao/roteiro/tpeasy";
import { idNoTpeasy } from "@/lib/criacao/roteiro/vistas/teleprompter";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { Folha, useFecharFolha } from "@/components/folha";
import { Icone, type NomeIcone } from "@/components/icones";
import { quando } from "./comum";
import { ParaOCliente } from "./cliente";
import { PreviaTeleprompter } from "./leitura";

export type DestinoEnvio = DestinoSaida;

type Item = { k: DestinoEnvio; icone: NomeIcone; titulo: string; apoio: string };

/** As opções do menu, na ordem. AEON só com o gate aberto (hoje fechado: não aparece). */
export function itensEnviar(aeon: boolean, tpeasy = false): Item[] {
  return [
    { k: "cliente", icone: "aprovacoes", titulo: "Para o cliente aprovar", apoio: "Pelo link de aprovação do card" },
    { k: "tpeasy", icone: "celular", titulo: "Para o TPeasy", apoio: tpeasy ? "Direto no app, pronto para gravar" : "Só as falas, prontas para gravar" },
    { k: "edicao", icone: "filme", titulo: "PDF para a edição", apoio: "Cenas, tempos e deixas" },
    ...(aeon ? [{ k: "aeon" as const, icone: "documento" as const, titulo: "AEON", apoio: "Arquivo do roteiro" }] : []),
    { k: "pdf", icone: "imprimir", titulo: "PDF", apoio: "Literário, Técnico ou Teleprompter" },
  ];
}

function Itens({ aeon, tpeasy, escolher, salvarVersao }: { aeon: boolean; tpeasy: boolean; escolher: (d: DestinoEnvio) => void; salvarVersao: () => void }) {
  return (
    <>
      {itensEnviar(aeon, tpeasy).map((i) => (
        <button key={i.k} type="button" role="menuitem" className="cr-enviar__item" onClick={() => escolher(i.k)}>
          <span className="cr-enviar__icone" aria-hidden="true">
            <Icone nome={i.icone} size={18} />
          </span>
          <span className="cr-enviar__texto">
            <b>{i.titulo}</b>
            <span>{i.apoio}</span>
          </span>
        </button>
      ))}
      <hr className="cr-enviar__linha" />
      <button type="button" role="menuitem" className="cr-enviar__item cr-enviar__item--curto" onClick={salvarVersao}>
        <span className="cr-enviar__icone" aria-hidden="true">
          <Icone nome="versoes" size={18} />
        </span>
        <span className="cr-enviar__texto">
          <b>Salvar versão</b>
        </span>
      </button>
    </>
  );
}

/** O botão "Enviar" com o menu de vidro (computador). Esc ou clique fora fecha; setas andam entre as opções. */
export function MenuEnviar({
  aeon,
  tpeasy = false,
  escolher,
  salvarVersao,
}: {
  aeon: boolean;
  tpeasy?: boolean;
  escolher: (d: DestinoEnvio) => void;
  salvarVersao: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    caixa.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);
  const fechar = (focar = true) => {
    setAberto(false);
    if (focar) botao.current?.focus();
  };
  return (
    <div
      className="cr-enviar"
      ref={caixa}
      onKeyDown={(e) => {
        if (!aberto) return;
        if (e.key === "Escape") {
          e.preventDefault();
          fechar();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const itens = [...(caixa.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
          const i = itens.indexOf(document.activeElement as HTMLElement);
          itens[(i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length]?.focus();
        }
      }}
    >
      <button ref={botao} type="button" className="glass-btn glass-btn--ink" aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <Icone nome="compartilhar" size={17} /> Enviar <Icone nome="abaixo" size={12} />
      </button>
      {aberto ? (
        <div className="cr-enviar__menu" role="menu" aria-label="Enviar">
          <Itens
            aeon={aeon}
            tpeasy={tpeasy}
            escolher={(d) => {
              fechar(false);
              escolher(d);
            }}
            salvarVersao={() => {
              fechar(false);
              salvarVersao();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** O mesmo menu numa folha (iPhone). */
export function FolhaMenuEnviar({
  aeon,
  tpeasy = false,
  escolher,
  salvarVersao,
  aoFechar,
}: {
  aeon: boolean;
  tpeasy?: boolean;
  escolher: (d: DestinoEnvio) => void;
  salvarVersao: () => void;
  aoFechar: () => void;
}) {
  const depois = useRef<(() => void) | null>(null);
  return (
    <Folha
      rotulo="Enviar"
      tamanho="acao"
      className="cr-enviar-folha"
      aoFechar={() => {
        aoFechar();
        const f = depois.current;
        if (f) setTimeout(f, 40);
      }}
    >
      <h2 className="cr-folha__titulo">Enviar</h2>
      <FecharDepois
        render={(fechar) => (
          <div className="cr-enviar__lista" role="menu" aria-label="Enviar">
            <Itens
              aeon={aeon}
              tpeasy={tpeasy}
              escolher={(d) => {
                depois.current = () => escolher(d);
                fechar();
              }}
              salvarVersao={() => {
                depois.current = salvarVersao;
                fechar();
              }}
            />
          </div>
        )}
      />
    </Folha>
  );
}
function FecharDepois({ render }: { render: (fechar: () => void) => React.ReactNode }) {
  return <>{render(useFecharFolha())}</>;
}

const TITULO: Record<DestinoEnvio, string> = {
  cliente: "Para o cliente aprovar",
  tpeasy: "Para o TPeasy",
  edicao: "PDF para a edição",
  aeon: "AEON",
  pdf: "PDF",
};
const NOME_DESTINO: Record<DestinoEnvio, string> = { cliente: "Cliente", tpeasy: "TPeasy", edicao: "Edição", aeon: "AEON", pdf: "PDF" };
const NOME_FORMATO: Record<string, string> = {
  compartilhar: "compartilhado",
  copiar: "copiado",
  txt: ".txt",
  backup: "backup",
  direto: "no app",
  pdf: "PDF",
  json: "arquivo",
  link: "link do card",
  literario: "Literário",
  tecnico: "Técnico",
  teleprompter: "Teleprompter",
};

function baixar(nome: string, conteudo: string, tipo: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

const diaHora = (iso: string) => {
  const d = new Date(iso.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isFinite(d.getTime()) ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
};

type Props = {
  destino: DestinoEnvio;
  url: string;
  roteiroId: string;
  roteiro: Roteiro;
  titulo: string;
  versoes: VersaoLista[];
  setVersoes: (v: VersaoLista[]) => void;
  /** Grava o que falta (o rascunho no banco é o que vira versão). */
  antes: () => Promise<unknown>;
  aoSalvar: (n: number) => void;
  /** Pessoa escolhida na vista Teleprompter (começa nela). */
  pessoa: string | null;
  /** O TPeasy no plano (podeMandarParaTpeasy): "Enviar ao TPeasy" direto pela Absolute ZRO (F8). */
  tpeasy?: boolean;
  /** Para o cliente: os cards que dá para ligar, ligar um, e o aviso de que foi (o estado vira "com o cliente"). */
  cards: { id: string; tema: string }[];
  ligar: (cardId: string) => Promise<string | null>;
  aoCliente: () => void;
  aoFechar: () => void;
};

type Fase = { k: "carregando" } | { k: "salvar"; ultima: VersaoCompleta | null } | { k: "pronto"; v: VersaoCompleta } | { k: "erro"; msg: string };

export function FolhaEnviar(p: Props) {
  const [fase, setFase] = useState<Fase>({ k: "carregando" });
  const [indo, setIndo] = useState(false);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pessoa, setPessoa] = useState<string | null>(p.pessoa);
  const [podeCompartilhar, setPodeCompartilhar] = useState(false);
  const inicial = useRef(p);

  const lerVersao = async (n: number): Promise<VersaoCompleta> => {
    const r = await fetch(`${p.url}?versao=${n}`, { cache: "no-store" });
    const d = (await r.json().catch(() => ({}))) as { versao?: VersaoCompleta; mensagem?: string };
    if (!r.ok || !d.versao) throw new Error(d.mensagem ?? "Não deu para abrir a versão.");
    return d.versao;
  };

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a folha do sistema só existe no navegador
    setPodeCompartilhar(typeof navigator !== "undefined" && typeof navigator.share === "function");
    (async () => {
      const q = inicial.current;
      try {
        await q.antes();
        const [ultima, lista] = await Promise.all([
          q.versoes[0] ? lerVersao(q.versoes[0].n) : Promise.resolve(null),
          fetch(`${q.url}?envios=1`, { cache: "no-store" })
            .then((r) => r.json())
            .then((d: { envios?: Envio[] }) => d.envios ?? [])
            .catch(() => []),
        ]);
        if (!vivo) return;
        setEnvios(lista);
        const igual = ultima && ultima.titulo === q.titulo.replace(/\s+/g, " ").trim() && mesmoConteudo(ultima.conteudo, lerRoteiro(q.roteiro));
        setFase(igual ? { k: "pronto", v: ultima } : { k: "salvar", ultima });
      } catch (e) {
        if (vivo) setFase({ k: "erro", msg: e instanceof Error ? e.message : "Não deu para abrir as versões." });
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez, ao abrir
  }, []);

  async function salvarEContinuar() {
    setIndo(true);
    setMsg(null);
    try {
      await p.antes();
      const r = await fetch(p.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "versao", nota: null }) });
      const d = (await r.json()) as { versao?: { n: number }; versoes?: VersaoLista[]; mensagem?: string };
      if (!r.ok || !d.versao) throw new Error(d.mensagem ?? "Não deu para salvar a versão.");
      p.setVersoes(d.versoes ?? []);
      p.aoSalvar(d.versao.n);
      setFase({ k: "pronto", v: await lerVersao(d.versao.n) });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu para salvar a versão.");
    } finally {
      setIndo(false);
    }
  }

  /** Anota na auditoria (não segura a tela; `keepalive` deixa terminar mesmo se a página mudar). */
  function registrar(v: VersaoCompleta, formato: FormatoSaida, quem: string | null = null, destino: DestinoEnvio = p.destino) {
    const corpo = { op: "enviado", n: v.n, destino, formato, pessoa: quem };
    void fetch(p.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), keepalive: true })
      .then((r) => {
        if (r.ok) setEnvios((l) => [{ destino, formato, n: v.n, pessoa: quem, quem: null, em: new Date().toISOString() }, ...l].slice(0, 5));
      })
      .catch(() => {});
  }

  return (
    <Folha rotulo={TITULO[p.destino]} aoFechar={p.aoFechar} tamanho="acao" className="cr-enviar-folha" veuClasse="cr-enviar-veu">
      <h2 className="cr-folha__titulo">{TITULO[p.destino]}</h2>
      {fase.k === "carregando" ? (
        <p className="sutil" role="status">
          Abrindo a versão…
        </p>
      ) : fase.k === "erro" ? (
        <p className="sutil" role="alert">
          {fase.msg}
        </p>
      ) : fase.k === "salvar" ? (
        <div className="cr-enviar__salvar">
          <p>{fase.ultima ? `O rascunho mudou depois da v${fase.ultima.n}.` : "Envio sai de uma versão salva."}</p>
          <div className="acoes">
            <button type="button" className="glass-btn glass-btn--ink" onClick={() => void salvarEContinuar()} disabled={indo}>
              <Icone nome="versoes" size={16} /> Salvar v{(fase.ultima?.n ?? p.versoes[0]?.n ?? 0) + 1} e continuar
            </button>
            {fase.ultima ? (
              <button type="button" className="glass-btn" onClick={() => setFase({ k: "pronto", v: fase.ultima! })} disabled={indo}>
                Usar a v{fase.ultima.n}
              </button>
            ) : null}
          </div>
          {msg ? (
            <p className="sutil" role="alert">
              {msg}
            </p>
          ) : null}
        </div>
      ) : (
        <Pronto
          v={fase.v}
          destino={p.destino}
          roteiroId={p.roteiroId}
          pessoa={pessoa}
          setPessoa={setPessoa}
          compartilhar={podeCompartilhar}
          registrar={registrar}
          tpeasy={!!p.tpeasy}
          anotar={(e) => setEnvios((l) => [e, ...l].slice(0, 5))}
          cliente={{ url: p.url, cards: p.cards, ligar: p.ligar, aoEnviar: p.aoCliente }}
        />
      )}
      {envios.length ? (
        <ul className="cr-enviar__envios" aria-label="Últimos envios">
          {envios.slice(0, 3).map((e, i) => (
            <li key={`${e.em}-${i}`}>
              <Icone nome="check" size={13} /> {NOME_DESTINO[e.destino] ?? e.destino} · {NOME_FORMATO[e.formato] ?? e.formato} · v{e.n} · {quando(e.em)}
            </li>
          ))}
        </ul>
      ) : null}
    </Folha>
  );
}

function Pronto({
  v,
  destino,
  roteiroId,
  pessoa,
  setPessoa,
  compartilhar,
  registrar,
  tpeasy,
  anotar,
  cliente,
}: {
  v: VersaoCompleta;
  destino: DestinoEnvio;
  roteiroId: string;
  pessoa: string | null;
  setPessoa: (p: string | null) => void;
  compartilhar: boolean;
  registrar: (v: VersaoCompleta, formato: FormatoSaida, quem?: string | null, destino?: DestinoEnvio) => void;
  tpeasy: boolean;
  anotar: (e: Envio) => void;
  cliente: { url: string; cards: { id: string; tema: string }[]; ligar: (cardId: string) => Promise<string | null>; aoEnviar: () => void };
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const origem = { roteiroId, titulo: v.titulo, n: v.n, sha256: v.sha256, criadoEm: v.criadoEm, conteudo: v.conteudo };
  const imprimir = (vista: string) => `/app/criacao/roteiros/${roteiroId}/imprimir?vista=${vista}&versao=${v.n}`;
  const selo = (
    <p className="cr-enviar__versao">
      <span className="selo" data-status="rascunho">
        <i aria-hidden="true" />v{v.n}
      </span>
      <span className="sutil">
        salva {diaHora(v.criadoEm)} · {formatarTempo(v.duracaoSeg)}
      </span>
    </p>
  );

  if (destino === "cliente") {
    // O banco anota o envio (`roteiro.enviado`, destino cliente) ao mandar; aqui não há `registrar`.
    return (
      <div className="cr-enviar__corpo">
        {selo}
        <ParaOCliente url={cliente.url} n={v.n} cards={cliente.cards} ligar={cliente.ligar} aoEnviar={cliente.aoEnviar} />
      </div>
    );
  }

  if (destino === "tpeasy") {
    const s = saidaTpeasy(origem, pessoa);
    const vazio = !s.texto;
    const fazer = (formato: FormatoSaida, f: () => void | Promise<void>) => async () => {
      setAviso(null);
      try {
        await f();
        registrar(v, formato, pessoa);
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setAviso("Não deu. Tente Copiar ou Baixar.");
      }
    };
    const outros = (
      <div className="cr-enviar__acoes">
        {compartilhar ? (
          <button
            type="button"
            className="glass-btn glass-btn--ink"
            disabled={vazio}
            onClick={fazer("compartilhar", async () => {
              const arquivo = new File([s.texto], s.arquivoTxt, { type: "text/plain" });
              const comArquivo = typeof navigator.canShare === "function" && navigator.canShare({ files: [arquivo] });
              await navigator.share(comArquivo ? { files: [arquivo], title: s.titulo } : { title: s.titulo, text: s.texto });
            })}
          >
            <Icone nome="compartilhar" size={16} /> Compartilhar
          </button>
        ) : null}
        <button
          type="button"
          className={`glass-btn${compartilhar ? "" : " glass-btn--ink"}`}
          disabled={vazio}
          onClick={fazer("copiar", async () => {
            await navigator.clipboard.writeText(s.texto);
            setAviso("Copiado.");
          })}
        >
          <Icone nome="copiar" size={16} /> Copiar
        </button>
        <button type="button" className="glass-btn" disabled={vazio} onClick={fazer("txt", () => baixar(s.arquivoTxt, s.texto, "text/plain;charset=utf-8"))}>
          <Icone nome="baixar" size={16} /> .txt
        </button>
        <button
          type="button"
          className="glass-btn"
          disabled={vazio}
          title="Restaurar backup no TPeasy atualiza o mesmo roteiro"
          onClick={fazer("backup", () => baixar(s.arquivoBackup, JSON.stringify(s.backup, null, 2), "application/json"))}
        >
          <Icone nome="baixar" size={16} /> Backup do TPeasy
        </button>
      </div>
    );
    const avisoLinha = aviso ? (
      <p className="sutil" role="status">
        {aviso}
      </p>
    ) : null;
    if (tpeasy)
      return (
        <div className="cr-enviar__corpo">
          {selo}
          <p className="cr-enviar__apoio">Vai direto para o TPeasy: só as falas, por pessoa.</p>
          <PreviaTeleprompter roteiro={v.conteudo} pessoa={pessoa} escolher={setPessoa} />
          <DiretoTpeasy url={cliente.url} v={v} roteiroId={roteiroId} pessoa={pessoa} vazio={vazio} anotar={anotar} />
          <details className="cr-enviar__como cr-enviar__outros">
            <summary>Outros jeitos</summary>
            {outros}
            {avisoLinha}
          </details>
        </div>
      );
    return (
      <div className="cr-enviar__corpo">
        {selo}
        <p className="cr-enviar__apoio">Compartilha o texto pronto: só as falas, por pessoa.</p>
        <PreviaTeleprompter roteiro={v.conteudo} pessoa={pessoa} escolher={setPessoa} />
        {outros}
        {avisoLinha}
        <p className="cr-enviar__sem" data-tpeasy="sem">
          <Icone nome="cadeado" size={13} /> Enviar direto pede o TPeasy no plano.
        </p>
        <details className="cr-enviar__como">
          <summary>No TPeasy</summary>
          <p>Novo › Colar texto, ou Importar arquivo com o .txt.</p>
          <p>O backup entra em Ajustes › Restaurar backup e atualiza o mesmo roteiro.</p>
        </details>
      </div>
    );
  }

  if (destino === "edicao") {
    return (
      <div className="cr-enviar__corpo">
        {selo}
        <p className="cr-enviar__apoio">Cenas com o tempo, lettering, áudio e falas, em ordem.</p>
        <div className="cr-enviar__acoes">
          <Link className="glass-btn glass-btn--ink" href={imprimir("edicao")} onClick={() => registrar(v, "pdf")}>
            <Icone nome="imprimir" size={16} /> Abrir o PDF
          </Link>
        </div>
      </div>
    );
  }

  if (destino === "aeon") {
    return (
      <div className="cr-enviar__corpo">
        {selo}
        <p className="cr-enviar__apoio">O roteiro em arquivo (maestro.roteiro/1). Leve junto com o material.</p>
        <div className="cr-enviar__acoes">
          <button
            type="button"
            className="glass-btn glass-btn--ink"
            onClick={() => {
              baixar(arquivoParaEdicao(origem), JSON.stringify(paraRoteiroMaestro(origem), null, 2), "application/json");
              registrar(v, "json");
            }}
          >
            <Icone nome="baixar" size={16} /> Baixar o arquivo
          </button>
          <Link className="glass-btn" href={imprimir("edicao")} onClick={() => registrar(v, "pdf", null, "edicao")}>
            <Icone nome="imprimir" size={16} /> PDF para a edição
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-enviar__corpo">
      {selo}
      <div className="cr-enviar__acoes">
        {(["literario", "tecnico", "teleprompter"] as const).map((x, i) => (
          <Link key={x} className={`glass-btn${i === 0 ? " glass-btn--ink" : ""}`} href={imprimir(x)} onClick={() => registrar(v, x)}>
            {NOME_FORMATO[x]}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** " · Ana" quando foi para outra pessoa; vazio quando foi para você. */
const paraQuem = (e: EnvioTpeasy) => (e.para.eu ? "" : ` · ${e.para.nome.split(" ")[0]}`);

/**
 * Enviar ao TPeasy (F8): para quem (você, ou quem da organização usa o TPeasy), a ação principal e o estado
 * "Enviado ao TPeasy · v3 · agora" (com "Recebido" quando o aparelho contou). A mesma versão de novo é "Reenviar" e
 * não duplica nada lá (o HUB junta pela chave; o TPeasy pelo id).
 */
function DiretoTpeasy({
  url,
  v,
  roteiroId,
  pessoa,
  vazio,
  anotar,
}: {
  url: string;
  v: VersaoCompleta;
  roteiroId: string;
  pessoa: string | null;
  vazio: boolean;
  anotar: (e: Envio) => void;
}) {
  const [estado, setEstado] = useState<EstadoTpeasy | null>(null);
  const [para, setPara] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`${url}?tpeasy=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: EstadoTpeasy) => {
        if (vivo) setEstado(d);
      })
      .catch(() => {
        if (vivo) setEstado({ pode: false, motivo: "A Absolute ZRO não respondeu agora.", destinatarios: [], enviados: [] });
      });
    return () => {
      vivo = false;
    };
  }, [url]);

  if (!estado)
    return (
      <p className="sutil cr-tpd__estado" role="status" aria-busy="true">
        Vendo o TPeasy…
      </p>
    );
  if (!estado.pode)
    return (
      <p className="cr-enviar__sem" data-tpeasy="sem">
        <Icone nome="cadeado" size={13} /> {estado.motivo}
      </p>
    );

  const eu = estado.destinatarios.find((d) => d.eu)?.id ?? null;
  const alvo = para ?? eu;
  const item = idNoTpeasy(roteiroId, pessoa);
  const ultimo = estado.enviados.find((e) => e.item === item && (alvo ? e.para.id === alvo : e.para.eu));
  const mesma = !!ultimo && ultimo.versao === v.n;

  async function enviar() {
    setIndo(true);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "tpeasy", n: v.n, pessoa, para: alvo && alvo !== eu ? alvo : null }),
      });
      const d = (await r.json().catch(() => ({}))) as { envio?: EnvioTpeasy & { situacao: string }; mensagem?: string };
      if (!r.ok || !d.envio) throw new Error(d.mensagem ?? "Não deu para enviar agora.");
      const novo = d.envio;
      setEstado((x) => (x ? { ...x, enviados: [novo, ...x.enviados.filter((e) => e.id !== novo.id)] } : x));
      anotar({ destino: "tpeasy", formato: "direto", n: v.n, pessoa, quem: null, em: new Date().toISOString() });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu para enviar agora.");
    } finally {
      setIndo(false);
    }
  }

  return (
    <div className="cr-tpd">
      {estado.destinatarios.length > 1 ? (
        <div className="cr-chips cr-tpd__para" role="radiogroup" aria-label="Para quem" data-rolagem>
          {estado.destinatarios.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={alvo === d.id} onClick={() => setPara(d.id)}>
              {d.eu ? "Você" : d.nome.split(" ")[0]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="cr-enviar__acoes">
        <button
          type="button"
          className="glass-btn glass-btn--ink"
          disabled={vazio || indo}
          onClick={() => void enviar()}
          title="Aparece em Roteiros quando o TPeasy abrir, marcado Do Maestro"
        >
          <Icone nome="enviar" size={16} /> {indo ? "Enviando…" : mesma ? "Reenviar" : "Enviar ao TPeasy"}
        </button>
      </div>
      {ultimo ? (
        <p className="cr-tpd__estado" role="status" data-recebido={ultimo.recebida_em ? "sim" : "nao"}>
          <Icone nome="check" size={14} />
          <span>
            Enviado ao TPeasy · v{ultimo.versao}
            {paraQuem(ultimo)} · {quando(ultimo.atualizada_em)}
            {ultimo.recebida_em ? <b> · Recebido</b> : null}
          </span>
        </p>
      ) : null}
      {msg ? (
        <p className="sutil" role="alert">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
