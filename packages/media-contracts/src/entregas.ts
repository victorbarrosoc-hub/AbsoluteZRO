/**
 * Entregas entre apps pelo HUB (Criação F8, 30/10/2026): o roteiro do Maestro direto no TPeasy, sem copiar e colar.
 * Contrato em docs/integration-contracts/maestro-tpeasy.md; tabela e funções na migração 0040 do HUB.
 *
 * O TPeasy guarda os roteiros só no aparelho (não tem banco), então o HUB é a caixa de entrada:
 * 1. O servidor do Maestro manda a versão salva (`POST /api/v1/apps/entregas`, Bearer da sessão com `maestro.projects`).
 *    O HUB confere a pessoa, o papel, o TPeasy no plano da organização e o gate de lançamento, e guarda UMA linha por
 *    destinatário e versão (`chave`): mandar a mesma versão de novo não duplica (vira "reenviada").
 * 2. O TPeasy, ao abrir (em cada aparelho), lê a caixa (`GET /api/v1/apps/entregas/recebidas`, Bearer com
 *    `tpeasy.roteiros`) e grava no aparelho pelo `item` (id estável): atualiza o mesmo roteiro, ou faz uma cópia se a
 *    pessoa mexeu no texto. Depois conta que recebeu (`POST .../recebidas`), e o Maestro mostra "Recebido".
 *
 * O texto é só o do Teleprompter (falas e marcações do TPeasy). Sem e-mail, telefone nem mídia.
 */
import { z } from 'zod'
import { IsoDate, Uuid } from './common'

/** Origem → destino → tipos: a lista fechada (o HUB recusa o resto). */
export const ENTREGAS_ENTRE_APPS = { maestro: { tpeasy: ['roteiro'] } } as const
export const TEXTO_ENTREGA_MAX = 200_000
export const TITULO_ENTREGA_MAX = 300

/** id de pessoa do roteiro do Maestro (o mesmo do `maestro.roteiro/1`). */
const PessoaId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)
const Link = z
  .string()
  .max(500)
  .regex(/^https?:\/\/[^\s"<>]+$/)

// ───── Maestro → HUB ─────

export const AppEntregaEntradaSchema = z
  .object({
    destino: z.literal('tpeasy'),
    tipo: z.literal('roteiro'),
    /** `sub` de quem recebe (alguém da mesma organização que usa o TPeasy). Sem ele: a própria pessoa. */
    para: Uuid.optional(),
    roteiro: z
      .object({
        id: Uuid,
        versao: z.number().int().min(1).max(100_000),
        /** A pessoa do roteiro (só as falas dela); null = todas. */
        pessoa: PessoaId.nullable(),
        /** sha256 da versão salva no Maestro (o que saiu). */
        sha256: Sha256,
      })
      .strict(),
    titulo: z.string().min(1).max(TITULO_ENTREGA_MAX),
    /** O texto na marcação do TPeasy (`# bloco`, `[pausa]`, `**ênfase**`, `((nota))`). */
    corpo: z.string().min(1).max(TEXTO_ENTREGA_MAX),
    /** Link de volta para o roteiro no Maestro. */
    link: Link.nullable(),
    /** Meta de duração no TPeasy (segundos; 0 = sem meta). */
    alvo_seg: z.number().int().min(0).max(3600),
  })
  .strict()

export const AppEntregaEstadoSchema = z
  .object({
    id: Uuid,
    /** nova = primeira vez; reenviada = a mesma versão de novo (nada duplica). */
    situacao: z.enum(['nova', 'reenviada']),
    /** O id do roteiro no TPeasy (`maestro-<roteiro>-<pessoa|todas>`): diz de qual pessoa do roteiro saiu. */
    item: z.string().regex(/^maestro-[A-Za-z0-9._-]{1,100}$/),
    versao: z.number().int().min(1),
    para: z.object({ id: Uuid, nome: z.string().max(120), eu: z.boolean() }).strict(),
    criada_em: IsoDate,
    atualizada_em: IsoDate,
    recebida_em: IsoDate.nullable(),
  })
  .strict()

/** GET /api/v1/apps/entregas?roteiro=<id>: o que a pessoa mandou daquele roteiro (as últimas, mais nova primeiro). */
export const AppEntregasEnviadasSchema = z.object({ entregas: z.array(AppEntregaEstadoSchema.omit({ situacao: true })) }).strict()

/** GET /api/v1/apps/entregas/destinatarios?destino=tpeasy: para quem dá para mandar. */
export const AppEntregaDestinatariosSchema = z
  .object({
    destinatarios: z.array(z.object({ id: Uuid, nome: z.string().max(120), foto: z.string().max(500).nullable(), eu: z.boolean() }).strict()),
  })
  .strict()

// ───── HUB → TPeasy ─────

export const AppEntregaRecebidaSchema = z
  .object({
    id: Uuid,
    origem: z.literal('maestro'),
    tipo: z.literal('roteiro'),
    /** id estável no TPeasy (`maestro-<roteiro>-<pessoa|todas>`): o mesmo roteiro em todas as versões. */
    item: z.string().regex(/^maestro-[A-Za-z0-9._-]{1,100}$/),
    versao: z.number().int().min(1),
    titulo: z.string().min(1).max(TITULO_ENTREGA_MAX),
    corpo: z.string().min(1).max(TEXTO_ENTREGA_MAX),
    sha256: Sha256,
    link: Link.nullable(),
    alvo_seg: z.number().int().min(0).max(3600),
    /** Quem mandou (só o nome). */
    de: z.string().max(120),
    /** Muda a cada reenvio: o aparelho guarda o último que viu de cada entrega. */
    atualizada_em: IsoDate,
  })
  .strict()

/** GET /api/v1/apps/entregas/recebidas?destino=tpeasy[&desde=<iso>]: o que chegou nos últimos 30 dias. */
export const AppEntregasRecebidasSchema = z.object({ entregas: z.array(AppEntregaRecebidaSchema), agora: IsoDate }).strict()

/** POST /api/v1/apps/entregas/recebidas: o aparelho conta o que gravou. */
export const AppEntregaRecebidasEntradaSchema = z.object({ ids: z.array(Uuid).min(1).max(100) }).strict()

export type AppEntregaEntrada = z.infer<typeof AppEntregaEntradaSchema>
export type AppEntregaEstado = z.infer<typeof AppEntregaEstadoSchema>
export type AppEntregaRecebida = z.infer<typeof AppEntregaRecebidaSchema>

/** A chave de idempotência (uma por destinatário): a mesma versão da mesma pessoa do roteiro = a mesma entrega. */
export const chaveDaEntrega = (r: { id: string; versao: number; pessoa: string | null }) => `maestro:roteiro:${r.id}:${r.pessoa || 'todas'}:v${r.versao}`
/** O id do roteiro no TPeasy (igual ao `idNoTpeasy` do Maestro e ao backup da F3). */
export const itemNoTpeasy = (r: { id: string; pessoa: string | null }) => `maestro-${r.id}-${r.pessoa || 'todas'}`.slice(0, 100)
