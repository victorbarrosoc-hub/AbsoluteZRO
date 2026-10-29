"use client";
/**
 * Pessoas da Absolute ZRO (ADR 0029 do HUB): um campo "@fulano ou nome" que busca perfis visíveis na Absolute ZRO e
 * mostra a ficha (foto, nome, @, funções, cidade, selos). A ação de cada ficha muda com a tela: em Ajustes › Pessoas,
 * "Convidar" (a pessoa aceita na Absolute ZRO); em Freelas, "Adicionar ao banco" (ligado ao perfil pelo @). E-mail e
 * telefone nunca chegam aqui.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { PessoaZro } from "@/lib/zro/pessoas";
import { Icone } from "./icones";
import { Monograma } from "./crm";
import "./pessoas-zro.css";

type Busca = (q: string) => Promise<{ pessoas: PessoaZro[]; erro?: string; reconectar?: boolean }>;
type Retorno = { aviso?: string; mensagem?: string; id?: string };

export function PessoasZro({
  buscar,
  acao,
  rotulo,
  papeis,
  irPara,
  perfilBase,
}: {
  buscar: Busca;
  /** Convidar (com papel) ou adicionar ao banco. */
  acao: (arroba: string, papel: string) => Promise<Retorno | undefined>;
  rotulo: string;
  /** Papéis do convite; sem eles, a ação não pede papel. */
  papeis?: { valor: string; nome: string }[];
  /** Depois de adicionar, abre a ficha (freela): o começo do endereço, o id vem no fim. */
  irPara?: string;
  /** Endereço do perfil na Absolute ZRO (link do nome). */
  perfilBase: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [papel, setPapel] = useState(papeis?.[0]?.valor ?? "");
  const [res, setRes] = useState<{ q: string; pessoas: PessoaZro[]; erro?: string } | null>(null);
  const [feitos, setFeitos] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Retorno | null>(null);
  const [, iniciar] = useTransition();
  const [enviando, iniciarEnvio] = useTransition();
  const ultima = useRef("");
  const t = q.trim();
  const curta = t.replace(/^@/, "").length < 2;

  useEffect(() => {
    if (curta) return;
    const h = setTimeout(() => {
      ultima.current = t;
      iniciar(async () => {
        const r = await buscar(t);
        if (ultima.current === t) setRes({ q: t, ...r });
      });
    }, 220);
    return () => clearTimeout(h);
  }, [t, curta, buscar]);

  function agir(arroba: string) {
    setMsg(null);
    iniciarEnvio(async () => {
      const r = (await acao(arroba, papel)) ?? {};
      setMsg(r);
      if (r.aviso) {
        setFeitos((f) => ({ ...f, [arroba]: r.id ?? "ok" }));
        if (r.id && irPara) router.push(`${irPara}${r.id}`);
      }
    });
  }

  const lista = !curta && res?.q === t ? res.pessoas : [];
  return (
    <div className="pzro">
      <div className="pzro__barra">
        <label className="q-busca pzro__campo">
          <Icone nome="busca" size={16} />
          <span className="sr-only">Buscar na Absolute ZRO por @ ou nome</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="@fulano ou nome"
            autoComplete="off"
            spellCheck={false}
            maxLength={60}
          />
        </label>
        {papeis?.length ? (
          <label className="pzro__papel">
            <span>Entra como</span>
            <select value={papel} onChange={(e) => setPapel(e.target.value)}>
              {papeis.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {lista.length ? (
        <ul className="pzro__lista" aria-label="Pessoas na Absolute ZRO">
          {lista.map((p) => (
            <li key={p.id} className="pzro__ficha" aria-label={`${p.nome}, @${p.arroba}`}>
              {p.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="pzro__foto" src={p.foto} alt="" width={44} height={44} loading="lazy" />
              ) : (
                <Monograma nome={p.nome} />
              )}
              <span className="pzro__miolo">
                <b>
                  <a href={`${perfilBase}/pessoas/@${p.arroba}`} target="_blank" rel="noreferrer">
                    {p.nome}
                  </a>{" "}
                  <span className="pzro__arroba">@{p.arroba}</span>
                </b>
                <small>{[p.funcoes.map((f) => f.nome).join(", "), p.cidade].filter(Boolean).join(" · ")}</small>
                {p.selos.length ? (
                  <span className="pzro__selos">
                    {p.selos.map((s) => (
                      <span key={s.produto} className="pzro__selo">
                        {s.texto}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              {feitos[p.arroba] ? (
                <span className="pzro__feito">
                  <Icone nome="check" size={15} /> Feito
                </span>
              ) : (
                <button
                  type="button"
                  className="glass-btn glass-btn--ink glass-btn--sm"
                  onClick={() => agir(p.arroba)}
                  disabled={enviando}
                  aria-label={`${rotulo} @${p.arroba}`}
                >
                  {rotulo}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : !curta && res?.q === t ? (
        <p className="pzro__vazio" role="status">
          {res.erro ?? "Ninguém com esse @ ou nome na Absolute ZRO."}
        </p>
      ) : null}
      {msg?.mensagem ? (
        <p className="pzro__erro" role="alert">
          {msg.mensagem}
        </p>
      ) : msg?.aviso ? (
        <p className="pzro__ok" role="status">
          {msg.aviso}
        </p>
      ) : null}
    </div>
  );
}
