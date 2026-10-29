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
