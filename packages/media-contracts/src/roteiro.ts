/**
 * maestro.roteiro/1 — o roteiro de uma VERSÃO SALVA do Maestro (Criação, fase F3), para quem edita (um editor de vídeo,
 * o AEON quando abrir, ou uma IA). Contrato em docs/integration-contracts/maestro-roteiro.md.
 *
 * Direção: Maestro → arquivo (`<titulo> · vN.maestro.json`). Sem rede, sem evento: nada consome automaticamente hoje
 * (a importação no AEON é a fase F8b). Sempre de uma versão salva (imutável no Maestro), então `origem.versao` +
 * `origem.sha256` identificam exatamente o que saiu.
 *
 * Tudo em segundos, desde o começo do roteiro, arredondado a 0,1. Os tempos são ESTIMADOS (`tempos: "estimados"`): a
 * fala por palavras ÷ `wpm`; o resto só tem o tempo que alguém digitou (`duracao_digitada_seg`). Não entram: nota
 * interna, observação de captação e bloco ainda vazio. Sem e-mail, telefone ou qualquer dado de conta: as pessoas são
 * os nomes do elenco do roteiro.
 */
import { z } from 'zod'
import { IsoDate, Uuid } from './common'

export const MAESTRO_ROTEIRO_CONTRATO = 'maestro.roteiro/1' as const

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
/** Segundos desde o começo (até 300 h, o teto do Maestro). */
const Seg = z.number().min(0).max(1_080_000)
const Digitado = z.number().gt(0).max(3600).nullable()
const Talvez = (max: number) => z.string().min(1).max(max).nullable()

export const FORMATOS_ROTEIRO = ['16:9', '9:16', '1:1', '4:5'] as const
export const PAPEIS_ROTEIRO = ['locutor', 'apresentador', 'entrevistado', 'ator', 'outro'] as const
export const MODOS_FALA_ROTEIRO = ['on', 'off', 'sonora', 'passagem'] as const
export const TAMANHOS_PLANO_ROTEIRO = ['GPG', 'PG', 'PA', 'PM', 'PP', 'PD', 'detalhe', 'drone', 'outro'] as const
export const ESTILOS_LETTERING_ROTEIRO = ['gc', 'titulo', 'legenda', 'cta', 'legal'] as const
export const TIPOS_AUDIO_ROTEIRO = ['trilha', 'efeito', 'bg', 'silencio'] as const
const Transicao = z.enum(['corte', 'fade']).nullable()

const tempo = { id: Id, inicio_seg: Seg, fim_seg: Seg, duracao_digitada_seg: Digitado }

export const FalaRoteiroSchema = z
  .object({
    ...tempo,
    tipo: z.literal('fala'),
    /** id de uma pessoa de `pessoas`; null = fala sem pessoa ("Voz"). */
    pessoa_id: Id.nullable(),
    /** O nome para mostrar (o digitado, senão o papel, senão "Voz"). */
    pessoa: z.string().min(1).max(80),
    modo: z.enum(MODOS_FALA_ROTEIRO),
    /** Como o autor escreveu, na marcação do TPeasy: `**ênfase**`, `[deixa]`, `((nota que não se fala))`. */
    texto: z.string().min(1).max(5000),
    /** Só o que se fala (sem a marcação): a base para alinhar com a transcrição. */
    texto_falado: z.string().max(5000),
    palavras: z.number().int().min(0).max(5000),
    /** Indicação para quem fala ("sorrindo"). */
    obs: Talvez(300),
  })
  .strict()

export const AcaoRoteiroSchema = z.object({ ...tempo, tipo: z.literal('acao'), texto: z.string().min(1).max(5000) }).strict()

export const PlanoRoteiroSchema = z
  .object({
    ...tempo,
    tipo: z.literal('plano'),
    tamanho: z.enum(TAMANHOS_PLANO_ROTEIRO),
    /** "PM", "Drone"…: o rótulo curto para marcador. */
    sigla: z.string().min(1).max(20),
    angulo: Talvez(60),
    movimento: Talvez(60),
    lente: Talvez(60),
    fps: z.number().gt(0).max(1000).nullable(),
    texto: Talvez(300),
  })
  .strict()

export const LetteringRoteiroSchema = z
  .object({ ...tempo, tipo: z.literal('lettering'), estilo: z.enum(ESTILOS_LETTERING_ROTEIRO), texto: z.string().min(1).max(500) })
  .strict()

