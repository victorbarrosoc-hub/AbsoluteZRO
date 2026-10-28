/**
 * Envio de e-mail transacional pelo Resend (decisão do titular, 28/10/2026), do endereço nao-responda@absolutezro.com.
 * Em desenvolvimento o link aparece no log do servidor; em produção sem RESEND_API_KEY, `deliveryAvailable` é false e
 * a interface diz que a confirmação por e-mail está indisponível, em vez de fingir que enviou.
 */
import { zroEnv } from '@zro/observability'

/** `text` é sempre obrigatório (leitores sem HTML e filtros de spam); `html` é a versão desenhada. */
export type InlineImage = { arquivo: string; cid: string; base64: string }
export type OutgoingEmail = { to: string; subject: string; text: string; html?: string; imagens?: InlineImage[] }
export type EmailSender = { deliveryAvailable: boolean; send(email: OutgoingEmail): Promise<void> }

export function devConsoleSender(log: (line: string) => void = (l) => console.info(l)): EmailSender {
  return {
    deliveryAvailable: true,
    async send(e) {
      log(`[e-mail de desenvolvimento] para ${e.to} · ${e.subject}\n${e.text}`)
    },
  }
}

export const unavailableSender: EmailSender = {
  deliveryAvailable: false,
  async send() {},
}

/** Caixa de saída em memória para testes. */
export function memorySender(): EmailSender & { outbox: OutgoingEmail[] } {
  const outbox: OutgoingEmail[] = []
  return { deliveryAvailable: true, outbox, send: async (e) => void outbox.push(e) }
}

const REMETENTE = 'Absolute ZRO <nao-responda@absolutezro.com>'
const RESPONDER_PARA = 'contato@absolutezro.com'

export function resendSender(apiKey: string, fetcher: typeof fetch = fetch): EmailSender {
  return {
    deliveryAvailable: true,
    async send(e) {
      const r = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: REMETENTE,
          reply_to: RESPONDER_PARA,
          to: [e.to],
          subject: e.subject,
          text: e.text,
          ...(e.html ? { html: e.html } : {}),
          ...(e.imagens?.length ? { attachments: e.imagens.map((i) => ({ filename: i.arquivo, content: i.base64, content_id: i.cid })) } : {}),
        }),
      })
      if (!r.ok) throw new Error(`Resend recusou o envio (${r.status}).`)
    },
  }
}

export function defaultSender(): EmailSender {
  const key = process.env.RESEND_API_KEY?.trim()
  if (key) return resendSender(key)
  if (zroEnv() === 'production') return unavailableSender
  return devConsoleSender()
}
