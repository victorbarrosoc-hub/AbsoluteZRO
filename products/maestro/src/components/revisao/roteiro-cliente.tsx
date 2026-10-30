"use client";
/**
 * O roteiro no link do cliente (`/a/<token>`, plano da Criação §4.6, fase F7): a vista Literário montada no servidor
 * (`roteiroDoCliente`: nada interno chega aqui), numa coluna que lê bem no iPhone. Tocar num trecho abre o comentário
 * dele (um aberto por vez); o trecho com comentário mostra o número. A decisão (Aprovar / Pedir ajuste) vem de fora, em
 * `abaixo`, igual à do vídeo. Sem animação por quadro: o trecho aberto só ganha fundo e a caixa entra com CSS (parada
 * com "reduzir movimento").
 */
import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { LinhaDoCliente, RoteiroDoCliente } from "@/lib/revisao/roteiro";
import type { ComentarioVisto } from "@/lib/revisao/tipos";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { marcacao } from "@/components/criacao/roteiro/marcacao";
import { Icone } from "@/components/icones";

export type ComentarioDeBloco = { texto: string; bloco: string; idem: string };

const novoIdem = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

const hora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/** Só `<span>` (o trecho mora dentro de um botão: nada de bloco dentro dele). */
function Conteudo({ l }: { l: LinhaDoCliente }) {
  if (l.tipo === "acao") return <span className="cl-rot__acao">{l.texto}</span>;
  if (l.tipo === "fala")
    return (
      <span className="cl-rot__fala">
        <span className="cl-rot__nome">{l.nome}</span>
        {l.obs ? <span className="cl-rot__obs">({l.obs})</span> : null}
        <span className="cl-rot__dito">
          {l.texto.split("\n").map((linha, i) => (
            <span key={i}>
              {i ? <br /> : null}
              {marcacao(linha)}
            </span>
          ))}
        </span>
      </span>
    );
  return (
    <span className="cl-rot__linha">
      <b>{l.rotulo}</b> {l.texto}
    </span>
  );
}

function Comentarios({ lista }: { lista: ComentarioVisto[] }) {
  if (!lista.length) return null;
  return (
    <ul className="cl-rot__comentarios">
      {lista.map((c) => (
        <li key={c.id} data-autor={c.autor} data-resolvido={c.resolvido || undefined}>
          <span className="cl-rot__av" aria-hidden="true">
            {(c.nome ?? (c.autor === "equipe" ? "E" : "C")).slice(0, 1).toUpperCase()}
          </span>
          <span className="cl-rot__corpo">
            <span className="cl-rot__quem">
              <b>{c.nome ?? (c.autor === "equipe" ? "Equipe" : "Cliente")}</b>
              <time dateTime={c.em}>{hora(c.em)}</time>
              {c.resolvido ? <span className="cl-rot__ok">Resolvido</span> : null}
            </span>
            <span className="cl-rot__texto">{c.texto}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Escrever({
  aoEnviar,
  pedirNome,
  aoFechar,
}: {
  aoEnviar: (texto: string) => Promise<string | null>;
  pedirNome?: { valor: string; mudar: (v: string) => void };
  aoFechar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const id = useId();
  async function enviar(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    if (pedirNome && pedirNome.valor.trim().length < 2) return setErro("Escreva seu nome.");
    setIndo(true);
    setErro(null);
    const r = await aoEnviar(t);
    setIndo(false);
    if (r) setErro(r);
    else setTexto("");
  }
  return (
    <form className="cl-rot__escrever" onSubmit={enviar} aria-label="Comentar este trecho">
      {pedirNome ? (
        <label className="cl-campo cl-rot__nomecampo">
          <span>Seu nome</span>
          <input value={pedirNome.valor} onChange={(e) => pedirNome.mudar(e.target.value)} maxLength={80} autoComplete="name" />
        </label>
      ) : null}
      <label className="sr-only" htmlFor={id}>
        Comentário
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={2000}
        value={texto}
        placeholder="O que mudar aqui?"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") aoFechar();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar(e as unknown as FormEvent);
        }}
        autoFocus
      />
      {erro ? (
        <p className="rv-erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="cl-rot__acoes">
        <button type="button" className="glass-btn glass-btn--sm" onClick={aoFechar}>
          Fechar
        </button>
        <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={indo || !texto.trim()}>
          {indo ? "Enviando…" : "Comentar"}
        </button>
      </div>
    </form>
  );
}

export function RoteiroParaAprovar({
  roteiro,
  comentarios,
  podeComentar,
  aoComentar,
  pedirNome,
  abaixo,
}: {
  roteiro: RoteiroDoCliente;
  comentarios: ComentarioVisto[];
  podeComentar: boolean;
  aoComentar: (c: ComentarioDeBloco) => Promise<string | null>;
  pedirNome?: { valor: string; mudar: (v: string) => void };
  abaixo?: ReactNode;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const porBloco = new Map<string, ComentarioVisto[]>();
  for (const c of comentarios) if (c.bloco) porBloco.set(c.bloco, [...(porBloco.get(c.bloco) ?? []), c]);
  const vazio = !roteiro.cenas.some((c) => c.linhas.length);

  return (
    <div className="cl-rot">
      <p className="cl-rot__meta">
        <span className="selo" data-status="enviado">
          <i aria-hidden="true" />
          Roteiro · v{roteiro.n}
        </span>
        <span className="num" title="Duração estimada">
          {formatarTempo(roteiro.duracaoSeg)}
        </span>
        {podeComentar && !vazio ? <span className="cl-rot__dica">Toque num trecho para comentar.</span> : null}
      </p>
      <article className="cl-rot__folha" aria-label={`Roteiro ${roteiro.titulo}`}>
        {vazio ? <p className="rv-vazio">Este roteiro ainda não tem texto.</p> : null}
        {roteiro.cenas.map((c) => (
          <section key={c.numero} className="cl-rot__cena" aria-label={c.cabecalho}>
            <h3>{c.cabecalho}</h3>
            {c.titulo ? <p className="cl-rot__sub">{c.titulo}</p> : null}
            {c.linhas.map((l) => {
              const lista = porBloco.get(l.bloco) ?? [];
              const abrir = aberto === l.bloco;
              const pode = podeComentar || lista.length > 0;
              return (
                <div key={l.bloco} className="cl-rot__bloco" data-tipo={l.tipo} data-aberto={abrir || undefined} data-bloco={l.bloco}>
                  {pode ? (
                    <button
                      type="button"
                      className="cl-rot__alvo"
                      aria-expanded={abrir}
                      aria-label={lista.length ? `${lista.length} comentário${lista.length > 1 ? "s" : ""} neste trecho` : "Comentar este trecho"}
                      onClick={() => setAberto(abrir ? null : l.bloco)}
                    >
                      <Conteudo l={l} />
                      {lista.length ? (
                        <span className="cl-rot__n" aria-hidden="true">
                          <Icone nome="balao" size={12} />
                          {lista.length}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <div className="cl-rot__alvo">
                      <Conteudo l={l} />
                    </div>
                  )}
                  {abrir ? (
                    <div className="cl-rot__caixa">
                      <Comentarios lista={lista} />
                      {podeComentar ? (
                        <Escrever
                          pedirNome={pedirNome}
                          aoFechar={() => setAberto(null)}
                          aoEnviar={(texto) => aoComentar({ texto, bloco: l.bloco, idem: novoIdem() })}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}
      </article>
      {abaixo}
    </div>
  );
}
