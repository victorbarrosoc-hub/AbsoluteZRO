// Um lugar só para o Preact, os hooks e o htm (bibliotecas em /vendor, por caminho relativo: a CSP não aceita import
// map). As telas importam daqui: `import { html, useState } from '../../preact.js'`.

import { h } from '../vendor/preact/preact.mjs'

export { h, render, Component, Fragment, createContext, cloneElement, toChildArray } from '../vendor/preact/preact.mjs'
export { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext, useReducer, useId } from '../vendor/preact/hooks.mjs'
export { html } from '../vendor/htm/preact.mjs'

const rasoIgual = (a, b) => {
  for (const k in a) if (k !== '__source' && !(k in b)) return false
  for (const k in b) if (k !== '__source' && a[k] !== b[k]) return false
  return true
}

/**
 * O componente só redesenha quando as props mudam (comparação rasa, ou `iguais(antes, depois)`). É o que deixa a
 * grade leve: um cartão não é refeito porque o vizinho mudou. Estado e assinaturas de dentro continuam valendo.
 */
export function memo(Componente, iguais) {
  function deveAtualizar(proximas) {
    return !(iguais ? iguais(this.props, proximas) : rasoIgual(this.props, proximas))
  }
  function Memo(props) {
    this.shouldComponentUpdate = deveAtualizar
    return h(Componente, props)
  }
  Memo.displayName = `Memo(${Componente.displayName || Componente.name || 'Componente'})`
  return Memo
}

/** Junta classes: cx('a', cond && 'b') → 'a b'. */
export const cx = (...partes) => partes.filter(Boolean).join(' ')

/** A pessoa pediu menos movimento? (o CSS já corta; isto é para View Transitions e Web Animations) */
export const reduzirMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
