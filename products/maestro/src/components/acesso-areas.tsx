"use client";
/**
 * O que uma pessoa vê (Ajustes → Pessoas, só a administração): um interruptor por área sensível, como nos Ajustes do
 * iPhone. Cada toque salva na hora (a action confere a sessão e o papel; o banco confere de novo e audita) e o
 * interruptor fica como o banco gravou; se o banco recusar, volta. A dica de cada área fica no `title` (pouco texto).
 */
import { startTransition, useActionState, useRef, useState } from "react";
import { salvarAreasAcao } from "@/app/(app)/app/ajustes/pessoas/acoes";
import { AREA, AREAS, ehArea, type Area } from "@/lib/acessos";
import { Icone, type NomeIcone } from "./icones";
// O interruptor `.ag-switch` mora lá (o mesmo dos Ajustes → Agenda).
import "@/app/agenda-google.css";

const ICONE: Record<Area, NomeIcone> = {
  financeiro: "dinheiro",
  orcamentos: "orcamento",
  contratos: "documento",
  diarias: "freelas",
  dados_equipe: "cadeado",
  inventario_valores: "inventario",
};

const igual = (a: readonly Area[], b: readonly Area[]) => a.length === b.length && a.every((x) => b.includes(x));

export function AcessoAreas({
  sub,
  nome,
  ligadas,
  padrao,
  nomePapel,
}: {
  sub: string;
  nome: string;
  /** As áreas que a pessoa vê hoje. */
  ligadas: Area[];
  /** As do padrão do papel (para "Voltar ao padrão"). */
  padrao: Area[];
  /** "Gestão", "Equipe", "Leitura". */
  nomePapel: string;
}) {
  const [estado, enviar, pendente] = useActionState(salvarAreasAcao, undefined);
  const form = useRef<HTMLFormElement>(null);
  const [marcadas, setMarcadas] = useState<Area[]>(ligadas);
  const [gravadas, setGravadas] = useState<Area[]>(ligadas);
  const [visto, setVisto] = useState(estado);
  // Resposta nova da action: o que o banco gravou vale; recusa, volta ao último gravado.
  if (estado !== visto) {
    setVisto(estado);
    const r = estado?.valores?.areas;
    if (typeof r === "string") {
      const v = r.split(",").filter(ehArea);
      setMarcadas(v);
      setGravadas(v);
    } else if (estado?.mensagem) setMarcadas(gravadas);
  }
  const ajustado = !igual(marcadas, padrao);
  return (
    <form
      ref={form}
      className="areas"
      aria-label={`O que ${nome} vê`}
      // Sem `action={…}`: o React limparia o formulário depois da resposta e o interruptor controlado ficaria
      // desenhado como no começo. Aqui o envio é nosso, com o botão que enviou (o "Voltar ao padrão").
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => enviar(fd));
      }}
    >
      <input type="hidden" name="sub" value={sub} />
      <ul className="areas__lista">
        {AREAS.map((a) => (
          <li key={a}>
            <label className="areas__item" title={AREA[a].dica}>
              <span className="areas__icone" data-area={a} aria-hidden="true">
                <Icone nome={ICONE[a]} size={16} />
              </span>
              <span className="areas__nome">{AREA[a].nome}</span>
              <input
                type="checkbox"
                className="ag-switch"
                name="area"
                value={a}
                checked={marcadas.includes(a)}
                disabled={pendente}
                onChange={(e) => {
                  const ligar = e.target.checked;
                  setMarcadas((m) => (ligar ? [...m.filter((x) => x !== a), a] : m.filter((x) => x !== a)));
                  // Depois do React aplicar o estado: o formulário leva os interruptores como estão.
                  requestAnimationFrame(() => form.current?.requestSubmit());
                }}
              />
            </label>
          </li>
        ))}
      </ul>
      <div className="areas__pe">
        {ajustado ? (
          <button type="submit" name="padrao" value="1" className="q-limpar" disabled={pendente}>
            Voltar ao padrão da {nomePapel}
          </button>
        ) : (
          <span className="sutil">Padrão da {nomePapel}</span>
        )}
        {estado?.mensagem ? (
          <span className="erro erro--linha" role="alert">
            {estado.mensagem}
          </span>
        ) : estado?.aviso ? (
          <span className="aviso-ok aviso-ok--linha" role="status">
            <Icone nome="check" size={14} /> {estado.aviso}
          </span>
        ) : null}
      </div>
    </form>
  );
}
