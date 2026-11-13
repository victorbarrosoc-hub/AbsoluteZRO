// O cartão de um estilo: a foto da pessoa já revelada com ele (prévia do worker), o nome, a estrela e o menu.
// Passar o mouse ou focar mostra no palco (sem aplicar); clique e Enter aplicam. A imagem pede prioridade quando entra
// na tela (IntersectionObserver).

import { cx, html, memo, useEffect, useRef, useState } from '../../preact.js'
import { Icone } from '../../icones.js'
import { Menu } from '../../componentes/base.js'

/**
 * A prévia de um pedido ({ fonte, p, daFoto, intensidade, lado, local }): { url, pronta }. Enquanto a nova não chega,
 * fica a anterior (sem piscar ao trocar de foto); `pronta` diz se a que está é a do pedido atual.
 */
export function usarPrevia(previas, pedido, { prioridade = 0, elemento = null } = {}) {
  const chave = pedido ? previas.chaveDe(pedido) : null
  const [estado, definir] = useState(() => ({ chave, url: chave ? previas.pronta(chave) : null }))
  const atual = useRef(chave)
  atual.current = chave
  useEffect(() => {
    if (!chave) return
    const ja = previas.pronta(chave)
    if (ja) {
      definir({ chave, url: ja })
      return
    }
    let vivo = true
    previas
      .pedir(pedido, { prioridade })
      .then((url) => vivo && url && atual.current === chave && definir({ chave, url }))
      .catch((e) => vivo && e?.name !== 'AbortError' && atual.current === chave && definir({ chave, url: null, erro: true }))
    return () => {
      vivo = false
    }
  }, [chave])
  // na tela: passa na frente da fila
  useEffect(() => {
    const el = elemento?.current
    if (!el || !chave || typeof IntersectionObserver !== 'function') return
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) previas.priorizar(chave, 50)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [chave])
  const pronta = estado.chave === chave && !!estado.url
  return { url: estado.url, pronta, chave, erro: estado.chave === chave && !!estado.erro }
}

function CartaoBase({ i = 0, p, previas, fonte, daFoto, naFoto, favorito, itensDoMenu, aoVer, aoAplicar, aoFavoritar, marca }) {
  const ref = useRef(null)
  const { url, pronta, erro } = usarPrevia(previas, fonte ? { fonte, p, daFoto, lado: 320 } : null, { elemento: ref })
  return html`<li class=${cx('estilo', naFoto && 'estilo--na-foto')} ref=${ref} style=${`--i:${i}`}>
    <button
      type="button"
      class="estilo-cartao"
      data-estilo=${p.id}
      aria-label=${`${p.nome}${naFoto ? ', na foto' : ''}`}
      onPointerEnter=${(e) => e.pointerType === 'mouse' && aoVer(p.id, 'mouse')}
      onPointerLeave=${(e) => e.pointerType === 'mouse' && aoVer(null, 'mouse')}
      onFocus=${() => aoVer(p.id, 'teclado')}
      onBlur=${() => aoVer(null, 'teclado')}
      onClick=${(e) => aoAplicar(p, e.currentTarget.querySelector('.estilo-imagem'))}
    >
      <span class="estilo-imagem">
        ${
          url
            ? html`<img src=${url} alt="" draggable="false" data-pronta=${pronta ? '1' : '0'} />`
            : erro
              ? html`<span class="estilo-falhou" title="Não deu para revelar"><${Icone} nome="aviso" /></span>`
              : html`<span class="esqueleto" aria-hidden="true"></span>`
        }
        ${naFoto ? html`<span class="estilo-selo" aria-hidden="true"><${Icone} nome="ok" /></span>` : null}
        ${marca ? html`<span class="estilo-origem" aria-hidden="true">${marca}</span>` : null}
      </span>
      <span class="estilo-nome">${p.nome}</span>
    </button>
    <button
      type="button"
      class=${cx('estilo-estrela', 'toque', favorito && 'estilo-estrela--sim')}
      aria-label=${favorito ? `Tirar ${p.nome} dos favoritos` : `Favoritar ${p.nome}`}
      aria-pressed=${favorito ? 'true' : 'false'}
      tabindex="-1"
      onClick=${() => aoFavoritar(p.id)}
    >
      <${Icone} nome="estrela" cheio=${favorito} />
    </button>
    <${Menu}
      classe="estilo-menu"
      classeBotao="liso estilo-mais"
      rotulo=${`Mais de ${p.nome}`}
      gatilho=${html`<${Icone} nome="tres" />`}
      lado="direita"
      itens=${itensDoMenu ? itensDoMenu(p) : []}
    />
  </li>`
}

export const Cartao = memo(CartaoBase)
