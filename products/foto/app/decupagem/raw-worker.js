// Worker da segunda passada da decupagem, "pelo RAW": lê o dado do sensor (LibRaw em WebAssembly, vendorizado) e mede
// a Latitude do arquivo (src/raw/latitude.js). Serve para a foto em que a prévia embutida mostrou estouro: a nota só
// reprova se o dado do sensor está perdido (três canais cortados); um ou dois canais o motor reconstrói.
// Pesado (o RAW inteiro na memória do WASM): um worker só, uma foto por vez.
//
// Tarefa (protocolo de app/trabalho/servir.js):
//   latitude { arquivo: File, nome? } → { latitude (enxuta: app/decupagem/compacto.js), tempos: { ler, medir } }
//   Arquivo que o leitor não abre rejeita com a mensagem do ErroRaw, e `codigo` no começo ('sem-suporte: …').

import { LibRaw } from '../../vendor/libraw/index.js'
import { servir } from '../trabalho/servir.js'
import { criarLeitor } from '../../src/raw/libraw.js'
import { medirLatitude } from '../../src/raw/latitude.js'
import { resumirLatitude } from './compacto.js'

const agora = () => performance.now()
const ms = (v) => Math.round(v * 10) / 10

let leitor = null
async function prontoParaLer() {
  if (!leitor) {
    await LibRaw.initialize()
    leitor = criarLeitor(LibRaw)
  }
  return leitor
}

servir({
  async latitude({ arquivo, nome }, { cancelado }) {
    const l = await prontoParaLer()
    if (cancelado()) return null
    let t = agora()
    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    let negativo
    try {
      negativo = await l.ler(bytes, { nome: nome ?? arquivo.name })
    } catch (e) {
      throw new Error(`${e?.codigo ?? 'corrompido'}: ${e?.message ?? e}`)
    }
    const ler = ms(agora() - t)
    if (cancelado()) return null
    t = agora()
    const latitude = resumirLatitude(medirLatitude(negativo))
    return { latitude, tempos: { ler, medir: ms(agora() - t) } }
  },
})
