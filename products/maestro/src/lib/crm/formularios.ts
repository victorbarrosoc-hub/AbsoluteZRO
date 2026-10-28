/** Os campos dos formulários de cliente e projeto (a tela monta; a validação de verdade é validarCliente/validarProjeto). */
import type { DefCampo } from "@/components/form";
import { STATUS_CLIENTE } from "./clientes";
import { STATUS_PROJETO } from "./projetos";

export const CAMPOS_CLIENTE: DefCampo[] = [
  { nome: "nome", rotulo: "Nome", obrigatorio: true, autoFocus: true, max: 200, placeholder: "Como a equipe chama" },
  { nome: "status", rotulo: "Relacionamento", tipo: "segmentos", opcoes: STATUS_CLIENTE.map((s) => ({ valor: s.k, nome: s.nome })) },
  { nome: "empresa", rotulo: "Empresa", max: 200, placeholder: "Razão social ou nome fantasia" },
  { nome: "contato", rotulo: "Contato", max: 200, placeholder: "Quem fala com vocês" },
  { nome: "whatsapp", rotulo: "WhatsApp", tipo: "tel", max: 30, placeholder: "(11) 91234-5678" },
  { nome: "email", rotulo: "E-mail", tipo: "email", max: 254 },
  { nome: "observacoes", rotulo: "Observações", tipo: "area", largo: true, max: 5000 },
];

export function camposProjeto(clientes: { id: string; nome: string }[]): DefCampo[] {
  return [
    { nome: "titulo", rotulo: "Título", obrigatorio: true, autoFocus: true, max: 200, largo: true },
    {
      nome: "cliente",
      rotulo: "Cliente",
      tipo: "select",
      opcoes: [{ valor: "", nome: "Sem cliente" }, ...clientes.map((c) => ({ valor: c.id, nome: c.nome }))],
    },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: STATUS_PROJETO.map((s) => ({ valor: s.k, nome: s.nome })) },
    { nome: "inicio", rotulo: "Início", tipo: "data" },
    { nome: "prazo", rotulo: "Prazo", tipo: "data" },
    { nome: "briefing", rotulo: "Briefing", tipo: "area", largo: true, max: 5000 },
  ];
}
