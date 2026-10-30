"use client";
/**
 * Um bloco do roteiro em edição (Literário e Técnico usam o mesmo): o texto principal num campo que cresce com o texto e,
 * em cima, os controles do tipo (quem fala e o modo, a sigla do plano, o estilo do lettering, o tipo do áudio, o tempo).
 * Campos opcionais vazios só aparecem com o foco no bloco (pouco texto na tela).
 *
 * Teclado (como no Final Draft e no Notion): Enter cria o bloco seguinte (fala depois de fala troca de pessoa), ⇧Enter
 * quebra a linha, Tab/⇧Tab percorre os tipos, "/" no bloco vazio abre o menu de tipos, ⌘1–6 escolhe o tipo, "@" na
 * fala vazia escolhe a pessoa, ⌘⇧Enter abre cena nova, ⌥↑/⌥↓ move o bloco, ⌫ no bloco vazio apaga, ↑/↓ nas pontas
 * passam de bloco.
 */
import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  apagarBloco,
  cenaDoBloco,
  inserirDepois,
  lerTempo,
  moverBloco,
  mudarBloco,
  novaCena,
  novaPessoa,
  tipoVizinho,
  trocarTipo,
} from "@/lib/criacao/roteiro/editar";
import {
  type Bloco,
  ESTILOS_LETTERING,
  MODOS_FALA,
  NOME_ESTILO_LETTERING,
  NOME_MODO_FALA,
  NOME_PAPEL_PESSOA,
  NOME_TIPO_AUDIO,
  NOME_TIPO_BLOCO,
  type Pessoa,
  SIGLA_TAMANHO_PLANO,
  NOME_TAMANHO_PLANO,
  TAMANHOS_PLANO,
  TIPOS_AUDIO,
  TIPOS_BLOCO,
  type TipoBloco,
  textoDoBloco,
} from "@/lib/criacao/roteiro/modelo";
import { formatarTempo } from "@/lib/criacao/roteiro/tempo";
import { Icone } from "@/components/icones";
import { ComentariosDoBloco } from "./cliente";
import { ICONE_TIPO, useEditor } from "./contexto";

const DICA: Record<TipoBloco, string> = {
  fala: "O que se fala",
  acao: "O que se vê",
  plano: "Detalhe do plano",
  lettering: "Texto na tela",
  audio: "Trilha, efeito ou som",
  observacao: "Para a captação",
  nota: "Só a equipe vê",
};

const mac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const atalho = (i: number) => `${mac() ? "⌘" : "Ctrl "}${i + 1}`;

export const nomeDaPessoa = (p: Pessoa) => p.nome.trim() || NOME_PAPEL_PESSOA[p.papel];

