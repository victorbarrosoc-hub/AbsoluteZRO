import 'server-only'
/**
 * Aprender conversando (Laboratório da Z, ADR 0033 § Aprender conversando). Quando o titular corrige a Z no meio da
 * conversa, ela chama `propor_aprendizado` e o navegador mostra o cartão "Aprender: …". Nada é guardado sem ele: o
 * "Guardar" é o toque no cartão (rota /aprendizados) ou uma confirmação dita ou escrita ("pode guardar", "sim"), que o
 * servidor reconhece sozinho antes de chamar o modelo (`antes`) ou aceita em `confirmar_aprendizado` só se a última
 * frase do titular confirma mesmo. O guardado vai para o rascunho; o próximo turno já usa.
 */
import { randomUUID } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import type { Authenticated } from '@zro/auth'
import {
  confirmaNaFrase,
  conflitoDe,
  guardarAprendizado,
  intencaoDoCartao,
  lerEntradaDaProposta,
  repetidoDe,
  travaDeSeguranca,
  Z_APPS,
  Z_APRENDIZADO_TIPOS,
  type ZAprendizado,
  type ZLabPedido,
  type ZProposta,
} from '@zro/core'
import type { Database } from '@zro/db'
import { DomainError, isDomainError } from '@zro/observability'

const PLATAFORMAS = Z_APPS.map((a) => a.id).filter((id) => id !== 'hub')

/** As duas ferramentas do laboratório. `strict`: todos os campos obrigatórios; vazio e "nenhuma" = sem valor. */
export const FERRAMENTAS_DE_APRENDER: Anthropic.Tool[] = [
  {
    name: 'propor_aprendizado',
    description:
      'Use quando o titular corrigir o seu jeito ou ensinar algo para você lembrar sempre: tom ("não fala tão formal"), uma regra de conversa ("quando eu perguntar de preço, fala dos planos", "não repete a pergunta"), um fato ("a produtora se chama Lumen"), a pronúncia de uma palavra ou algo só de uma plataforma. Não guarda nada: mostra um cartão para ele confirmar. Pergunta ou pedido comum de conversa não é aprendizado. Uma chamada por correção.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: [...Z_APRENDIZADO_TIPOS], description: 'tom, regra, fato, pronuncia ou plataforma' },
        texto: {
          type: 'string',
          description:
            'O aprendizado numa frase curta, no imperativo e na segunda pessoa, até 200 caracteres. Ex.: "Fale de um jeito próximo, sem formalidade."',
        },
        plataforma: { type: 'string', enum: ['nenhuma', ...PLATAFORMAS], description: 'A plataforma, só quando vale apenas nela; senão "nenhuma"' },
        exemplo: { type: 'string', description: 'Um exemplo curto de como fica, ou "" quando não houver' },
      },
      required: ['tipo', 'texto', 'plataforma', 'exemplo'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'confirmar_aprendizado',
    description:
      'Use só quando o titular responder a um cartão de aprendizado que está esperando: "guardar" se ele confirmou na última mensagem ("pode guardar", "sim, guarda"), "ignorar" se ele disse para deixar de lado. Nunca confirme por conta própria.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'o id do cartão esperando' },
        decisao: { type: 'string', enum: ['guardar', 'ignorar'] },
      },
      required: ['id', 'decisao'],
      additionalProperties: false,
    },
    strict: true,
  },
]

export type EventoDeAprender =
  | { tipo: 'aprendizado'; acao: 'proposto'; proposta: ZProposta }
  | { tipo: 'aprendizado'; acao: 'salvo'; proposta: string; aprendizado: ZAprendizado; substituido: { id: string; texto: string } | null; repetido: boolean }
  | { tipo: 'aprendizado'; acao: 'ignorado'; proposta: string }
  | { tipo: 'aprendizado'; acao: 'repetido'; texto: string }
  | { tipo: 'aprendizado'; acao: 'recusado'; motivo: string; proposta?: string }

/** Propostas novas por turno: a Z não enche a conversa de cartões. */
const MAX_POR_TURNO = 2

const aspas = (t: string) => `“${t}”`

