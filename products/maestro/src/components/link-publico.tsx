"use client";
/**
 * Os links públicos na tela da equipe: o link de pedido (Ajustes → Link de pedido: copiar, compartilhar no WhatsApp,
 * escolher as perguntas, trocar e revogar) e o link do orçamento (enviar ao cliente com as parcelas, copiar, revogar).
 * O token só chega aqui para quem pode (admin e gestão); o banco guarda só o sha256.
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { brl } from "@/lib/dinheiro";
import { PERGUNTAS_PADRAO, type ConfigPedido } from "@/lib/pedidos/formulario";
import { parcelasPadrao } from "@/lib/orcamento/motor";
import { criarLinkPedidoAcao, revogarLinkPedidoAcao, salvarConfigPedidoAcao } from "@/app/(app)/app/ajustes/pedido/acoes";
import { gerarLinkOrcamentoAcao, revogarLinkOrcamentoAcao } from "@/app/(app)/app/orcamentos/acoes";
import type { EstadoForm } from "./form";
import { Icone } from "./icones";

function Enviar({ rotulo, classe = "glass-btn glass-btn--ink" }: { rotulo: string; classe?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={classe} disabled={pending}>
      {pending ? "Um instante…" : rotulo}
    </button>
  );
}

function Aviso({ e }: { e: EstadoForm }) {
  if (e?.mensagem)
    return (
      <p className="erro" role="alert">
        {e.mensagem}
      </p>
    );
  if (e?.aviso)
    return (
      <p className="aviso-ok" role="status">
        <Icone nome="check" size={16} /> {e.aviso}
      </p>
    );
  return null;
}

export function CopiarLink({ url, texto }: { url: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="lp-link">
      <input readOnly value={url} aria-label="Endereço do link" onFocus={(e) => e.currentTarget.select()} />
      <div className="acoes">
        <button
          type="button"
          className="glass-btn glass-btn--sm glass-btn--ink"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              setCopiado(false);
            }
          }}
        >
          <Icone nome={copiado ? "check" : "copiar"} size={15} /> {copiado ? "Copiado" : "Copiar"}
        </button>
        <a className="glass-btn glass-btn--sm" href={`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`} target="_blank" rel="noreferrer">
          <Icone nome="whatsapp" size={15} /> WhatsApp
        </a>
        <a className="glass-btn glass-btn--sm glass-btn--icone" href={url} target="_blank" rel="noreferrer" aria-label="Abrir o link" title="Abrir">
          <Icone nome="externo" size={15} />
        </a>
      </div>
    </div>
  );
}

const ROTULOS: Record<keyof typeof PERGUNTAS_PADRAO, string> = {
  ideia: "A ideia, em texto",
  datas: "Datas",
  local: "Local",
  investimento: "Faixa de investimento",
};

export function LinkDePedido({ url, config, usos }: { url: string | null; config: ConfigPedido; usos: number }) {
  const [eCriar, criar] = useActionState(criarLinkPedidoAcao, undefined);
  const [eSalvar, salvar] = useActionState(salvarConfigPedidoAcao, undefined);
  const [eRevogar, revogar] = useActionState(revogarLinkPedidoAcao, undefined);
  const [certeza, setCerteza] = useState(false);
  return (
    <div className="lp">
      <section className="ficha lp-cartao" aria-label="O link">
        {url ? (
          <>
            <div>
              <strong className="ficha__titulo">Ativo</strong>
              <p className="sutil">
                {usos ? `Aberto ${usos} ${usos > 1 ? "vezes" : "vez"}.` : "Ainda não foi aberto."} Os pedidos chegam em Comercial → Pedidos.
              </p>
            </div>
            <CopiarLink url={url} texto="Peça seu orçamento:" />
            <div className="acoes">
              <form action={criar}>
                <Enviar rotulo="Trocar link" classe="glass-btn glass-btn--sm" />
              </form>
              {certeza ? (
                <form action={revogar} className="remover__certeza">
                  <span>O link para de abrir.</span>
                  <Enviar rotulo="Revogar" classe="q-perigo" />
                  <button type="button" className="q-limpar" onClick={() => setCerteza(false)}>
                    Não
                  </button>
                </form>
              ) : (
                <button type="button" className="q-perigo" onClick={() => setCerteza(true)}>
                  Revogar
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <strong className="ficha__titulo">Sem link ativo</strong>
              <p className="sutil">Crie e compartilhe na bio, no site ou no WhatsApp.</p>
            </div>
            <form action={criar}>
              <Enviar rotulo="Criar link" />
            </form>
          </>
        )}
        <Aviso e={eCriar ?? eRevogar} />
      </section>

      {url ? (
        <form action={salvar} className="ficha lp-cartao" aria-label="Perguntas">
          <div>
            <strong className="ficha__titulo">Perguntas</strong>
            <p className="sutil">Tipo, nicho e entregas vêm da tabela de preços. Contato e consentimento sempre.</p>
          </div>
          <div className="lp-perguntas">
            {(Object.keys(PERGUNTAS_PADRAO) as (keyof typeof PERGUNTAS_PADRAO)[]).map((k) => (
              <label key={k} className="lp-pergunta">
                <input type="checkbox" name={`p_${k}`} defaultChecked={config.perguntas[k]} />
                <span>{ROTULOS[k]}</span>
              </label>
            ))}
          </div>
          <label className="form__campo">
            <span>Boas-vindas</span>
            <textarea
              name="boasVindas"
              rows={2}
              maxLength={280}
              defaultValue={config.boasVindas ?? ""}
              placeholder="Conte o que você precisa. Respondemos em até um dia útil."
            />
          </label>
          <div className="acoes">
            <Enviar rotulo="Salvar perguntas" classe="glass-btn glass-btn--sm glass-btn--ink" />
          </div>
          <Aviso e={eSalvar} />
        </form>
      ) : null}
    </div>
  );
}

export function LinkDoOrcamentoPainel({
  orcamentoId,
  url,
  total,
  hoje,
  status,
  parcelasAtuais,
  expira,
  usos,
}: {
  orcamentoId: string;
  url: string | null;
  total: number;
  hoje: string;
  status: string;
  parcelasAtuais: number;
  expira: string | null;
  usos: number;
}) {
  const [eGerar, gerar] = useActionState(gerarLinkOrcamentoAcao, undefined);
  const [eRevogar, revogar] = useActionState(revogarLinkOrcamentoAcao, undefined);
  const [n, setN] = useState(parcelasAtuais >= 1 && parcelasAtuais <= 3 ? parcelasAtuais : 2);
  const previa = total > 0 ? parcelasPadrao(total, n, hoje) : [];
  const pode = status === "rascunho" || status === "enviado";
  return (
    <section className="ficha lp-cartao lp-orcamento" aria-label="Link para o cliente">
      <div>
        <strong className="ficha__titulo">Link para o cliente</strong>
        <p className="sutil">
          {url
            ? `${usos ? `Aberto ${usos} ${usos > 1 ? "vezes" : "vez"}` : "Ainda não aberto"}${expira ? ` · vale até ${new Date(expira).toLocaleDateString("pt-BR")}` : ""}.`
            : "O cliente vê o timbrado e aceita. O aceite abre o projeto e as parcelas."}
        </p>
      </div>
      {url ? <CopiarLink url={url} texto="Sua proposta:" /> : null}
      {pode ? (
        <form action={gerar} className="lp-gerar">
          <input type="hidden" name="id" value={orcamentoId} />
          <input type="hidden" name="parcelas" value={n} />
          <div className="q-segmentos" role="radiogroup" aria-label="Parcelas">
            {[1, 2, 3].map((x) => (
              <button key={x} type="button" role="radio" aria-checked={n === x} onClick={() => setN(x)}>
                {x === 1 ? "À vista" : `${x}x`}
              </button>
            ))}
          </div>
          {previa.length ? (
            <ol className="lp-parcelas">
              {previa.map((p, i) => (
                <li key={i}>
                  <b className="num">{brl(p.valorCents)}</b> <span className="sutil">{p.rotulo}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <Enviar rotulo={url ? "Gerar de novo" : "Enviar link"} classe={url ? "glass-btn glass-btn--sm" : "glass-btn glass-btn--sm glass-btn--ink"} />
        </form>
      ) : null}
      {url && pode ? (
        <form action={revogar}>
          <input type="hidden" name="id" value={orcamentoId} />
          <Enviar rotulo="Revogar link" classe="q-perigo" />
        </form>
      ) : null}
      <Aviso e={eGerar ?? eRevogar} />
    </section>
  );
}