/** Campo de texto que cresce com o conteúdo (CSS `field-sizing` onde existe; senão a altura pelo scrollHeight). */
function ajustar(el: HTMLTextAreaElement | null) {
  if (!el || (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content"))) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Os campos em ordem de tela (↑/↓ nas pontas do texto). */
function vizinho(el: HTMLElement, passo: 1 | -1): HTMLTextAreaElement | null {
  const todos = [...document.querySelectorAll<HTMLTextAreaElement>("textarea[data-campo]")].filter((x) => x.offsetParent !== null);
  const i = todos.indexOf(el as HTMLTextAreaElement);
  return todos[i + passo] ?? null;
}

type ItemMenu = { k: string; nome: string; dica?: string; icone?: (typeof ICONE_TIPO)[TipoBloco] };

/** Tempo digitado do bloco ("0:05"): aceita 5, 0:05, 1m30. */
export function CampoTempo({
  valor,
  mudar,
  editavel,
  placeholder = "tempo",
  rotulo = "Tempo (segundos ou m:ss)",
}: {
  valor?: number;
  mudar: (s: number | undefined) => void;
  editavel: boolean;
  placeholder?: string;
  rotulo?: string;
}) {
  const [texto, setTexto] = useState(valor ? formatarTempo(valor) : "");
  const [visto, setVisto] = useState(valor);
  if (visto !== valor) {
    setVisto(valor);
    setTexto(valor ? formatarTempo(valor) : "");
  }
  return (
    <input
      className="cr-tempo cr-opcional"
      value={texto}
      placeholder={placeholder}
      inputMode="numeric"
      aria-label={rotulo}
      readOnly={!editavel}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const s = lerTempo(texto);
        mudar(s ?? undefined);
        setTexto(s ? formatarTempo(s) : "");
      }}
    />
  );
}

function Selecao<T extends string>({
  valor,
  opcoes,
  rotulo,
  mudar,
  editavel,
  classe = "",
  vazio,
}: {
  valor: T | "";
  opcoes: readonly { k: T; nome: string; titulo?: string }[];
  rotulo: string;
  mudar: (v: T | "") => void;
  editavel: boolean;
  classe?: string;
  vazio?: string;
}) {
  return (
    <select
      className={`cr-sel ${classe}`.trim()}
      value={valor}
      aria-label={rotulo}
      disabled={!editavel}
      data-vazio={valor === "" || undefined}
      data-valor={valor || undefined}
      onChange={(e) => mudar(e.target.value as T | "")}
    >
      {vazio !== undefined ? <option value="">{vazio}</option> : null}
      {opcoes.map((o) => (
        <option key={o.k} value={o.k} title={o.titulo}>
          {o.nome}
        </option>
      ))}
    </select>
  );
}

const lista = <T extends string>(ks: readonly T[], nomes: Record<T, string>) => ks.map((k) => ({ k, nome: nomes[k] }));

export const CampoBloco = memo(function CampoBloco({
  bloco: b,
  variante,
  antes,
}: {
  bloco: Bloco;
  variante: "literario" | "tecnico";
  /** A alça de arrastar (iPhone). */
  antes?: ReactNode;
}) {
  const { ops, pessoas, editavel } = useEditor();
  const [menu, setMenu] = useState<null | "tipo" | "pessoa">(null);
  const [sel, setSel] = useState(0);
  const [nova, setNova] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const texto = textoDoBloco(b);
  const set = (campos: Record<string, unknown>) => ops.mudar((r) => mudarBloco(r, b.id, campos));

  useLayoutEffect(() => ajustar(area.current), [texto, variante]);

  const itens: ItemMenu[] =
    menu === "tipo"
      ? TIPOS_BLOCO.map((t, i) => ({ k: t, nome: NOME_TIPO_BLOCO[t], dica: i < 6 ? atalho(i) : "Tab", icone: ICONE_TIPO[t] }))
      : menu === "pessoa"
        ? [...pessoas.map((p) => ({ k: p.id, nome: nomeDaPessoa(p) })), { k: "", nome: "Sem pessoa" }]
        : [];

  const abrir = (m: "tipo" | "pessoa") => {
    setMenu(m);
    setSel(m === "tipo" ? Math.max(0, TIPOS_BLOCO.indexOf(b.tipo)) : 0);
  };
  const escolher = (i: number) => {
    const it = itens[i];
    if (!it) return;
    if (menu === "tipo") ops.mudar((r) => trocarTipo(r, b.id, it.k as TipoBloco), { id: b.id, onde: "fim" });
    else {
      set({ quem: it.k || null });
      ops.focar({ id: b.id, onde: "fim" });
    }
    setMenu(null);
  };

  function tecla(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!editavel) return;
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;
    if (menu) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => (s + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length);
        return;
      }
      if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        escolher(sel);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenu(null);
        return;
      }
      setMenu(null);
    }
    if (e.key === "Enter" && mod && e.shiftKey) {
      e.preventDefault();
      let novo = "";
      ops.mudar((r) => {
        const x = novaCena(r, cenaDoBloco(r, b.id)?.id ?? null);
        novo = x.blocoId;
        return x.roteiro;
      });
      if (novo) ops.focar({ id: novo, onde: "inicio" });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !mod && !e.altKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      let novo = "";
      ops.mudar((r) => {
        const x = inserirDepois(r, b.id);
        novo = x.id;
        return x.roteiro;
      });
      if (novo) ops.focar({ id: novo, onde: "inicio" });
      return;
    }
    if (e.key === "Tab" && !mod && !e.altKey) {
      e.preventDefault();
      ops.mudar((r) => trocarTipo(r, b.id, tipoVizinho(b.tipo, e.shiftKey ? -1 : 1)), { id: b.id, onde: "fim" });
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      ops.mudar((r) => trocarTipo(r, b.id, TIPOS_BLOCO[Number(e.key) - 1]), { id: b.id, onde: "fim" });
      return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      ops.mudar((r) => moverBloco(r, b.id, e.key === "ArrowUp" ? -1 : 1), { id: b.id, onde: "fim" });
      return;
    }
    if (e.key === "Backspace" && !texto && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault();
      let foco: string | null = null;
      ops.mudar((r) => {
        const x = apagarBloco(r, b.id);
        foco = x.foco;
        return x.roteiro;
      });
      if (foco) ops.focar({ id: foco, onde: "fim" });
      return;
    }
    if (e.key === "/" && !texto) {
      e.preventDefault();
      abrir("tipo");
      return;
    }
    if (e.key === "@" && b.tipo === "fala" && !texto && pessoas.length) {
      e.preventDefault();
      abrir("pessoa");
      return;
    }
    if (!mod && !e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const noInicio = el.selectionStart === 0 && el.selectionEnd === 0;
      const noFim = el.selectionStart === el.value.length;
      const outro = e.key === "ArrowUp" && noInicio ? vizinho(el, -1) : e.key === "ArrowDown" && noFim ? vizinho(el, 1) : null;
      if (outro) {
        e.preventDefault();
        outro.focus();
        const p = e.key === "ArrowUp" ? outro.value.length : 0;
        outro.setSelectionRange(p, p);
      }
    }
  }

  const tipoBotao = (
    <button
      type="button"
      className="cr-tipo"
      onClick={() => (menu === "tipo" ? setMenu(null) : abrir("tipo"))}
      disabled={!editavel}
      aria-haspopup="listbox"
      aria-expanded={menu === "tipo"}
      title="Tipo do bloco (Tab troca)"
    >
      <Icone nome={ICONE_TIPO[b.tipo]} size={14} />
      <span>{NOME_TIPO_BLOCO[b.tipo]}</span>
    </button>
  );

  let controles: ReactNode = null;
  switch (b.tipo) {
    case "fala":
      controles = (
        <>
          {nova ? (
            <input
              className="cr-quem cr-quem--nova"
              autoFocus
              placeholder="Nome"
              aria-label="Nome de quem fala"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNova(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  const nome = e.currentTarget.value.trim();
                  if (nome) {
                    ops.mudar((r) => {
                      const x = novaPessoa(r, nome);
                      return mudarBloco(x.roteiro, b.id, { quem: x.id });
                    });
                  }
                  setNova(false);
                  ops.focar({ id: b.id, onde: "fim" });
                }
              }}
              onBlur={() => setNova(false)}
            />
          ) : (
            <select
              className="cr-quem"
              value={b.quem ?? ""}
              aria-label="Quem fala"
              disabled={!editavel}
              onChange={(e) => (e.target.value === "__nova" ? setNova(true) : set({ quem: e.target.value || null }))}
            >
              <option value="">Voz</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {nomeDaPessoa(p)}
                </option>
              ))}
              {editavel ? <option value="__nova">Nova pessoa…</option> : null}
            </select>
          )}
          <Selecao
            valor={b.modo}
            opcoes={lista(MODOS_FALA, NOME_MODO_FALA)}
            rotulo="Modo da fala"
            mudar={(v) => set({ modo: v || "on" })}
            editavel={editavel}
            classe="cr-modo"
          />
          <input
            className="cr-obs cr-opcional"
            value={b.obs ?? ""}
            placeholder="indicação"
            aria-label="Indicação para quem fala"
            maxLength={300}
            readOnly={!editavel}
            onChange={(e) => set({ obs: e.target.value || undefined })}
          />
        </>
      );
      break;
    case "plano":
      controles = (
        <>
          <Selecao
            valor={b.tamanho}
            opcoes={TAMANHOS_PLANO.map((k) => ({ k, nome: SIGLA_TAMANHO_PLANO[k], titulo: NOME_TAMANHO_PLANO[k] }))}
            rotulo="Tamanho do plano"
            mudar={(v) => set({ tamanho: v || "outro" })}
            editavel={editavel}
            classe="cr-sigla"
          />
          {(["movimento", "angulo", "lente"] as const).map((k) => (
            <input
              key={k}
              className="cr-curto cr-opcional"
              value={b[k] ?? ""}
              placeholder={k === "angulo" ? "ângulo" : k}
              aria-label={k === "angulo" ? "Ângulo" : k === "lente" ? "Lente" : "Movimento"}
              maxLength={60}
              readOnly={!editavel}
              onChange={(e) => set({ [k]: e.target.value || undefined })}
            />
          ))}
        </>
      );
      break;
    case "lettering":
      controles = (
        <Selecao
          valor={b.estilo}
          opcoes={lista(ESTILOS_LETTERING, NOME_ESTILO_LETTERING)}
          rotulo="Estilo do lettering"
          mudar={(v) => set({ estilo: v || "gc" })}
          editavel={editavel}
          classe="cr-rotulo"
        />
      );
      break;
    case "audio":
      controles = (
        <>
          <Selecao
            valor={b.audio}
            opcoes={lista(TIPOS_AUDIO, NOME_TIPO_AUDIO)}
            rotulo="Tipo de áudio"
            mudar={(v) => set({ audio: v || "trilha" })}
            editavel={editavel}
            classe="cr-rotulo"
          />
          {(["entra", "sai"] as const).map((k) => (
            <Selecao
              key={k}
              valor={b[k] ?? ""}
              opcoes={[
                { k: "corte", nome: `${k} em corte` },
                { k: "fade", nome: `${k} em fade` },
              ]}
              rotulo={k === "entra" ? "Como entra" : "Como sai"}
              mudar={(v) => set({ [k]: v || undefined })}
              editavel={editavel}
              classe="cr-curto cr-opcional"
              vazio={k}
            />
          ))}
        </>
      );
      break;
  }

  return (
    <div className="cr-bloco" data-tipo={b.tipo} data-variante={variante} data-bloco={b.id}>
      {antes}
      <div className="cr-bloco__cab">
        {tipoBotao}
        {controles}
        <CampoTempo valor={b.duracao} mudar={(s) => set({ duracao: s })} editavel={editavel} />
      </div>
      <textarea
        ref={area}
        className="cr-bloco__texto"
        data-campo={b.id}
        rows={1}
        value={texto}
        placeholder={b.dica ?? DICA[b.tipo]}
        aria-label={NOME_TIPO_BLOCO[b.tipo]}
        readOnly={!editavel}
        spellCheck
        onChange={(e) => {
          set({ texto: e.target.value || (b.tipo === "plano" ? undefined : "") });
          ajustar(e.target);
        }}
        onKeyDown={tecla}
        onBlur={() => setTimeout(() => setMenu((m) => (document.activeElement?.closest(".cr-menu") ? m : null)), 120)}
      />
      <ComentariosDoBloco bloco={b.id} />
      {menu ? (
        <ul className="cr-menu" role="listbox" aria-label={menu === "tipo" ? "Tipo do bloco" : "Quem fala"}>
          {itens.map((it, i) => (
            <li key={it.k || "_"} role="option" aria-selected={i === sel}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(i)} onMouseEnter={() => setSel(i)}>
                {it.icone ? <Icone nome={it.icone} size={15} /> : null}
                <span>{it.nome}</span>
                {it.dica ? <kbd>{it.dica}</kbd> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});

/** A linha "Adicionar" no fim da cena (computador): um botão por tipo, com o atalho no título. */
export function AdicionarBloco({ cenaId, onAdicionar }: { cenaId: string; onAdicionar: (cenaId: string, tipo: TipoBloco) => void }) {
  return (
    <div className="cr-adicionar" role="group" aria-label="Adicionar bloco">
      {TIPOS_BLOCO.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onAdicionar(cenaId, t)}
          title={NOME_TIPO_BLOCO[t]}
          aria-label={`Adicionar ${NOME_TIPO_BLOCO[t].toLowerCase()}`}
        >
          <Icone nome={ICONE_TIPO[t]} size={15} />
        </button>
      ))}
    </div>
  );
}
