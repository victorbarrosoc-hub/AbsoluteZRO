import 'server-only'
/**
 * Um turno do Laboratório da Z: a mesma Z dos clientes (retrato da conta, ferramentas, permissões de quem testa), com
 * a configuração escolhida (rascunho, uma versão ou o padrão do código), o modelo escolhido e anexos. Nada da conversa
 * é guardado: o navegador manda o histórico a cada turno. O uso e o custo vão para `zro.z_lab_uso`.
 */
import { randomUUID } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import type { Authenticated } from '@zro/auth'
import {
  authorize,
  configDaVersao,
  personalizacaoDe,
  rascunhoDoLab,
  textosDoConhecimento,
  Z_RESPOSTAS,
  type IaMensagem,
  type Turno,
  type ZConfig,
  type ZLabPedido,
  type ZPersonalizacao,
} from '@zro/core'
import type { Database } from '@zro/db'
import { iaModelo, type RespostaOpcoes } from '../modelo'
import { Aprendiz, FERRAMENTAS_DE_APRENDER } from './aprender'

/** Instrução do operador quando a resposta vai ser falada (modo voz). */
export const FALADA =
  'Esta resposta vai ser falada em voz alta. Frases curtas e naturais, como numa conversa. Sem markdown, sem listas, sem links, sem emojis e sem símbolos. No máximo três frases, a menos que a pessoa peça mais.'

/** Mensagens para o Claude: anexos antes do texto (imagem e PDF pelos arquivos da Anthropic; documento como texto). */
export function mensagensDoLab(historico: ZLabPedido['historico']): Anthropic.MessageParam[] {
  return historico.map((m): Anthropic.MessageParam => {
    if (m.papel === 'assistant' || !m.anexos?.length) return { role: m.papel, content: m.texto || '(sem texto)' }
    const blocos: Anthropic.ContentBlockParam[] = m.anexos.map((a): Anthropic.ContentBlockParam => {
      if (a.tipo === 'imagem') return { type: 'image', source: { type: 'file', file_id: a.arquivo } }
      if (a.tipo === 'pdf') return { type: 'document', source: { type: 'file', file_id: a.arquivo }, title: a.nome }
      const nota = a.cortado ? '\n\n[O arquivo foi cortado em 150 mil caracteres; o resto não chegou.]' : ''
      const tipo = a.origem === 'audio' ? 'Transcrição do áudio' : a.origem === 'video' ? 'Transcrição do vídeo' : 'Conteúdo'
      return { type: 'document', source: { type: 'text', media_type: 'text/plain', data: a.texto + nota }, title: `${tipo}: ${a.nome}` }
    })
    blocos.push({ type: 'text', text: m.texto.trim() || 'Leia o que anexei.' })
    return { role: 'user', content: blocos }
  })
}

/** A configuração do teste e o que ela muda no sistema da Z. `padrao` = o texto do código, sem personalização. */
export async function configDoTeste(
  db: Database,
  auth: Authenticated | null,
  pedido: Pick<ZLabPedido, 'versao' | 'plataforma'>,
): Promise<{ config: ZConfig | null; personalizacao: ZPersonalizacao | null }> {
  if (pedido.versao === 'padrao') return { config: null, personalizacao: null }
  const config = pedido.versao === 'rascunho' ? await rascunhoDoLab(db, auth, iaModelo()) : await configDaVersao(db, auth, pedido.versao, iaModelo())
  const textos = await textosDoConhecimento(db, auth, config.conhecimento)
  const plataforma = pedido.plataforma && pedido.plataforma !== 'hub' ? pedido.plataforma : null
  return { config, personalizacao: personalizacaoDe(config, plataforma, textos) }
}

/** Um turno sem conversa guardada para as ferramentas da Z (o retrato e as permissões são os de quem testa). */
export async function turnoDoLab(db: Database, auth: Authenticated | null, pedido: ZLabPedido): Promise<Turno> {
  const actor = await authorize(db, auth)
  const agora = new Date()
  const plataforma = pedido.plataforma && pedido.plataforma !== 'hub' ? pedido.plataforma : null
  const historico: IaMensagem[] = pedido.historico.map((m, i) => ({ id: `lab-${i}`, papel: m.papel, texto: m.texto, criada: agora }))
  return {
    actor,
    conversa: { id: randomUUID(), titulo: 'Laboratório da Z', produto: plataforma, produtoNome: null, atualizada: agora, criada: agora },
    historico,
    perguntaId: randomUUID(),
  }
}

export function opcoesDoTeste(pedido: ZLabPedido, config: ZConfig | null) {
  return {
    modelo: pedido.modelo ?? config?.modelo.id ?? iaModelo(),
    maxTokens: config ? Z_RESPOSTAS[config.modelo.resposta].maxTokens : 4000,
  }
}

/**
 * Tudo que um turno do laboratório precisa antes de chamar o Claude: aprender conversando (um "pode guardar" com cartão
 * esperando é decidido aqui, antes do modelo, e a configuração já sai com o que foi guardado), a configuração do teste,
 * o turno e as opções da resposta (com as ferramentas de aprender, só no rascunho). `aprendiz.ligar` manda os eventos.
 */
export async function prepararTurno(db: Database, auth: Authenticated | null, pedido: ZLabPedido) {
  const aprendiz = pedido.aprender && pedido.versao === 'rascunho' ? new Aprendiz(db, auth, pedido) : null
  const decidido = aprendiz ? await aprendiz.antes() : null
  const { config, personalizacao } = await configDoTeste(db, auth, pedido)
  if (aprendiz && config) aprendiz.conhecer(config.aprendizados)
  const turno = await turnoDoLab(db, auth, pedido)
  const base = opcoesDoTeste(pedido, config)
  const opcoes = (): RespostaOpcoes => ({
    ...base,
    personalizacao,
    mensagens: mensagensDoLab(pedido.historico),
    // A instrução do aprender sai na hora de responder: já sem os cartões decididos em `antes`.
    instrucao: [pedido.voz ? FALADA : null, aprendiz?.instrucao(), decidido].filter(Boolean).join('\n\n') || undefined,
    ...(aprendiz ? { ferramentasExtras: FERRAMENTAS_DE_APRENDER, usarExtra: (u) => aprendiz.usar(u) } : {}),
  })
  return { turno, aprendiz, config, opcoes }
}
