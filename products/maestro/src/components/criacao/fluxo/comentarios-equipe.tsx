"use client";
/**
 * Os comentários de quem abriu um link "Ver e comentar" (drizzle/0039), no editor do Fluxo: o botão com a contagem na
 * cabeça (só quando há algum) e a folha com cada um (quem, quando, o item), "Ver" leva ao nó no canvas e "Apagar" (quem
 * edita a Criação; o banco confere e audita). Lê ao abrir e a cada 30 s com a aba à vista.
 */
import { useCallback, useEffect, useState } from "react";
import type { ComentarioDoLink } from "@/lib/criacao/fluxo/compartilhar";
import { Folha } from "@/components/folha";
import { Icone } from "@/components/icones";

const ENDERECO = "/api/criacao/fluxo/comentarios";
const QUANDO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function useComentariosDoFluxo(fluxoId: string) {
  const [lista, setLista] = useState<ComentarioDoLink[]>([]);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${ENDERECO}?fluxo=${encodeURIComponent(fluxoId)}`, { cache: "no-store" });
      if (r.ok) setLista(((await r.json()) as { comentarios: ComentarioDoLink[] }).comentarios);
    } catch {
      // sem rede: fica o que já havia
    }
  }, [fluxoId]);
  useEffect(() => {
    const primeira = setTimeout(() => void carregar(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 30_000);
    return () => {
      clearTimeout(primeira);
      clearInterval(t);
    };
  }, [carregar]);
  const apagar = useCallback(async (id: string): Promise<string | null> => {
    try {
      const r = await fetch(ENDERECO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "apagar", id }) });
      if (!r.ok) return ((await r.json().catch(() => ({}))) as { mensagem?: string }).mensagem ?? "Não deu para apagar.";
      setLista((l) => l.filter((c) => c.id !== id));
      return null;
    } catch {
      return "Sem conexão. Tente de novo.";
    }
  }, []);
  return { lista, carregar, apagar };
}

export function FolhaComentarios({
  lista,
  nomeDoNo,
  podeApagar,
  apagar,
  irPara,
  avisar,
  aoFechar,
}: {
  lista: ComentarioDoLink[];
  /** O nome curto do nó (null = o nó saiu ou é do fluxo todo). */
  nomeDoNo: (id: string) => string | null;
  podeApagar: boolean;
  apagar: (id: string) => Promise<string | null>;
  irPara: (id: string) => void;
  avisar: (t: string, tom?: "erro") => void;
  aoFechar: () => void;
}) {
  return (
    <Folha rotulo="Comentários" aoFechar={aoFechar} tamanho="acao">
      <div className="fx-folha fxc-equipe">
        <h2 className="fx-folha__titulo fx-folha__titulo--esq">Comentários</h2>
        {lista.length ? (
          <ul className="fxc-lista" aria-label="Comentários do link">
            {lista.map((c) => {
              const no = c.no ? nomeDoNo(c.no) : null;
              return (
                <li key={c.id}>
                  <span className="fxc-avatar" aria-hidden="true">
                    {c.nome.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="fxc-quem">
                      <b>{c.nome}</b> <time dateTime={c.em}>{QUANDO.format(new Date(c.em))}</time>
                    </p>
                    <p className="fxc-texto">{c.texto}</p>
                    <div className="fxc-acoes fxc-acoes--esq">
                      {no ? (
                        <button
                          type="button"
                          className="glass-btn glass-btn--sm"
                          onClick={() => {
                            aoFechar();
                            irPara(c.no!);
                          }}
                          title="Ver no canvas"
                        >
                          <Icone nome="alvo" size={14} /> {no}
                        </button>
                      ) : (
                        <span className="fxc-do-fluxo">Do fluxo</span>
                      )}
                      {podeApagar ? (
                        <button
                          type="button"
                          className="glass-btn glass-btn--sm fx-folha__apagar"
                          onClick={async () => {
                            const e = await apagar(c.id);
                            avisar(e ?? "Comentário apagado.", e ? "erro" : undefined);
                          }}
                        >
                          Apagar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="fx-folha__nada">Nenhum comentário.</p>
        )}
      </div>
    </Folha>
  );
}
