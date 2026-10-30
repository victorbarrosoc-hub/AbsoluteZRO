/**
 * Criação · Roteiro (plano da Criação §4.1, fase F1): UM documento estruturado (cenas → blocos), guardado em jsonb
 * (`maestro.roteiros.conteudo`), de onde saem todas as vistas (Literário, Técnico, Teleprompter, Edição, impressão e
 * Markdown, em `./vistas`). Puro: sem banco, sem tela.
 *
 * `lerRoteiro()` confere e normaliza o que vem da tela (no molde de `lerConteudo()` dos documentos): devolve `null`
 * quando a forma não cabe (não é objeto, passa dos limites de cenas, blocos ou bytes) e, no resto, conserta em vez de
 * recusar (tipo de bloco desconhecido sai, valor fora da lista volta ao padrão, texto longo é cortado no teto, id
 * repetido ou inválido ganha um novo). Os textos NÃO são aparados aqui (a tela grava enquanto a pessoa digita); as
 * vistas é que aparam na saída.
 *
 * `dica` (em cena, bloco e pessoa) é o texto cinza dos modelos dentro do campo vazio: nunca é conteúdo e nenhuma vista o
 * mostra como texto (só o Técnico e o Literário com `incluirVazios`, num campo próprio, para a tela desenhar a dica).
 */

export const FORMATOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export type Formato = (typeof FORMATOS)[number];

export const PAPEIS_PESSOA = ["locutor", "apresentador", "entrevistado", "ator", "outro"] as const;
export type PapelPessoa = (typeof PAPEIS_PESSOA)[number];
export const NOME_PAPEL_PESSOA: Record<PapelPessoa, string> = {
  locutor: "Locutor",
  apresentador: "Apresentador",
  entrevistado: "Entrevistado",
  ator: "Ator",
  outro: "Pessoa",
};

/** on = fala aparecendo; off = voz sem aparecer; sonora = fala do entrevistado; passagem = repórter em cena. */
export const MODOS_FALA = ["on", "off", "sonora", "passagem"] as const;
export type ModoFala = (typeof MODOS_FALA)[number];
export const NOME_MODO_FALA: Record<ModoFala, string> = { on: "On", off: "OFF", sonora: "Sonora", passagem: "Passagem" };

export const TAMANHOS_PLANO = ["GPG", "PG", "PA", "PM", "PP", "PD", "detalhe", "drone", "outro"] as const;
export type TamanhoPlano = (typeof TAMANHOS_PLANO)[number];
export const NOME_TAMANHO_PLANO: Record<TamanhoPlano, string> = {
  GPG: "Grande plano geral",
  PG: "Plano geral",
  PA: "Plano americano",
  PM: "Plano médio",
  PP: "Primeiro plano",
  PD: "Plano detalhe",
  detalhe: "Detalhe",
  drone: "Drone",
  outro: "Outro",
};
/** Sigla curta para tabela e deixa: as siglas ficam como estão; o resto vira a palavra. */
export const SIGLA_TAMANHO_PLANO: Record<TamanhoPlano, string> = {
  GPG: "GPG",
  PG: "PG",
  PA: "PA",
  PM: "PM",
  PP: "PP",
  PD: "PD",
  detalhe: "Detalhe",
  drone: "Drone",
  outro: "Plano",
};

/** gc = gerador de caracteres (nome e cargo). */
export const ESTILOS_LETTERING = ["gc", "titulo", "legenda", "cta", "legal"] as const;
export type EstiloLettering = (typeof ESTILOS_LETTERING)[number];
export const NOME_ESTILO_LETTERING: Record<EstiloLettering, string> = { gc: "GC", titulo: "Título", legenda: "Legenda", cta: "CTA", legal: "Legal" };

/** bg = som de fundo. */
export const TIPOS_AUDIO = ["trilha", "efeito", "bg", "silencio"] as const;
export type TipoAudio = (typeof TIPOS_AUDIO)[number];
export const NOME_TIPO_AUDIO: Record<TipoAudio, string> = { trilha: "Trilha", efeito: "Efeito", bg: "BG", silencio: "Silêncio" };
export const TRANSICOES_AUDIO = ["corte", "fade"] as const;
export type TransicaoAudio = (typeof TRANSICOES_AUDIO)[number];

export const PERIODOS = ["dia", "noite", "amanhecer", "entardecer"] as const;
export type Periodo = (typeof PERIODOS)[number];
export const INT_EXT = ["INT", "EXT"] as const;
export type IntExt = (typeof INT_EXT)[number];