export class Aprendiz {
  private pendentes: ZProposta[]
  private salvos: ZAprendizado[] = []
  private novas = 0
  private fila: EventoDeAprender[] = []
  private saida: ((e: EventoDeAprender) => void) | null = null
  private readonly frase: string
  private readonly pela: 'voz' | 'conversa'

  constructor(
    private readonly db: Database,
    private readonly auth: Authenticated | null,
    private readonly pedido: ZLabPedido,
  ) {
    this.pendentes = [...(pedido.pendentes ?? [])]
    this.frase = pedido.historico[pedido.historico.length - 1]!.texto.trim()
    this.pela = pedido.voz ? 'voz' : 'conversa'
  }

  /** Os eventos ficam na fila até a resposta começar a sair. */
  ligar(enviar: (e: EventoDeAprender) => void) {
    this.saida = enviar
    for (const e of this.fila.splice(0)) enviar(e)
  }
  private emitir(e: EventoDeAprender) {
    if (this.saida) this.saida(e)
    else this.fila.push(e)
  }

  /** O que já está guardado no rascunho (para não propor de novo e para avisar contradição). */
  conhecer(salvos: ZAprendizado[]) {
    this.salvos = salvos
  }

  private async guardar(p: ZProposta): Promise<boolean> {
    try {
      const r = await guardarAprendizado(this.db, this.auth, { proposta: p, confirmar: true, pela: this.pela })
      this.emitir({ tipo: 'aprendizado', acao: 'salvo', proposta: p.id, aprendizado: r.aprendizado, substituido: r.substituido, repetido: r.repetido })
      this.pendentes = this.pendentes.filter((x) => x.id !== p.id)
      return true
    } catch (err) {
      if (!isDomainError(err)) throw err
      this.emitir({ tipo: 'aprendizado', acao: 'recusado', motivo: err.message, proposta: p.id })
      return false
    }
  }

  /**
   * Antes do modelo: "pode guardar", "sim", "ignora" com um cartão esperando decide aqui mesmo, sem depender da Z. Devolve
   * a instrução para ela responder em uma frase (ou null se a frase não era sobre o cartão).
   */
  async antes(): Promise<string | null> {
    const ultimo = this.pendentes.at(-1)
    const intencao = ultimo ? intencaoDoCartao(this.frase) : null
    if (!ultimo || !intencao) return null
    const alvos = intencao.todos ? [...this.pendentes] : [ultimo]
    if (intencao.decisao === 'ignorar') {
      for (const p of alvos) this.emitir({ tipo: 'aprendizado', acao: 'ignorado', proposta: p.id })
      this.pendentes = this.pendentes.filter((x) => !alvos.includes(x))
      return `O titular dispensou o cartão ${alvos.map((p) => aspas(p.texto)).join(' e ')}: nada foi guardado. Responda numa frase curta e natural, sem perguntar de novo.`
    }
    const guardados: string[] = []
    for (const p of alvos) if (await this.guardar(p)) guardados.push(p.texto)
    if (!guardados.length) return 'O titular quis guardar o cartão, mas não deu (o motivo apareceu para ele). Diga isso numa frase curta.'
    return `O titular confirmou o cartão. Já está guardado no rascunho: ${guardados.map(aspas).join(' e ')}. Responda numa frase curta e natural (ex.: "Pronto, guardei."), sem perguntar de novo, e siga assim daqui para frente.`
  }

  /** A instrução do laboratório, junto do retrato no fim (não quebra o cache do começo). */
  instrucao(): string {
    const esperando = this.pendentes.length
      ? `\nCartões esperando o titular: ${this.pendentes.map((p) => `[${p.id}] ${aspas(p.texto)}`).join('; ')}. Se ele confirmar na última mensagem, chame confirmar_aprendizado com "guardar"; se dispensar, com "ignorar".`
      : ''
    return `Laboratório da Z: quem fala com você agora é o titular da Absolute ZRO, ajustando como você deve se comportar. \
Quando ele corrigir o seu jeito ou ensinar algo para guardar, chame propor_aprendizado (uma vez por correção). Nada é \
guardado sem ele: o cartão pergunta. Depois, responda numa frase natural mostrando que entendeu (ex.: "Entendi, vou falar \
mais próxima.") e já siga a correção nesta conversa. Não diga que guardou e não peça licença para propor. Os aprendizados \
já guardados estão no fim do seu texto de sistema: não proponha de novo.${esperando}`
  }

