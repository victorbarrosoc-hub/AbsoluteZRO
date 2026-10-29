"use client";
/**
 * Ajustes → Contrato: o texto do modelo com as {{variáveis}} em chips (um toque põe no cursor), os números do contrato
 * e a prévia ao vivo com dados de exemplo, a mesma função que preenche o contrato do cliente. Salvar = versão nova.
 */
import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AVISO_MODELO,
  CAMPOS_CONFIG,
  dadosDeExemplo,
  desenharContrato,
  NOMES_DOS_GRUPOS,
  validarConfig,
  valoresDoContrato,
  VARIAVEIS,
  type ConfigContrato,
  type DadosDoContrato,
  type GrupoVariavel,
} from "@/lib/contrato/modelo";
import { restaurarContratoAcao, salvarContratoAcao } from "@/app/(app)/app/ajustes/contrato/acoes";
import { Icone } from "@/components/icones";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="glass-btn glass-btn--ink" disabled={pending}>
      {pending ? "Salvando…" : "Salvar versão"}
    </button>
  );
}

const GRUPOS = Object.keys(NOMES_DOS_GRUPOS) as GrupoVariavel[];

export function EditorContrato({
  texto: textoInicial,
  config: configInicial,
  contratada,
  hoje,
  podeMudar,
}: {
  texto: string;
  config: ConfigContrato;
  contratada: DadosDoContrato["contratada"];
  hoje: string;
  podeMudar: boolean;
}) {
  const [estado, salvar] = useActionState(salvarContratoAcao, undefined);
  const [estadoPadrao, restaurar] = useActionState(restaurarContratoAcao, undefined);
  const [texto, setTexto] = useState(estado?.valores?.texto ?? textoInicial);
  const [config, setConfig] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS_CONFIG.map((c) => [c.chave, String(estado?.valores?.[c.chave] ?? configInicial[c.chave] ?? c.padrao)])),
  );
  const [certeza, setCerteza] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const previa = useMemo(() => {
    const c = validarConfig(config);
    return desenharContrato(texto, valoresDoContrato(dadosDeExemplo(c.ok ? c.config : configInicial, contratada, hoje)));
  }, [texto, config, configInicial, contratada, hoje]);

  function inserir(chave: string) {
    const el = area.current;
    const marca = `{{${chave}}}`;
    if (!el) return setTexto((t) => t + marca);
    const [a, b] = [el.selectionStart ?? texto.length, el.selectionEnd ?? texto.length];
    const novo = texto.slice(0, a) + marca + texto.slice(b);
    setTexto(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + marca.length, a + marca.length);
    });
  }

  return (
    <div className="ct-editor">
      <form action={salvar} className="ct-editor__lado form" noValidate>
        <p className="ct-aviso" role="note">
          <Icone nome="alerta" size={16} /> {AVISO_MODELO}
        </p>
        {estado?.mensagem ? (
          <p className="erro" role="alert">
            {estado.mensagem}
          </p>
        ) : null}
        {estado?.aviso || estadoPadrao?.aviso ? (
          <p className="aviso-ok" role="status">
            <Icone nome="check" size={16} /> {estado?.aviso ?? estadoPadrao?.aviso}
          </p>
        ) : null}
        {estadoPadrao?.mensagem ? (
          <p className="erro" role="alert">
            {estadoPadrao.mensagem}
          </p>
        ) : null}
        <div className="ct-chips" aria-label="Variáveis">
          {GRUPOS.map((g) => (
            <div key={g} className="ct-chips__grupo">
              <span className="ct-chips__rotulo">{NOMES_DOS_GRUPOS[g]}</span>
              {VARIAVEIS.filter((v) => v.grupo === g).map((v) => (
                <button key={v.chave} type="button" className="ct-chip" title={`{{${v.chave}}}`} disabled={!podeMudar} onClick={() => inserir(v.chave)}>
                  {v.rotulo}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className={`form__campo form__campo--largo${estado?.erros?.texto ? " form__campo--erro" : ""}`}>
          <label htmlFor="ct-texto">Texto do contrato</label>
          <textarea
            id="ct-texto"
            ref={area}
            name="texto"
            className="ct-editor__texto"
            rows={22}
            value={texto}
            readOnly={!podeMudar}
            spellCheck
            onChange={(e) => setTexto(e.target.value)}
          />
          <span className="form__dica"># título · ## cláusula · linha em branco separa parágrafos · - item</span>
        </div>
        <details className="ct-numeros">
          <summary>Números do contrato</summary>
          <fieldset className="form__grade" disabled={!podeMudar}>
            {CAMPOS_CONFIG.map((c) => {
              const erro = estado?.erros?.[c.chave];
              return (
                <div key={c.chave} className={`form__campo${c.tipo === "texto" ? " form__campo--largo" : ""}${erro ? " form__campo--erro" : ""}`}>
                  <label htmlFor={`ct-${c.chave}`}>{c.rotulo}</label>
                  <input
                    id={`ct-${c.chave}`}
                    name={c.chave}
                    inputMode={c.tipo === "numero" ? "decimal" : undefined}
                    className={c.tipo === "numero" ? "num" : undefined}
                    maxLength={c.tipo === "numero" ? 8 : 200}
                    placeholder={c.chave === "foro_cidade" ? "Cidade da sede" : undefined}
                    value={config[c.chave] ?? ""}
                    aria-invalid={erro ? true : undefined}
                    onChange={(e) => setConfig((x) => ({ ...x, [c.chave]: e.target.value }))}
                  />
                  {erro ? <span className="form__erro">{erro}</span> : null}
                </div>
              );
            })}
          </fieldset>
        </details>
        {podeMudar ? (
          <div className="acoes">
            <Salvar />
            {certeza ? (
              <span className="remover__certeza">
                <span>Voltar ao modelo base?</span>
                <button type="submit" formAction={restaurar} className="q-perigo">
                  Sim
                </button>
                <button type="button" className="q-limpar" onClick={() => setCerteza(false)}>
                  Não
                </button>
              </span>
            ) : (
              <button type="button" className="glass-btn glass-btn--sm" onClick={() => setCerteza(true)}>
                <Icone nome="retorno" size={16} /> Restaurar modelo base
              </button>
            )}
          </div>
        ) : null}
      </form>
      <aside className="ct-editor__previa" aria-label="Prévia com dados de exemplo">
        <span className="marca__previa-rotulo">Prévia com dados de exemplo</span>
        <div className="ct-folha" dangerouslySetInnerHTML={{ __html: previa }} />
      </aside>
    </div>
  );
}
