// Laboratório de qualidade (scripts/qualidade.mjs): converte no Chromium com o motor do navegador do Relay e devolve
// o arquivo, para medir contra o HandBrake. Não vai para o site.

import { converterArquivo, usarEscala } from '/app/motor.js'

window.labConverter = async (origem, preset, opcoes = {}) => {
  const resposta = await fetch(`/lab-arquivo/${origem}`)
  const arquivo = new File([await resposta.blob()], origem)
  usarEscala(opcoes.escala ?? 'auto')
  const inicio = performance.now()
  const r = await converterArquivo(arquivo, preset, { ...opcoes, memoria: true })
  const segundos = (performance.now() - inicio) / 1000
  const nome = `${origem.replace(/\.[^.]+$/, '')}-${preset.id ?? preset}-navegador${opcoes.sufixo ?? ''}.${r.extensao}`
  await fetch(`/lab-saida/${encodeURIComponent(nome)}`, { method: 'POST', body: r.blob })
  return { nome, segundos, escala: r.escala, bytes: r.blob.size, codec: r.codecVideo, audio: r.codecAudio, plano: r.plano, avisos: r.avisos }
}
window.labPronto = true
