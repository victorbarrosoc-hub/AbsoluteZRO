// Revela Lab · monta o pacote profissional fora da tela (src/cor/pacote.js): o zip volta transferido, sem cópia.
import { montarPacote } from '../src/cor/pacote.js'

onmessage = ({ data }) => {
  try {
    const p = montarPacote(data.receita)
    postMessage({ ok: true, zip: p.zip, pasta: p.pasta, qc: p.qc }, [p.zip.buffer])
  } catch (erro) {
    postMessage({ ok: false, erro: String(erro?.message ?? erro) })
  }
}