/** Os tipos de bloco, na ordem do Tab do editor (como no Final Draft). */
export const TIPOS_BLOCO = ["fala", "acao", "plano", "lettering", "audio", "observacao", "nota"] as const;
export type TipoBloco = (typeof TIPOS_BLOCO)[number];
export const NOME_TIPO_BLOCO: Record<TipoBloco, string> = {
  fala: "Fala",
  acao: "Ação",
  plano: "Plano",
  lettering: "Lettering",
  audio: "Áudio",
  observacao: "Observação",
  nota: "Nota interna",
};

type Base = {
  /** Estável: comentário por bloco, alinhamento no AEON e diferença entre versões usam o id. */
  id: string;
  /** Segundos digitados (opcional em qualquer bloco). */
  duracao?: number;
  /** Texto cinza do modelo no campo vazio; nunca é conteúdo. */
  dica?: string;
};
export type BlocoFala = Base & {
  tipo: "fala";
  /** id de uma pessoa do roteiro; null = ainda sem pessoa. */
  quem: string | null;
  /** Pode ter a marcação do TPeasy: `**ênfase**`, `[pausa]`, `((nota))`. */
  texto: string;
  modo: ModoFala;
  /** Indicação para quem fala ("sorrindo", "mais devagar"): parêntese no Literário, `((…))` no Teleprompter. */
  obs?: string;
};
export type BlocoAcao = Base & { tipo: "acao"; texto: string };
export type BlocoPlano = Base & {
  tipo: "plano";
  tamanho: TamanhoPlano;
  angulo?: string;
  movimento?: string;
  lente?: string;
  fps?: number;
  /** Complemento livre ("plano sequência", o que veio da decupagem antiga). */
  texto?: string;
  /** Marcado na captação (veio da decupagem antiga). */
  feito?: boolean;
};
export type BlocoLettering = Base & { tipo: "lettering"; texto: string; estilo: EstiloLettering };
export type BlocoAudio = Base & { tipo: "audio"; audio: TipoAudio; texto: string; entra?: TransicaoAudio; sai?: TransicaoAudio };
/** Sai no Técnico e no PDF de captação. */
export type BlocoObservacao = Base & { tipo: "observacao"; texto: string };
/** Interna: não sai em vista nenhuma. */
export type BlocoNota = Base & { tipo: "nota"; texto: string };
export type Bloco = BlocoFala | BlocoAcao | BlocoPlano | BlocoLettering | BlocoAudio | BlocoObservacao | BlocoNota;

export type Pessoa = { id: string; nome: string; papel: PapelPessoa; dica?: string };

export type Cena = {
  id: string;
  titulo: string;
  intExt?: IntExt;
  local?: string;
  periodo?: Periodo;
  /** Segundos digitados para a cena inteira: quando há, manda no tempo da cena (§ tempo.ts). */
  duracaoSeg?: number;
  dica?: string;
  blocos: Bloco[];
};

/** Duração alvo (segundos). Um alvo fixo ("30 segundos") é min = max. */
export type Alvo = { min: number; max: number };

export type Roteiro = {
  v: 1;
  formato: Formato;
  alvo: Alvo | null;
  /** Palavras por minuto da estimativa de fala (o TPeasy usa a mesma ideia). */
  wpm: number;
  pessoas: Pessoa[];
  cenas: Cena[];
};

export const WPM_PADRAO = 150;

export const LIMITES = {
  cenas: 300,
  blocos: 3000,
  pessoas: 50,
  /** O jsonb inteiro, como o check do banco (pg_column_size ≤ 256 KB) e os documentos. */
  bytes: 262_144,
  tituloCena: 200,
  local: 120,
  nomePessoa: 80,
  fala: 5000,
  acao: 5000,
  lettering: 500,
  audio: 500,
  observacao: 2000,
  nota: 5000,
  obsFala: 300,
  campoPlano: 60,
  textoPlano: 300,
  dica: 200,
  /** Duração de bloco ou cena: até 1 h. */
  duracao: 3600,
  /** Alvo: até 4 h. */
  alvo: 14_400,
  wpmMin: 60,
  wpmMax: 320,
  fpsMax: 1000,
} as const;

const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Id curto e aleatório (12 hex). A tela pode gerar os dela; o servidor só confere a forma. */
export function novoId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export const ehFormato = (v: unknown): v is Formato => FORMATOS.includes(v as Formato);
const de = <T extends string>(lista: readonly T[], v: unknown, padrao: T): T => (lista.includes(v as T) ? (v as T) : padrao);
const talvez = <T extends string>(lista: readonly T[], v: unknown): T | undefined => (lista.includes(v as T) ? (v as T) : undefined);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "");
/** Texto de uma linha (título, local, campos do plano): quebras viram espaço. */
const linha = (v: unknown, max: number) => texto(v, max).replace(/\n/g, " ");
const opcional = (v: unknown, max: number) => {
  const t = linha(v, max);
  return t.trim() ? t : undefined;
};
const segundos = (v: unknown, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.round(n * 10) / 10) : undefined;
};

