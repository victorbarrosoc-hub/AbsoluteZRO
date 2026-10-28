/** Campos do formulário da agenda. */
import type { DefCampo } from "@/components/form";
import { CORES, TIPOS_EVENTO } from "./servidor";

const NOME_COR: Record<string, string> = {
  vermelho: "Vermelho",
  laranja: "Laranja",
  amarelo: "Amarelo",
  verde: "Verde",
  azul: "Azul",
  roxo: "Roxo",
  rosa: "Rosa",
};

export function camposEvento(projetos: { id: string; codigo: string; titulo: string }[]): DefCampo[] {
  return [
    { nome: "titulo", rotulo: "Título", obrigatorio: true, autoFocus: true, max: 200, largo: true },
    { nome: "tipo", rotulo: "Tipo", tipo: "segmentos", opcoes: TIPOS_EVENTO.map((t) => ({ valor: t.k, nome: t.nome })) },
    {
      nome: "projeto",
      rotulo: "Projeto",
      tipo: "select",
      opcoes: [{ valor: "", nome: "Sem projeto" }, ...projetos.map((p) => ({ valor: p.id, nome: `${p.codigo} · ${p.titulo}` }))],
    },
    { nome: "data", rotulo: "Dia", tipo: "data", obrigatorio: true },
    { nome: "dataFim", rotulo: "Até (mais de um dia)", tipo: "data" },
    { nome: "horaIni", rotulo: "Começa", tipo: "hora" },
    { nome: "horaFim", rotulo: "Termina", tipo: "hora" },
    { nome: "local", rotulo: "Local", max: 300, largo: true },
    { nome: "cor", rotulo: "Cor", tipo: "select", opcoes: [{ valor: "", nome: "A do tipo" }, ...CORES.map((c) => ({ valor: c, nome: NOME_COR[c] }))] },
    { nome: "notas", rotulo: "Notas", tipo: "area", linhas: 3, largo: true, max: 4000 },
  ];
}
