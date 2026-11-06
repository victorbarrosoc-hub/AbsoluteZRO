"use client";
/**
 * O link "Ver e comentar" do Fluxo (titular, 04/11/2026; drizzle/0039): a Lista de sempre e, em cada item, "Comentar"
 * com os comentários daquele nó; embaixo, os do fluxo todo. Quem abre escreve **só o nome** (decisão do titular: "Só o
 * nome, não precisa do cadastro"), que fica no aparelho (localStorage, quando dá) para a próxima vez. O servidor limpa
 * nome e texto, confere o limite por link e IP e a permissão do link; revogado ou vencido, nada entra.
 */
import { useId, useState, useSyncExternalStore } from "react";
import { LIMITE_NOME_COMENTARIO, LIMITE_TEXTO_COMENTARIO, type ComentarioDoLink } from "@/lib/criacao/fluxo/compartilhar";
import type { LigacaoFluxo, NoFluxo, RefResolvida } from "@/lib/criacao/fluxo/modelo";
import { Icone } from "@/components/icones";
import { ListaFluxo } from "./lista";

const CHAVE_NOME = "maestro.fluxo.nome";
const lerNome = () => {
  try {
    return localStorage.getItem(CHAVE_NOME) ?? "";
  } catch {
    return "";
  }
};
const guardarNome = (n: string) => {
  try {
    localStorage.setItem(CHAVE_NOME, n);
  } catch {
    // sem storage: pede o nome de novo da próxima vez
  }
};
const semAviso = () => () => {};
const idem = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, "");

const QUANDO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Comentarios({ lista }: { lista: ComentarioDoLink[] }) {
  if (!lista.length) return null;
  return (
    <ul className="fxc-lista">
      {lista.map((c) => (
        <li key={c.id}>
          <span className="fxc-avatar" aria-hidden="true">
            {c.nome.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="fxc-quem">
              <b>{c.nome}</b> <time dateTime={c.em}>{QUANDO.format(new Date(c.em))}</time>
            </p>
            <p className="fxc-texto">{c.texto}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Escrever({
  token,
  no,
  nome,
  setNome,
  aoComentar,
  aoFechar,
  rotulo,
}: {
  token: string;
  no: string | null;
  nome: string;
  setNome: (n: string) => void;
  aoComentar: (c: ComentarioDoLink) => void;
  aoFechar?: () => void;
  rotulo: string;
}) {
  const base = useId();
  const [texto, setTexto] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [rascunhoNome, setRascunhoNome] = useState("");
  // sem nome guardado, o campo do nome aparece; com ele, "Como <nome> · Trocar"
  const pedirNome = trocando || !nome;
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const nomeUsado = (pedirNome ? rascunhoNome : nome).trim();
  return (
    <form
      className="fxc-escrever"
      aria-label={rotulo}
      onSubmit={async (e) => {
        e.preventDefault();
        if (indo) return;
        if (!nomeUsado) return setErro("Escreva seu nome.");
        if (!texto.trim()) return setErro("Escreva o comentário.");
        setIndo(true);
        setErro(null);
        try {
          const r = await fetch(`/f/${token}/comentar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome: nomeUsado, texto, no, idem: idem() }),
          });
          const c = (await r.json().catch(() => ({}))) as { comentario?: ComentarioDoLink; mensagem?: string };
          if (!r.ok || !c.comentario) return setErro(c.mensagem ?? "Não deu para comentar.");
          guardarNome(c.comentario.nome);
          setNome(c.comentario.nome);
          setTrocando(false);
          setTexto("");
          aoComentar(c.comentario);
        } catch {
          setErro("Sem conexão. Tente de novo.");
        } finally {
          setIndo(false);
        }
      }}
    >
      {pedirNome ? (
        <label className="fxc-nome">
          <span className="sr-only">Seu nome</span>
          <input
            id={`${base}-nome`}
            autoComplete="name"
            placeholder="Seu nome"
            maxLength={LIMITE_NOME_COMENTARIO}
            value={rascunhoNome}
            onChange={(e) => setRascunhoNome(e.currentTarget.value)}
          />
        </label>
      ) : (
        <p className="fxc-como">
          Como <b>{nome}</b>
          <button type="button" onClick={() => (setRascunhoNome(nome), setTrocando(true))}>
            Trocar
          </button>
        </p>
      )}
      <label className="fxc-campo">
        <span className="sr-only">Comentário</span>
        <textarea
          rows={2}
          placeholder="Escreva um comentário"
          maxLength={LIMITE_TEXTO_COMENTARIO}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          }}
        />
      </label>
      {erro ? (
        <p className="fxc-erro" role="alert">
          {erro}
        </p>
      ) : null}
      <div className="fxc-acoes">
        {aoFechar ? (
          <button type="button" className="glass-btn glass-btn--sm" onClick={aoFechar}>
            Fechar
          </button>
        ) : null}
        <button type="submit" className="glass-btn glass-btn--sm glass-btn--ink" disabled={indo || !texto.trim() || !nomeUsado}>
          {indo ? "Enviando…" : "Comentar"}
        </button>
      </div>
    </form>
  );
}

export function FluxoComComentarios({
  token,
  titulo,
  nos,
  ligacoes,
  refs,
  comentarios,
}: {
  token: string;
  titulo: string;
  nos: NoFluxo[];
  ligacoes: LigacaoFluxo[];
  refs: Record<string, RefResolvida>;
  comentarios: ComentarioDoLink[];
}) {
  const [lista, setLista] = useState(comentarios);
  // o nome guardado no aparelho só existe no navegador (o servidor desenha sem nome); o que a pessoa usou agora vale mais
  const guardado = useSyncExternalStore(semAviso, lerNome, () => "");
  const [usado, setNome] = useState<string | null>(null);
  const nome = usado ?? guardado;
  const [aberto, setAberto] = useState<string | null>(null);
  const vivos = new Set(nos.map((n) => n.id));
  const doNo = (id: string) => lista.filter((c) => c.no === id);
  const gerais = lista.filter((c) => !c.no || !vivos.has(c.no));
  const somar = (c: ComentarioDoLink) => setLista((l) => (l.some((x) => x.id === c.id) ? l : [...l, c]));
  return (
    <>
      <ListaFluxo
        titulo={titulo}
        nos={nos}
        ligacoes={ligacoes}
        refs={refs}
        publico
        className="fx-lista--publica"
        depoisDoItem={(n) => {
          if (n.tipo === "secao") return null;
          const daqui = doNo(n.id);
          const abertoAqui = aberto === n.id;
          return (
            <li className="fxc-no" data-no={n.id}>
              {daqui.length ? <Comentarios lista={daqui} /> : null}
              {abertoAqui ? (
                <Escrever
                  token={token}
                  no={n.id}
                  nome={nome}
                  setNome={setNome}
                  aoComentar={somar}
                  aoFechar={() => setAberto(null)}
                  rotulo="Comentar este item"
                />
              ) : (
                <button
                  type="button"
                  className="fxc-abrir"
                  onClick={() => setAberto(n.id)}
                  aria-label={daqui.length ? `Comentar (${daqui.length})` : "Comentar"}
                >
                  <Icone nome="balao" size={14} />
                  {daqui.length ? daqui.length : "Comentar"}
                </button>
              )}
            </li>
          );
        }}
      />
      <section className="fxc-geral nao-imprime" aria-label="Comentários do fluxo">
        <h2>Comentários</h2>
        <Comentarios lista={gerais} />
        <Escrever token={token} no={null} nome={nome} setNome={setNome} aoComentar={somar} rotulo="Comentar o fluxo" />
      </section>
    </>
  );
}