export const AudioRoteiroSchema = z
  .object({
    ...tempo,
    tipo: z.literal('audio'),
    audio: z.enum(TIPOS_AUDIO_ROTEIRO),
    /** Vazio só no silêncio. */
    texto: z.string().max(500),
    entra: Transicao,
    sai: Transicao,
  })
  .strict()

export const BlocoRoteiroSchema = z.discriminatedUnion('tipo', [
  FalaRoteiroSchema,
  AcaoRoteiroSchema,
  PlanoRoteiroSchema,
  LetteringRoteiroSchema,
  AudioRoteiroSchema,
])

export const CenaRoteiroSchema = z
  .object({
    id: Id,
    numero: z.number().int().min(1).max(300),
    titulo: z.string().max(200),
    /** "2. INT. TORREFAÇÃO – DIA": o rótulo do marcador da cena. */
    cabecalho: z.string().min(1).max(400),
    int_ext: z.enum(['INT', 'EXT']).nullable(),
    local: Talvez(120),
    periodo: z.enum(['dia', 'noite', 'amanhecer', 'entardecer']).nullable(),
    inicio_seg: Seg,
    fim_seg: Seg,
    duracao_digitada_seg: Digitado,
    /** Soma das falas da cena (estimada). */
    voz_seg: Seg,
    blocos: z.array(BlocoRoteiroSchema).max(3000),
  })
  .strict()

export const MaestroRoteiroSchema = z
  .object({
    contract: z.literal(MAESTRO_ROTEIRO_CONTRATO),
    gerado_em: IsoDate,
    origem: z
      .object({
        app: z.literal('maestro'),
        roteiro_id: Uuid,
        titulo: z.string().min(1).max(200),
        /** n da versão salva (imutável no Maestro). */
        versao: z.number().int().min(1).max(100_000),
        /** sha256 do conteúdo da versão, o mesmo que o Maestro conferiu ao salvar. */
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        salva_em: IsoDate,
      })
      .strict(),
    formato: z.enum(FORMATOS_ROTEIRO),
    /** Palavras por minuto da estimativa de fala. */
    wpm: z.number().int().min(60).max(320),
    alvo_seg: z
      .object({ min: z.number().int().min(0).max(14_400), max: z.number().int().min(0).max(14_400) })
      .strict()
      .nullable(),
    tempos: z.literal('estimados'),
    duracao_seg: Seg,
    pessoas: z.array(z.object({ id: Id, nome: z.string().max(80), papel: z.enum(PAPEIS_ROTEIRO) }).strict()).max(50),
    cenas: z.array(CenaRoteiroSchema).max(300),
  })
  .strict()
  .superRefine((r, ctx) => {
    const ids = new Set<string>()
    const pessoas = new Set(r.pessoas.map((p) => p.id))
    let blocos = 0
    const visto = (id: string, path: (string | number)[]) => {
      if (ids.has(id)) ctx.addIssue({ code: 'custom', message: `id repetido: ${id}`, path })
      ids.add(id)
    }
    r.cenas.forEach((c, i) => {
      visto(c.id, ['cenas', i, 'id'])
      if (c.numero !== i + 1) ctx.addIssue({ code: 'custom', message: 'numero fora de ordem', path: ['cenas', i, 'numero'] })
      if (c.fim_seg < c.inicio_seg) ctx.addIssue({ code: 'custom', message: 'fim antes do começo', path: ['cenas', i] })
      c.blocos.forEach((b, j) => {
        blocos++
        visto(b.id, ['cenas', i, 'blocos', j, 'id'])
        if (b.fim_seg < b.inicio_seg) ctx.addIssue({ code: 'custom', message: 'fim antes do começo', path: ['cenas', i, 'blocos', j] })
        if (b.tipo === 'fala' && b.pessoa_id !== null && !pessoas.has(b.pessoa_id))
          ctx.addIssue({ code: 'custom', message: 'pessoa fora do elenco', path: ['cenas', i, 'blocos', j, 'pessoa_id'] })
      })
    })
    if (blocos > 3000) ctx.addIssue({ code: 'custom', message: 'mais de 3.000 blocos', path: ['cenas'] })
    if (new Set(r.pessoas.map((p) => p.id)).size !== r.pessoas.length) ctx.addIssue({ code: 'custom', message: 'pessoa repetida', path: ['pessoas'] })
  })
export type MaestroRoteiro = z.infer<typeof MaestroRoteiroSchema>
export type BlocoRoteiro = z.infer<typeof BlocoRoteiroSchema>