  /** Responde às ferramentas do laboratório; null para as outras. */
  async usar(u: Anthropic.ToolUseBlock): Promise<{ texto: string; erro: boolean } | null> {
    if (u.name === 'propor_aprendizado') return this.propor(u.input)
    if (u.name === 'confirmar_aprendizado') return this.confirmar(u.input)
    return null
  }

  private propor(input: unknown): { texto: string; erro: boolean } {
    if (this.novas >= MAX_POR_TURNO) return { texto: 'Já mostrei cartões demais nesta resposta. Siga a conversa.', erro: true }
    let e: ReturnType<typeof lerEntradaDaProposta>
    try {
      e = lerEntradaDaProposta(input, PLATAFORMAS)
    } catch (err) {
      return { texto: err instanceof DomainError ? err.message : 'Proposta inválida.', erro: true }
    }
    const motivo = travaDeSeguranca(`${e.texto} ${e.exemplo ?? ''}`)
    if (motivo) {
      this.emitir({ tipo: 'aprendizado', acao: 'recusado', motivo: `Não dá para aprender isso: ${motivo}.` })
      return {
        texto: `Recusado: ${motivo}. Aprendizado não muda regras, permissões nem o que você pode fazer. Explique isso com gentileza, numa frase, e diga que isso só muda na configuração.`,
        erro: true,
      }
    }
    const guardado = repetidoDe(e, this.salvos)
    if (guardado) {
      this.emitir({ tipo: 'aprendizado', acao: 'repetido', texto: guardado.texto })
      return { texto: `Isso já está guardado: ${aspas(guardado.texto)}. Diga que já sabia, numa frase, e siga.`, erro: false }
    }
    const naFila = repetidoDe(e, this.pendentes)
    if (naFila) return { texto: `Já há um cartão esperando com isso: ${aspas(naFila.texto)}. Não proponha de novo.`, erro: false }
    const conflito = conflitoDe(e, this.salvos)
    const proposta: ZProposta = {
      id: randomUUID(),
      tipo: e.tipo,
      texto: e.texto,
      plataforma: e.plataforma,
      exemplo: e.exemplo,
      gatilho: this.frase.slice(0, 300),
      voz: !!this.pedido.voz,
      conflito: conflito ? { id: conflito.id, texto: conflito.texto } : null,
    }
    this.novas++
    this.pendentes.push(proposta)
    this.emitir({ tipo: 'aprendizado', acao: 'proposto', proposta })
    return {
      texto: `Cartão mostrado ao titular (Guardar, Ajustar ou Ignorar). Nada foi guardado ainda.${
        conflito ? ` Isso contradiz um aprendizado guardado, ${aspas(conflito.texto)}; se ele guardar, o novo fica no lugar.` : ''
      } Agora responda numa frase natural mostrando que entendeu.`,
      erro: false,
    }
  }

  private async confirmar(input: unknown): Promise<{ texto: string; erro: boolean }> {
    const i = (input ?? {}) as { id?: unknown; decisao?: unknown }
    const p = this.pendentes.find((x) => x.id === i.id) ?? (this.pendentes.length === 1 ? this.pendentes[0] : undefined)
    if (!p) return { texto: 'Não há cartão esperando com esse id.', erro: true }
    if (i.decisao === 'ignorar') {
      this.emitir({ tipo: 'aprendizado', acao: 'ignorado', proposta: p.id })
      this.pendentes = this.pendentes.filter((x) => x.id !== p.id)
      return { texto: 'Cartão dispensado. Nada foi guardado.', erro: false }
    }
    // O modelo não confirma sozinho: a última frase do titular tem de confirmar.
    if (i.decisao !== 'guardar' || !confirmaNaFrase(this.frase))
      return { texto: 'O titular ainda não confirmou. Não guarde e não diga que guardou; o cartão continua esperando.', erro: true }
    return (await this.guardar(p))
      ? { texto: `Guardado no rascunho: ${aspas(p.texto)}. Diga isso numa frase curta.`, erro: false }
      : { texto: 'Não deu para guardar (o motivo apareceu para o titular). Diga isso numa frase curta.', erro: true }
  }
}
