/**
 * Veículos de partida da calculadora de deslocamento (pedido do titular, 29/10/2026): os tipos de carro de produção mais
 * comuns no Brasil, com um consumo de estrada por combustível (km/L). São médias arredondadas para baixo, pensando no
 * carro com equipe e equipamento (referência: o consumo de estrada do Programa Brasileiro de Etiquetagem do Inmetro
 * para os modelos de exemplo; o etanol rende uns 70% da gasolina). Valem como ponto de partida: o campo "Consumo"
 * continua aberto e o inventário da produtora entra junto. Puro: a tela e os testes leem daqui.
 */
import type { Combustivel } from "./deslocamento";

export type VeiculoPadrao = {
  id: string;
  nome: string;
  /** Modelos de exemplo, para a dica do botão. */
  exemplos: string;
  /** Km por litro em cada combustível que o tipo usa; o primeiro é o mais comum. */
  kmL: Partial<Record<Combustivel, number>>;
};

export const VEICULOS_PADRAO: readonly VeiculoPadrao[] = [
  { id: "compacto", nome: "Compacto", exemplos: "Mobi, Kwid, HB20 1.0", kmL: { gasolina: 14, etanol: 10 } },
  { id: "seda", nome: "Sedã", exemplos: "Onix Plus, Virtus, Corolla", kmL: { gasolina: 13, etanol: 9 } },
  { id: "suv", nome: "SUV compacto", exemplos: "T-Cross, Creta, Tracker", kmL: { gasolina: 12, etanol: 8.5 } },
  { id: "suv-medio", nome: "SUV médio", exemplos: "Compass, Taos, SW4", kmL: { gasolina: 10.5, etanol: 7.5, diesel: 11 } },
  { id: "picape-compacta", nome: "Picape compacta", exemplos: "Strada, Saveiro, Montana", kmL: { gasolina: 13, etanol: 9 } },
  { id: "picape", nome: "Picape diesel", exemplos: "Hilux, S10, Ranger", kmL: { diesel: 10.5 } },
  { id: "van", nome: "Van", exemplos: "Ducato, Master, Sprinter", kmL: { diesel: 9 } },
  { id: "micro", nome: "Micro-ônibus", exemplos: "Volare, Sprinter 20 lugares", kmL: { diesel: 6.5 } },
];

export const veiculoPadrao = (id: string | null | undefined) => VEICULOS_PADRAO.find((v) => v.id === id) ?? null;

/** Os combustíveis que o tipo usa, na ordem (o mais comum primeiro). */
export const combustiveisDo = (v: VeiculoPadrao) => Object.keys(v.kmL) as Combustivel[];

/** O consumo do tipo no combustível; null se ele não usa esse combustível. */
export const consumoDo = (v: VeiculoPadrao, c: Combustivel): number | null => v.kmL[c] ?? null;

/**
 * Escolher o tipo: mantém o combustível escolhido se o tipo usa; senão troca para o mais comum dele (a van é diesel).
 * Devolve o combustível e o consumo que a tela passa a mostrar.
 */
export function aplicarVeiculo(v: VeiculoPadrao, atual: Combustivel): { combustivel: Combustivel; kmL: number } {
  const combustivel = v.kmL[atual] != null ? atual : combustiveisDo(v)[0];
  return { combustivel, kmL: v.kmL[combustivel]! };
}
