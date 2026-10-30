/** As vistas do roteiro: um documento, várias formas de ler. Todas puras. */
export { type OpcoesVista } from "./comum";
export { literarioEmTexto, nomeNaFala, vistaLiterario, type CenaLiteraria, type LinhaLiteraria, type VistaLiterario } from "./literario";
export {
  COLUNAS_TECNICO,
  NOME_COLUNA_TECNICO,
  vistaTecnico,
  type CelulaTecnico,
  type CenaTecnico,
  type ColunaTecnico,
  type LinhaTecnico,
  type OpcoesTecnico,
  type VistaTecnico,
} from "./tecnico";
export { idNoTpeasy, paraBackupTpeasy, vistaTeleprompter, type BackupTpeasy, type OpcoesTeleprompter, type VistaTeleprompter } from "./teleprompter";
export { vistaEdicao, type CorDeixa, type DeixaEdicao, type VistaEdicao } from "./edicao";
export { paraMarkdown } from "./markdown";
export { dadosImpressao, VISTAS_IMPRESSAO, type DadosImpressao, type VistaImpressao } from "./impressao";

/** As vistas que a tela oferece no seletor, na ordem. */
export const VISTAS = [
  { k: "literario", nome: "Literário" },
  { k: "tecnico", nome: "Técnico" },
  { k: "teleprompter", nome: "Teleprompter" },
  { k: "edicao", nome: "Edição" },
] as const;
export type Vista = (typeof VISTAS)[number]["k"];
