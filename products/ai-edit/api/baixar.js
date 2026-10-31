// GET /baixar/mac e /baixar/windows (o vercel.json reescreve para cá): o instalador do AEON. Fechado ao público (o
// padrão, api/_release.js), nada para baixar: volta para "Em desenvolvimento" na página, sem link para o Release. Aberto
// só na web (RELEASE=released, sem RELEASE_DESKTOP): volta para a seção da página, que diz "em breve". Com o app de
// computador aberto (RELEASE_DESKTOP=released), o arquivo do Release do app de desktop (o mesmo que o HUB lista em
// Downloads e o atualizador do app baixa). Sistema desconhecido: a seção Baixar da página.

import { desktopAberto, fechado } from './_release.js'
import { PRODUTO } from '../src/produto.js'

/** Os instaladores do workflow ai-edit-desktop.yml, pelo nome do produto. */
export const INSTALADORES = Object.freeze({ mac: `${PRODUTO.arquivo}-mac-universal.dmg`, windows: `${PRODUTO.arquivo}-windows-setup.exe` })

/** Para onde /baixar/<sistema> vai agora. */
export function destino(sistema) {
  if (fechado()) return '/#em-desenvolvimento'
  if (!desktopAberto()) return '/#baixar'
  const arquivo = INSTALADORES[sistema]
  return arquivo ? `https://github.com/${PRODUTO.repositorio}/releases/download/${PRODUTO.release}/${arquivo}` : '/#baixar'
}

export default function baixar(req, res) {
  const sistema = String(new URL(req.url, 'http://x').searchParams.get('sistema') || '').toLowerCase()
  res.statusCode = 302
  res.setHeader('Location', destino(sistema))
  res.setHeader('Cache-Control', 'no-store')
  res.end()
}
