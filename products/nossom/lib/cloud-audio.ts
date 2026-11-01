import { inspect, decode, measure } from './audio';
import {
  isCloudPreset,
  isVoiceToolPreset,
  restorationD,
  singingSeparation,
  stemSeparation,
  transcription,
  validStemsReport,
  validTranscriptReport,
  vocalSeparation,
  voiceIsolator,
  type CloudPreset,
  validCloudReport,
  validJobReport,
} from './restoration';
import { parseTranscript } from './transcript';
import type { AudioUsage } from './usage';

const engines: Record<CloudPreset, string> = {
  [restorationD.id]: 'Resemble Enhance · Quasar Restore D',
  [vocalSeparation.id]: 'Demucs · HTDemucs vocals',
  [voiceIsolator.id]: 'Mel-Band RoFormer + MossFormer2 SE 48K',
  [singingSeparation.id]: 'Mel-Band RoFormer · vocals',
  [transcription.id]: 'Whisper large-v3-turbo',
  [stemSeparation.id]: 'Mel-Band RoFormer + HTDemucs 6s',
};
const runningLabels: Record<CloudPreset, string> = {
  [restorationD.id]: 'Melhorando sua voz…',
  [vocalSeparation.id]: 'Separando a voz dos instrumentos…',
  [voiceIsolator.id]: 'Isolando sua voz…',
  [singingSeparation.id]: 'Separando a voz dos instrumentos…',
  [transcription.id]: 'Escrevendo o que foi dito…',
  [stemSeparation.id]: 'Separando voz, bateria, baixo e guitarra…',
};

