/**
 * SOBEDESCE → Synquei, download do Drive (plano SD→SQ, etapa 1).
 *
 * 1. `sobedesce.descarga/2` (linha `v: 2`, `tipo: 'drive.download'`): o SOBEDESCE grava na pasta baixada, em
 *    `<pasta>/.sobedesce/descargas.jsonl` (o mesmo arquivo das linhas v1 dos cartões; leitores v1 pulam a linha),
 *    quando o lote de download termina sem nenhum arquivo diferente do original. Produtor:
 *    products/sobedesce/src/engine/manifesto.js. Leitor: products/synquei/desktop/manifesto-drive.cjs.
 * 2. `synquei.preparo/1` (recibo): o Synquei grava em `<pasta>/Synquei/preparos.jsonl`, uma linha por mudança de
 *    estado de cada operação (a última linha de um `op` vale). O SOBEDESCE lê para nunca dizer "preparado" sem ele.
 *
 * Os dois são entrada não confiável para quem lê: objetos estritos (campo a mais = recusado), caminhos relativos sem
 * "..", limites de tamanho. Nenhum leva credencial, e-mail da conta, link assinado ou token do Drive. O `caminho` do
 * destino é do computador que gravou (informativo): quem lê usa a pasta onde achou o manifesto.
 */
import { z } from 'zod'
import { IsoDate, Uuid } from './common'

export const DRIVE_DOWNLOAD_VERSION = 2
export const DRIVE_DOWNLOAD_MAX_FILES = 50_000
export const PREPARO_FORMATO = 'synquei.preparo/1'
export const PREPARO_MAX_EXEMPLOS = 30

/** Id da operação (o id do lote no SOBEDESCE). Vai no link synquei://organizar?…&op=<id>. */
export const OperationId = z.string().regex(/^[A-Za-z0-9_-]{6,100}$/, 'op = 6 a 100 letras, números, _ ou -')
const DriveId = z.string().regex(/^[\w-]{1,200}$/)
const Md5Hex = z.string().regex(/^[0-9a-f]{32}$/)
const Contagem = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Um nome (sem barra, sem NUL, sem "." nem ".."). */
const NomeSeguro = z
  .string()
  .min(1)
  .max(255)
  .refine((s) => !/[/\\\0]/.test(s) && s !== '.' && s !== '..', { message: 'nome inválido' })

/** Caminho relativo à pasta: "/" como separador, sem raiz, sem "..", ".", segmento vazio, "\" ou NUL. */
export const CaminhoRelativo = z
  .string()
  .min(1)
  .max(1024)
  .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !/[\\\0]/.test(p) && !p.split('/').some((s) => s === '' || s === '.' || s === '..'), {
    message: 'caminho precisa ser relativo à pasta, sem ".."',
  })

export const DriveDownloadFileSchema = z
  .strictObject({
    rel: CaminhoRelativo,
    nome: NomeSeguro,
    size: Contagem,
    file_id: DriveId,
    /** MD5 do Drive conferido no arquivo baixado; null = sem conferência (Doc Google, já estava no computador…). */
    md5: Md5Hex.nullable(),
    conferido: z.boolean(),
  })
  .refine((a) => a.conferido === (a.md5 !== null), { message: 'conferido só com md5 (e md5 só se conferido)' })
  .refine((a) => a.rel === a.nome || a.rel.endsWith(`/${a.nome}`), { message: 'nome precisa ser o fim do caminho' })

export const DriveDownloadSchema = z
  .strictObject({
    v: z.literal(DRIVE_DOWNLOAD_VERSION),
    app: z.literal('sobedesce'),
    app_versao: z.string().min(1).max(60),
    tipo: z.literal('drive.download'),
    op: OperationId,
    /** Projeto da Absolute ZRO, quando a pessoa escolheu (vínculo em degraus; ausente/null = sem projeto). */
    project_id: Uuid.nullable().optional(),
    quando: IsoDate,
    /** A pasta do Drive de onde veio. Sem conta, sem link assinado: só o id e o nome. */
    origem: z.strictObject({ tipo: z.literal('drive'), pasta_id: DriveId.nullable(), pasta: z.string().min(1).max(300) }),
    /** A pasta baixada (onde o manifesto mora). `caminho` é do computador que gravou: informativo. */
    destino: z.strictObject({ pasta: NomeSeguro, caminho: z.string().min(1).max(4096).nullable().optional() }),
    /** conferido = MD5 de todos os arquivos bateu; parcial = algum ficou sem conferência (nenhum chegou diferente). */
    estado: z.enum(['conferido', 'parcial']),
    /** O que foi verificado de fato: MD5 do Drive por arquivo e o tamanho final de cada um. */
    verificacao: z.strictObject({
      algoritmo: z.literal('md5'),
      total: Contagem,
      conferidos: Contagem,
      sem_conferencia: Contagem,
      tamanho: z.literal(true),
    }),
    bytes: Contagem,
    arquivos: z.array(DriveDownloadFileSchema).min(1).max(DRIVE_DOWNLOAD_MAX_FILES),
  })
  .superRefine((d, ctx) => {
    const conferidos = d.arquivos.filter((a) => a.conferido).length
    const v = d.verificacao
    if (v.total !== d.arquivos.length || v.conferidos !== conferidos || v.sem_conferencia !== v.total - conferidos)
      ctx.addIssue({ code: 'custom', path: ['verificacao'], message: 'contagens não batem com os arquivos' })
    if ((d.estado === 'conferido') !== (conferidos === d.arquivos.length))
      ctx.addIssue({ code: 'custom', path: ['estado'], message: 'estado não bate com a verificação' })
    if (d.bytes !== d.arquivos.reduce((s, a) => s + a.size, 0)) ctx.addIssue({ code: 'custom', path: ['bytes'], message: 'bytes não bate com a soma' })
    if (new Set(d.arquivos.map((a) => a.rel)).size !== d.arquivos.length) ctx.addIssue({ code: 'custom', path: ['arquivos'], message: 'arquivo repetido' })
  })
export type DriveDownload = z.infer<typeof DriveDownloadSchema>

const Exemplos = z.array(CaminhoRelativo).max(PREPARO_MAX_EXEMPLOS)

export const PreparoSchema = z.strictObject({
  formato: z.literal(PREPARO_FORMATO),
  op: OperationId,
  app_versao: z.string().min(1).max(60),
  quando: IsoDate,
  project_id: Uuid.nullable().optional(),
  /**
   * recebido: o Synquei achou a operação e conferiu os arquivos; preparando: lendo/sincronizando; preparado: tudo
   * certo; com_pendencias: preparou o que deu e sobrou algo (ausente, alterado, sincronia para revisar); erro: parou.
   */
  estado: z.enum(['recebido', 'preparando', 'preparado', 'com_pendencias', 'erro']),
  resultado: z.strictObject({
    organizados: Contagem,
    sincronizados: Contagem,
    ignorados: Contagem,
    pendentes: Contagem,
    ausentes: Contagem,
    alterados: Contagem,
    movidos: Contagem,
    revisar: Contagem,
  }),
  /** Até 30 caminhos de cada lista (relativos à pasta), para a tela explicar sem abrir o Synquei. */
  exemplos: z.strictObject({ ausentes: Exemplos, alterados: Exemplos, movidos: Exemplos, revisar: Exemplos }),
  /** O mesmo op pedido de novo: nada foi duplicado (só conferido outra vez). */
  repetido: z.boolean().optional(),
  erro: z.string().max(300).nullable().optional(),
})
export type Preparo = z.infer<typeof PreparoSchema>
