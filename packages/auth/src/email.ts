/**
 * Envio de e-mail transacional. O provedor ainda não foi escolhido (PRD, decisões pendentes):
 * em desenvolvimento o link aparece no log do servidor; em produção sem provedor, `deliveryAvailable` é false e a
 * interface diz que a confirmação por e-mail está indisponível, em vez de fingir que enviou.
 */
export type OutgoingEmail = { to: string; subject: string; text: string }
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

export function defaultSender(): EmailSender {
  if (process.env.ZRO_ENV === 'production') return unavailableSender
  return devConsoleSender()
}
