"use client";
/**
 * O kit próprio do freela (drizzle/0013): lista por categoria, editar e tirar os itens do Maestro, "do Carro do Freela"
 * só leitura (a fonte de verdade futura), e o formulário para acrescentar. Também o "leva equipamento" da escala: os
 * itens do freela marcados, com a diária de aluguel somando ao a pagar.
 */
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { brl, centavosParaCampo } from "@/lib/dinheiro";
import { CATEGORIAS_EQUIP_FREELA, nomeCategoriaEquip, nomeDoEquip, type EquipFreela } from "@/lib/freelas/kit";
import { equipNaEscalaAcao, removerEquipFreelaAcao, salvarEquipFreelaAcao } from "@/app/(app)/app/freelas/acoes";
import { Icone } from "./icones";

function Botao({ rotulo, classe = "glass-btn glass-btn--sm glass-btn--ink" }: { rotulo: string; classe?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={classe} disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </button>
  );
}

function FormEquip({ freelaId, item, aoFim, veValores = true }: { freelaId: string; item?: EquipFreela; aoFim?: () => void; veValores?: boolean }) {
  const [estado, enviar] = useActionState(async (a: Parameters<typeof salvarEquipFreelaAcao>[0], fd: FormData) => {
    const r = await salvarEquipFreelaAcao(a, fd);
    if (r?.aviso && aoFim) aoFim();
    return r;
  }, undefined);
  const v = estado?.valores ?? {
    categoria: item?.categoria ?? "camera",
    marca: item?.marca ?? "",
    modelo: item?.modelo ?? "",
    quantidade: String(item?.quantidade ?? 1),
    diaria: item?.diariaCents != null ? centavosParaCampo(item.diariaCents) : "",
    observacao: item?.observacao ?? "",
  };
  const erro = (k: string) => (estado?.erros?.[k] ? <span className="form__erro">{estado.erros[k]}</span> : null);
  return (
    <form action={enviar} className="kit-form" key={estado?.n ?? 0} noValidate>
      <input type="hidden" name="freela" value={freelaId} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <label className="form__campo">
        <span>Categoria</span>
        <select name="categoria" defaultValue={v.categoria}>
          {CATEGORIAS_EQUIP_FREELA.map((c) => (
            <option key={c.k} value={c.k}>
              {c.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="form__campo">
        <span>Marca</span>
        <input name="marca" maxLength={60} defaultValue={v.marca} placeholder="Sony" />
        {erro("marca")}
      </label>
      <label className="form__campo kit-form__largo">
        <span>Modelo</span>
        <input name="modelo" maxLength={120} defaultValue={v.modelo} placeholder="FX6" aria-invalid={!!estado?.erros?.modelo || undefined} />
        {erro("modelo")}
      </label>
      <label className="form__campo">
        <span>Qtd</span>
        <input name="quantidade" inputMode="numeric" className="num" maxLength={3} defaultValue={v.quantidade} />
        {erro("quantidade")}
      </label>
      {veValores ? (
        <label className="form__campo">
          <span>Diária do aluguel</span>
          <input name="diaria" inputMode="decimal" className="num" maxLength={14} defaultValue={v.diaria} placeholder="opcional" />
          {erro("diaria")}
        </label>
      ) : null}
      <label className="form__campo kit-form__largo">
        <span>Observação</span>
        <input name="observacao" maxLength={500} defaultValue={v.observacao} />
      </label>
      {estado?.mensagem ? (
        <p className="erro kit-form__largo" role="alert">
          {estado.mensagem}
        </p>
      ) : null}
      <div className="acoes kit-form__largo">
        <Botao rotulo={item ? "Salvar" : "Adicionar"} />
        {aoFim ? (
          <button type="button" className="q-limpar" onClick={aoFim}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Remover({ id, freelaId }: { id: string; freelaId: string }) {
  const [estado, enviar] = useActionState(removerEquipFreelaAcao, undefined);
  return (
    <form action={enviar}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="freela" value={freelaId} />
      <button type="submit" className="q-limpar" aria-label="Tirar" title={estado?.mensagem ?? "Tirar"}>
        <Icone nome="lixo" size={15} />
      </button>
    </form>
  );
}

/** `veValores` = a área "Diárias e cachês": sem ela, nada de diária na lista nem no formulário (o servidor já manda vazio). */
export function KitDoFreela({
  freelaId,
  itens,
  podeMudar,
  veValores = true,
}: {
  freelaId: string;
  itens: EquipFreela[];
  podeMudar: boolean;
  veValores?: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  return (
    <div className="kit">
      {itens.length ? (
        <ul className="kit-lista">
          {itens.map((e) =>
            editando === e.id ? (
              <li key={e.id} className="kit-item kit-item--aberto">
                <FormEquip freelaId={freelaId} item={e} aoFim={() => setEditando(null)} veValores={veValores} />
              </li>
            ) : (
              <li key={e.id} className="kit-item" data-inativo={!e.ativo || undefined}>
                <span className="kit-item__cat" data-cat={e.categoria}>
                  {nomeCategoriaEquip(e.categoria)}
                </span>
                <span className="kit-item__nome">
                  {nomeDoEquip(e)}
                  {e.observacao ? <small>{e.observacao}</small> : null}
                </span>
                {e.origem === "carro-do-freela" ? (
                  <span className="selo" title="Vem do inventário do freela no Carro do Freela; muda só lá.">
                    <i aria-hidden="true" />
                    do Carro do Freela
                  </span>
                ) : null}
                {!e.ativo ? <span className="selo">Inativo</span> : null}
                <span className="kit-item__diaria num">{e.diariaCents != null ? `${brl(e.diariaCents)}/dia` : ""}</span>
                {podeMudar && e.origem === "maestro" ? (
                  <span className="kit-item__acoes">
                    <button type="button" className="q-limpar" aria-label={`Editar ${e.modelo}`} onClick={() => setEditando(e.id)}>
                      <Icone nome="editar" size={15} />
                    </button>
                    <Remover id={e.id} freelaId={freelaId} />
                  </span>
                ) : null}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="nada">Sem equipamento próprio cadastrado.</p>
      )}
      {podeMudar ? (
        novo ? (
          <FormEquip freelaId={freelaId} aoFim={() => setNovo(false)} veValores={veValores} />
        ) : (
          <button type="button" className="glass-btn glass-btn--sm" onClick={() => setNovo(true)}>
            <Icone nome="mais" size={15} /> Adicionar equipamento
          </button>
        )
      ) : null}
    </div>
  );
}

/** "Leva equipamento" numa escala: marca os itens do freela; o aluguel (diária × dias) entra no a pagar. */
export function EquipNaEscala({
  escalaId,
  disponiveis,
  marcados,
  dias,
  aluguelCents,
  veValores = true,
}: {
  escalaId: string;
  disponiveis: EquipFreela[];
  marcados: string[];
  dias: number;
  aluguelCents: number;
  veValores?: boolean;
}) {
  const [estado, enviar] = useActionState(equipNaEscalaAcao, undefined);
  const [sel, setSel] = useState<string[]>(marcados);
  if (!disponiveis.length) return null;
  const soma = disponiveis.filter((d) => sel.includes(d.id)).reduce((t, d) => t + (d.diariaCents ?? 0), 0) * Math.max(1, dias);
  return (
    <details className="kit-escala">
      <summary>
        <Icone nome="inventario" size={14} /> {marcados.length ? `Leva ${marcados.length} ${marcados.length > 1 ? "itens" : "item"}` : "Leva equipamento?"}
        {aluguelCents > 0 ? <span className="sutil"> · {brl(aluguelCents)}</span> : null}
      </summary>
      <form action={enviar} className="kit-escala__form">
        <input type="hidden" name="escala" value={escalaId} />
        {disponiveis.map((d) => (
          <label key={d.id} className="kit-escala__item">
            <input
              type="checkbox"
              name="equip"
              value={d.id}
              checked={sel.includes(d.id)}
              onChange={(e) => setSel((x) => (e.target.checked ? [...x, d.id] : x.filter((i) => i !== d.id)))}
            />
            <span>{nomeDoEquip(d)}</span>
            {veValores ? <span className="sutil num">{d.diariaCents != null ? `${brl(d.diariaCents)}/dia` : "sem aluguel"}</span> : null}
          </label>
        ))}
        <div className="acoes">
          <Botao rotulo={soma > 0 ? `Salvar · aluguel ${brl(soma)}` : "Salvar"} />
          {estado?.mensagem ? (
            <span className="erro erro--linha" role="alert">
              {estado.mensagem}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}
