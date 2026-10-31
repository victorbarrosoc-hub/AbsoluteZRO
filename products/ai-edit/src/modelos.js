// Modelos de transcrição (Whisper, OpenAI, licença MIT; versões ONNX da comunidade Hugging Face com o tempo de cada
// palavra). Rodam na máquina da pessoa: nada de áudio sai do computador e não gasta crédito.

export const MODELOS = {
  rapido: { id: 'onnx-community/whisper-base_timestamped', nome: 'Rápido', mb: 80, dica: 'Bom para conferir o corte. Erra mais nomes e pontuação.' },
  preciso: { id: 'onnx-community/whisper-small_timestamped', nome: 'Preciso', mb: 250, dica: 'Pontuação e acentos melhores. Leva o dobro do tempo.' },
}

/** Precisão de cada parte do modelo: na placa de vídeo (WebGPU) e no processador (WASM). */
export function dtypes(dispositivo) {
  return dispositivo === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : { encoder_model: 'q8', decoder_model_merged: 'q8' }
}

export const IDIOMAS = { pt: 'portuguese', en: 'english', es: 'spanish' }

/**
 * Motor de fluxo óptico da câmera lenta (app/fluxo-worker.js): RIFE 4.25 da Practical-RIFE (hzwer, licença MIT, código e
 * pesos), exportado em ONNX "em campos" (fluxo + máscara) pelo Goblin; versão fixa no commit e conferida pelo SHA-256.
 * Escolhido medindo (docs/validation.md): em takes reais de 60 qps com 3 de 4 quadros tirados, ganha da mistura e
 * do quadro repetido.
 */
export const MODELO_FLUXO = Object.freeze({
  caminho: 'glowskeleton/goblin-models/resolve/4e9379825f6ea5423a0c70d6821a05d3d1b06cc5/rife/interp_model.onnx',
  sha256: '7b153d12a4b005198c73a75046218eb35b867dadba18d5a140f467889ebc34a9',
  bytes: 22752508,
  mb: 23,
})
