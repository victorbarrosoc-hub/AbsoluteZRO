/** Campos dos formulários de freelas, dados de pagamento e escala. */
import type { DefCampo } from "@/components/form";
import { FUNCOES } from "./funcoes";
import { TIPOS_PIX } from "./pagamento";

export const CAMPOS_FREELA: DefCampo[] = [
  { nome: "nome", rotulo: "Nome", obrigatorio: true, autoFocus: true, max: 120 },
  { nome: "cidade", rotulo: "Cidade", max: 120, placeholder: "São Paulo, SP" },
  {
    nome: "funcoes",
    rotulo: "Funções",
    max: 400,
    largo: true,
    // Curto: no iPhone o campo tem uns 300 px.
    placeholder: `${FUNCOES[0].nome}, …`,
    dica: "Separadas por vírgula.",
  },
  {
    nome: "valores",
    rotulo: "Valores",
    tipo: "area",
    linhas: 3,
    largo: true,
    placeholder: "Edição: 450,00 por diária\nMotion: 2.200,00 por projeto",
    dica: "Um por linha: função, valor e por diária, projeto ou vídeo.",
  },
  { nome: "nichos", rotulo: "Nichos", max: 400, placeholder: "Moda, Casamento" },
  { nome: "whatsapp", rotulo: "WhatsApp", tipo: "tel", max: 30 },
  { nome: "email", rotulo: "E-mail", tipo: "email", max: 254 },
  { nome: "instagram", rotulo: "Instagram", max: 60 },
  { nome: "whatsappMsg", rotulo: "Mensagem do WhatsApp", max: 500, largo: true, placeholder: "Oi, {nome}! Aqui é da {produtora}." },
  { nome: "notas", rotulo: "Notas", tipo: "area", linhas: 3, largo: true, max: 4000 },
  {
    nome: "ativo",
    rotulo: "Situação",
    tipo: "segmentos",
    opcoes: [
      { valor: "sim", nome: "Ativo" },
      { valor: "nao", nome: "Inativo" },
    ],
  },
];

export const CAMPOS_PAGAMENTO: DefCampo[] = [
  { nome: "documento", rotulo: "CPF ou CNPJ", max: 20, placeholder: "só números" },
  { nome: "titular", rotulo: "Titular da conta", max: 120 },
  { nome: "pixTipo", rotulo: "Tipo da chave PIX", tipo: "select", opcoes: [{ valor: "", nome: "—" }, ...TIPOS_PIX.map((t) => ({ valor: t.k, nome: t.nome }))] },
  { nome: "pix", rotulo: "Chave PIX", max: 254 },
];

export function camposEscala(freelas: { id: string; nome: string }[]): DefCampo[] {
  return [
    { nome: "freela", rotulo: "Freela", tipo: "select", opcoes: [{ valor: "", nome: "Escolha" }, ...freelas.map((f) => ({ valor: f.id, nome: f.nome }))] },
    { nome: "funcao", rotulo: "Função", max: 40, placeholder: "Edição" },
    { nome: "inicio", rotulo: "De", tipo: "data" },
    { nome: "fim", rotulo: "Até", tipo: "data" },
    {
      nome: "modo",
      rotulo: "Valor",
      tipo: "segmentos",
      opcoes: [
        { valor: "diaria", nome: "Por diária" },
        { valor: "total", nome: "Total" },
      ],
    },
    { nome: "valor", rotulo: "Quanto", tipo: "dinheiro", placeholder: "0,00", dica: "Por diária: × os dias do período." },
  ];
}
