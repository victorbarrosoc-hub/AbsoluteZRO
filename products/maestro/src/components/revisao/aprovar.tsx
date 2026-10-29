"use client";
/**
 * A tela do cliente (`/a/<token>`, plano v2 §4.3): o que aprovar no topo, numerado e com o estado; o player grande com
 * comentário no tempo e pino; "Antes | Agora" quando há versão nova; "Aprovar esta" e "Pedir ajuste nesta" com o mesmo
 * peso, e a próxima abre sozinha; "Revisar e enviar" com o resumo, o nome e o aceite; o selo do aprovado (o "acorde",
 * só CSS, parado com "reduzir movimento"). O rascunho fica no aparelho (por link, peça e volta), sem nada que identifique
 * o lote. Nada de e-mail, conta ou dado da produtora além do nome.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import type { LoteDoCliente, PecaVista } from "@/lib/revisao/link";
import type { ComentarioVisto, VersaoVista } from "@/lib/revisao/tipos";
import { Icone } from "@/components/icones";
import { MaestroSimbolo, ZroSimbolo } from "@/components/marca";
import { CabecaMarca, estiloDaMarca, type MarcaDaPagina } from "@/components/publico/comum";
import { Revisor, type NovoComentario } from "./revisor";

type Escolha = { decisao: "aprovado" | "ajuste"; nota: string };
type Rascunho = { nome: string; escolhas: Record<string, Escolha> };

function lerRascunho(chave: string): Rascunho {
  try {
    const v = JSON.parse(localStorage.getItem(`mae:apr:${chave}`) ?? "null") as Rascunho | null;
    if (v && typeof v === "object" && typeof v.nome === "string" && v.escolhas && typeof v.escolhas === "object") return v;
  } catch {
    // sem armazenamento (aba anônima, bloqueio): segue sem rascunho
  }
  return { nome: "", escolhas: {} };
}

function guardarRascunho(chave: string, r: Rascunho) {
  try {
    localStorage.setItem(`mae:apr:${chave}`, JSON.stringify(r));
  } catch {
    // idem
  }
}

const chaveEscolha = (p: PecaVista) => `${p.card}:${p.volta}`;
const decidida = (p: PecaVista) => (p.decisao && p.decisao.volta === p.volta ? p.decisao : null);

function Rodape({ propria = false }: { propria?: boolean }) {
  if (propria)
    return (
      <footer className="cl-rodape cl-rodape--propria">
        <ZroSimbolo size={14} /> <span>Powered by Absolute ZRO</span>
      </footer>
    );
  return (
    <footer className="cl-rodape">
      <span>com</span> <MaestroSimbolo width={22} /> <b>Maestro</b> <span aria-hidden="true">·</span>
      <ZroSimbolo size={16} /> <span>Absolute ZRO</span>
    </footer>
  );
}

/** Link desconhecido, revogado, vencido ou fechado: a mesma tela, sem dizer de quem é. */
export function LinkNeutro({ limite = false }: { limite?: boolean }) {
  return (
    <main className="cl cl--neutro" id="conteudo">
      <section className="cl-neutro">
        <MaestroSimbolo width={120} />
        <h1>{limite ? "Muitas tentativas." : "Este link não está mais ativo."}</h1>
        <p>{limite ? "Espere alguns minutos e abra de novo." : "Peça um link novo a quem enviou."}</p>
      </section>
      <Rodape />
    </main>
  );
}

