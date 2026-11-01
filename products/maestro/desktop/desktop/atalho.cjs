// O atalho global do cronômetro (padrão ⌥⇧T / Alt+Shift+T): pausa e retoma com o Maestro em segundo plano. Só os da
// lista fechada de tempo.cjs (nunca o ⌥T do site, que abre o painel dentro da janela). Trocar libera o anterior;
// ocupado por outro app, volta ao que estava e diz. Sair do app libera tudo (main.cjs, before-quit). O globalShortcut
// vem de fora: o teste usa um falso.

const { ATALHOS } = require('./tempo.cjs')

class Atalho {
  /** @param {{ globalShortcut: { register: Function, unregister: Function, isRegistered?: Function }, aoTocar: () => void }} o */
  constructor(o) {
    this.g = o.globalShortcut
    this.aoTocar = o.aoTocar
    this.atual = null
    this.ocupado = false
  }

  registrar(id) {
    try {
      return !!this.g.register(id, () => this.aoTocar())
    } catch {
      return false
    }
  }

  liberar() {
    if (this.atual) {
      try {
        this.g.unregister(this.atual)
      } catch {
        // o sistema já tinha liberado: nada a fazer
      }
    }
    this.atual = null
  }

  /** Liga `id` (null = sem atalho). Devolve { ok, atual, ocupado }. */
  aplicar(id) {
    if (id !== null && !ATALHOS.some((a) => a.id === id)) return { ok: false, atual: this.atual, ocupado: false }
    if (id === this.atual) return { ok: true, atual: this.atual, ocupado: this.ocupado }
    const anterior = this.atual
    this.liberar()
    this.ocupado = false
    if (id === null) return { ok: true, atual: null, ocupado: false }
    if (this.registrar(id)) {
      this.atual = id
      return { ok: true, atual: id, ocupado: false }
    }
    // outro app já usa: o pedido fica marcado como ocupado e o anterior volta
    this.ocupado = true
    if (anterior && this.registrar(anterior)) this.atual = anterior
    return { ok: false, atual: this.atual, ocupado: true }
  }
}

module.exports = { Atalho }