/** Junta só as chaves com valor (o jsonb fica sem `undefined` e a comparação entre versões é estável). */
function limpo<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

function lerAlvo(v: unknown): Alvo | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  const min = segundos(a.min, LIMITES.alvo);
  const max = segundos(a.max, LIMITES.alvo);
  if (min === undefined && max === undefined) return null;
  const lo = Math.round(min ?? max!);
  const hi = Math.round(max ?? min!);
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}

type SemId<T> = T extends unknown ? Omit<T, "id"> : never;

function lerBloco(x: Record<string, unknown>, pessoas: Set<string>): SemId<Bloco> | null {
  const base = limpo({ duracao: segundos(x.duracao, LIMITES.duracao), dica: opcional(x.dica, LIMITES.dica) });
  switch (x.tipo) {
    case "fala":
      return limpo({
        ...base,
        tipo: "fala" as const,
        quem: typeof x.quem === "string" && pessoas.has(x.quem) ? x.quem : null,
        texto: texto(x.texto, LIMITES.fala),
        modo: de(MODOS_FALA, x.modo, "on"),
        obs: opcional(x.obs, LIMITES.obsFala),
      });
    case "acao":
    case "observacao":
    case "nota":
      return { ...base, tipo: x.tipo, texto: texto(x.texto, LIMITES[x.tipo]) };
    case "plano": {
      const fps = typeof x.fps === "number" && Number.isFinite(x.fps) && x.fps > 0 ? Math.min(LIMITES.fpsMax, Math.round(x.fps * 1000) / 1000) : undefined;
      return limpo({
        ...base,
        tipo: "plano" as const,
        tamanho: de(TAMANHOS_PLANO, x.tamanho, "outro"),
        angulo: opcional(x.angulo, LIMITES.campoPlano),
        movimento: opcional(x.movimento, LIMITES.campoPlano),
        lente: opcional(x.lente, LIMITES.campoPlano),
        fps,
        texto: opcional(x.texto, LIMITES.textoPlano),
        feito: x.feito === true ? true : undefined,
      });
    }
    case "lettering":
      return { ...base, tipo: "lettering", texto: texto(x.texto, LIMITES.lettering), estilo: de(ESTILOS_LETTERING, x.estilo, "gc") };
    case "audio":
      return limpo({
        ...base,
        tipo: "audio" as const,
        audio: de(TIPOS_AUDIO, x.audio, "trilha"),
        texto: texto(x.texto, LIMITES.audio),
        entra: talvez(TRANSICOES_AUDIO, x.entra),
        sai: talvez(TRANSICOES_AUDIO, x.sai),
      });
    default:
      return null;
  }
}

const objetos = (v: unknown): Record<string, unknown>[] | null =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : null;

/** Tamanho em bytes do JSON (UTF-8), a medida do limite de 256 KB. */
export function bytesDoRoteiro(r: unknown): number {
  return new TextEncoder().encode(JSON.stringify(r)).length;
}

/**
 * Confere e normaliza o roteiro que veio da tela ou do banco. `null` = a forma não cabe. `novoId` gera o id de quem
 * chegou sem id válido ou repetido (padrão: aleatório; os testes passam um contador).
 */
