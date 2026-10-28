"use client";
/**
 * A decisão do cliente no orçamento (`/o/<token>`, plano v2 §6.3): "Aceitar" e "Pedir ajuste" com o mesmo peso. Aceitar
 * pede o nome e o aceite (vale como resposta formal, uma vez só); ajuste pede o nome e o que mudar. O selo do aceite é o
 * mesmo "acorde" da aprovação (só CSS, parado com "reduzir movimento").
 */
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { brl, dataBr } from "@/lib/dinheiro";
import type { Parcela } from "@/lib/orcamento/motor";
import { Icone } from "@/components/icones";
import { SeloAprovado } from "@/components/revisao/aprovar";

type Props = {
  token: string;
  codigo: string;
  total: number;
  produtora: string;
  parcelas: Parcela[];
  status: string;
  aceite: { nome: string; em: string } | null;
  retorno: { nome: string; texto: string; em: string } | null;
  whatsapp: string | null;
};

const quando = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
};

export function ParcelasDoOrcamento({ parcelas }: { parcelas: Parcela[] }) {
  if (!parcelas.length) return null;
  return (
    <ol className="oc-parcelas" aria-label="Parcelas">
      {parcelas.map((p, i) => (
        <li key={i}>
          <span className="oc-parcelas__n">{i + 1}</span>
          <span className="oc-parcelas__miolo">
            <b>{brl(p.valorCents)}</b>
            <small>
              {p.rotulo} · {dataBr(p.vencimento)}
            </small>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AceiteOrcamento(p: Props) {
  const router = useRouter();
  const [modo, setModo] = useState<"aceitar" | "ajuste" | null>(null);
  const [nome, setNome] = useState("");
  const [aceite, setAceite] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [feito, setFeito] = useState<"aceito" | "ajuste" | null>(null);

  if (p.aceite || feito === "aceito")
    return (
      <section className="cl-fim oc-feito" aria-live="polite">
        <SeloAprovado />
        <h2>Aceito.</h2>
        <p>
          {p.aceite ? `${p.aceite.nome}, ${quando(p.aceite.em)}.` : `A ${p.produtora} já recebeu.`} A {p.produtora} entra em contato para começar.
        </p>
      </section>
    );
  if (p.status === "expirado")
    return (
      <section className="ficha oc-aviso">
        <strong>A validade passou.</strong>
        <p className="sutil">Peça uma versão nova à {p.produtora}.</p>
        {p.whatsapp ? (
          <a className="glass-btn" href={p.whatsapp} target="_blank" rel="noreferrer">
            <Icone nome="whatsapp" size={16} /> WhatsApp
          </a>
        ) : null}
      </section>
    );

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setIndo(true);
    setErro(null);
    try {
      const url = modo === "aceitar" ? "/api/publico/orcamento/aceitar" : "/api/publico/orcamento/ajuste";
      const corpo = modo === "aceitar" ? { token: p.token, nome, aceite } : { token: p.token, nome, texto };
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
      const j = (await r.json().catch(() => ({}))) as { mensagem?: string };
      if (!r.ok) {
        setErro(j.mensagem ?? "Não deu certo.");
        return;
      }
      setFeito(modo === "aceitar" ? "aceito" : "ajuste");
      router.refresh();
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setIndo(false);
    }
  }

  if (feito === "ajuste")
    return (
      <section className="cl-fim" aria-live="polite">
        <span className="oc-icone">
          <Icone nome="balao" size={26} />
        </span>
        <h2>Pedido enviado.</h2>
        <p>A {p.produtora} ajusta e manda a versão nova.</p>
      </section>
    );

  return (
    <section className="oc-decidir" aria-label="Sua resposta">
      {p.retorno ? (
        <p className="oc-retorno">
          <Icone nome="balao" size={16} /> Ajuste pedido por {p.retorno.nome} em {quando(p.retorno.em)}. Se já combinaram, pode aceitar.
        </p>
      ) : null}
      <div className="cl-decidir__botoes oc-botoes">
        <button type="button" className="cl-escolha" data-tipo="aprovado" aria-checked={modo === "aceitar"} role="radio" onClick={() => setModo("aceitar")}>
          <Icone nome="check" size={20} /> Aceitar
        </button>
        <button type="button" className="cl-escolha" data-tipo="ajuste" aria-checked={modo === "ajuste"} role="radio" onClick={() => setModo("ajuste")}>
          <Icone nome="editar" size={20} /> Pedir ajuste
        </button>
      </div>
      {modo ? (
        <form className="oc-form" onSubmit={enviar}>
          <label className="cl-campo">
            <span>Seu nome</span>
            <input autoComplete="name" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </label>
          {modo === "aceitar" ? (
            <label className="cl-termo">
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
              <span>
                Aceito a proposta {p.codigo} da {p.produtora}, no total de {brl(p.total)}
                {p.parcelas.length > 1 ? `, em ${p.parcelas.length} parcelas` : ""}. Vale como resposta formal, com meu nome e a data.
              </span>
            </label>
          ) : (
            <label className="cl-campo">
              <span>O que ajustar</span>
              <textarea rows={4} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </label>
          )}
          {erro ? (
            <p className="rv-erro" role="alert">
              {erro}
            </p>
          ) : null}
          <button
            type="submit"
            className="glass-btn glass-btn--ink"
            disabled={indo || nome.trim().length < 2 || (modo === "aceitar" ? !aceite : !texto.trim())}
          >
            {indo ? "Enviando…" : modo === "aceitar" ? "Confirmar aceite" : "Enviar pedido de ajuste"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
