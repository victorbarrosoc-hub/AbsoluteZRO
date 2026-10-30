/**
 * "Gerar versões com o Relay" (contrato em docs/integration-contracts/relay.md, "Maestro → Relay"): a parte pura da
 * folha, que roda no navegador, no servidor e nos testes. Os presets e o plano são cópias do Relay
 * (`presets.js`/`plano.js`, conferidas por tests/relay.test.mts); nada de número inventado aqui.
 *
 * - Ordem: primeiro os de `ENTREGA_AO_CLIENTE` (na ordem do Relay), o resto em "Mais" (áudio inclusive). "Tamanho
 *   exato" (ajustável, pede o MB na hora) fica de fora.
 * - No máximo 8 por pedido (o limite da rota do SOBEDESCE).
 * - A prévia: `<original> (<preset>).<ext>` (`nomeSaida`), o codec e o peso por `planejar(origem, preset)` com a
 *   origem do Drive (largura, altura e duração do `videoMediaMetadata`); sem os metadados, "—" e nada de palpite.
 */
import { planejar, nomeSaida, tamanhoLegivel } from "./plano.js";
import { ENTREGA_AO_CLIENTE, GRUPOS, PRESETS, preset as acharPreset, type Preset } from "./presets.js";

export const MAX_PRESETS = 8;

export type PresetMaestro = Preset & { id: string };

/** Os presets que o Maestro oferece: com id (o Relay tem um preset sem id hoje; sem id não dá para pedir) e não ajustáveis. */
export function presetsOferecidos(): PresetMaestro[] {
  return PRESETS.filter((p): p is PresetMaestro => typeof p.id === "string" && !!p.id && !p.ajustavel);
}

/** Primeiro os de entrega ao cliente, na ordem do Relay; os outros em "Mais", na ordem do catálogo. */
export function presetsDaFolha(): { principais: PresetMaestro[]; mais: PresetMaestro[] } {
  const todos = presetsOferecidos();
  const porId = new Map(todos.map((p) => [p.id, p]));
  const principais = ENTREGA_AO_CLIENTE.map((id) => porId.get(id)).filter((p): p is PresetMaestro => !!p);
  const usados = new Set(principais.map((p) => p.id));
  return { principais, mais: todos.filter((p) => !usados.has(p.id)) };
}

/** "Mais", nos grupos do Relay (Redes, Trabalho, TV, Tamanho, Áudio), na ordem dele; grupo vazio some. */
export function maisPorGrupo(): { grupo: string; presets: PresetMaestro[] }[] {
  const { mais } = presetsDaFolha();
  const grupos = [...GRUPOS, ...new Set(mais.map((p) => p.grupo).filter((g) => !GRUPOS.includes(g)))];
  return grupos.map((grupo) => ({ grupo, presets: mais.filter((p) => p.grupo === grupo) })).filter((g) => g.presets.length);
}

export type Forma = "vertical" | "horizontal" | "audio";

/** A forma de um preset do Relay (o desenho na lista): só som, em pé (tela 9:16 ou 4:5) ou deitado. */
export function formaDoPreset(id: string): Forma {
  const p = acharPreset(id);
  if (!p?.video) return p ? "audio" : "horizontal";
  const q = p.video.quadro;
  return q && q.altura > q.largura ? "vertical" : "horizontal";
}

const ID_PRESET = /^[a-z0-9-]{1,40}$/;

/** A ordem da folha (principais, depois "Mais"): a lista dos entregáveis segue a mesma. */
export const ORDEM = (): string[] => {
  const { principais, mais } = presetsDaFolha();
  return [...principais, ...mais].map((p) => p.id);
};

/** O id é um dos presets oferecidos? (o servidor confere de novo antes de pedir). */
export function presetValido(id: unknown): id is string {
  return typeof id === "string" && ID_PRESET.test(id) && presetsOferecidos().some((p) => p.id === id);
}

/** Marca ou desmarca; marcar além de 8 não muda nada (a tela diz por quê). */
export function alternar(selecionados: readonly string[], id: string): { lista: string[]; cheio: boolean } {
  if (selecionados.includes(id)) return { lista: selecionados.filter((x) => x !== id), cheio: false };
  if (selecionados.length >= MAX_PRESETS) return { lista: [...selecionados], cheio: true };
  return { lista: [...selecionados, id], cheio: false };
}

