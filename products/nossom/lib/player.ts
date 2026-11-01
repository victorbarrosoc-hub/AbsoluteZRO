'use client';
// O player da plataforma (pedido do titular, 01/11/2026): um só elemento de áudio para o NOSSOM inteiro, fora do React,
// para o último áudio tocado continuar enquanto a pessoa troca de ferramenta ou de página — como a barra do Spotify.
// A onda do estúdio (wave-player) e a barra fixa (player-bar) leem e mandam no mesmo motor. A tela se atualiza no ritmo
// do `timeupdate` do navegador (umas 4 vezes por segundo), nunca por quadro.
// O que fica guardado neste aparelho (localStorage): só a referência ao áudio (projeto, versão, título, tempo). O som
// continua no IndexedDB da conta; depois de recarregar a página, ele é lido de lá quando a pessoa toca de novo.
import { useSyncExternalStore } from 'react';

export type Faixa = {
  /** Id da versão tocada: muda quando muda o som. */
  chave: string;
  titulo: string;
  /** Nome do projeto, a linha de baixo da barra. */
  projeto: string;
  projectId: string;
  /** Conta dona do IndexedDB onde o som mora. */
  dono: string;
  duracao: number;
};
export type EstadoPlayer = {
  faixa: Faixa | null;
  tocando: boolean;
  carregando: boolean;
  tempo: number;
  duracao: number;
  volume: number;
  mudo: boolean;
  erro: string;
};

const CHAVE = 'nossom.player.v1';
const VAZIO: EstadoPlayer = {
  faixa: null,
  tocando: false,
  carregando: false,
  tempo: 0,
  duracao: 0,
  volume: 1,
  mudo: false,
  erro: '',
};

let estado: EstadoPlayer = VAZIO;
let audio: HTMLAudioElement | null = null;
let url: string | null = null;
let trecho: { start: number; end: number } | null = null;
let ganho = 1;
let pedido = 0;
let salvoEm = 0;
let iniciado = false;
const ouvintes = new Set<() => void>();

function emitir(parcial: Partial<EstadoPlayer>) {
  estado = { ...estado, ...parcial };
  for (const f of ouvintes) f();
}

function guardar(agora = false) {
  if (!estado.faixa) return;
  const t = Date.now();
  if (!agora && t - salvoEm < 2000) return;
  salvoEm = t;
  try {
    localStorage.setItem(
      CHAVE,
      JSON.stringify({ faixa: estado.faixa, tempo: estado.tempo, volume: estado.volume }),
    );
  } catch {
    // navegador sem armazenamento: o player vale só nesta aba
  }
}

function aplicarVolume() {
  if (!audio) return;
  audio.volume = Math.max(0, Math.min(1, estado.volume * ganho));
  audio.muted = estado.mudo;
}

/** O som de uma versão guardada no IndexedDB da conta (null se não está mais neste aparelho). */
async function lerDoAparelho(f: Faixa): Promise<Blob | null> {
  try {
    const { getProject } = await import('./storage');
    const p = await getProject(f.projectId, f.dono);
    return p?.versions.find((v) => v.id === f.chave)?.blob ?? null;
  } catch {
    return null;
  }
}

function iniciar() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('timeupdate', () => {
    if (!audio) return;
    if (trecho && audio.currentTime >= trecho.end) {
      audio.pause();
      audio.currentTime = trecho.start;
    }
    emitir({ tempo: audio.currentTime });
    guardar();
  });
  audio.addEventListener('play', () => {
    emitir({ tocando: true, erro: '' });
    window.dispatchEvent(new CustomEvent('nossom:player-tocou'));
  });
  audio.addEventListener('pause', () => {
    emitir({ tocando: false });
    guardar(true);
  });
  audio.addEventListener('ended', () => emitir({ tocando: false }));
  audio.addEventListener('loadedmetadata', () => {
    if (audio && Number.isFinite(audio.duration)) emitir({ duracao: audio.duration });
  });
  audio.addEventListener('error', () => {
    if (audio?.src)
      emitir({ tocando: false, carregando: false, erro: 'Não foi possível tocar este áudio.' });
  });
  window.addEventListener('pagehide', () => guardar(true));
  // outro som da plataforma começou (mixer de faixas, demonstração): este pausa
  window.addEventListener('nossom:outro-som', () => audio?.pause());
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (salvo?.faixa?.chave && salvo.faixa.projectId && salvo.faixa.dono) {
      estado = {
        ...VAZIO,
        faixa: salvo.faixa,
        tempo: Number(salvo.tempo) || 0,
        duracao: Number(salvo.faixa.duracao) || 0,
        volume: Number.isFinite(salvo.volume) ? Math.max(0, Math.min(1, salvo.volume)) : 1,
      };
    }
  } catch {
    // sem nada guardado
  }
}

