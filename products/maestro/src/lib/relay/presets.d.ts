// Tipos de presets.js (cópia de products/relay/src/presets.js; tests/relay.test.mts confere a cópia).
export type FonteDoPreset = { titulo: string; url: string; tipo: "oficial" | "mercado"; verificadoEm: string };

export type VideoDoPreset = {
  codec: "avc" | "hevc" | "vp9" | "prores4444";
  ladoMenor?: number | null;
  quadro?: { largura: number; altura: number };
  fpsMax: number;
  gop: number;
  kbps: Record<number, [number, number]> | null;
  crf?: number | null;
  ampliar?: boolean;
  teto?: number;
  /** Mantém a transparência do arquivo (VP9 em WebM ou ProRes 4444). */
  alfa?: boolean;
  /** Cor (#RRGGBB) atrás da transparência: fundo chroma para recortar no editor. */
  fundo?: string;
};

export type AudioDoPreset = { codec: "aac" | "mp3" | "pcm-s24" | "pcm-s16" | "opus"; kbps: number | null; taxa: number | null; canais: number | null };

export type Preset = {
  /** Ausente num preset quebrado do Relay: o Maestro não mostra (não dá para pedir sem o id). */
  id?: string;
  nome: string;
  grupo: string;
  icone: string;
  resumo: string;
  formato: "mp4" | "mp3" | "wav" | "m4a" | "webm" | "mov";
  video: VideoDoPreset | null;
  audio: AudioDoPreset;
  tamanhoMax?: number;
  /** Sai sem som mesmo com áudio na origem (Vídeo de fundo). */
  semAudio?: boolean;
  /** O codec não existe no navegador (ProRes): só na Máxima qualidade, no computador. */
  soComputador?: boolean;
  ajustavel?: boolean;
  dica?: string;
  fontes: FonteDoPreset[];
};

export const VERIFICADO_EM: string;
export const PRESETS: Preset[];
export const GRUPOS: string[];
export const ENTREGA_AO_CLIENTE: string[];
export function preset(id: string): Preset | null;