export class CloudCancelled extends Error {
  constructor(message = 'Cancelamento solicitado. O original foi preservado.') {
    super(message);
  }
}
async function api(body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch('/api/audio/jobs', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível acessar a restauração.');
  return data;
}
export async function restoreCloud(
  /** Resolved only when bytes must be sent, so resuming a queued job encodes nothing. */
  getSource: () => Promise<Blob>,
  duration: number,
  options: {
    resumeId?: string;
    preset?: CloudPreset;
    signal: AbortSignal;
    onStatus: (message: string) => void;
    onProgress: (value: number) => void;
    onUsage: (usage: AudioUsage) => void;
    onJob: (id: string | null) => void;
  },
) {
  let id: string | undefined;
  let preset = options.preset ?? restorationD.id;
  let source: Blob | undefined;
  try {
    let prepared;
    if (options.resumeId) {
      id = options.resumeId;
      options.onJob(id);
      const response = await fetch(`/api/audio/jobs?id=${id}`, {
        signal: options.signal,
        cache: 'no-store',
      });
      const existing = await response.json();
      if (!response.ok) throw new Error(existing.error || 'Não foi possível retomar o tratamento.');
      if (isCloudPreset(existing.preset)) preset = existing.preset;
      if (existing.status === 'uploading') {
        source = await getSource();
        prepared = await api({ action: 'resume-upload', id }, options.signal);
      }
    } else {
      options.onStatus('Preparando o envio privado para restauração…');
      source = await getSource();
      prepared = await api({ action: 'prepare', bytes: source.size, duration }, options.signal);
      id = prepared.id;
      options.onJob(id!);
    }
    if (prepared) {
      for (let i = 0; i < prepared.uploadUrls.length; i++) {
        options.onStatus(`Enviando áudio com segurança · ${i + 1}/${prepared.uploadUrls.length}…`);
        const response = await fetch(prepared.uploadUrls[i], {
          method: 'PUT',
          signal: options.signal,
          headers: { 'Content-Type': 'application/octet-stream' },
          body: source!.slice(i * prepared.partBytes, (i + 1) * prepared.partBytes),
        });
        if (!response.ok)
          throw new Error('Não foi possível enviar o áudio. Seu original foi preservado.');
        options.onProgress(Math.round((100 * (i + 1)) / prepared.uploadUrls.length));
      }
      options.onStatus('Confirmando o envio do áudio…');
      options.onProgress(-1);
      const submitted = await api({ action: 'submit', id, preset }, options.signal);
      if (submitted.usage) options.onUsage(submitted.usage);
    }
    let status: Record<string, unknown> | undefined;
    const waitingSince = Date.now();
    const deadline = waitingSince + 35 * 60000;
    while (Date.now() < deadline) {
      if (options.signal.aborted) throw new CloudCancelled();
      const response = await fetch(`/api/audio/jobs?id=${id}`, {
        signal: options.signal,
        cache: 'no-store',
      });
      status = await response.json();
      if (!response.ok)
        throw new Error(String(status?.error || 'Não foi possível consultar o tratamento.'));
      if (status?.status === 'completed') break;
      if (['failed', 'cancelled', 'released'].includes(String(status?.status)))
        throw new Error(
          'A restauração não foi concluída. Seu original foi preservado; confira seu saldo atualizado.',
        );
      const seconds = Math.floor((Date.now() - waitingSince) / 1000);
      const waiting = seconds >= 60 ? ` há ${Math.floor(seconds / 60)}min ${seconds % 60}s` : '';
      options.onStatus(
        status?.status === 'running'
          ? runningLabels[preset]
          : status?.status === 'submitting'
            ? 'Aguardando confirmação do pedido. O processamento ainda não foi confirmado.'
            : `Seu áudio está na fila${waiting}. O tratamento ainda não começou.`,
      );
      // The provider supplies stages, not an inference percentage.
      options.onProgress(-1);
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer);
          reject(new CloudCancelled());
        };
        const timer = setTimeout(() => {
          options.signal.removeEventListener('abort', cancel);
          resolve();
        }, 2500);
        options.signal.addEventListener('abort', cancel, { once: true });
      });
    }
    if (
      !status ||
      status.status !== 'completed' ||
      !validJobReport(status.report) ||
      status.report.preset !== preset ||
      !Array.isArray(status.downloadUrls)
    )
      throw new Error(
        'A restauração ainda não foi concluída. Consulte o tratamento antes de iniciar outro.',
      );
    options.onStatus(
      preset === transcription.id
        ? 'Recebendo o texto…'
        : preset === stemSeparation.id
          ? 'Recebendo as faixas…'
          : 'Recebendo o áudio tratado…',
    );
    const parts: Blob[] = [];
    let receivedBytes = 0;
    for (const [index, url] of (status.downloadUrls as string[]).entries()) {
      const response = await fetch(url, { signal: options.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível baixar o resultado.');
      const part = await response.blob();
      if (part.size !== status.report.chunks[index]?.bytes)
        throw new Error('O resultado foi recebido incompleto.');
      parts.push(part);
      receivedBytes += part.size;
      options.onProgress(Math.round((100 * receivedBytes) / status.report.totalBytes));
    }
    if (validTranscriptReport(status.report)) {
      let transcript;
      try {
        transcript = parseTranscript(JSON.parse(await new Blob(parts).text()), duration);
      } catch {
        transcript = null;
      }
      if (!transcript || transcript.words.length !== status.report.words)
        throw new Error('O texto recebido não corresponde a este áudio.');
      options.onProgress(100);
      return { kind: 'transcript' as const, id: id!, transcript };
    }
    if (validStemsReport(status.report)) {
      options.onStatus('Conferindo cada faixa…');
      options.onProgress(-1);
      const pack = new Blob(parts);
      const files: Blob[] = [];
      let offset = 0;
      for (const stem of status.report.stems) {
        const file = new Blob([pack.slice(offset, offset + stem.bytes)], { type: 'audio/flac' });
        offset += stem.bytes;
        const head = new TextDecoder().decode(await file.slice(0, 4).arrayBuffer());
        // Decoded one at a time: the browser keeps only one stem in memory while checking.
        const buffer = head === 'fLaC' ? await decode(file).catch(() => null) : null;
        if (!buffer || Math.abs(buffer.duration - duration) > 0.1 || buffer.numberOfChannels !== 2)
          throw new Error('Uma das faixas chegou incompleta. Seu original foi preservado.');
        files.push(file);
      }
      options.onProgress(100);
      return { kind: 'stems' as const, id: id!, files, gainDb: status.report.gainDb };
    }
    if (!validCloudReport(status.report)) throw new Error('O resultado não é um áudio válido.');
    const blob = new Blob(parts, { type: 'audio/wav' });
    options.onStatus('Verificando o resultado e preparando seus ajustes…');
    options.onProgress(-1);
    const buffer = await decode(blob);
    if (
      Math.abs(buffer.duration - duration) > 0.1 ||
      buffer.numberOfChannels !== status.report.channels
    )
      throw new Error('A duração do resultado não corresponde ao original.');
    const info = inspect(buffer),
      metrics = await measure(blob, options.onStatus);
    options.onProgress(100);
    // Release only after the caller has saved the returned version locally.
    return {
      kind: 'audio' as const,
      id: id!,
      blob,
      info,
      metrics,
      processing: {
        engine: engines[status.report.preset],
        strength: 100,
        noiseFloor: info.noiseFloor ?? -60,
        mode: 'cloud',
        automatic: status.report.preset === restorationD.id,
        ...(isVoiceToolPreset(status.report.preset)
          ? { vocalSeparation: status.report }
          : { cloudRestoration: { ...restorationD, ...status.report } }),
      },
    };
  } catch (error) {
    if (options.signal.aborted) {
      if (!id) throw new CloudCancelled('Envio interrompido. Seu original foi preservado.');
      options.onStatus('Confirmando o cancelamento…');
      options.onProgress(-1);
      let cancelled;
      try {
        cancelled = await api({ action: 'cancel', id });
      } catch {
        throw new Error(
          'Não foi possível confirmar o cancelamento. Use Verificar andamento antes de iniciar outro pedido.',
        );
      }
      throw new CloudCancelled(
        ['cancelled', 'failed', 'released'].includes(cancelled.status)
          ? 'Pedido encerrado. O original foi preservado; você pode iniciar outra restauração.'
          : cancelled.status === 'completed'
            ? 'O resultado já está pronto. Retome o pedido para salvar o áudio tratado.'
            : 'Cancelamento solicitado. Verifique o andamento para confirmar o encerramento.',
      );
    }
    throw error;
  }
}
export async function releaseCloudJob(id: string) {
  return api({ action: 'release', id });
}
export async function cancelCloudJob(id: string) {
  return api({ action: 'cancel', id });
}
