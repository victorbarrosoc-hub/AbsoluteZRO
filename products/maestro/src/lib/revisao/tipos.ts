/** Formas que a tela da equipe e a do cliente recebem (sem e-mail, sub nem id de outra organização). */
import type { TipoFonte } from "./fontes/detectar";

export type ComentarioVisto = {
  id: string;
  pai: string | null;
  autor: "equipe" | "cliente";
  /** Nome de quem comentou: o que o cliente digitou, ou o nome da pessoa da equipe (só na tela da equipe). */
  nome: string | null;
  t: number | null;
  tFim: number | null;
  digitado: boolean;
  x: number | null;
  y: number | null;
  texto: string;
  resolvido: boolean;
  em: string;
};

export type VersaoVista = {
  id: string;
  n: number;
  titulo: string | null;
  fonte: TipoFonte;
  url: string;
  driveId: string | null;
  driveChave: string | null;
  duracaoMs: number | null;
  fps: number | null;
  /** Drive com a chave de API do Maestro: o endereço do <video>. null = iframe (tempo digitado). */
  stream: string | null;
  em: string;
  comentarios: ComentarioVisto[];
};

export type DecisaoVista = {
  decisao: "aprovado" | "ajuste";
  nota: string | null;
  nome: string | null;
  em: string;
  volta: number | null;
  versao: string | null;
};