export function lerRoteiro(v: unknown, opcoes: { novoId?: () => string } = {}): Roteiro | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (r.v !== undefined && r.v !== 1) return null;
  const gerar = opcoes.novoId ?? novoId;
  const cenasBrutas = objetos(r.cenas ?? []);
  const pessoasBrutas = objetos(r.pessoas ?? []);
  if (!cenasBrutas || !pessoasBrutas || cenasBrutas.length > LIMITES.cenas || pessoasBrutas.length > LIMITES.pessoas) return null;
  let totalBlocos = 0;
  for (const c of cenasBrutas) {
    const bl = Array.isArray(c.blocos) ? c.blocos.length : 0;
    totalBlocos += bl;
  }
  if (totalBlocos > LIMITES.blocos) return null;

  const idsPessoas = new Set<string>();
  const pessoas: Pessoa[] = pessoasBrutas.map((p) => {
    let id = typeof p.id === "string" && ID.test(p.id) && !idsPessoas.has(p.id) ? p.id : gerar();
    while (idsPessoas.has(id)) id = gerar();
    idsPessoas.add(id);
    return limpo({ id, nome: linha(p.nome, LIMITES.nomePessoa), papel: de(PAPEIS_PESSOA, p.papel, "outro"), dica: opcional(p.dica, LIMITES.dica) });
  });

  // Cenas e blocos dividem o mesmo espaço de ids (comentário e alinhamento apontam para qualquer um).
  const ids = new Set<string>();
  const idUnico = (v: unknown) => {
    let id = typeof v === "string" && ID.test(v) && !ids.has(v) ? v : gerar();
    while (ids.has(id)) id = gerar();
    ids.add(id);
    return id;
  };
  const cenas: Cena[] = cenasBrutas.map((c) => {
    const id = idUnico(c.id);
    const blocos: Bloco[] = [];
    for (const x of objetos(c.blocos ?? []) ?? []) {
      const b = lerBloco(x, idsPessoas);
      if (b) blocos.push({ id: idUnico(x.id), ...b } as Bloco);
    }
    return limpo({
      id,
      titulo: linha(c.titulo, LIMITES.tituloCena),
      intExt: talvez(INT_EXT, c.intExt),
      local: opcional(c.local, LIMITES.local),
      periodo: talvez(PERIODOS, c.periodo),
      duracaoSeg: segundos(c.duracaoSeg, LIMITES.duracao),
      dica: opcional(c.dica, LIMITES.dica),
      blocos,
    });
  });

  const wpmBruto = Number(r.wpm);
  const roteiro: Roteiro = {
    v: 1,
    formato: ehFormato(r.formato) ? r.formato : "16:9",
    alvo: lerAlvo(r.alvo),
    wpm: Number.isFinite(wpmBruto) && wpmBruto > 0 ? Math.min(LIMITES.wpmMax, Math.max(LIMITES.wpmMin, Math.round(wpmBruto))) : WPM_PADRAO,
    pessoas,
    cenas,
  };
  return bytesDoRoteiro(roteiro) <= LIMITES.bytes ? roteiro : null;
}

/** Roteiro vazio: uma cena sem título, 16:9, sem alvo. */
export function roteiroVazio(gerar: () => string = novoId): Roteiro {
  return {
    v: 1,
    formato: "16:9",
    alvo: null,
    wpm: WPM_PADRAO,
    pessoas: [],
    cenas: [{ id: gerar(), titulo: "", blocos: [{ id: gerar(), tipo: "acao", texto: "" }] }],
  };
}

/** Bloco novo e vazio de um tipo (o editor usa no Enter, no Tab e no menu "/"). */
export function blocoVazio(tipo: TipoBloco, gerar: () => string = novoId, quem: string | null = null): Bloco {
  const id = gerar();
  switch (tipo) {
    case "fala":
      return { id, tipo, quem, texto: "", modo: "on" };
    case "plano":
      return { id, tipo, tamanho: "PM" };
    case "lettering":
      return { id, tipo, texto: "", estilo: "gc" };
    case "audio":
      return { id, tipo, audio: "trilha", texto: "" };
    default:
      return { id, tipo, texto: "" };
  }
}

/** O texto principal do bloco ("" no plano sem complemento). */
export function textoDoBloco(b: Bloco): string {
  return b.tipo === "plano" ? (b.texto ?? "") : b.texto;
}

/** Bloco sem nada escrito (o que os modelos criam com dica). Plano conta como escrito se tem algo além do "outro". */
export function blocoVazioDeConteudo(b: Bloco): boolean {
  if (b.tipo === "plano") return b.tamanho === "outro" && !b.angulo && !b.movimento && !b.lente && !b.fps && !b.texto?.trim();
  if (b.tipo === "audio" && b.audio === "silencio") return false;
  return !b.texto.trim();
}

/** Nome para mostrar de quem fala: o nome digitado, senão o papel ("Locutor"), senão "Voz". */
export function nomeDeQuemFala(r: Roteiro, quem: string | null): string {
  const p = quem ? r.pessoas.find((x) => x.id === quem) : undefined;
  if (!p) return "Voz";
  return p.nome.trim() || NOME_PAPEL_PESSOA[p.papel];
}

/** Cabeçalho da cena no padrão do roteiro literário: `2. INT. TORREFAÇÃO – DIA` (ou `2. O PROCESSO`, ou `CENA 2`). */
export function cabecalhoDaCena(c: Cena, numero: number): string {
  const lugar = [c.intExt ? `${c.intExt}.` : "", c.local?.trim() ?? ""].filter(Boolean).join(" ");
  if (lugar || c.periodo) return `${numero}. ${[lugar, c.periodo].filter(Boolean).join(" – ")}`.toLocaleUpperCase("pt-BR");
  const titulo = c.titulo.trim();
  return (titulo ? `${numero}. ${titulo}` : `Cena ${numero}`).toLocaleUpperCase("pt-BR");
}
