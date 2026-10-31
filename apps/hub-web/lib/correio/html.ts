/**
 * HTML de e-mail com segurança (ADR 0034). Três camadas:
 * 1. sanitize-html: sai script, iframe, objeto, formulário, evento (on*), javascript:, base, meta e link. Links abrem
 *    em outra aba sem referenciador. Imagem remota sai por padrão (contada, para o botão "Mostrar imagens"); a
 *    embutida (cid:) vira data: quando cabe.
 * 2. O documento ganha CSP própria: nada carrega de fora (default-src 'none'), só data: (e http/https quando a pessoa
 *    pede as imagens), nenhum script.
 * 3. A tela mostra num iframe com sandbox sem allow-scripts nem allow-same-origin (origem opaca).
 */
import sanitizeHtml from 'sanitize-html'

export type OpcoesHtml = {
  /** A pessoa pediu "Mostrar imagens": imagem http/https fica. */
  imagens?: boolean
  /** cid → data: das imagens embutidas na própria mensagem. */
  embutidas?: Map<string, string>
}

const REMOTA = /^\s*(https?:)?\/\//i
const URL_CSS = /url\(\s*(['"]?)(.*?)\1\s*\)/gi

/** Tira url() de CSS que buscaria algo fora (sem imagens) e qualquer @import. */
function limparCss(css: string, imagens: boolean): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(')
    .replace(URL_CSS, (todo, _q, url: string) => {
      const u = url.trim()
      if (/^data:image\//i.test(u)) return todo
      if (imagens && REMOTA.test(u)) return todo
      return 'none'
    })
}

const ATRIBUTOS_DE_LAYOUT = ['style', 'align', 'valign', 'width', 'height', 'bgcolor', 'color', 'border', 'dir', 'lang', 'title', 'class', 'id']

export function limparHtml(html: string, opts: OpcoesHtml = {}): { html: string; imagensBloqueadas: number } {
  const imagens = !!opts.imagens
  let bloqueadas = 0
  const limpo = sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags.filter((t) => t !== 'style'),
      'img',
      'center',
      'font',
      'span',
      'h1',
      'h2',
      'u',
      's',
      'strike',
      'big',
      'small',
      'style',
    ],
    // <style> fica (e-mail depende dele), mas sem @import e sem url() remota; o CSP do documento segura o resto.
    allowVulnerableTags: true,
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'title', 'select', 'button', 'head'],
    allowedAttributes: {
      '*': ATRIBUTOS_DE_LAYOUT,
      a: [...ATRIBUTOS_DE_LAYOUT, 'href', 'name', 'target', 'rel'],
      img: [...ATRIBUTOS_DE_LAYOUT, 'src', 'alt', 'data-zro-bloqueada'],
      font: [...ATRIBUTOS_DE_LAYOUT, 'face', 'size'],
      table: [...ATRIBUTOS_DE_LAYOUT, 'cellpadding', 'cellspacing', 'summary'],
      td: [...ATRIBUTOS_DE_LAYOUT, 'colspan', 'rowspan', 'nowrap'],
      th: [...ATRIBUTOS_DE_LAYOUT, 'colspan', 'rowspan', 'nowrap', 'scope'],
      ol: [...ATRIBUTOS_DE_LAYOUT, 'start', 'type'],
      col: [...ATRIBUTOS_DE_LAYOUT, 'span'],
      colgroup: [...ATRIBUTOS_DE_LAYOUT, 'span'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'cid'] },
    allowProtocolRelative: false,
    // Sem parse de style com postcss: o CSS do e-mail fica como veio, depois de limparCss.
    parseStyleAttributes: false,
    transformTags: {
      '*': (tagName, attribs) => {
        const a = { ...attribs }
        if (a.style) a.style = limparCss(a.style, imagens)
        return { tagName, attribs: a }
      },
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }),
      img: (tagName, attribs) => {
        const a: Record<string, string> = { ...attribs }
        const src = (a.src ?? '').trim()
        if (a.style) a.style = limparCss(a.style, imagens)
        if (/^cid:/i.test(src)) {
          const dado = opts.embutidas?.get(src.slice(4).replace(/^<|>$/g, '').toLowerCase())
          if (dado) a.src = dado
          else delete a.src
        } else if (/^data:/i.test(src)) {
          if (!/^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(src)) delete a.src
        } else if (REMOTA.test(src)) {
          if (!imagens) {
            bloqueadas++
            delete a.src
            a['data-zro-bloqueada'] = ''
          }
        } else delete a.src
        return { tagName, attribs: a }
      },
    },
  })
  // O texto de <style> não passa pelo filtro de texto do sanitize-html: limpa aqui, na saída já bem formada.
  const comCss = limpo.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_t, a: string, css: string, b: string) => a + limparCss(css, imagens) + b)
  return { html: comCss, imagensBloqueadas: bloqueadas }
}

/** Política do documento da mensagem (vale dentro do iframe, por cima da herdada da página). */
export function cspDaMensagem(imagens: boolean): string {
  return [
    "default-src 'none'",
    `img-src data:${imagens ? ' https: http:' : ''}`,
    "style-src 'unsafe-inline'",
    'font-src data:',
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

const BASE_CSS =
  'html{color-scheme:light}body{margin:0;padding:20px;font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;color:#1d1d1f;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}img[data-zro-bloqueada]{display:inline-block;min-width:24px;min-height:24px;background:#f5f5f7;border-radius:6px}table{max-width:100%}pre{white-space:pre-wrap}a{color:#0066cc}blockquote{margin:0 0 0 8px;padding-left:12px;border-left:2px solid #d2d2d7;color:#6e6e73}'

/** Documento completo para o `srcdoc` do iframe (sandbox na tela). */
export function documentoDaMensagem(htmlLimpo: string, imagens: boolean): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${cspDaMensagem(imagens)}">`,
    '<meta name="referrer" content="no-referrer">',
    '<base target="_blank">',
    `<style>${BASE_CSS}</style>`,
    '</head><body>',
    htmlLimpo,
    '</body></html>',
  ].join('')
}
