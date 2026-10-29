"use client";
/**
 * O pedido de orçamento (`/p/<token>`, plano v2 §6.2): uma pergunta por tela, como o funil do ZRO, com as perguntas da
 * tabela de preços da produtora (tipo de trabalho, nicho, entregas), datas e local, faixa de investimento, a ideia e o
 * contato com o consentimento. Termina em "Recebido", com o protocolo e o WhatsApp da produtora. Entrada das telas só em
 * CSS (parada com "reduzir movimento"); o campo-armadilha fica fora da vista de gente.
 */
import { useMemo, useState, type FormEvent } from "react";
import { FAIXAS_INVESTIMENTO, variaveisDeEntrega, variavelDoNicho, type FormPedido, type RespostasPedido } from "@/lib/pedidos/formulario";
import { Icone } from "@/components/icones";
import { SeloAprovado } from "@/components/revisao/aprovar";

type Passo = "tipo" | "entregas" | "quando" | "investimento" | "ideia" | "contato";

function novaChave() {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

function Contador({ rotulo, valor, mudar }: { rotulo: string; valor: number; mudar: (n: number) => void }) {
  return (
    <div className="pd-contador">
      <span className="pd-contador__rotulo">{rotulo}</span>
      <div className="pd-contador__controle">
        <button type="button" aria-label={`Menos ${rotulo.toLowerCase()}`} onClick={() => mudar(Math.max(0, valor - 1))} disabled={valor <= 0}>
          −
        </button>
        <input
          inputMode="numeric"
          aria-label={rotulo}
          value={valor}
          onChange={(e) => mudar(Math.min(999, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)))}
        />
        <button type="button" aria-label={`Mais ${rotulo.toLowerCase()}`} onClick={() => mudar(Math.min(999, valor + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

export function PedidoPublico({ token, form, selo }: { token: string; form: FormPedido; selo: string }) {
  const p = form.config.perguntas;
  const nicho = variavelDoNicho(form.variaveis);
  const entregas = variaveisDeEntrega(form.variaveis);
  const passos = useMemo<Passo[]>(
    () =>
      [
        form.modelos.length ? "tipo" : null,
        nicho || entregas.length ? "entregas" : null,
        p.datas || p.local ? "quando" : null,
        p.investimento ? "investimento" : null,
        p.ideia ? "ideia" : null,
        "contato",
      ].filter(Boolean) as Passo[],
    [form.modelos.length, nicho, entregas.length, p.datas, p.local, p.investimento, p.ideia],
  );
  const [i, setI] = useState(0);
  const [r, setR] = useState<RespostasPedido>({ vars: {} });
  const [contato, setContato] = useState({ nome: "", empresa: "", whatsapp: "", email: "", consentimento: false, site: "" });
  const [idem] = useState(novaChave);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ protocolo: string; whatsapp: string | null } | null>(null);
  const passo = passos[i];
  const ultimo = i === passos.length - 1;

  const ir = (n: number) => {
    setErro(null);
    setI(Math.max(0, Math.min(passos.length - 1, n)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!ultimo) return ir(i + 1);
    setEnviando(true);
    setErro(null);
    setErros({});
    try {
      const res = await fetch("/api/publico/pedido", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, selo, idem, ...contato, respostas: r }),
      });
      const j = (await res.json().catch(() => ({}))) as { protocolo?: string; whatsapp?: string | null; mensagem?: string; erros?: Record<string, string> };
      if (!res.ok || !j.protocolo) {
        setErro(j.mensagem ?? "Não deu para enviar. Tente de novo.");
        setErros(j.erros ?? {});
        return;
      }
      setFeito({ protocolo: j.protocolo, whatsapp: j.whatsapp ?? null });
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (feito)
    return (
      <section className="pd-fim" aria-live="polite">
        <SeloAprovado />
        <h1>Recebido.</h1>
        <p>A {form.marca.nome} responde em breve.</p>
        <p className="pd-protocolo">
          Protocolo <b>{feito.protocolo}</b>
        </p>
        {feito.whatsapp ? (
          <a className="glass-btn glass-btn--ink" href={feito.whatsapp} target="_blank" rel="noreferrer">
            <Icone nome="whatsapp" size={18} /> Falar no WhatsApp
          </a>
        ) : null}
      </section>
    );

  const titulo: Record<Passo, string> = {
    tipo: "O que você precisa?",
    entregas: "Quanto de cada coisa?",
    quando: "Quando e onde?",
    investimento: "Qual a faixa de investimento?",
    ideia: "Conte a ideia.",
    contato: "Como a gente te chama?",
  };

  return (
    <form className="pd" onSubmit={enviar} noValidate>
      <div className="pd-progresso" role="progressbar" aria-valuemin={1} aria-valuemax={passos.length} aria-valuenow={i + 1} aria-label="Andamento">
        <span style={{ width: `${((i + 1) / passos.length) * 100}%` }} />
      </div>
      {i === 0 && form.config.boasVindas ? <p className="pd-boas-vindas">{form.config.boasVindas}</p> : null}
      <section className="pd-passo" key={passo} aria-labelledby="pd-titulo">
        <h1 id="pd-titulo" className="pd-titulo">
          {titulo[passo]}
        </h1>

        {passo === "tipo" ? (
          <div className="pd-opcoes" role="radiogroup" aria-labelledby="pd-titulo">
            {[...form.modelos.map((m) => ({ id: m.id, nome: m.nome, apoio: m.descricao })), { id: "outro", nome: "Outro", apoio: "Conto na ideia." }].map(
              (m) => {
                const marcado = (r.modelo ?? (r.tipo === "Outro" ? "outro" : "")) === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    className="pd-opcao"
                    onClick={() => {
                      const mod = form.modelos.find((x) => x.id === m.id);
                      setR((x) => ({
                        ...x,
                        modelo: mod ? m.id : undefined,
                        tipo: mod ? m.nome : "Outro",
                        nicho: mod?.nicho && nicho?.opcoes.some((o) => o.valor === mod.nicho) ? mod.nicho : x.nicho,
                      }));
                      setTimeout(() => ir(i + 1), 220);
                    }}
                  >
                    <strong>{m.nome}</strong>
                    {m.apoio ? <span>{m.apoio}</span> : null}
                  </button>
                );
              },
            )}
          </div>
        ) : null}

        {passo === "entregas" ? (
          <div className="pd-campos">
            {nicho ? (
              <fieldset className="pd-grupo">
                <legend>{nicho.rotulo}</legend>
                <div className="pd-chips">
                  {nicho.opcoes.map((o) => (
                    <button
                      key={o.valor}
                      type="button"
                      className="pd-chip"
                      aria-pressed={r.nicho === o.valor}
                      onClick={() => setR((x) => ({ ...x, nicho: x.nicho === o.valor ? undefined : o.valor }))}
                    >
                      {o.rotulo}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {entregas.map((v) =>
              v.tipo === "numero" ? (
                <Contador
                  key={v.chave}
                  rotulo={v.rotulo}
                  valor={Number(r.vars[v.chave] ?? 0)}
                  mudar={(n) => setR((x) => ({ ...x, vars: { ...x.vars, [v.chave]: n } }))}
                />
              ) : (
                <fieldset key={v.chave} className="pd-grupo">
                  <legend>{v.rotulo}</legend>
                  <div className="pd-chips">
                    {v.opcoes.map((o) => (
                      <button
                        key={o.valor}
                        type="button"
                        className="pd-chip"
                        aria-pressed={r.vars[v.chave] === o.valor}
                        onClick={() => setR((x) => ({ ...x, vars: { ...x.vars, [v.chave]: o.valor } }))}
                      >
                        {o.rotulo}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ),
            )}
          </div>
        ) : null}

        {passo === "quando" ? (
          <div className="pd-campos pd-campos--grade">
            {p.datas ? (
              <>
                <label className="pd-campo">
                  <span>Começa em</span>
                  <input type="date" value={r.inicio ?? ""} onChange={(e) => setR((x) => ({ ...x, inicio: e.target.value || undefined }))} />
                </label>
                <label className="pd-campo">
                  <span>Termina em</span>
                  <input type="date" value={r.fim ?? ""} min={r.inicio} onChange={(e) => setR((x) => ({ ...x, fim: e.target.value || undefined }))} />
                </label>
              </>
            ) : null}
            {p.local ? (
              <label className="pd-campo pd-campo--largo">
                <span>Cidade ou local</span>
                <input maxLength={120} value={r.local ?? ""} placeholder="São Paulo, SP" onChange={(e) => setR((x) => ({ ...x, local: e.target.value }))} />
              </label>
            ) : null}
            {erros.fim ? <p className="pd-erro">{erros.fim}</p> : null}
          </div>
        ) : null}

        {passo === "investimento" ? (
          <div className="pd-opcoes pd-opcoes--lista" role="radiogroup" aria-labelledby="pd-titulo">
            {FAIXAS_INVESTIMENTO.map((f) => (
              <button
                key={f.valor}
                type="button"
                role="radio"
                aria-checked={r.investimento === f.valor}
                className="pd-opcao"
                onClick={() => {
                  setR((x) => ({ ...x, investimento: f.valor }));
                  setTimeout(() => ir(i + 1), 220);
                }}
              >
                <strong>{f.rotulo}</strong>
              </button>
            ))}
          </div>
        ) : null}

        {passo === "ideia" ? (
          <label className="pd-campo pd-campo--largo">
            <span className="sr-only">A ideia</span>
            <textarea
              rows={6}
              maxLength={2000}
              value={r.ideia ?? ""}
              placeholder="O que vocês querem contar, para quem e onde o vídeo vai viver."
              onChange={(e) => setR((x) => ({ ...x, ideia: e.target.value }))}
            />
          </label>
        ) : null}

        {passo === "contato" ? (
          <div className="pd-campos pd-campos--grade">
            <label className="pd-campo pd-campo--largo">
              <span>Seu nome</span>
              <input
                autoComplete="name"
                maxLength={120}
                value={contato.nome}
                aria-invalid={!!erros.nome || undefined}
                onChange={(e) => setContato((c) => ({ ...c, nome: e.target.value }))}
              />
              {erros.nome ? <small className="pd-erro">{erros.nome}</small> : null}
            </label>
            <label className="pd-campo pd-campo--largo">
              <span>Empresa (opcional)</span>
              <input
                autoComplete="organization"
                maxLength={120}
                value={contato.empresa}
                onChange={(e) => setContato((c) => ({ ...c, empresa: e.target.value }))}
              />
            </label>
            <label className="pd-campo">
              <span>WhatsApp</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                placeholder="(11) 90000-0000"
                value={contato.whatsapp}
                aria-invalid={!!erros.whatsapp || undefined}
                onChange={(e) => setContato((c) => ({ ...c, whatsapp: e.target.value }))}
              />
              {erros.whatsapp ? <small className="pd-erro">{erros.whatsapp}</small> : null}
            </label>
            <label className="pd-campo">
              <span>E-mail</span>
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                value={contato.email}
                aria-invalid={!!erros.email || undefined}
                onChange={(e) => setContato((c) => ({ ...c, email: e.target.value }))}
              />
              {erros.email ? <small className="pd-erro">{erros.email}</small> : null}
            </label>
            {/* Armadilha: fora da vista e do teclado; gente não preenche. */}
            <label className="pd-armadilha" aria-hidden="true">
              Site
              <input tabIndex={-1} autoComplete="off" value={contato.site} onChange={(e) => setContato((c) => ({ ...c, site: e.target.value }))} />
            </label>
            <label className="pd-consentimento pd-campo--largo">
              <input type="checkbox" checked={contato.consentimento} onChange={(e) => setContato((c) => ({ ...c, consentimento: e.target.checked }))} />
              <span>A {form.marca.nome} pode guardar estes dados para responder ao pedido. Só para isso; dá para pedir para apagar quando quiser.</span>
            </label>
            {erros.consentimento ? <small className="pd-erro">{erros.consentimento}</small> : null}
          </div>
        ) : null}
      </section>

      {erro ? (
        <p className="pd-erro pd-erro--geral" role="alert">
          {erro}
        </p>
      ) : null}

      <div className="pd-barra">
        {i > 0 ? (
          <button type="button" className="glass-btn" onClick={() => ir(i - 1)}>
            <Icone nome="voltar" size={16} /> Voltar
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="glass-btn glass-btn--ink" disabled={enviando || (ultimo && !contato.consentimento)}>
          {ultimo ? (enviando ? "Enviando…" : "Enviar pedido") : "Continuar"}
          {!ultimo ? <Icone nome="seta" size={16} /> : null}
        </button>
      </div>
    </form>
  );
}
