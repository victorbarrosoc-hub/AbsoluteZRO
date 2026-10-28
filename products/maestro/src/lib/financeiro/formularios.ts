/** Campos dos formulários do Financeiro (a validação de verdade é validarLancamento/validarRecorrencia). */
import type { DefCampo } from "@/components/form";
import { CATEGORIAS, FORMAS } from "./contas";

type Opcoes = { projetos: { id: string; codigo: string; titulo: string }[]; clientes: { id: string; nome: string }[]; freelas: { id: string; nome: string }[] };

const categorias = CATEGORIAS.map((c) => ({ valor: c.k, nome: `${c.tipo === "entrada" ? "Entrada" : "Saída"} · ${c.nome}` }));

export function camposLancamento(o: Opcoes): DefCampo[] {
  return [
    { nome: "descricao", rotulo: "Descrição", obrigatorio: true, max: 200, largo: true, autoFocus: true },
    {
      nome: "tipo",
      rotulo: "Tipo",
      tipo: "segmentos",
      opcoes: [
        { valor: "entrada", nome: "Entrada" },
        { valor: "saida", nome: "Saída" },
      ],
    },
    { nome: "categoria", rotulo: "Categoria", tipo: "select", opcoes: categorias },
    { nome: "valor", rotulo: "Valor", tipo: "dinheiro", obrigatorio: true, placeholder: "0,00" },
    { nome: "vencimento", rotulo: "Vencimento", tipo: "data", obrigatorio: true },
    {
      nome: "projeto",
      rotulo: "Projeto",
      tipo: "select",
      opcoes: [{ valor: "", nome: "Sem projeto" }, ...o.projetos.map((p) => ({ valor: p.id, nome: `${p.codigo} · ${p.titulo}` }))],
    },
    { nome: "cliente", rotulo: "Cliente", tipo: "select", opcoes: [{ valor: "", nome: "—" }, ...o.clientes.map((c) => ({ valor: c.id, nome: c.nome }))] },
    { nome: "freela", rotulo: "Freela", tipo: "select", opcoes: [{ valor: "", nome: "—" }, ...o.freelas.map((f) => ({ valor: f.id, nome: f.nome }))] },
    { nome: "parcela", rotulo: "Parcela", max: 20, placeholder: "1/3" },
    { nome: "notas", rotulo: "Notas", tipo: "area", linhas: 2, largo: true, max: 2000 },
  ];
}

export const CAMPOS_BAIXA: DefCampo[] = [
  { nome: "valor", rotulo: "Valor", tipo: "dinheiro", placeholder: "o que falta", dica: "Vazio = quita tudo." },
  { nome: "data", rotulo: "Data", tipo: "data" },
  { nome: "forma", rotulo: "Forma", tipo: "select", opcoes: [{ valor: "", nome: "—" }, ...FORMAS.map((f) => ({ valor: f.k, nome: f.nome }))] },
];

export function camposRecorrencia(clientes: { id: string; nome: string }[]): DefCampo[] {
  return [
    { nome: "descricao", rotulo: "Descrição", obrigatorio: true, max: 200, largo: true, placeholder: "Ex.: Aluguel do estúdio" },
    {
      nome: "tipo",
      rotulo: "Tipo",
      tipo: "segmentos",
      opcoes: [
        { valor: "saida", nome: "Saída" },
        { valor: "entrada", nome: "Entrada" },
      ],
    },
    { nome: "categoria", rotulo: "Categoria", tipo: "select", opcoes: categorias },
    { nome: "valor", rotulo: "Valor por mês", tipo: "dinheiro", obrigatorio: true, placeholder: "0,00" },
    { nome: "dia", rotulo: "Dia do vencimento", tipo: "numero", max: 2, placeholder: "5" },
    { nome: "inicio", rotulo: "A partir de", tipo: "mes" },
    { nome: "fim", rotulo: "Até (opcional)", tipo: "mes" },
    {
      nome: "cliente",
      rotulo: "Cliente (contrato)",
      tipo: "select",
      opcoes: [{ valor: "", nome: "—" }, ...clientes.map((c) => ({ valor: c.id, nome: c.nome }))],
    },
    {
      nome: "entregas",
      rotulo: "Entregas do mês na Pauta",
      tipo: "area",
      linhas: 2,
      largo: true,
      placeholder: "8 reels\n12 posts",
      dica: "Opcional. Cada mês vira card na Pauta, uma vez só.",
    },
  ];
}
