import { after } from 'next/server';
import { CLOUD_PART_BYTES } from '../restoration';

// IA avançada (titular, 02/11/2026): a reserva do "Melhorar com IA" quando o nosso motor não dá conta. Um parceiro de
// nuvem isola a voz; a interface não diz quem é. Roda no servidor, nunca no navegador, e a chave não sai daqui.
const ENDERECO = 'https://api.elevenlabs.io/v1/audio-isolation';
/** Sem resultado neste prazo, o pedido é encerrado e os minutos voltam para a pessoa. */
export const IA_AVANCADA_PRAZO_MS = 8 * 60000;
/** Tempo máximo da chamada ao parceiro, dentro do limite da função (300 s). */
const CHAMADA_MS = 270000;

export function iaAvancadaConfigurada() {
  return (process.env.ELEVENLABS_API_KEY?.trim().length ?? 0) >= 20;
}

/** Nome com a extensão certa ajuda o parceiro a reconhecer o arquivo; o conteúdo vem do próprio áudio. */
export function nomeDoAudio(cabeca: Uint8Array) {
  const texto = (inicio: number, fim: number) => String.fromCharCode(...cabeca.slice(inicio, fim));
  if (texto(0, 4) === 'RIFF' && texto(8, 12) === 'WAVE') return 'audio.wav';
  if (texto(0, 4) === 'fLaC') return 'audio.flac';
  if (texto(0, 4) === 'OggS') return 'audio.ogg';
  if (texto(4, 8) === 'ftyp') return 'audio.m4a';
  if (cabeca[0] === 0x1a && cabeca[1] === 0x45 && cabeca[2] === 0xdf && cabeca[3] === 0xa3)
    return 'audio.webm';
  if (texto(0, 3) === 'ID3' || (cabeca[0] === 0xff && (cabeca[1] & 0xe0) === 0xe0))
    return 'audio.mp3';
  return 'audio';
}

export class IaAvancadaErro extends Error {}

/** Envia o áudio e devolve a voz limpa (um arquivo comprimido). Nunca repete sozinho. */
export async function isolarVoz(audio: Blob): Promise<Blob> {
  const chave = process.env.ELEVENLABS_API_KEY?.trim();
  if (!chave || !iaAvancadaConfigurada()) throw new IaAvancadaErro('não configurada');
  const form = new FormData();
  form.append('audio', audio, nomeDoAudio(new Uint8Array(await audio.slice(0, 12).arrayBuffer())));
  const resposta = await fetch(ENDERECO, {
    method: 'POST',
    cache: 'no-store',
    signal: AbortSignal.timeout(CHAMADA_MS),
    headers: { 'xi-api-key': chave },
    body: form,
  });
  // Só o código vai para o log: nada do corpo, que pode ecoar dados da conta.
  if (!resposta.ok) throw new IaAvancadaErro('recusado ' + resposta.status);
  const limpo = await resposta.blob();
  if (!limpo.size || limpo.size > CLOUD_PART_BYTES) throw new IaAvancadaErro('resultado inválido');
  return limpo;
}

/**
 * Trabalho depois da resposta (`after` da Next, que a Vercel mantém viva até o fim da função). Fora de um pedido
 * (testes), roda direto; os testes trocam `rodar` para esperar o fim.
 */
export const segundoPlano = {
  rodar(tarefa: () => Promise<void>) {
    try {
      after(tarefa);
    } catch {
      void tarefa();
    }
  },
};