/** Troca o som do player (mantendo ou não a reprodução). O pedido mais novo ganha. */
async function carregar(f: Faixa, blob: Blob, { em = 0, tocar = false } = {}) {
  iniciar();
  if (!audio) return;
  const meu = ++pedido;
  trecho = null;
  ganho = 1;
  audio.pause();
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(blob);
  emitir({ faixa: f, tempo: em, duracao: f.duracao, carregando: true, erro: '' });
  audio.src = url;
  aplicarVolume();
  await new Promise<void>((ok) => {
    const pronto = () => {
      audio?.removeEventListener('loadedmetadata', pronto);
      audio?.removeEventListener('error', pronto);
      ok();
    };
    audio!.addEventListener('loadedmetadata', pronto);
    audio!.addEventListener('error', pronto);
  });
  if (meu !== pedido || !audio) return;
  const dur = Number.isFinite(audio.duration) ? audio.duration : f.duracao;
  audio.currentTime = Math.max(0, Math.min(em, dur - 0.01));
  emitir({ carregando: false, tempo: audio.currentTime });
  guardar(true);
  if (tocar) await reproduzir();
}

async function reproduzir() {
  if (!audio) return;
  if (trecho && (audio.currentTime < trecho.start || audio.currentTime >= trecho.end))
    audio.currentTime = trecho.start;
  try {
    await audio.play();
  } catch {
    emitir({ tocando: false, erro: 'Toque de novo para permitir o som.' });
  }
}

/** Tocar/pausar o que está no player; depois de recarregar a página, busca o som no aparelho. */
async function alternar() {
  iniciar();
  if (!audio || !estado.faixa) return;
  if (!audio.src) {
    const f = estado.faixa;
    emitir({ carregando: true });
    const blob = await lerDoAparelho(f);
    if (!blob) {
      emitir({ carregando: false, erro: 'Esse áudio não está mais neste aparelho.' });
      return;
    }
    await carregar(f, blob, { em: estado.tempo, tocar: true });
    return;
  }
  if (audio.paused) await reproduzir();
  else audio.pause();
}

export const player = {
  carregar,
  alternar,
  pausar: () => audio?.pause(),
  buscar(t: number) {
    iniciar();
    const max = estado.duracao || estado.faixa?.duracao || 0;
    const v = Math.max(0, Math.min(t, Math.max(0, max - 0.01)));
    if (audio?.src) audio.currentTime = v;
    emitir({ tempo: v });
    guardar(true);
  },
  pular(segundos: number) {
    player.buscar(estado.tempo + segundos);
  },
  /** Repetir só um trecho (a seleção na onda do estúdio); null = o áudio inteiro. */
  definirTrecho(r: { start: number; end: number } | null) {
    trecho = r;
  },
  /** Ganho da comparação A/B com volume igualado (multiplica o volume da pessoa). */
  definirGanho(g: number) {
    ganho = Math.max(0, Math.min(1, g));
    aplicarVolume();
  },
  definirVolume(v: number) {
    emitir({ volume: Math.max(0, Math.min(1, v)) });
    aplicarVolume();
    guardar(true);
  },
  definirMudo(m: boolean) {
    emitir({ mudo: m });
    aplicarVolume();
  },
  /** Fecha a barra: para o som e esquece o último áudio. */
  fechar() {
    pedido++;
    audio?.pause();
    if (audio) audio.removeAttribute('src');
    audio?.load();
    if (url) URL.revokeObjectURL(url);
    url = null;
    trecho = null;
    emitir({ ...VAZIO, volume: estado.volume });
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      // nada guardado
    }
  },
  /** Esquece o áudio se ele for de outra conta (troca de conta no mesmo aparelho). */
  conferirDono(dono: string) {
    iniciar();
    if (estado.faixa && estado.faixa.dono !== dono) player.fechar();
  },
};

function assinar(f: () => void) {
  iniciar();
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}
const ler = () => estado;
const lerNoServidor = () => VAZIO;

/** O estado do player para a tela (re-renderiza no ritmo do timeupdate, nunca por quadro). */
export function usePlayer(): EstadoPlayer {
  return useSyncExternalStore(assinar, ler, lerNoServidor);
}

/** Avisa o player que outro som da plataforma começou (ele pausa). */
export function avisarOutroSom() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nossom:outro-som'));
}
