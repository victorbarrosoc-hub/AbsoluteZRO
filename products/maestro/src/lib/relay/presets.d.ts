// Tipos de presets.js (cópia de products/relay/src/presets.js; tests/relay.test.mts confere a cópia).
export type FonteDoPreset = { titulo: string; url: string; tipo: "oficial" | "mercado"; verificadoEm: string };

export type VideoDoPreset = {
  codec: "avc" | "hevc";
  ladoMenor?: number | null;
  quadro?: { largura: number; altura: number };
  fpsMax: number;
  gop: number;
  kbps: Record<number, [number, number]> | null;
  crf?: number;
  ampliar?: boolean;
  teto?: number;
};

export type AudioDoPreset = { codec: "aac" | "mp3" | "pcm-s24" | "pcm-s16"; kbps: number | null; taxa: number | null; canais: number | null };

export type Preset = {
  /** Ausente num preset quebrado do Relay: o Maestro não mostra (não dá para pedir sem o id). */
  id?: string;
  nome: string;
  grupo: string;
  icone: string;
  resumo: string;
  formato: "mp4" | "mp3" | "wav" | "m4a";
  video: VideoDoPreset | null;
  audio: AudioDoPreset;
  tamanhoMax?: number;
  ajustavel?: boolean;
  dica?: string;
  fontes: FonteDoPreset[];
};

export const VERIFICADO_EM: string;
export const PRESETS: Preset[];
export const GRUPOS: string[];
export const ENTREGA_AO_CLIENTE: string[];
export function preset(id: string): Preset | null;
