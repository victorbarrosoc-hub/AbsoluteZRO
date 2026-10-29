"use client";
/**
 * O funil na tela (drizzle/0014): a etapa do pedido (com o motivo quando é "Perdido"), o mover rápido do quadro, o
 * próximo contato e o "contato feito". Cada controle chama uma Server Action que confere sessão e papel; o banco
 * confere de novo (o gatilho barra "Ganho" sem orçamento aprovado e "Perdido" sem motivo).
 */
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { contatoFeitoAcao, moverEtapaAcao, retornoAcao, valorEstimadoAcao } from "@/app/(app)/app/pedidos/acoes";
import { ETAPAS, MOTIVOS_PERDA, type Etapa } from "@/lib/funil/regras";
import { Icone } from "./icones";

function Ok({ texto }: { texto?: string }) {
  return texto ? (
    <span className="aviso-ok aviso-ok--linha" role="status">
      <Icone nome="check" size={14} /> {texto}
    </span>
  ) : null;
}

function Erro({ texto }: { texto?: string }) {
  return texto ? (
    <span className="erro erro--linha" role="alert">
      {texto}
    </span>
  ) : null;
}

function Enviar({ rotulo, classe = "glass-btn glass-btn--sm glass-btn--ink" }: { rotulo: string; classe?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={classe} disabled={pending} aria-busy={pending || undefined}>
      {pending ? "…" : rotulo}
    </button>
  );
}

/** A etapa do pedido: uma linha de botões; "Perdido" abre o motivo. "Ganho" só aparece com o orçamento aprovado. */
export function EtapaDoPedido({ id, etapa, podeGanhar, abrirPerda }: { id: string; etapa: Etapa; podeGanhar: boolean; abrirPerda?: boolean }) {
  const [estado, enviar] = useActionState(moverEtapaAcao, undefined);
  const [perder, setPerder] = useState(Boolean(abrirPerda) && etapa !== "perdido" && etapa !== "ganho");
  const form = useRef<HTMLFormElement>(null);
  const fechado = etapa === "ganho";
  return (
    <form ref={form} action={enviar} className="funil-etapa">
      <input type="hidden" name="id" value={id} />
      <div className="funil-etapa__trilho" role="group" aria-label="Etapa do pedido">
        {ETAPAS.map((e) => {
          const atual = e.k === etapa;
          const bloqueado = fechado || (e.k === "ganho" && !podeGanhar);
          return (
            <button
              key={e.k}
              type={e.k === "perdido" ? "button" : "submit"}
              name={e.k === "perdido" ? undefined : "etapa"}
              value={e.k}
              data-etapa={e.k}
              aria-pressed={atual}
              disabled={bloqueado || atual}
              title={e.k === "ganho" && !podeGanhar ? "Ganho quando o orçamento for aprovado" : undefined}
              onClick={e.k === "perdido" ? () => setPerder(true) : undefined}
            >
              <i aria-hidden="true" />
              {e.nome}
            </button>
          );
        })}
      </div>
      {perder && !fechado && etapa !== "perdido" ? (
        <div className="funil-perda">
          <label htmlFor={`motivo-${id}`}>Motivo da perda</label>
          <input id={`motivo-${id}`} name="motivo" list={`motivos-${id}`} maxLength={300} required autoFocus placeholder="Preço, prazo…" />
          <datalist id={`motivos-${id}`}>
            {MOTIVOS_PERDA.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button type="submit" name="etapa" value="perdido" className="glass-btn glass-btn--sm glass-btn--ink">
            Marcar perdido
          </button>
          <button type="button" className="q-limpar" onClick={() => setPerder(false)}>
            Cancelar
          </button>
        </div>
      ) : null}
      <Erro texto={estado?.mensagem} />
      <Ok texto={estado?.aviso} />
    </form>
  );
}

/** No quadro do funil: um seletor que move direto (Perdido vai para a ficha, que pede o motivo). */
export function MoverRapido({ id, etapa, podeGanhar }: { id: string; etapa: Etapa; podeGanhar: boolean }) {
  const [estado, enviar] = useActionState(moverEtapaAcao, undefined);
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  if (etapa === "ganho") return null;
  return (
    <form ref={form} action={enviar} className="funil-mover">
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`mover-${id}`}>
        Mover para
      </label>
      <select
        id={`mover-${id}`}
        name="etapa"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (v === "perdido") router.push(`/app/pedidos/${id}?perder=1`);
          else form.current?.requestSubmit();
        }}
      >
        <option value="" disabled>
          Mover…
        </option>
        {ETAPAS.filter((e) => e.k !== etapa && (e.k !== "ganho" || podeGanhar)).map((e) => (
          <option key={e.k} value={e.k}>
            {e.nome}
          </option>
        ))}
      </select>
      <Erro texto={estado?.mensagem} />
    </form>
  );
}

/** Próximo contato: data + nota; "Tirar" apaga. */
export function ProximoContato({ alvo, id, data, nota }: { alvo: "pedido" | "cliente"; id: string; data: string | null; nota: string | null }) {
  const [estado, enviar] = useActionState(retornoAcao, undefined);
  return (
    <form action={enviar} className="funil-retorno" key={estado?.n ?? 0}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="alvo" value={alvo} />
      <div className="funil-retorno__campos">
        <label>
          <span>Próximo contato</span>
          <input type="date" name="data" defaultValue={data ?? ""} required />
        </label>
        <label className="funil-retorno__nota">
          <span>Nota</span>
          <input name="nota" defaultValue={nota ?? ""} maxLength={300} placeholder="Assunto do retorno" />
        </label>
      </div>
      <div className="acoes">
        <Enviar rotulo={data ? "Mudar" : "Marcar"} />
        {data ? (
          <button type="submit" name="tirar" value="1" className="q-limpar" formNoValidate>
            Tirar
          </button>
        ) : null}
      </div>
      <Erro texto={estado?.mensagem} />
      <Ok texto={estado?.aviso} />
    </form>
  );
}

/** "Contato feito": a nota (opcional) e, se quiser, já o próximo. */
export function ContatoFeito({ alvo, id }: { alvo: "pedido" | "cliente"; id: string }) {
  const [estado, enviar] = useActionState(contatoFeitoAcao, undefined);
  return (
    <details className="funil-feito" key={estado?.n ?? 0}>
      <summary className="glass-btn glass-btn--sm">
        <Icone nome="check" size={15} /> Contato feito
      </summary>
      <form action={enviar}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="alvo" value={alvo} />
        <label>
          <span>Como foi</span>
          <input name="nota" maxLength={500} placeholder="Falamos por WhatsApp" />
        </label>
        <label>
          <span>Próximo (opcional)</span>
          <input type="date" name="proximo" />
        </label>
        <Enviar rotulo="Registrar" />
        <Erro texto={estado?.mensagem} />
      </form>
      <Ok texto={estado?.aviso} />
    </details>
  );
}

export function ValorEstimado({ id, valor }: { id: string; valor: string }) {
  const [estado, enviar] = useActionState(valorEstimadoAcao, undefined);
  return (
    <form action={enviar} className="funil-valor">
      <input type="hidden" name="id" value={id} />
      <label>
        <span>Valor estimado</span>
        <input name="valor" defaultValue={valor} inputMode="decimal" className="num" placeholder="R$ 0,00" />
      </label>
      <Enviar rotulo="Salvar" classe="glass-btn glass-btn--sm" />
      <Erro texto={estado?.mensagem} />
      <Ok texto={estado?.aviso} />
    </form>
  );
}
