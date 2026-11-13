// O Controle da casca (duplo clique zera, setas e Shift + setas, roda com Alt) com o número que se digita: tocar no
// valor abre um campo; Enter grava, Esc desiste. `deTexto` lê o que foi digitado (padrão: número com vírgula ou
// ponto, aceitando o sinal de menos tipográfico) e devolve o valor do controle.

import { html, useLayoutEffect, useRef, useState } from '../../preact.js'
import { Controle, formatarValor } from '../../componentes/base.js'

const lerNumero = (t) => {
  if (!/\d/.test(String(t))) return null
  const n = Number(
    String(t)
      .replace(/[−–]/g, '-')
      .replace(',', '.')
      .replace(/[^\d.+-]/g, ''),
  )
  return Number.isFinite(n) ? n : null
}

export function Ajuste({ caminho, rotulo, valor, min, max, passo = 1, neutro = 0, aoMudar, formato, deTexto, desligado, dica, classe, unidade }) {
  const [editando, definir] = useState(false)
  const campo = useRef(null)
  // o valor mais novo, sem esperar o desenho: tecla repetida (setas seguradas) soma passo a passo
  const ultimo = useRef(valor)
  ultimo.current = valor
  const casas = (String(passo).split('.')[1] || '').length
  const setas = (e) => {
    const direcao = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key]
    if (!direcao || desligado || e.target.type !== 'range') return
    e.preventDefault()
    e.stopPropagation()
    const novo = Number((Math.round(Math.max(min, Math.min(max, ultimo.current + direcao * passo * (e.shiftKey ? 10 : 1))) / passo) * passo).toFixed(casas + 2))
    ultimo.current = novo
    aoMudar?.(novo, { final: true })
  }
  const texto = formato ? formato(valor) : `${formatarValor(valor, { passo, sinal: min < 0 })}${unidade ? ` ${unidade}` : ''}`
  useLayoutEffect(() => {
    if (!editando) return
    campo.current?.focus()
    campo.current?.select()
  }, [editando])
  const gravar = () => {
    // Enter grava e tira o campo; o blur que vem junto não grava de novo
    if (!campo.current || campo.current.dataset.feito) return
    campo.current.dataset.feito = '1'
    const bruto = campo.current.value
    definir(false)
    const v = deTexto ? deTexto(bruto) : lerNumero(bruto)
    if (v == null) return
    aoMudar?.(Math.max(min, Math.min(max, v)), { final: true })
  }
  return html`<div class="rv-ajuste" data-caminho=${caminho} data-editando=${editando ? '' : undefined} onKeyDownCapture=${setas}>
    <${Controle}
      rotulo=${rotulo}
      valor=${valor}
      min=${min}
      max=${max}
      passo=${passo}
      neutro=${neutro}
      aoMudar=${aoMudar}
      formato=${() => texto}
      desligado=${desligado}
      dica=${dica}
      classe=${classe}
    />
    ${
      editando
        ? html`<input
            ref=${campo}
            class="rv-ajuste-numero"
            type="text"
            inputmode="decimal"
            value=${texto}
            aria-label=${`${rotulo}: digite o valor`}
            onKeyDown=${(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') gravar()
              else if (e.key === 'Escape') definir(false)
            }}
            onBlur=${gravar}
          />`
        : desligado
          ? null
          : html`<button type="button" class="rv-ajuste-editar toque" aria-label=${`Digitar ${rotulo}`} tabindex="-1" onClick=${() => definir(true)}></button>`
    }
  </div>`
}
