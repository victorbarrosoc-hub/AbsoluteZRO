/**
 * TPeasy → Synquei e AEON: registro de leituras (`tpeasy.leituras/1`, docs/integration-contracts/tpeasy-leituras.md).
 *
 * Cada leitura no teleprompter (o texto começou a andar, com o bip da contagem quando ligado, até pausar, voltar,
 * chegar ao fim ou fechar) é uma linha JSONL com a hora do aparelho e os blocos (`# bloco`) que passaram na linha de
 * leitura. Quem lê casa cada take da câmera com a leitura pela hora e confirma pelo bip no áudio; o nome do bloco vira o
 * nome (Synquei) ou a etiqueta (AEON) do clipe. Ambíguo vai para revisão, nunca para um chute.
 * Produtor: products/tpeasy/app/js/leituras.js. Só tempos e nomes: nada de áudio, conta, e-mail ou aparelho.
 * Entrada não confiável para quem lê: objeto estrito, limites de tamanho, blocos em ordem de tempo.
 */
import { z } from 'zod'
import { IsoDate, Uuid } from './common'

export const TPEASY_LEITURAS_CONTRATO = 'tpeasy.leituras/1'
const SEIS_HORAS_MS = 6 * 3_600_000

export const TpeasyLeituraBlocoSchema = z
  .strictObject({
    /** Posição do bloco no roteiro (0 = primeiro `# bloco`); null = texto antes do primeiro bloco. */
    i: z.number().int().min(0).max(499).nullable(),
    nome: z.string().max(120).nullable(),
    /** Quando o bloco chegou à linha de leitura, em ms desde o início da leitura. */
    em_ms: z.number().int().min(0).max(SEIS_HORAS_MS),
  })
  .refine((b) => (b.i === null) === (b.nome === null), { message: 'bloco sem posição não tem nome (e vice-versa)' })

export const TpeasyLeituraSchema = z
  .strictObject({
    contrato: z.literal(TPEASY_LEITURAS_CONTRATO),
    id: z.string().regex(/^l[0-9a-f]{18}$/),
    roteiro: z.strictObject({
      id: z.string().min(1).max(80),
      titulo: z.string().max(200),
      /** Projeto da Absolute ZRO, quando o roteiro veio de lá ("Abrir no TPeasy"). */
      projeto: Uuid.nullable(),
      versao: z.number().int().positive().nullable(),
    }),
    /** Hora do aparelho quando o texto começou a andar (o bip, se `bip`), com o fuso. */
    inicio: IsoDate,
    fim: IsoDate,
    fuso_min: z.number().int().min(-840).max(840),
    duracao_ms: z.number().int().min(1).max(SEIS_HORAS_MS),
    bip: z.boolean(),
    contagem_s: z.number().int().min(0).max(10),
    voz: z.boolean(),
    /** Chegou ao fim do roteiro. */
    completo: z.boolean(),
    blocos: z.array(TpeasyLeituraBlocoSchema).min(1).max(500),
  })
  .refine((l) => Date.parse(l.fim) - Date.parse(l.inicio) === l.duracao_ms, { message: 'fim − início tem de ser a duração' })
  .refine((l) => l.blocos[0]!.em_ms === 0 && l.blocos.every((b, k) => k === 0 || b.em_ms >= l.blocos[k - 1]!.em_ms), {
    message: 'blocos em ordem de tempo, o primeiro no início',
  })
  .refine((l) => l.blocos.every((b) => b.em_ms <= l.duracao_ms), { message: 'bloco depois do fim' })
  .refine((l) => l.roteiro.versao === null || l.roteiro.projeto !== null, { message: 'versão só com projeto' })
export type TpeasyLeitura = z.infer<typeof TpeasyLeituraSchema>

/** Lê um arquivo `tpeasy.leituras/1` (JSONL). Linha inválida não derruba o resto: vai para `invalidas` com o número. */
export function parseTpeasyLeituras(texto: string): { leituras: TpeasyLeitura[]; invalidas: number[] } {
  const leituras: TpeasyLeitura[] = []
  const invalidas: number[] = []
  const linhas = String(texto).split(/\r?\n/)
  linhas.forEach((linha, k) => {
    if (!linha.trim()) return
    let bruto: unknown
    try {
      bruto = JSON.parse(linha)
    } catch {
      invalidas.push(k + 1)
      return
    }
    const r = TpeasyLeituraSchema.safeParse(bruto)
    if (r.success) leituras.push(r.data)
    else invalidas.push(k + 1)
  })
  return { leituras, invalidas }
}
