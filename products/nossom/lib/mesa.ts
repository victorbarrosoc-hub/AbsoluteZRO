// A mesa de faixas (titular, 02/11/2026: "isso aqui é muito legal, pra visualizar o tratamento"): o original e cada
// passo que levou à versão aberta, como faixas de uma DAW, com o mixer e a cadeia de efeitos. Só lê o que já foi medido;
// nada de nível ao vivo inventado.
import { broadcastReference, type BroadcastSettings } from './broadcast';
import type { Version } from './storage';

export type PapelFaixa = 'original' | 'z' | 'presence' | 'ajuste';

/** Da versão aberta até o original, seguindo `parentId`; devolve na ordem do original para o fim. */
export function cadeia(versions: Version[], activeId: string): Version[] {
  const porId = new Map(versions.map((v) => [v.id, v]));
  const caminho: Version[] = [];
  let atual = porId.get(activeId);
  const vistos = new Set<string>();
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    caminho.unshift(atual);
    atual = atual.parentId ? porId.get(atual.parentId) : undefined;
  }
  // O original é sempre a primeira faixa, mesmo quando a versão aberta não descende dele por parentId.
  if (versions[0] && caminho[0]?.id !== versions[0].id) caminho.unshift(versions[0]);
  return caminho;
}

export function papel(v: Version, indice: number): PapelFaixa {
  if (indice === 0) return 'original';
  if (v.processing?.masterPreset === 'broadcast' || v.preset === 'Quasar Presence')
    return 'presence';
  if (
    v.operation === 'auto' ||
    v.operation === 'vocals' ||
    v.processing?.cloudRestoration ||
    v.processing?.iaAvancada
  )
    return 'z';
  return 'ajuste';
}

export function nomeDaFaixa(v: Version, indice: number) {
  const p = papel(v, indice);
  if (p === 'original') return 'Original';
  if (p === 'presence') return 'Quasar Presence';
  if (p === 'z') return v.processing?.iaAvancada ? 'Z avançada' : 'Z · voz limpa';
  return v.preset?.split(' / ')[0] || v.label.split(' · ')[0];
}

/** O nome no canal do mixer, curto como numa mesa de som. */
export function nomeCurto(v: Version, indice: number) {
  const p = papel(v, indice);
  if (p === 'original') return 'Original';
  if (p === 'presence') return 'Presence';
  if (p === 'z') return 'Z';
  return nomeDaFaixa(v, indice).split(/[: ]/)[0];
}

/** Uma casa, vírgula e o sinal de menos tipográfico. */
export const umaCasa = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }).replace('-', '−');

/** O que a Z fez, em números medidos: fundo mais baixo e volume final. Sem medida, sem frase. */
export function resumoDaZ(faixas: Version[]): { frase: string; chips: string[] } | null {
  if (faixas.length < 2) return null;
  const original = faixas[0],
    final = faixas[faixas.length - 1];
  const chips: string[] = [];
  const antes = original.info.noiseFloor,
    depois = final.info.noiseFloor;
  if (Number.isFinite(antes) && Number.isFinite(depois) && antes! - depois! >= 1)
    chips.push(`Fundo −${umaCasa(antes! - depois!)} dB`);
  if (final.metrics.lufs !== null) chips.push(`${umaCasa(final.metrics.lufs)} LUFS`);
  if (final.metrics.truePeak !== null) chips.push(`Pico ${umaCasa(final.metrics.truePeak)} dBTP`);
  const papeis = faixas.map(papel);
  const limpou = papeis.includes('z'),
    presenca = papeis.includes('presence');
  const frase =
    limpou && presenca
      ? 'Limpei o fundo e deixei sua voz mais presente.'
      : limpou
        ? 'Limpei o fundo da sua voz.'
        : presenca
          ? 'Deixei sua voz mais presente.'
          : 'Seus ajustes, passo a passo.';
  return { frase, chips };
}

/** As quatro bandas da Quasar Presence com as faixas de frequência dos cortes. */
export function bandasPresence(s: BroadcastSettings = broadcastReference) {
  const [a, b, c] = s.crossovers;
  const hz = (n: number) => (n >= 1000 ? `${umaCasa(n / 1000)} kHz` : `${Math.round(n)} Hz`);
  return [
    { nome: 'Graves', faixa: `até ${hz(a)}` },
    { nome: 'Corpo', faixa: `${hz(a)}–${hz(b)}` },
    { nome: 'Voz', faixa: `${hz(b)}–${hz(c)}` },
    { nome: 'Brilho', faixa: `acima de ${hz(c)}` },
  ].map((banda, i) => ({ ...banda, ...s.bands[i] }));
}
