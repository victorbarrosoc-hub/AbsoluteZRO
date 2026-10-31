/** Envio pelo SMTP do iCloud (smtp.mail.me.com:587, STARTTLS obrigatório) com a senha de app. */
import { createTransport } from 'nodemailer'
import { LIMITES, type ConfigCorreio } from './config'
import { erroDoIcloud } from './erros'

export async function enviarPorSmtp(cfg: ConfigCorreio, m: { raw: Buffer; envelope: { from: string; to: string[] } }): Promise<void> {
  const t = createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    requireTLS: cfg.smtp.requireTLS,
    ignoreTLS: cfg.smtp.ignoreTLS,
    auth: { user: cfg.usuario, pass: cfg.senha },
    connectionTimeout: LIMITES.conexao,
    greetingTimeout: LIMITES.saudacao,
    socketTimeout: LIMITES.socket,
    name: 'absolutezro.com',
    logger: false,
    debug: false,
  })
  try {
    await t.sendMail({ envelope: m.envelope, raw: m.raw })
  } catch (e) {
    throw erroDoIcloud(e, 'smtp')
  } finally {
    t.close()
  }
}
