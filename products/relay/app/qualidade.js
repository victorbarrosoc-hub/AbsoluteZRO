// Relay · página de qualidade: o placar e a tabela saem de app/qualidade-dados.js (scripts/qualidade.mjs --publicar).
import { LINHAS } from './qualidade-dados.js'
import { tamanhoLegivel } from '../src/plano.js'

const NOMES = { foto: 'Grão pesado', limpa: 'Imagem limpa', movimento: 'Movimento fino', uhd: '4K → 1080p' }
const el = (tag, props = {}, ...filhos) => {
  const n = Object.assign(document.createElement(tag), props)
  n.append(...filhos.filter((f) => f != null))
  return n
}
const fmt = (n, c = 4) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })

// Placar: Relay no computador × HandBrake no mesmo tamanho, por clipe
const placar = document.querySelector('[data-placar]')
for (const m of Object.keys(NOMES)) {
  const relay = LINHAS.find((l) => l.master === m && /computador/.test(l.nome))
  const hb = LINHAS.find((l) => l.master === m && /mesmo tamanho \(youtube-1080-computador\)/.test(l.nome))
  if (!relay || !hb) continue
  const ganhou = relay.ssim >= hb.ssim
  placar.append(
    el(
      'article',
      { className: 'cartao' },
      el('span', { className: 'sobretitulo', textContent: NOMES[m] }),
      el('span', { className: 'numero' }, fmt(relay.ssim), el('small', { textContent: ' Relay no computador' })),
      el('span', { className: 'apoio', textContent: `HandBrake no mesmo tamanho: ${fmt(hb.ssim)}${ganhou ? '' : ' (o HandBrake ganha)'}` }),
    ),
  )
}

const tabela = document.querySelector('[data-tabela]')
tabela.append(el('thead', {}, el('tr', {}, ...['Clipe', 'Conversão', 'SSIM', 'PSNR (Y)', 'Tamanho'].map((t) => el('th', { textContent: t })))))
tabela.append(
  el(
    'tbody',
    {},
    ...LINHAS.map((l) =>
      el(
        'tr',
        { className: /^Relay/.test(l.nome) ? 'relay' : '' },
        el('td', { textContent: NOMES[l.master] ?? l.master }),
        el('td', { textContent: l.nome.replace('(youtube-1080-computador)', '(Relay no computador)').replace('(youtube-1080-navegador)', '(Relay no navegador)') }),
        el('td', { textContent: fmt(l.ssim) }),
        el('td', { textContent: `${fmt(l.psnrY, 1)} dB` }),
        el('td', { textContent: tamanhoLegivel(l.bytes) }),
      ),
    ),
  ),
)
