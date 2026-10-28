"use client";
/**
 * Ajustes → Marca: o logo (enviado sozinho: o servidor confere e reencoda), a cor de destaque com o contraste conferido na
 * hora, os dados da empresa e a assinatura, com a prévia do topo do timbrado ao lado. A cor só pinta filete e ponto,
 * nunca texto (a prévia mostra exatamente onde ela entra).
 */
import { useActionState, useRef, useState, type CSSProperties } from "react";
import { useFormStatus } from "react-dom";
import { conferirCor, normalizarCor } from "@/lib/marca/cor";
import type { Marca } from "@/lib/marca/servidor";
import { enviarLogoAcao, salvarMarcaAcao, tirarLogoAcao } from "@/app/(app)/app/ajustes/marca/acoes";
import { Icone } from "./icones";

/** Tons que passam no papel branco (≥ 3:1), para começar rápido. */
const SUGESTOES = ["#1d1d1f", "#b8872b", "#1f6feb", "#0f7b5f", "#b4232c", "#6e3fb5"];

const CAMPOS: { nome: keyof Marca; rotulo: string; max: number; tipo?: string; dica?: string; largo?: boolean }[] = [
  { nome: "nome", rotulo: "Nome da produtora", max: 120, largo: true, dica: "Sem ele, vale o nome da organização." },
  { nome: "cnpj", rotulo: "CNPJ", max: 20, dica: "Opcional." },
  { nome: "telefone", rotulo: "WhatsApp ou telefone", max: 30, tipo: "tel" },
  { nome: "email", rotulo: "E-mail", max: 254, tipo: "email" },
  { nome: "endereco", rotulo: "Endereço", max: 300, largo: true },
  { nome: "assinatura", rotulo: "Assinatura", max: 200, largo: true, dica: "A linha no fim do timbrado. Ex.: Ana Lima · Direção" },
];

function Salvar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--ink" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </button>
  );
}

function EnviarLogo({ temLogo }: { temLogo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <span className="glass-btn glass-btn--sm marca-logo__escolher" aria-busy={pending || undefined}>
      <Icone nome="imagem" size={16} /> {pending ? "Enviando…" : temLogo ? "Trocar logo" : "Escolher logo"}
    </span>
  );
}

