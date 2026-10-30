/**
 * Ponte Maestro → SOBEDESCE pelo HUB (Maestro v2, fases 7–10; docs/integration-contracts/maestro-sobedesce.md).
 *
 * 1. O servidor do Maestro pede ao HUB (`POST /api/v1/apps/pedidos`) um pedido assinado para uma ação.
 * 2. O HUB devolve o `zro-pedido+jwt` (aud = client_id do SOBEDESCE, 60 s, `jti` de uso único) e a `url` exata.
 * 3. O Maestro chama o SOBEDESCE com `Authorization: Bearer <jwt>` e o corpo da ação. O HUB não vê a resposta.
 *
 * Nenhum byte de arquivo passa por servidor: a miniatura é um link curto do Google, o vídeo da equipe toca pelo service
 * worker do Maestro com o token curto (`drive.token`, nunca guardado) e o do cliente pela URL pública de mídia enquanto
 * o link do lote vale (`drive.compartilhar_revisao` / `drive.recolher_revisao`).
 */
import { z } from 'zod'
import { IsoDate, Uuid } from './common'

export const ACOES_PONTE_SOBEDESCE = [
  'drive.listar',
  'drive.miniatura',
  'drive.pasta.criar',
  'drive.compartilhar_revisao',
  'drive.recolher_revisao',
  'drive.token',
  // "Gerar versões com o Relay" (docs/integration-contracts/relay.md, "Maestro → Relay"): a fila do SOBEDESCE.
  'relay.converter',
  'relay.pedido',
  'relay.cancelar',
] as const
export type AcaoPonteSobedesce = (typeof ACOES_PONTE_SOBEDESCE)[number]

/** As ações que pedem também o Relay no plano da organização (além do SOBEDESCE, o destino). */
export const ACOES_PONTE_RELAY = ['relay.converter', 'relay.pedido', 'relay.cancelar'] as const satisfies readonly AcaoPonteSobedesce[]

/** Id de arquivo ou pasta do Drive. */
export const DriveId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
/** Id da conta Google conectada no SOBEDESCE (contas_google.id; opaco para o Maestro). */
export const ContaSobedesce = z.string().min(1).max(64)

// ───── HUB ─────

export const AppPedidoEntradaSchema = z
  .object({
    destino: z.literal('sobedesce'),
    acao: z.enum(ACOES_PONTE_SOBEDESCE),
    /** Só com a credencial do app (Basic) e só para drive.recolher_revisao. */
    sub: Uuid.optional(),
  })
  .strict()

export const AppPedidoRespostaSchema = z
  .object({
    tipo: z.literal('zro-pedido+jwt'),
    token: z.string().regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
    aud: z.string().min(1),
    acao: z.enum(ACOES_PONTE_SOBEDESCE),
    expira_em: IsoDate,
    url: z.url({ protocol: /^https?$/ }),
  })
  .strict()

// ───── SOBEDESCE: corpos ─────

export const DriveListarEntradaSchema = z
  .object({
    /** null ou 'root' = Meu Drive. */
    pasta: z.union([DriveId, z.null()]).optional(),
    busca: z.string().min(1).max(200).optional(),
    pagina: z.string().min(1).max(2000).optional(),
    conta: ContaSobedesce.optional(),
  })
  .strict()

export const DriveMiniaturaEntradaSchema = z.object({ arquivoId: DriveId, px: z.number().int().min(64).max(1600).optional() }).strict()

export const DrivePastaCriarEntradaSchema = z
  .object({
    cliente: z.string().min(1).max(120),
    projeto: z.string().min(1).max(120),
    /** Pasta (ou Drive compartilhado) onde a árvore nasce; sem ela, Meu Drive. */
    raiz: DriveId.nullable().optional(),
    conta: ContaSobedesce.optional(),
  })
  .strict()

export const DriveCompartilharEntradaSchema = z.object({ arquivoId: DriveId }).strict()
export const DriveRecolherEntradaSchema = z.object({ arquivoId: DriveId, permissaoId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/) }).strict()
export const DriveTokenEntradaSchema = z.object({ conta: ContaSobedesce.optional() }).strict()

// ───── SOBEDESCE: respostas ─────

const Link = z.url({ protocol: /^https?$/ }).nullable()

export const ItemDriveSchema = z
  .object({
    id: DriveId,
    nome: z.string().min(1),
    tipo: z.string().min(1),
    pasta: z.boolean(),
    modificado: z.string().nullable(),
    tamanho: z.number().int().nonnegative().nullable(),
    /** Link curto do Google (horas), já no tamanho da grade. */
    miniatura: Link,
    video: z.object({ largura: z.number().nullable(), altura: z.number().nullable(), duracao_ms: z.number().nullable() }).nullable(),
    abrir_no_sobedesce: Link,
  })
  .strict()

