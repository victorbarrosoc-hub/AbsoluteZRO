"use client";
/**
 * "@ no Absolute ZRO", no topo do cadastro e da edição do freela (drizzle/0036). Depois de uma pausa curta, a prévia
 * (foto, nome, @) vem do HUB pelo servidor, como no Set; "Usar" preenche nome, cidade e funções e liga o freela à conta
 * (o servidor relê o perfil ao salvar). Sem @, o cadastro avulso segue igual e oferece "Convidar para o Absolute ZRO".
 * E-mail e telefone nunca chegam aqui.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import type { PessoaZro } from "@/lib/zro/pessoas";
import { Icone } from "@/components/icones";
import { Monograma } from "@/components/crm";
import "./conta-zro.css";

type Ver = (arroba: string) => Promise<{ pessoa?: PessoaZro; funcoes?: string; erro?: string }>;
type Escolha = { arroba: string; nome: string; foto: string | null; apoio: string };

const ARROBA = /^[a-z0-9._]{3,30}$/;
const limpar = (v: string) => v.trim().replace(/^@/, "").toLowerCase();

function preencher(raiz: HTMLElement | null, nome: string, valor: string, soVazio: boolean) {
  const form = raiz?.closest("form");
  const el = form?.elements.namedItem(nome);
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !valor) return;
  if (soVazio && el.value.trim()) return;
  el.value = valor;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function ArrobaZro({
  ver,
  atual,
  perfilBase,
  convidar = false,
}: {
  ver: Ver;
  /** O @ já ligado (edição). */
  atual?: { arroba: string; nome: string } | null;
  perfilBase: string;
  /** Cadastro novo: oferece o convite para quem não tem conta. */
  convidar?: boolean;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState("");
  const [res, setRes] = useState<{ a: string; pessoa?: PessoaZro; funcoes?: string; erro?: string } | null>(null);
  const [escolha, setEscolha] = useState<Escolha | null>(atual ? { arroba: atual.arroba, nome: atual.nome, foto: null, apoio: "" } : null);
  const [convite, setConvite] = useState(false);
  const [buscando, iniciar] = useTransition();
  const ultima = useRef("");
  const a = limpar(texto);
  const valido = ARROBA.test(a);

  useEffect(() => {
    if (!valido) return;
    const h = setTimeout(() => {
      ultima.current = a;
      iniciar(async () => {
        const r = await ver(a);
        if (ultima.current === a) setRes({ a, ...r });
      });
    }, 450);
    return () => clearTimeout(h);
  }, [a, valido, ver]);

  function usar(p: PessoaZro, funcoes: string) {
    preencher(raiz.current, "nome", p.nome, false);
    preencher(raiz.current, "cidade", p.cidade ?? "", true);
    preencher(raiz.current, "funcoes", funcoes, true);
    setEscolha({ arroba: p.arroba, nome: p.nome, foto: p.foto, apoio: [p.funcoes.map((f) => f.nome).join(", "), p.cidade].filter(Boolean).join(" · ") });
    setConvite(false);
    setTexto("");
    setRes(null);
  }

  const vista = valido && res?.a === a ? res : null;
  return (
    <div className="czro" ref={raiz}>
      <input type="hidden" name="zro_arroba" value={escolha?.arroba ?? ""} />
      <input type="hidden" name="zro_antes" value={atual?.arroba ?? ""} />
      {convite ? <input type="hidden" name="convidar" value="sim" /> : null}
      {escolha ? (
        <div className="czro__ficha czro__ficha--ligada" aria-label={`Conectado a @${escolha.arroba}`}>
          {escolha.foto ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto pública do perfil, do HUB
            <img className="czro__foto" src={escolha.foto} alt="" width={40} height={40} />
          ) : (
            <Monograma nome={escolha.nome} />
          )}
          <span className="czro__miolo">
            <b>
              {escolha.nome}{" "}
              <a className="czro__arroba" href={`${perfilBase}/pessoas/@${escolha.arroba}`} target="_blank" rel="noreferrer">
                @{escolha.arroba}
              </a>
            </b>
            <small>
              <Icone nome="check" size={13} /> {escolha.apoio || "Conectado ao Absolute ZRO"}
            </small>
          </span>
          <button type="button" className="glass-btn glass-btn--icone glass-btn--sm" onClick={() => setEscolha(null)} aria-label="Tirar o @" title="Tirar o @">
            <Icone nome="fechar" size={15} />
          </button>
        </div>
      ) : (
        <>
          <label className="czro__campo" htmlFor="campo-zro-arroba">
            <span className="czro__rotulo">@ no Absolute ZRO</span>
            <span className="czro__entrada">
              <span aria-hidden="true">@</span>
              <input
                id="campo-zro-arroba"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (vista?.pessoa) usar(vista.pessoa, vista.funcoes ?? "");
                  }
                }}
                placeholder="fulano"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={31}
                aria-describedby="czro-estado"
              />
              {buscando ? <span className="czro__girando" aria-hidden="true" /> : null}
            </span>
          </label>
          <div id="czro-estado" aria-live="polite">
            {vista?.pessoa ? (
              <div className="czro__ficha" aria-label={`${vista.pessoa.nome}, @${vista.pessoa.arroba}`}>
                {vista.pessoa.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto pública do perfil, do HUB
                  <img className="czro__foto" src={vista.pessoa.foto} alt="" width={40} height={40} />
                ) : (
                  <Monograma nome={vista.pessoa.nome} />
                )}
                <span className="czro__miolo">
                  <b>
                    {vista.pessoa.nome} <span className="czro__arroba">@{vista.pessoa.arroba}</span>
                  </b>
                  <small>{[vista.pessoa.funcoes.map((f) => f.nome).join(", "), vista.pessoa.cidade].filter(Boolean).join(" · ")}</small>
                </span>
                <button type="button" className="glass-btn glass-btn--ink glass-btn--sm" onClick={() => usar(vista.pessoa!, vista.funcoes ?? "")}>
                  Usar
                </button>
              </div>
            ) : vista?.erro ? (
              <p className="czro__nada">{vista.erro}</p>
            ) : null}
          </div>
          {convidar ? (
            <button
              type="button"
              className="czro__convite"
              role="switch"
              aria-checked={convite}
              onClick={() => setConvite((c) => !c)}
              title="Sem conta? Ele recebe um link para criar a conta e entrar no banco de freelas."
            >
              <span className="czro__chave" aria-hidden="true" />
              Convidar para o Absolute ZRO
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
