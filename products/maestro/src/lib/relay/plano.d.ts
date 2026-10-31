// Tipos de plano.js (cópia de products/relay/src/plano.js; tests/relay.test.mts confere a cópia). Só o que o Maestro usa.
import type { Preset } from "./presets.js";

export type Origem = {
  largura: number;
  altura: number;
  fps?: number | null;
  duracao?: number;
  temVideo?: boolean;
  temAudio?: boolean;
  canais?: number | null;
  taxa?: number | null;
  cor?: { primaries?: string; transfer?: string; matrix?: string; fullRange?: boolean } | null;
  codec?: string | null;
};

export type Plano = {
  preset: string;
  formato: string;
  motor: string;
  video: { codec: "avc" | "hevc"; largura: number; altura: number; fpsSaida: number; bitrate: number; crf?: number } | null;
  audio: { codec: string; bitrate: number | null; taxa: number; canais: number } | null;
  tamanhoMax?: number | null;
  tamanhoEstimado: number;
  avisos: string[];
};

export function planejar(
  origem: Origem,
  p: Preset | string,
  opcoes?: { motor?: "navegador" | "computador"; resolucao?: string | number; preencher?: boolean; tamanhoMB?: number },
): Plano;
export function extensao(formato: string): string;
export function nomeSaida(nome: string, p: Preset | string): string;
export function tamanhoLegivel(bytes: number): string;
export function fmtDuracao(s: number): string;
