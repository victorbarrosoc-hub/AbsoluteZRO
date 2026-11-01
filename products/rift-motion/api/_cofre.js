// Cofre das conexões do Rift (rift.conexoes): a chave da API ou os tokens da conta da Higgsfield só entram no banco
// cifrados com AES-256-GCM. A chave do cofre sai de ZRO_CLIENT_SECRET por HKDF (mesma origem dos cookies, outro
// rótulo): sem o segredo do servidor, o que está no banco não abre. Trocar ZRO_CLIENT_SECRET desliga as conexões
// (a pessoa conecta de novo).
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

const segredo = () => (process.env.ZRO_CLIENT_SECRET || '').trim()
const chave = (nome) => Buffer.from(hkdfSync('sha256', Buffer.from(segredo(), 'utf8'), Buffer.from('rift-cofre', 'utf8'), Buffer.from(`conexao:${nome}`, 'utf8'), 32))

export function trancar(nome, dados) {
  if (!segredo()) throw new Error('cofre sem segredo')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(nome), iv)
  const corpo = Buffer.concat([c.update(JSON.stringify(dados), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64url')
}

export function destrancar(nome, valor) {
  if (!segredo() || typeof valor !== 'string' || valor.length < 40 || valor.length > 8000) return null
  try {
    const b = Buffer.from(valor, 'base64url')
    const d = createDecipheriv('aes-256-gcm', chave(nome), b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    const dados = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'))
    return dados && typeof dados === 'object' ? dados : null
  } catch {
    return null
  }
}