/** Os presets pedidos, sem repetição, na ordem da folha, só os válidos. Mais de 8 ou nenhum: null. */
export function normalizarPresets(entrada: unknown): string[] | null {
  if (!Array.isArray(entrada) || !entrada.every(presetValido) || new Set(entrada).size !== entrada.length) return null;
  const pedidos = new Set<string>(entrada);
  const lista = ORDEM().filter((id) => pedidos.has(id));
  return lista.length >= 1 && lista.length <= MAX_PRESETS ? lista : null;
}

/** A chave de idempotência de cada item da fila do SOBEDESCE (contrato): `ref:preset`, com ref = id da versão. */
export const chaveIdem = (ref: string, preset: string) => `${ref}:${preset}`;

export type MetadadosDrive = { width?: number | string; height?: number | string; durationMillis?: number | string } | null | undefined;

/** A origem para `planejar` a partir do `videoMediaMetadata` do Drive. Sem largura e altura: null. */
export function origemDoDrive(m: MetadadosDrive): { largura: number; altura: number; duracao: number; temVideo: true; temAudio: true } | null {
  const largura = Number(m?.width);
  const altura = Number(m?.height);
  const ms = Number(m?.durationMillis);
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura < 2 || altura < 2) return null;
  // O Drive não diz se há áudio nem a cadência: a estimativa supõe áudio (um master de entrega quase sempre tem).
  return { largura, altura, duracao: Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0, temVideo: true, temAudio: true };
}

export type LinhaDaPrevia = {
  preset: string;
  nome: string;
  /** O nome do arquivo que vai sair. */
  arquivo: string;
  /** "H.264 · 1920×1080" (sem os metadados, só o codec). */
  codec: string;
  /** "≈ 42 MB" ou "—". */
  peso: string;
  avisos: string[];
  /** O plano disse que não dá (ex.: longo demais para caber no tamanho do e-mail). */
  impossivel: string | null;
};

const NOME_CODEC: Record<string, string> = { avc: "H.264", hevc: "HEVC", aac: "AAC", mp3: "MP3", "pcm-s24": "WAV", "pcm-s16": "WAV" };

/** A lista da prévia: um item por preset escolhido. `origem` null = sem metadados (peso "—", sem avisos do plano). */
export function previa(nomeOriginal: string, ids: readonly string[], origem: ReturnType<typeof origemDoDrive>): LinhaDaPrevia[] {
  const todos = new Map(presetsOferecidos().map((p) => [p.id, p]));
  const linhas: LinhaDaPrevia[] = [];
  for (const id of ids) {
    const p = todos.get(id);
    if (!p) continue;
    const base = {
      preset: p.id,
      nome: p.nome,
      arquivo: nomeSaida(nomeOriginal || "video", p),
      codec: p.video ? (NOME_CODEC[p.video.codec] ?? p.video.codec) : (NOME_CODEC[p.audio.codec] ?? p.audio.codec),
    };
    if (!origem) {
      linhas.push({ ...base, peso: "—", avisos: [], impossivel: null });
      continue;
    }
    try {
      const plano = planejar(origem, p, { motor: "computador" });
      const v = plano.video;
      linhas.push({
        ...base,
        codec: v ? `${base.codec} · ${v.largura}×${v.altura}` : base.codec,
        peso: origem.duracao > 0 && plano.tamanhoEstimado > 0 ? `≈ ${tamanhoLegivel(plano.tamanhoEstimado)}` : "—",
        avisos: plano.avisos,
        impossivel: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "O Relay não consegue esta versão.";
      // Sem a duração, o tamanho máximo não se calcula: não é impossível, só sem estimativa.
      if ((e as { codigo?: string })?.codigo === "sem-duracao") linhas.push({ ...base, peso: "—", avisos: [], impossivel: null });
      else linhas.push({ ...base, peso: "—", avisos: [], impossivel: msg });
    }
  }
  return linhas;
}

/**
 * De quanto em quanto tempo a ficha pergunta pelo andamento: nada andando, nunca; convertendo ou com o computador
 * aberto (ou sem saber), 5 s; tudo na fila com o computador fechado, 15 s (nada muda até ele abrir).
 */
export function intervaloDoAcompanhar(lista: readonly { status: string }[] | null, computador: { aberto_agora: boolean } | null): number | null {
  if (!lista?.some((e) => e.status === "pendente" || e.status === "convertendo")) return null;
  const convertendo = lista.some((e) => e.status === "convertendo");
  return convertendo || computador?.aberto_agora !== false ? 5000 : 15000;
}
