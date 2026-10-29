"use client";
/**
 * O navegador do Drive (plano v2 §5, passo B): a experiência da aba Drive do SOBEDESCE em React, sobre o mesmo núcleo
 * (packages/drive-web → src/lib/drive-web). Meu Drive, Compartilhados comigo e Drives compartilhados; migalhas; busca;
 * filtro por tipo; grade ou lista; miniaturas do Google; prévia de vídeo e áudio (stream pelo service worker, com Range),
 * imagem, PDF (prévia do Drive) e o resto com "Abrir no SOBEDESCE". Tudo direto entre o navegador e o Google com o token
 * curto da pessoa; nada é guardado.
 *
 * `modo="escolher"`: o mesmo navegador como seletor ("Escolher no Drive" na versão da revisão), só vídeos.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { bytes, duration, shortDate } from "@/lib/drive-web/format.js";
import { autoView, FILTERS, isFolder, kindOf, SCOPES, sizedThumb, target, type ArquivoDrive, type Filtro, type Lugar } from "@/lib/drive-web/nucleo.js";
import { Icone, type NomeIcone } from "@/components/icones";
import { ErroDrive, listadorDa, pedirToken, urlDeMidia, type ContaDrive } from "./drive-cliente";

export type Pasta = { id: string; name: string; driveId?: string | null };

type Estado = { tipo: "carregando" } | { tipo: "pronto"; itens: ArquivoDrive[]; proxima: string | null } | { tipo: "erro"; erro: string; mensagem: string };

const ICONE: Record<string, NomeIcone> = { folder: "pasta", video: "filme", audio: "musica", image: "imagem", pdf: "documento", gdoc: "documento" };

export function linkSobedesce(base: string, f: { id: string }, pasta: boolean): string {
  return `${base.replace(/\/$/, "")}/app/#${pasta ? "drive" : "arquivo"}/${encodeURIComponent(f.id)}`;
}

function Miniatura({ f, px }: { f: ArquivoDrive; px: number }) {
  const [falhou, setFalhou] = useState(false);
  const k = kindOf(f);
  const src = !falhou && f.thumbnailLink ? sizedThumb(f.thumbnailLink, px) : null;
  return (
    <span className="dv-thumb" data-tipo={k}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFalhou(true)} />
      ) : (
        <Icone nome={ICONE[k] ?? "documento"} size={k === "folder" ? 30 : 26} />
      )}
      {k === "video" && f.videoMediaMetadata?.durationMillis ? <em className="dv-dur">{duration(f.videoMediaMetadata.durationMillis)}</em> : null}
    </span>
  );
}

function Previa({ f, conta, sobedesce, aoFechar, acao }: { f: ArquivoDrive; conta: string; sobedesce: string; aoFechar: () => void; acao?: ReactNode }) {
  const k = kindOf(f);
  const midia = k === "video" || k === "audio" || k === "image";
  const [veio, setVeio] = useState<{ id: string; src: string | null } | null>(null);
  const src = !midia ? null : veio?.id === f.id ? veio.src : undefined;
  const [tempo, setTempo] = useState(0);
  useEffect(() => {
    if (!midia) return;
    let vivo = true;
    void urlDeMidia(f, conta).then((u) => vivo && setVeio({ id: f.id, src: u }));
    return () => {
      vivo = false;
    };
  }, [f, conta, midia]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [aoFechar]);
  const tc = (s: number) => {
    const t = Math.max(0, Math.floor(s));
    return `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  let miolo: ReactNode;
  if (k === "video" && src)
    miolo = (
      <>
        <video className="dv-video" src={src} controls playsInline preload="metadata" onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)} />
        <p className="dv-tc" aria-label="Tempo atual">
          {tc(tempo)}
        </p>
      </>
    );
  else if (k === "audio" && src) miolo = <audio src={src} controls preload="metadata" />;
  else if (k === "image" && src)
    // eslint-disable-next-line @next/next/no-img-element
    miolo = <img className="dv-imagem" src={src} alt={f.name} />;
  else if (k === "pdf")
    miolo = (
      <iframe className="dv-pdf" title={f.name} src={`https://drive.google.com/file/d/${encodeURIComponent(f.id)}/preview`} referrerPolicy="strict-origin" />
    );
  else if (src === undefined) miolo = <div className="dv-carregando" aria-busy="true" />;
  else
    miolo = (
      <div className="dv-sem-previa">
        <Icone nome={ICONE[k] ?? "documento"} size={34} />
        <p>Sem prévia aqui.</p>
      </div>
    );
  // No <body>: o painel de vidro (backdrop-filter) prenderia o position: fixed dentro dele.
  return createPortal(
    <div className="dv-previa" role="dialog" aria-modal="true" aria-label={f.name} onClick={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="dv-previa__caixa">
        <header className="dv-previa__topo">
          <div>
            <h2 title={f.name}>{f.name}</h2>
            <p>
              {[bytes(f.size == null ? null : Number(f.size)), f.modifiedTime ? shortDate(f.modifiedTime) : null].filter((x) => x && x !== "—").join(" · ")}
            </p>
          </div>
          <button type="button" className="glass-btn glass-btn--sm" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" size={16} />
          </button>
        </header>
        <div className="dv-previa__palco">{miolo}</div>
        <footer className="dv-previa__acoes">
          {acao}
          <a className="glass-btn glass-btn--sm" href={linkSobedesce(sobedesce, f, false)} target="_blank" rel="noreferrer noopener">
            <Icone nome="externo" size={15} /> Abrir no SOBEDESCE
          </a>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function NavegadorDrive({
  modo = "navegar",
  sobedesce,
  inicial,
  aoEscolher,
  extraDaPasta,
}: {
  modo?: "navegar" | "escolher";
  /** Origem do app do SOBEDESCE (deep links). */
  sobedesce: string;
  inicial?: Pasta | null;
  aoEscolher?: (f: ArquivoDrive) => void;
  /** Ação ligada à pasta aberta (ex.: "Ligar ao projeto"). */
  extraDaPasta?: (pasta: Pasta | null) => ReactNode;
}) {
  const [contas, setContas] = useState<ContaDrive[]>([]);
  const [conta, setConta] = useState("");
  const [escopo, setEscopo] = useState<Lugar["scope"]>("mine");
  const [trilha, setTrilha] = useState<Pasta[]>(inicial ? [inicial] : []);
  const [busca, setBusca] = useState("");
  const [buscaFeita, setBuscaFeita] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [vista, setVista] = useState<"grid" | "list" | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [aberto, setAberto] = useState<ArquivoDrive | null>(null);
  const [mais, setMais] = useState(false);
  const pedido = useRef(0);
  const pasta = trilha.at(-1) ?? null;
  const listador = useMemo(() => listadorDa(conta), [conta]);

  useEffect(() => {
    let vivo = true;
    pedirToken(conta)
      .then((t) => {
        if (!vivo) return;
        setContas(t.contas);
        if (!conta) setConta(t.conta.id);
      })
      .catch(
        (e: unknown) =>
          vivo &&
          setEstado({ tipo: "erro", erro: e instanceof ErroDrive ? e.erro : "erro", mensagem: e instanceof Error ? e.message : "Não deu para abrir o Drive." }),
      );
    return () => {
      vivo = false;
    };
  }, [conta]);

  const carregar = useCallback(
    async (proxima: string | null = null) => {
      if (!conta) return;
      const n = ++pedido.current;
      if (!proxima) setEstado({ tipo: "carregando" });
      else setMais(true);
      try {
        let itens: ArquivoDrive[];
        let next: string | null;
        if (escopo === "drives" && !pasta && !buscaFeita) {
          itens = await listador.listDrives();
          next = null;
        } else {
          const r = await listador.listPage(
            { scope: escopo, folder: pasta ? { id: pasta.id, name: pasta.name } : null, driveId: pasta?.driveId ?? null, search: buscaFeita },
            { filter: filtro, pageToken: proxima },
          );
          itens = r.files.filter((f) => !String(f.name).startsWith("._") && f.name !== ".DS_Store");
          next = r.next;
        }
        if (n !== pedido.current) return;
        setEstado((e) => ({ tipo: "pronto", itens: proxima && e.tipo === "pronto" ? [...e.itens, ...itens] : itens, proxima: next }));
      } catch (e) {
        if (n !== pedido.current) return;
        setEstado({
          tipo: "erro",
          erro: e instanceof ErroDrive ? e.erro : "drive",
          mensagem: e instanceof Error ? e.message : "O Google Drive não respondeu.",
        });
      } finally {
        if (n === pedido.current) setMais(false);
      }
    },
    [conta, escopo, pasta, buscaFeita, filtro, listador],
  );

  useEffect(() => {
    // Ao trocar de lugar, filtro ou conta: a primeira página de novo (o efeito busca dados externos, não deriva estado).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  const entrar = (f: ArquivoDrive) => {
    const t = target(f);
    setBusca("");
    setBuscaFeita("");
    setTrilha((tr) => [...tr, { id: t.id, name: f.name, driveId: f.isDrive ? f.id : (f.driveId ?? pasta?.driveId ?? null) }]);
  };
  const abrir = (f: ArquivoDrive) => {
    if (isFolder(f) || f.isDrive) return entrar(f);
    if (modo === "escolher" && aoEscolher && kindOf(f) === "video") return aoEscolher(f);
    setAberto(target(f));
  };
  const itens = estado.tipo === "pronto" ? estado.itens.filter((f) => modo !== "escolher" || isFolder(f) || f.isDrive || kindOf(f) === "video") : [];
  const v = vista ?? autoView(itens);
  const nomeEscopo = SCOPES.find((s) => s.id === escopo)?.aria ?? "Meu Drive";
  const semDrive = estado.tipo === "erro" && ["sem_vinculo", "sem_drive", "reconectar_drive"].includes(estado.erro);

  if (estado.tipo === "erro" && estado.erro === "reconectar_zro")
    return (
      <section className="dv-vazio" aria-label="Entrar de novo">
        <span className="dv-vazio__icone">
          <Icone nome="nuvem" size={28} />
        </span>
        <h2>Entre de novo para ver o Drive</h2>
        <p>{estado.mensagem}</p>
        <a className="glass-btn glass-btn--ink" href="/api/zro/entrar?volta=/app/arquivos">
          Entrar com Absolute ZRO
        </a>
      </section>
    );
  if (semDrive)
    return (
      <section className="dv-vazio" aria-label="Drive não conectado">
        <span className="dv-vazio__icone">
          <Icone nome="nuvem" size={28} />
        </span>
        <h2>Conecte o Drive no SOBEDESCE</h2>
        <p>{estado.mensagem}</p>
        <a className="glass-btn glass-btn--ink" href={`${sobedesce.replace(/\/$/, "")}/conta`} target="_blank" rel="noreferrer noopener">
          <Icone nome="externo" size={16} /> Conectar o Drive no SOBEDESCE
        </a>
      </section>
    );

  return (
    <section className="dv" data-modo={modo} aria-label="Google Drive">
      <div className="dv-barra">
        <nav className="pilulas" aria-label="Onde">
          {SCOPES.map((s) => (
            <a
              key={s.id}
              href="#"
              aria-current={escopo === s.id && !trilha.length ? "true" : undefined}
              aria-label={s.aria}
              onClick={(e) => {
                e.preventDefault();
                setEscopo(s.id);
                setTrilha([]);
                setBusca("");
                setBuscaFeita("");
              }}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <form
          className="q-busca dv-busca"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setBuscaFeita(busca.trim());
          }}
        >
          <Icone nome="busca" size={16} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={pasta ? `Buscar em ${pasta.name}` : `Buscar em ${nomeEscopo}`}
            aria-label="Buscar no Drive"
          />
        </form>
        {contas.length > 1 ? (
          <select className="dv-conta" value={conta} onChange={(e) => (setTrilha([]), setConta(e.target.value))} aria-label="Conta Google">
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.email}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="glass-btn glass-btn--sm dv-vista"
          onClick={() => setVista(v === "grid" ? "list" : "grid")}
          aria-label={v === "grid" ? "Ver em lista" : "Ver em grade"}
        >
          <Icone nome={v === "grid" ? "lista" : "grade"} size={16} />
        </button>
      </div>

      <div className="dv-sub">
        <ol className="dv-migalhas" aria-label="Caminho">
          <li>
            <button type="button" onClick={() => setTrilha([])} aria-current={!trilha.length ? "page" : undefined}>
              {nomeEscopo}
            </button>
          </li>
          {trilha.map((p, i) => (
            <li key={`${p.id}-${i}`}>
              <Icone nome="seta" size={12} />
              <button type="button" onClick={() => setTrilha((t) => t.slice(0, i + 1))} aria-current={i === trilha.length - 1 ? "page" : undefined}>
                {p.name}
              </button>
            </li>
          ))}
        </ol>
        {modo === "navegar" ? (
          <div className="dv-filtros" role="group" aria-label="Tipo">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" className="chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
        {extraDaPasta ? <div className="dv-extra">{extraDaPasta(pasta)}</div> : null}
      </div>

      {estado.tipo === "carregando" ? (
        <ul className="dv-grade" aria-busy="true" aria-label="Carregando">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="dv-item dv-item--esqueleto" />
          ))}
        </ul>
      ) : estado.tipo === "erro" ? (
        <section className="dv-vazio" role="alert">
          <span className="dv-vazio__icone">
            <Icone nome="alerta" size={26} />
          </span>
          <h2>Não deu para abrir o Drive</h2>
          <p>{estado.mensagem}</p>
          <button type="button" className="glass-btn" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </section>
      ) : !itens.length ? (
        <section className="dv-vazio">
          <span className="dv-vazio__icone">
            <Icone nome={modo === "escolher" ? "filme" : "pasta"} size={26} />
          </span>
          <h2>{buscaFeita ? "Nada com esse nome" : modo === "escolher" ? "Nenhum vídeo aqui" : "Pasta vazia"}</h2>
        </section>
      ) : (
        <ul className={v === "grid" ? "dv-grade" : "dv-lista"}>
          {itens.map((f) => {
            const pastaItem = isFolder(f) || !!f.isDrive;
            return (
              <li key={f.id} className="dv-item" data-tipo={kindOf(f)}>
                <button type="button" className="dv-item__botao" onClick={() => abrir(f)} title={f.name}>
                  <Miniatura f={f} px={v === "grid" ? 360 : 96} />
                  <span className="dv-item__texto">
                    <strong>{f.name}</strong>
                    <small>
                      {pastaItem
                        ? f.isDrive
                          ? "Drive compartilhado"
                          : "Pasta"
                        : [bytes(f.size == null ? null : Number(f.size)), f.modifiedTime ? shortDate(f.modifiedTime) : null]
                            .filter((x) => x && x !== "—")
                            .join(" · ")}
                    </small>
                  </span>
                </button>
                {modo === "escolher" && !pastaItem ? <span className="dv-item__escolher">Escolher</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      {estado.tipo === "pronto" && estado.proxima ? (
        <div className="dv-mais">
          <button type="button" className="glass-btn" disabled={mais} onClick={() => void carregar(estado.proxima)}>
            {mais ? "Carregando…" : "Carregar mais"}
          </button>
        </div>
      ) : null}
      {aberto ? <Previa f={aberto} conta={conta} sobedesce={sobedesce} aoFechar={() => setAberto(null)} /> : null}
    </section>
  );
}
