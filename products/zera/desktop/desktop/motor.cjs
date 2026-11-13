// ZERA · conversa com o zera-motor (Rust) por linhas JSON: um processo só, vivo enquanto o app está aberto, com a
// árvore do disco na memória dele. Aqui só passa o que a tela mostra.
//
// Onde está o motor: no app instalado, em resources/motor/; para desenvolver, em ../motor/target/release/ (rode
// `npm run motor`). ZERA_MOTOR aponta para outro binário, só fora do app instalado.

'use strict'

const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const readline = require('node:readline')
const { EventEmitter } = require('node:events')

const NOME = process.platform === 'win32' ? 'zera-motor.exe' : 'zera-motor'

function acharMotor({ empacotado, resources }) {
  if (empacotado) return path.join(resources, 'motor', NOME)
  if (process.env.ZERA_MOTOR) return process.env.ZERA_MOTOR
  return path.join(__dirname, '..', '..', 'motor', 'target', 'release', NOME)
}

class Motor extends EventEmitter {
  constructor(binario) {
    super()
    this.binario = binario
    this.proc = null
    this.prox = 1
    this.pendentes = new Map()
  }

  existe() {
    return fs.existsSync(this.binario)
  }

  iniciar() {
    if (this.proc) return
    this.proc = spawn(this.binario, ['servir'], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
    const rl = readline.createInterface({ input: this.proc.stdout })
    rl.on('line', (linha) => {
      let m
      try {
        m = JSON.parse(linha)
      } catch {
        return
      }
      if (m.t) {
        this.emit('evento', m)
        return
      }
      const p = this.pendentes.get(m.id)
      if (!p) return
      this.pendentes.delete(m.id)
      p(m)
    })
    this.proc.on('exit', () => {
      this.proc = null
      for (const p of this.pendentes.values()) p({ ok: false, erro: 'motor_parou' })
      this.pendentes.clear()
      this.emit('parou')
    })
  }

  pedir(cmd, dados = {}) {
    this.iniciar()
    const id = this.prox++
    return new Promise((resolve) => {
      this.pendentes.set(id, resolve)
      this.proc.stdin.write(JSON.stringify({ ...dados, id, cmd }) + '\n')
    })
  }

  parar() {
    if (this.proc) this.proc.kill()
    this.proc = null
  }
}

module.exports = { Motor, acharMotor }