export function PedirPin({ token }: { token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIndo(true);
    setErro(null);
    try {
      const r = await fetch("/api/link/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, pin }) });
      if (r.ok) return router.refresh();
      const j = (await r.json().catch(() => ({}))) as { mensagem?: string };
      setErro(j.mensagem ?? "Não deu certo.");
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setIndo(false);
    }
  }
  return (
    <main className="cl cl--neutro" id="conteudo">
      <form className="cl-neutro cl-pin" onSubmit={enviar} aria-label="PIN">
        <span className="cl-pin__icone">
          <Icone nome="cadeado" size={26} />
        </span>
        <h1>Digite o PIN.</h1>
        <p>Quem enviou o link mandou o PIN à parte.</p>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{4,8}"
          maxLength={8}
          aria-label="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
        {erro ? (
          <p className="rv-erro" role="alert">
            {erro}
          </p>
        ) : null}
        <button type="submit" className="glass-btn glass-btn--ink" disabled={indo || pin.length < 4}>
          {indo ? "Conferindo…" : "Abrir"}
        </button>
      </form>
      <Rodape />
    </main>
  );
}

/** O acorde do aprovado: o anel se desenha e a centelha pisca uma vez (600 ms, só CSS). */
export function SeloAprovado({ tamanho = 120 }: { tamanho?: number }) {
  return (
    <svg className="cl-selo" viewBox="0 0 120 120" width={tamanho} height={tamanho} aria-hidden="true">
      <circle className="cl-selo__fundo" cx="60" cy="60" r="46" />
      <circle className="cl-selo__anel" cx="60" cy="60" r="46" pathLength="100" />
      <path className="cl-selo__check" d="M41 61.5 54 74l26-28" pathLength="100" />
      <path className="cl-selo__centelha" d="M98 14c.9 6.4 3 7.7 13 8.6-10 .9-12.1 2.2-13 8.6-.9-6.4-3-7.7-13-8.6 10-.9 12.1-2.2 13-8.6Z" />
    </svg>
  );
}

function Progresso({ feitas, total }: { feitas: number; total: number }) {
  return (
    <span className="cl-progresso" style={{ "--p": total ? feitas / total : 0 } as CSSProperties} aria-label={`${feitas} de ${total} decididas`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" pathLength="100" className="ap-anel__fundo" />
        <circle cx="18" cy="18" r="15" pathLength="100" className="ap-anel__feito" />
      </svg>
      <span>
        {feitas} de {total}
      </span>
    </span>
  );
}

export function AprovacaoCliente({
  token,
  dados,
  chave,
  marca = null,
}: {
  token: string;
  dados: LoteDoCliente;
  chave: string;
  /** A marca da produtora (Ajustes → Marca): logo no topo e a cor como acento. */
  marca?: MarcaDaPagina | null;
}) {
  const router = useRouter();
  const [pecas, setPecas] = useState(dados.pecas);
  const [idx, setIdx] = useState(() =>
    Math.max(
      0,
      dados.pecas.findIndex((p) => !decidida(p)),
    ),
  );
  const [rasc, setRasc] = useState<Rascunho>({ nome: "", escolhas: {} });
  const [tela, setTela] = useState<"pecas" | "resumo" | "enviado">("pecas");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // O servidor manda: a página recarregada (router.refresh) traz o estado novo (ajuste durante o render).
  const [vistas, setVistas] = useState(dados.pecas);
  if (vistas !== dados.pecas) {
    setVistas(dados.pecas);
    setPecas(dados.pecas);
  }
  // O rascunho mora no aparelho: lido depois de montar (o servidor não tem localStorage).
  useEffect(() => {
    const r = lerRascunho(chave);
    if (r.nome || Object.keys(r.escolhas).length) queueMicrotask(() => setRasc(r));
  }, [chave]);
  const mudarRasc = useCallback(
    (f: (r: Rascunho) => Rascunho) =>
      setRasc((r) => {
        const n = f(r);
        guardarRascunho(chave, n);
        return n;
      }),
    [chave],
  );

  const peca = pecas[idx] ?? pecas[0];
  const pendentes = useMemo(() => pecas.filter((p) => !decidida(p) && rasc.escolhas[chaveEscolha(p)]), [pecas, rasc]);
  const feitas = pecas.filter((p) => decidida(p)).length;
  const escolha = peca ? rasc.escolhas[chaveEscolha(peca)] : undefined;
  const jaDecidida = peca ? decidida(peca) : null;

  const notaAberta = escolha?.decisao === "ajuste";

  const aoComentar = useCallback(
    async (v: VersaoVista, c: NovoComentario): Promise<string | null> => {
      if (!peca) return "Escolha a peça.";
      try {
        const r = await fetch("/api/link/comentar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, card: peca.card, versao: v.id, ...c, nome: rasc.nome }),
        });
        const j = (await r.json().catch(() => ({}))) as { comentario?: ComentarioVisto; mensagem?: string };
        if (!r.ok || !j.comentario) return j.mensagem ?? "Não deu para comentar.";
        const novo = j.comentario;
        setPecas((ps) =>
          ps.map((p) =>
            p.card !== peca.card
              ? p
              : {
                  ...p,
                  versoes: p.versoes.map((x) =>
                    x.id === v.id && !x.comentarios.some((k) => k.id === novo.id) ? { ...x, comentarios: [...x.comentarios, novo] } : x,
                  ),
                },
          ),
        );
        return null;
      } catch {
        return "Sem conexão. Tente de novo.";
      }
    },
    [peca, token, rasc.nome],
  );

  function escolher(d: "aprovado" | "ajuste") {
    if (!peca) return;
    const k = chaveEscolha(peca);
    mudarRasc((r) => ({ ...r, escolhas: { ...r.escolhas, [k]: { decisao: d, nota: r.escolhas[k]?.nota ?? "" } } }));
    if (d === "aprovado") {
      // A próxima peça sem decisão abre sozinha.
      const prox = pecas.findIndex((p, i) => i > idx && !decidida(p) && !rasc.escolhas[chaveEscolha(p)]);
      if (prox >= 0) window.setTimeout(() => setIdx(prox), 380);
    }
  }

  const decisao = peca ? (
    jaDecidida ? (
      <div className="cl-decidida" data-decisao={jaDecidida.decisao}>
        {jaDecidida.decisao === "aprovado" ? <SeloAprovado tamanho={44} /> : <Icone nome="editar" size={22} />}
        <span>
          <b>{jaDecidida.decisao === "aprovado" ? "Aprovada" : "Ajuste pedido"}</b>
          {jaDecidida.nome ? ` por ${jaDecidida.nome}` : ""}
          {jaDecidida.nota ? <small>“{jaDecidida.nota}”</small> : null}
        </span>
      </div>
    ) : (
      <div className="cl-decidir">
        <div className="cl-decidir__botoes" role="radiogroup" aria-label="Sua decisão sobre esta peça">
          <button
            type="button"
            role="radio"
            aria-checked={escolha?.decisao === "aprovado"}
            className="cl-escolha"
            data-tipo="aprovado"
            onClick={() => escolher("aprovado")}
          >
            <Icone nome="check" size={18} /> Aprovar esta
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={escolha?.decisao === "ajuste"}
            className="cl-escolha"
            data-tipo="ajuste"
            onClick={() => escolher("ajuste")}
          >
            <Icone nome="editar" size={18} /> Pedir ajuste nesta
          </button>
        </div>
        {notaAberta ? (
          <label className="cl-campo">
            <span>O que ajustar? {peca.versoes.length ? "(ou comente no vídeo)" : ""}</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={escolha?.nota ?? ""}
              onChange={(e) => {
                const k = chaveEscolha(peca);
                mudarRasc((r) => ({ ...r, escolhas: { ...r.escolhas, [k]: { decisao: "ajuste", nota: e.target.value } } }));
              }}
            />
          </label>
        ) : null}
      </div>
    )
  ) : null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (rasc.nome.trim().length < 2) return setErro("Escreva seu nome.");
    if (!aceite) return setErro("Marque o aceite para enviar.");
    setEnviando(true);
    try {
      const r = await fetch("/api/link/enviar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          nome: rasc.nome,
          aceite: true,
          decisoes: pendentes.map((p) => ({
            card: p.card,
            versao: p.versoes[0]?.id ?? null,
            decisao: rasc.escolhas[chaveEscolha(p)].decisao,
            nota: rasc.escolhas[chaveEscolha(p)].nota.trim() || null,
          })),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { mensagem?: string; card?: string };
      if (!r.ok) {
        setErro(j.mensagem ?? "Não deu para enviar.");
        if (j.card) {
          const i = pecas.findIndex((p) => p.card === j.card);
          if (i >= 0) setIdx(i);
        }
        if (r.status === 409) router.refresh();
        return;
      }
      mudarRasc((x) => ({ nome: x.nome, escolhas: {} }));
      setTela("enviado");
      router.refresh();
    } catch {
      setErro("Sem conexão. Suas escolhas ficaram guardadas neste aparelho.");
    } finally {
      setEnviando(false);
    }
  }

  const cabeca = (
    <header className="cl-topo">
      <div className="cl-topo__miolo">
        {marca?.logo ? <CabecaMarca marca={marca} /> : <span className="cl-topo__produtora">{dados.produtora}</span>}
        <h1 className="cl-topo__titulo">{dados.lote.titulo}</h1>
      </div>
      <Progresso feitas={feitas} total={pecas.length} />
    </header>
  );

  if (tela === "enviado") {
    const aprovadas = pecas.filter((p) => decidida(p)?.decisao === "aprovado").length;
    return (
      <main className="cl" id="conteudo" style={estiloDaMarca(marca?.cor)}>
        {cabeca}
        <section className="cl-fim" aria-live="polite">
          <SeloAprovado />
          <h2>Enviado.</h2>
          <p>
            A {dados.produtora} já recebeu{aprovadas ? `: ${aprovadas} aprovada${aprovadas > 1 ? "s" : ""}` : ""}.
          </p>
          <button type="button" className="glass-btn" onClick={() => setTela("pecas")}>
            Ver as peças
          </button>
        </section>
        <Rodape propria={!!marca?.propria} />
      </main>
    );
  }

  if (tela === "resumo") {
    return (
      <main className="cl" id="conteudo" style={estiloDaMarca(marca?.cor)}>
        {cabeca}
        <form className="cl-resumo" onSubmit={enviar} aria-label="Revisar e enviar">
          <h2>
            Revisar e <strong>enviar.</strong>
          </h2>
          <ul className="cl-resumo__lista">
            {pendentes.map((p) => {
              const e = rasc.escolhas[chaveEscolha(p)];
              return (
                <li key={p.card} data-decisao={e.decisao}>
                  <span className="cl-resumo__marca" aria-hidden="true">
                    <Icone nome={e.decisao === "aprovado" ? "check" : "editar"} size={16} />
                  </span>
                  <span className="cl-resumo__miolo">
                    <b>{p.titulo}</b>
                    <small>
                      {e.decisao === "aprovado" ? "Aprovar" : "Pedir ajuste"}
                      {e.nota.trim() ? ` · “${e.nota.trim()}”` : ""}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="cl-resumo__mudar"
                    onClick={() => {
                      setIdx(pecas.indexOf(p));
                      setTela("pecas");
                    }}
                  >
                    Mudar
                  </button>
                </li>
              );
            })}
          </ul>
          <label className="cl-campo">
            <span>Seu nome</span>
            <input value={rasc.nome} onChange={(e) => mudarRasc((r) => ({ ...r, nome: e.target.value }))} maxLength={80} autoComplete="name" required />
          </label>
          <label className="cl-termo">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>
              Revisei as peças acima. Esta decisão vale como resposta formal à {dados.produtora}, com meu nome, a data e o registro do que foi decidido.
            </span>
          </label>
          {erro ? (
            <p className="rv-erro" role="alert">
              {erro}
            </p>
          ) : null}
          <div className="cl-resumo__acoes">
            <button type="button" className="glass-btn" onClick={() => setTela("pecas")}>
              Voltar
            </button>
            <button type="submit" className="glass-btn glass-btn--ink" disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
        <Rodape propria={!!marca?.propria} />
      </main>
    );
  }

  return (
    <main className="cl" id="conteudo" style={estiloDaMarca(marca?.cor)}>
      {cabeca}
      <nav className="cl-pecas" aria-label="O que aprovar" data-rolagem>
        {pecas.map((p, i) => {
          const d = decidida(p);
          const e = rasc.escolhas[chaveEscolha(p)];
          const estado = d ? d.decisao : e ? `rascunho-${e.decisao}` : "falta";
          return (
            <button key={p.card} type="button" className="cl-peca" data-estado={estado} aria-current={i === idx ? "true" : undefined} onClick={() => setIdx(i)}>
              <span className="cl-peca__n">{d || e ? <Icone nome={(d ?? e)!.decisao === "aprovado" ? "check" : "editar"} size={13} /> : i + 1}</span>
              <span className="cl-peca__nome">{p.titulo}</span>
            </button>
          );
        })}
      </nav>

      {peca ? (
        <section className="cl-peca-atual" aria-label={peca.titulo} key={peca.card}>
          <header className="cl-peca-atual__cabeca">
            <h2>{peca.titulo}</h2>
            {peca.versoes.length > 1 ? <span className="selo">Versão nova</span> : null}
          </header>
          {peca.versoes.length ? (
            <Revisor
              versoes={peca.versoes}
              modo="cliente"
              podeComentar={!jaDecidida}
              aoComentar={aoComentar}
              abaixo={decisao}
              pedirNome={rasc.nome.trim().length >= 2 ? undefined : { valor: rasc.nome, mudar: (v) => mudarRasc((r) => ({ ...r, nome: v })) }}
            />
          ) : (
            <div className="cl-texto">
              <p>{peca.titulo}</p>
              <small>Sem vídeo: decida por esta peça como ela está no texto.</small>
            </div>
          )}
          {peca.versoes.length ? null : decisao}
        </section>
      ) : (
        <p className="rv-vazio">Nada para aprovar neste link.</p>
      )}

      {pendentes.length ? (
        <div className="cl-barra">
          <button
            type="button"
            className="glass-btn glass-btn--ink"
            onClick={() => {
              setErro(null);
              setTela("resumo");
            }}
          >
            Revisar e enviar <span className="cl-barra__n">{pendentes.length}</span>
          </button>
        </div>
      ) : feitas === pecas.length && pecas.length ? (
        <div className="cl-tudo">
          <SeloAprovado tamanho={36} /> Tudo decidido. Obrigado!
        </div>
      ) : null}
      <Rodape propria={!!marca?.propria} />
    </main>
  );
}
