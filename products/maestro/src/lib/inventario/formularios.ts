/** Campos dos formulários do inventário e da reserva. */
import type { DefCampo } from "@/components/form";
import { CATEGORIAS_EQUIP, DONOS, ESTADOS } from "./nomes";

export function camposEquipamento(freelas: { id: string; nome: string }[]): DefCampo[] {
  return [
    { nome: "nome", rotulo: "Equipamento", obrigatorio: true, autoFocus: true, max: 80, placeholder: "Sony FX3" },
    {
      nome: "categoria",
      rotulo: "Categoria",
      tipo: "select",
      opcoes: [{ valor: "auto", nome: "Adivinhar pelo nome" }, ...CATEGORIAS_EQUIP.map((c) => ({ valor: c.k, nome: c.nome }))],
    },
    { nome: "estado", rotulo: "Estado", tipo: "select", opcoes: ESTADOS.map((e) => ({ valor: e.k, nome: e.nome })) },
    { nome: "marca", rotulo: "Marca", max: 60 },
    { nome: "modelo", rotulo: "Modelo", max: 80 },
    { nome: "serie", rotulo: "Nº de série", max: 80 },
    { nome: "patrimonio", rotulo: "Patrimônio", max: 40, placeholder: "PAT-001" },
    { nome: "compraEm", rotulo: "Comprado em", tipo: "data" },
    { nome: "valor", rotulo: "Valor de compra", tipo: "dinheiro", placeholder: "0,00" },
    { nome: "dono", rotulo: "De quem é", tipo: "select", opcoes: DONOS.map((d) => ({ valor: d.k, nome: d.nome })) },
    {
      nome: "freela",
      rotulo: "Freela (se for dele)",
      tipo: "select",
      opcoes: [{ valor: "", nome: "—" }, ...freelas.map((f) => ({ valor: f.id, nome: f.nome }))],
    },
    { nome: "local", rotulo: "Onde fica", max: 120, placeholder: "Estúdio" },
    { nome: "kmL", rotulo: "Consumo (km/L)", tipo: "numero", max: 6, dica: "Só para veículos: entra na calculadora de deslocamento." },
    { nome: "notas", rotulo: "Notas", tipo: "area", linhas: 2, largo: true, max: 2000 },
  ];
}

export function camposReserva(o: { equipamentos?: { id: string; nome: string }[]; projetos: { id: string; codigo: string; titulo: string }[] }): DefCampo[] {
  return [
    ...(o.equipamentos
      ? [
          {
            nome: "equipamento",
            rotulo: "Equipamento",
            tipo: "select" as const,
            opcoes: [{ valor: "", nome: "Escolha" }, ...o.equipamentos.map((e) => ({ valor: e.id, nome: e.nome }))],
          },
        ]
      : []),
    {
      nome: "projeto",
      rotulo: "Projeto",
      tipo: "select",
      opcoes: [{ valor: "", nome: "Sem projeto" }, ...o.projetos.map((p) => ({ valor: p.id, nome: `${p.codigo} · ${p.titulo}` }))],
    },
    { nome: "inicio", rotulo: "De", tipo: "data" },
    { nome: "fim", rotulo: "Até", tipo: "data" },
    { nome: "notas", rotulo: "Notas", max: 500, largo: true },
  ];
}
