/**
 * Enviar do Correio (resposta ou e-mail novo): monta o MIME uma vez, manda pelo SMTP, grava a cópia em "Sent Messages"
 * por IMAP APPEND e registra em audit_logs (caixa, tipo, quantos destinatários e o Message-ID; nunca o corpo nem o
 * assunto). Se o SMTP falha, nada é gravado nem auditado como enviado.
 */
import type { CaixaCorreio } from '@zro/core'
import type { Database } from '@zro/db'
import { audit, createLogger } from '@zro/observability'
import { gerarMime, montarNova, montarResposta } from './compor'
import type { ConfigCorreio } from './config'
import { guardarEnviada, lerOriginal } from './imap'
import { enviarPorSmtp } from './smtp'

const log = createLogger('correio')

export type PedidoDeEnvio = { para?: string; cc?: string; assunto?: string; texto: string; responderA?: number | null; todos?: boolean }

export async function enviarDoCorreio(
  db: Database,
  cfg: ConfigCorreio,
  ator: { userId: string },
  caixa: CaixaCorreio,
  pedido: PedidoDeEnvio,
): Promise<{ messageId: string; copiaEmEnviadas: boolean }> {
  const resposta = pedido.responderA != null
  const saida = resposta
    ? montarResposta(caixa, await lerOriginal(cfg, caixa, pedido.responderA!), { texto: pedido.texto, todos: pedido.todos })
    : montarNova(caixa, { para: pedido.para ?? '', cc: pedido.cc, assunto: pedido.assunto ?? '', texto: pedido.texto })
  const mime = await gerarMime(saida)
  await enviarPorSmtp(cfg, mime)
  // A cópia em Enviadas é o melhor esforço: o e-mail já saiu; se a gravação falhar, a tela avisa.
  const copiaEmEnviadas = await guardarEnviada(cfg, mime.raw).then(
    () => true,
    (e) => {
      log.warn('correio.copia_enviadas_falhou', { error: e })
      return false
    },
  )
  await db.asSystem('admin: correio enviado', (tx) =>
    audit(tx, {
      actorUserId: ator.userId,
      actorKind: 'admin',
      action: 'admin.correio_enviado',
      targetType: 'caixa_correio',
      targetId: caixa.id,
      metadata: {
        tipo: resposta ? 'resposta' : 'novo',
        destinatarios: mime.envelope.to.length,
        messageId: mime.messageId,
        copiaEmEnviadas,
      },
    }),
  )
  return { messageId: mime.messageId, copiaEmEnviadas }
}
