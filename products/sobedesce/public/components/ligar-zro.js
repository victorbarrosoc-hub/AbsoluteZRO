// "Agora sua conta é Absolute ZRO" (lib/ligar-zro.js): folha por cima da interface com o app parado, faixa fixa com
// transferência andando. O botão pede ao motor o endereço do vincular de sempre e abre no navegador do sistema; o
// motor confere a conta a cada 3 s e, quando ligar, a folha some (o navegador já foi para as Conexões da central).
import { html, useEffect, useRef, useState } from '/vendor/preact-htm.js'
import { useStore, setCloud } from '../lib/store.js'
import { api, attempt } from '../lib/api.js'
import { openExternal } from '../lib/desktop.js'
import { BOTAO, modoLigarZro, TITULO } from '../lib/ligar-zro.js'
import { Spinner } from './common.js'

/** Símbolo flat da Absolute ZRO (uma cor só, herda a cor do texto), o mesmo do site. */
export function SimboloZro({ size = 96 }) {
  return html`<svg class="lz-simbolo" width=${size} height=${size} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M74.00 40.02C75.00 47.51 77.33 49.00 94.82 50.00C77.33 51.00 75.00 52.49 74.00 59.98C73.00 52.49 70.67 51.00 53.18 50.00C70.67 49.00 73.00 47.51 74.00 40.02Z" />
    <path fill-rule="evenodd" d="M9.70 50.00a34.30 34.30 0 1 0 68.60 0a34.30 34.30 0 1 0 -68.60 0ZM18.30 50.00a25.70 25.70 0 1 0 51.40 0a25.70 25.70 0 1 0 -51.40 0Z" />
  </svg>`
}

let ultimoUrl = null

async function continuar(setAbrindo) {
  setAbrindo(true)
  const r = await attempt(api.post('/api/cloud/zro/ligar'))
  setAbrindo(false)
  if (r?.cloud) setCloud(r.cloud)
  if (r?.url) {
    ultimoUrl = r.url
    openExternal(r.url)
  }
}

export function LigarZro() {
  const cloud = useStore((s) => s.cloud)
  const transfers = useStore((s) => s.transfers)
  const backup = useStore((s) => s.backup)
  const [abrindo, setAbrindo] = useState(false)
  const modo = modoLigarZro(cloud, { transfers, backup })
  const esperando = Boolean(cloud?.zro?.esperando)
  const temDrive = (cloud?.contas?.length ?? 0) > 0
  const folha = useRef(null)

  // A folha pega o foco (teclado e leitor de tela ficam nela; Tab chega ao botão) e não fecha com Esc.
  // O resto da janela fica inerte embaixo da folha (Tab não escapa); a interface só deixa de receber cliques.
  useEffect(() => {
    if (modo !== 'folha') return
    folha.current?.focus()
    const embaixo = [...(folha.current?.parentElement?.children ?? [])].filter((el) => el !== folha.current && !el.inert)
    for (const el of embaixo) el.inert = true
    return () => {
      for (const el of embaixo) el.inert = false
    }
  }, [modo])

  if (!modo) return null
  const acao = esperando
    ? html`<div class="lz-esperando" role="status">
        <${Spinner} size=${16} />
        <span>Termine no navegador.</span>
        <button type="button" class="lz-link" onClick=${() => (ultimoUrl ? openExternal(ultimoUrl) : continuar(setAbrindo))}>Abrir de novo</button>
      </div>`
    : null

  if (modo === 'faixa') {
    return html`<div class="lz-faixa" role="region" aria-label=${TITULO} data-ligar-zro="faixa">
      <${SimboloZro} size=${26} />
      <span class="lz-faixa-texto"><b>${TITULO}</b><span>Suas transferências continuam enquanto isso.</span></span>
      ${esperando
        ? acao
        : html`<button type="button" class="btn btn-primary btn-sm" disabled=${abrindo} onClick=${() => continuar(setAbrindo)}><span>Continuar</span></button>`}
    </div>`
  }

  return html`<div ref=${folha} tabindex="-1" class="lz-folha" role="dialog" aria-modal="true" aria-labelledby="lz-titulo" data-ligar-zro="folha">
    <div class="lz-arrastar" aria-hidden="true"></div>
    <div class="lz-conteudo">
      <${SimboloZro} size=${104} />
      <h1 id="lz-titulo" class="lz-titulo">${TITULO}</h1>
      ${esperando
        ? acao
        : html`<button type="button" class="btn btn-primary btn-lg lz-botao" disabled=${abrindo} onClick=${() => continuar(setAbrindo)}>
            <span>${BOTAO}</span>
          </button>`}
      <p class="lz-nota">${temDrive ? 'Seu Google Drive continua conectado.' : 'Nada muda nos seus arquivos.'}</p>
    </div>
  </div>`
}