export function EditorMarca({ marca, nomeOrg, podeMudar }: { marca: Marca; nomeOrg: string; podeMudar: boolean }) {
  const [estado, salvar] = useActionState(salvarMarcaAcao, undefined);
  const [estadoLogo, enviarLogo] = useActionState(enviarLogoAcao, undefined);
  const [estadoTirar, tirar] = useActionState(tirarLogoAcao, undefined);
  const formLogo = useRef<HTMLFormElement>(null);
  const valores = estado?.valores ?? Object.fromEntries(CAMPOS.map((c) => [c.nome, String(marca[c.nome] ?? "")]));
  const [nome, setNome] = useState(valores.nome ?? "");
  const [assinatura, setAssinatura] = useState(valores.assinatura ?? "");
  const [cor, setCor] = useState(estado?.valores?.cor ?? marca.cor ?? "");
  const conf = conferirCor(cor);
  const corValida = conf.ok && conf.cor ? conf.cor : null;
  const estilo = { "--acento": corValida ?? "var(--acento-forte, #b8872b)" } as CSSProperties;
  const titulo = nome.trim() || nomeOrg;

  return (
    <div className="marca">
      <div className="marca__lado">
        <section className="ficha marca-logo" aria-label="Logo">
          <div className="marca-logo__palco">
            {marca.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- bytes do banco pela rota própria
              <img src={marca.logo} alt={`Logo de ${titulo}`} />
            ) : (
              <span className="marca-logo__vazio">
                <Icone nome="imagem" size={28} />
              </span>
            )}
          </div>
          <div className="marca-logo__miolo">
            <strong className="ficha__titulo">Logo</strong>
            <p className="sutil">PNG, JPEG ou WebP, até 4 MB. Fundo transparente fica melhor.</p>
            {podeMudar ? (
              <div className="acoes">
                <form ref={formLogo} action={enviarLogo}>
                  <label className="marca-logo__arquivo">
                    <input
                      type="file"
                      name="logo"
                      accept="image/png,image/jpeg,image/webp"
                      aria-label="Arquivo do logo"
                      onChange={(e) => {
                        if (e.currentTarget.files?.length) formLogo.current?.requestSubmit();
                      }}
                    />
                    <EnviarLogo temLogo={!!marca.logo} />
                  </label>
                </form>
                {marca.logo ? (
                  <form action={tirar}>
                    <button type="submit" className="q-limpar">
                      Tirar
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            {[estadoLogo, estadoTirar].map((e, i) =>
              e?.mensagem ? (
                <p key={i} className="erro" role="alert">
                  {e.mensagem}
                </p>
              ) : e?.aviso ? (
                <p key={i} className="aviso-ok" role="status">
                  <Icone nome="check" size={16} /> {e.aviso}
                </p>
              ) : null,
            )}
          </div>
        </section>

        <form action={salvar} className="form" noValidate>
          {estado?.mensagem ? (
            <p className="erro" role="alert">
              {estado.mensagem}
            </p>
          ) : null}
          {estado?.aviso ? (
            <p className="aviso-ok" role="status">
              <Icone nome="check" size={16} /> {estado.aviso}
            </p>
          ) : null}
          <fieldset className="marca-cor" disabled={!podeMudar}>
            <legend>Cor de destaque</legend>
            <div className="marca-cor__linha">
              {SUGESTOES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="marca-cor__amostra"
                  style={{ background: c }}
                  aria-label={`Usar ${c}`}
                  aria-pressed={corValida === c}
                  onClick={() => setCor(c)}
                />
              ))}
              <input
                type="color"
                className="marca-cor__seletor"
                aria-label="Escolher outra cor"
                value={corValida ?? normalizarCor(cor) ?? "#b8872b"}
                onChange={(e) => setCor(e.target.value)}
              />
              <input
                name="cor"
                className="marca-cor__hex num"
                aria-label="Código da cor"
                aria-invalid={!conf.ok || undefined}
                placeholder="#b8872b"
                maxLength={7}
                value={cor}
                onChange={(e) => setCor(e.target.value)}
              />
            </div>
            <span className={conf.ok ? "form__dica" : "form__erro"} role={conf.ok ? undefined : "alert"}>
              {!conf.ok
                ? conf.mensagem
                : conf.cor
                  ? `Contraste ${String(conf.contraste).replace(".", ",")}:1 no papel. Só em filete e ponto, nunca em texto.`
                  : "Sem cor, vale o latão do Maestro."}
            </span>
            {estado?.erros?.cor ? <span className="form__erro">{estado.erros.cor}</span> : null}
          </fieldset>
          <fieldset className="form__grade" disabled={!podeMudar} key={estado?.n ?? 0}>
            {CAMPOS.map((c) => {
              const erro = estado?.erros?.[c.nome];
              const id = `marca-${c.nome}`;
              return (
                <div key={c.nome} className={`form__campo${c.largo ? " form__campo--largo" : ""}${erro ? " form__campo--erro" : ""}`}>
                  <label htmlFor={id}>{c.rotulo}</label>
                  <input
                    id={id}
                    name={c.nome}
                    type={c.tipo ?? "text"}
                    maxLength={c.max}
                    defaultValue={valores[c.nome] ?? ""}
                    aria-invalid={erro ? true : undefined}
                    onChange={c.nome === "nome" ? (e) => setNome(e.target.value) : c.nome === "assinatura" ? (e) => setAssinatura(e.target.value) : undefined}
                  />
                  {erro ? <span className="form__erro">{erro}</span> : c.dica ? <span className="form__dica">{c.dica}</span> : null}
                </div>
              );
            })}
          </fieldset>
          {podeMudar ? (
            <div className="acoes">
              <Salvar rotulo="Salvar marca" />
            </div>
          ) : null}
        </form>
      </div>

      <aside className="marca__previa" aria-label="Prévia do timbrado" style={estilo}>
        <span className="marca__previa-rotulo">Prévia</span>
        <div className="marca-folha">
          <div className="marca-folha__topo">
            {marca.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- idem
              <img src={marca.logo} alt="" />
            ) : (
              <span className="lh-marca">{titulo}</span>
            )}
            <span className="lh-mono">Proposta · 2026-001</span>
          </div>
          <p className="lh-kicker">
            <span className="lh-ponto" aria-hidden="true" />
            <span className="lh-mono">Proposta de produção audiovisual</span>
          </p>
          <p className="marca-folha__titulo">Filme institucional</p>
          <span className="marca-folha__barra" aria-hidden="true" />
          <span className="marca-folha__barra marca-folha__barra--curta" aria-hidden="true" />
          {assinatura.trim() ? (
            <div className="lh-assinatura">
              <span className="lh-assinatura__linha" aria-hidden="true" />
              <p>{assinatura}</p>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
