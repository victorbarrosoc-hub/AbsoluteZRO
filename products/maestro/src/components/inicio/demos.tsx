"use client";

/**
 * As duas demonstrações de mexer da página inicial, com as regras de verdade do app (módulos puros, os mesmos que a tela
 * usa): a viagem pelos veículos de partida (`veiculos.ts`) e quem vê o quê pelo padrão de cada papel (`acessos.ts`).
 * Nada de preço inventado: a viagem mostra km e litros; o preço do litro é o da semana da ANP, só dentro do app.
 */
import { useState } from "react";
import { AREA, AREAS, PADRAO } from "@/lib/acessos";
import { COMBUSTIVEIS } from "@/lib/orcamento/deslocamento";
import { aplicarVeiculo, veiculoPadrao } from "@/lib/orcamento/veiculos";
import { NOME_DO_PAPEL, PAPEIS } from "@/lib/papeis";
import type { Papel } from "@/lib/papeis";

const VEICULOS = ["compacto", "suv", "van", "micro"].map((id) => veiculoPadrao(id)!);
/** Uma diária a 100 km da produtora, ida e volta. */
const KM = 200;
const num = (n: number, casas = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function DemoViagem() {
  const [id, setId] = useState("suv");
  const v = VEICULOS.find((x) => x.id === id) ?? VEICULOS[0];
  const { combustivel, kmL } = aplicarVeiculo(v, "gasolina");
  const litros = KM / kmL;
  return (
    <div className="dviagem">
      <div className="dviagem__carros" role="group" aria-label="Veículo">
        {VEICULOS.map((x) => (
          <button key={x.id} type="button" className="dchip" aria-pressed={x.id === id} onClick={() => setId(x.id)} title={x.exemplos}>
            {x.nome}
          </button>
        ))}
      </div>
      <dl className="dviagem__conta" aria-live="polite">
        <div>
          <dt>Ida e volta</dt>
          <dd>{KM} km</dd>
        </div>
        <div>
          <dt>Consumo</dt>
          <dd>{num(kmL, kmL % 1 ? 1 : 0)} km/L</dd>
        </div>
        <div>
          <dt>{COMBUSTIVEIS[combustivel].nome}</dt>
          <dd>
            <strong>{num(litros)} L</strong>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function DemoAcessos() {
  const [papel, setPapel] = useState<Papel>("gestor");
  const a = PADRAO[papel];
  return (
    <div className="dacessos">
      <div className="dacessos__papeis" role="group" aria-label="Papel na produtora">
        {PAPEIS.map((p) => (
          <button key={p} type="button" aria-pressed={p === papel} className="dchip" onClick={() => setPapel(p)}>
            {NOME_DO_PAPEL[p]}
          </button>
        ))}
      </div>
      <ul className="dacessos__areas" aria-label={`O que a ${NOME_DO_PAPEL[papel]} vê`}>
        {AREAS.map((k) => (
          <li key={k} title={AREA[k].dica} data-ligada={a[k] ? "" : undefined}>
            <span>{AREA[k].nome}</span>
            <i className="dacessos__chave" aria-hidden="true" />
            <span className="sr-only">{a[k] ? "vê" : "não vê"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