export const DriveListarRespostaSchema = z
  .object({
    conta: z.object({ id: ContaSobedesce, email: z.string() }).strict(),
    pasta: z.object({ id: DriveId, nome: z.string() }).strict().nullable(),
    itens: z.array(ItemDriveSchema).max(100),
    proxima: z.string().nullable(),
  })
  .strict()

export const DriveMiniaturaRespostaSchema = z.object({ url: z.url({ protocol: /^https?$/ }), expira_em: IsoDate }).strict()

export const DrivePastaCriarRespostaSchema = z
  .object({
    pasta: z.object({ id: DriveId, nome: z.string(), abrir_no_sobedesce: Link }).strict(),
    subpastas: z.array(z.object({ id: DriveId, nome: z.string() }).strict()).length(5),
    criadas: z.number().int().min(0).max(8),
  })
  .strict()

export const DriveCompartilharRespostaSchema = z
  .object({
    arquivoId: DriveId,
    /** A permissão "qualquer pessoa com o link" criada agora (para desfazer); null quando o arquivo já era público. */
    permissao_id: z.string().nullable(),
    ja_publico: z.boolean(),
    resource_key: z.string().nullable(),
  })
  .strict()

export const DriveRecolherRespostaSchema = z.object({ recolhido: z.literal(true), ja_nao_havia: z.boolean() }).strict()

export const DriveTokenRespostaSchema = z
  .object({
    access_token: z.string().min(10),
    expira_em: IsoDate,
    conta: z.object({ id: ContaSobedesce, email: z.string() }).strict(),
    contas: z.array(z.object({ id: ContaSobedesce, email: z.string() }).strict()).max(3),
  })
  .strict()

// ───── SOBEDESCE: as versões de entrega pelo Relay ─────

/** Id de preset do Relay (`products/relay/src/presets.js`); "tamanho" (Tamanho exato) pede o MB na hora e fica de fora. */
export const PresetRelayId = z
  .string()
  .regex(/^[a-z0-9-]{1,40}$/)
  .refine((id) => id !== 'tamanho', 'Tamanho exato não entra no pedido')
/** Id do pedido na fila do SOBEDESCE (opaco). */
export const PedidoRelayId = z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/)

export const STATUS_PEDIDO_RELAY = ['pendente', 'convertendo', 'pronto', 'erro', 'cancelado'] as const

export const RelayConverterEntradaSchema = z
  .object({
    arquivoId: DriveId,
    presets: z.array(PresetRelayId).min(1).max(8),
    /** Sem ela, a pasta do original. */
    pastaId: DriveId.optional(),
    /** Do app que pede (o Maestro manda o id da versão): cada item da fila tem a chave `ref:preset`. */
    ref: z.string().min(1).max(120),
    conta: ContaSobedesce.optional(),
  })
  .strict()

export const RelayConverterRespostaSchema = z
  .object({
    pedidos: z
      .array(z.object({ id: PedidoRelayId, preset: PresetRelayId, ref: z.string().min(1).max(120), status: z.enum(STATUS_PEDIDO_RELAY) }).strict())
      .min(1)
      .max(8),
  })
  .strict()

export const PedidoRelaySchema = z
  .object({
    id: PedidoRelayId,
    preset: PresetRelayId,
    ref: z.string().min(1).max(120),
    status: z.enum(STATUS_PEDIDO_RELAY),
    frac: z.number().min(0).max(1).optional(),
    /** Só com "pronto", e "pronto" só com o MD5 do Drive igual ao do arquivo convertido. */
    resultado: z
      .object({
        arquivoId: DriveId,
        nome: z.string().min(1).max(300),
        tamanho: z.number().int().nonnegative(),
        md5: z.string().regex(/^[0-9a-f]{32}$/),
        pastaId: DriveId,
      })
      .strict()
      .optional(),
    erro: z.string().max(300).optional(),
    criado_em: IsoDate,
    atualizado_em: IsoDate,
  })
  .strict()
  .refine((p) => p.status !== 'pronto' || !!p.resultado, { message: 'pronto exige o resultado com o MD5', path: ['resultado'] })

export const RelayPedidoEntradaSchema = z.object({ ids: z.array(PedidoRelayId).min(1).max(50) }).strict()
export const RelayPedidoRespostaSchema = z
  .object({
    pedidos: z.array(PedidoRelaySchema).max(50),
    /** Há um app de computador da conta aberto agora, ou usado há pouco (o app que pede diz isso sem prometer prazo). */
    computador: z.object({ aberto_agora: z.boolean(), usado_ha_pouco: z.boolean() }).strict(),
  })
  .strict()

export const RelayCancelarEntradaSchema = z.object({ id: PedidoRelayId }).strict()
export const RelayCancelarRespostaSchema = z.object({ cancelado: z.boolean(), ja_terminado: z.boolean() }).strict()

/** A árvore padrão de cada projeto (`Maestro/<Cliente>/<Projeto>/…`). */
export const ESTRUTURA_DO_PROJETO = ['01 Briefing', '02 Bruto', '03 Edição', '04 Revisão', '05 Entregas'] as const
