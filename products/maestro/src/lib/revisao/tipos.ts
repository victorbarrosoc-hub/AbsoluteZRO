/** Formas que a tela da equipe e a do cliente recebem (sem e-mail, sub nem id de outra organização). */
import type { TipoFonte } from "./fontes/detectar";
import type { RoteiroDoCliente } from "./roteiro";

/** De onde vem a versão: um link (vídeo, Drive…) ou, desde a 0033, uma versão salva de roteiro (sem URL). */
export type FonteVersao = TipoFonte | "roteiro";

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
  /** O bloco do roteiro comentado (só em versão de roteiro; null = a peça inteira). */
  bloco: string | null;
  texto: string;
  resolvido: boolean;
  em: string;
};

export type VersaoVista = {
  id: string;
  n: number;
  titulo: string | null;
  fonte: FonteVersao;
  /** Vazio na versão de roteiro (o texto vem em `roteiro`). */
  url: string;
  driveId: string | null;
  driveChave: string | null;
  duracaoMs: number | null;
  fps: number | null;
  /** Drive com a chave de API do Maestro: o endereço do <video>. null = iframe (tempo digitado). */
  stream: string | null;
  em: string;
  comentarios: ComentarioVisto[];
  /** Só na versão de roteiro: o que o cliente lê (a vista Literário, sem nada interno). */
  roteiro?: RoteiroDoCliente | null;
  /** Só na tela da equipe, na versão de roteiro: qual roteiro e qual versão dele (para abrir o editor). */
  doRoteiro?: { id: string; n: number } | null;
};

export type DecisaoVista = {
  decisao: "aprovado" | "ajuste";
  nota: string | null;
  nome: string | null;
  em: string;
  volta: number | null;
  versao: string | null;
};
