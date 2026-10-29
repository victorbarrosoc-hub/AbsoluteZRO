/**
 * Dissolvência do esqueleto para o conteúdo (components/esqueleto.tsx), em script na página desde o primeiro byte:
 * vale para a carga inteira (o HTML em streaming troca o esqueleto antes de o React hidratar) e para a troca de tela
 * no navegador.
 *
 * A animação de entrada do esqueleto (z-esq-aparece, app/globals.css) começa no primeiro quadro em que ele é pintado;
 * a partir daí o pai dele é observado. Quando o esqueleto sai e o conteúdo entra no mesmo lugar:
 * - se ele já estava à vista (mais de 320 ms), uma cópia dele fica por cima, no mesmo lugar, e some enquanto o
 *   conteúdo aparece: dissolvência, sem salto (a cópia vai para o fim do body, fora da árvore do React);
 * - se não chegou a aparecer, o conteúdo só entra suave (e nem isso dentro da troca de tela, que já anima a tela nova);
 * - com "reduzir movimento", nada: a troca é seca.
 * Só a Web Animations API toca no conteúdo: nenhum atributo muda, então a hidratação não estranha nada.
 */
export const SCRIPT_ESQUELETO = `(() => {
  const ATRASO = 320, SUBIDA = 220, vistos = new WeakSet()
  const curva = 'cubic-bezier(0.2, 0, 0, 1)'
  document.addEventListener('animationstart', (e) => {
    const s = e.target
    if (!/^z-esq-aparece/.test(e.animationName) || !(s instanceof HTMLElement) || !s.hasAttribute('data-esqueleto') || vistos.has(s)) return
    vistos.add(s)
    const pai = s.parentNode
    if (!pai) return
    // o relógio da própria animação (o evento pode chegar atrasado, sobretudo no WebKit)
    const anim = s.getAnimations().find((a) => a.animationName === e.animationName)
    const agora = () => Number(document.timeline.currentTime ?? performance.now())
    const t0 = anim && anim.startTime != null ? Number(anim.startTime) : agora()
    let caixa = null
    const medir = () => { if (s.isConnected) caixa = s.getBoundingClientRect() }
    medir()
    const remedir = setTimeout(medir, ATRASO)
    // o conteúdo pode entrar um instante antes de o esqueleto sair: junta o que entrou no pai até a saída dele
    const novos = []
    const mo = new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && !novos.includes(n)) novos.push(n)
      if (s.isConnected) return
      mo.disconnect()
      clearTimeout(remedir)
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const fica = novos.filter((n) => n.parentNode === pai)
      if (!fica.length) return
      const op = Math.min(1, Math.max(0, (agora() - t0 - ATRASO) / SUBIDA))
      if (op < 0.02) {
        if (document.documentElement.dataset.zSentido) return
        for (const n of fica) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: curva })
        return
      }
      if (caixa && caixa.width && caixa.height) {
        const c = s.cloneNode(true)
        c.removeAttribute('data-esqueleto')
        c.removeAttribute('aria-busy')
        c.setAttribute('aria-hidden', 'true')
        c.querySelector('[role=status]')?.remove()
        const topo = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0
        Object.assign(c.style, {
          position: 'fixed', left: caixa.left + 'px', top: caixa.top + 'px', width: caixa.width + 'px', height: caixa.height + 'px',
          margin: '0', boxSizing: 'border-box', pointerEvents: 'none', zIndex: '1', opacity: '0',
          clipPath: 'inset(' + Math.max(0, topo - caixa.top) + 'px 0 0 0)',
        })
        document.body.appendChild(c)
        const fim = () => c.remove()
        c.animate([{ opacity: op }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }).finished.then(fim, fim)
      }
      for (const n of fica) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: curva })
    })
    mo.observe(pai, { childList: true })
  }, true)
})()`
