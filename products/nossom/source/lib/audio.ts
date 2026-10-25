import type { FFmpeg } from '@ffmpeg/ffmpeg';
import {
  treatmentFilter,
  strengthValue,
  deliveryPresets,
  type Operation,
  type Intensity,
  type DenoiseMode,
  type FilterSettings,
} from './presets';
import { estimateNoiseFloor } from './noise-profile';
import { denoiseVoice, cancelNeural, type RestorationAnalysis } from './neural';
import { freshBroadcast } from './broadcast';
import { renderEffect } from './effects';
import { clippingRepairFilter, denseClipping } from './declip';
export const MAX_BYTES = 100 * 1024 * 1024;
export const MAX_DURATION = 600;
export type Measurements = { lufs: number | null; truePeak: number | null; lra: number | null };
export type AudioInfo = {
  duration: number;
  channels: number;
  sampleRate: number;
  peak: number;
  clipped: number;
  wave: number[];
  noiseFloor?: number;
};
let engine: FFmpeg | null = null;
let loading: Promise<FFmpeg> | null = null;
let inUse = false;
let cancellationEpoch = 0;
const cancelledMessage =
  'Processamento cancelado. O original e as versões salvas foram preservados.';
function checkCancellation(epoch: number) {
  if (epoch !== cancellationEpoch) throw new Error(cancelledMessage);
}
export async function getEngine(onStatus?: (status: string) => void) {
  if (engine?.loaded) return engine;
  if (loading) return loading;
  const epoch = cancellationEpoch;
  loading = (async () => {
    onStatus?.('Preparando o motor de áudio…');
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    checkCancellation(epoch);
    const next = new FFmpeg();
    engine = next;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        next.load({
          classWorkerURL: new URL('/ffmpeg/worker/worker.js', location.origin).href,
          coreURL: new URL('/ffmpeg/ffmpeg-core.js', location.origin).href,
          wasmURL: new URL('/ffmpeg/ffmpeg-core.wasm', location.origin).href,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            next.terminate();
            reject(
              new Error(
                'O motor de áudio demorou para carregar. Verifique sua conexão e tente novamente.',
              ),
            );
          }, 60000);
        }),
      ]);
      return next;
    } catch (error) {
      next.terminate();
      if (engine === next) engine = null;
      throw error instanceof Error
        ? error
        : new Error('Não foi possível iniciar o motor de áudio. Tente recarregar a página.');
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}
export function cancelProcessing() {
  cancellationEpoch++;
  cancelNeural();
  engine?.terminate();
  engine = null;
  loading = null;
}
async function exclusive<T>(task: () => Promise<T>): Promise<T> {
  if (inUse) throw new Error('Aguarde o processamento atual terminar.');
  inUse = true;
  const epoch = cancellationEpoch;
  try {
    const result = await task();
    checkCancellation(epoch);
    return result;
  } catch (error) {
    checkCancellation(epoch);
    throw error;
  } finally {
    inUse = false;
  }
}
async function execChecked(ff: FFmpeg, args: string[]) {
  const code = await ff.exec(args, 180000);
  if (code !== 0)
    throw new Error(
      code === 1
        ? 'Não foi possível processar este áudio. Verifique o arquivo e tente novamente.'
        : 'O processamento excedeu o limite. Tente um trecho menor.',
    );
}
export async function decode(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext({ sampleRate: 48000 });
  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await context.close();
  }
}
export function inspect(buffer: AudioBuffer): AudioInfo {
  const wave: number[] = [];
  let peak = 0,
    clipped = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      peak = Math.max(peak, a);
      if (a >= 0.99997) clipped++;
    }
  }
  const data = buffer.getChannelData(0),
    step = Math.max(1, Math.floor(data.length / 240));
  for (let i = 0; i < 240; i++) {
    let p = 0;
    for (let j = i * step; j < Math.min((i + 1) * step, data.length); j++)
      p = Math.max(p, Math.abs(data[j]));
    wave.push(p);
  }
  return {
    duration: buffer.duration,
    channels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
    peak: peak ? 20 * Math.log10(peak) : -Infinity,
    clipped,
    wave,
    noiseFloor: estimateNoiseFloor(data, buffer.sampleRate).floorDb,
  };
}
export function encodeWav(buffer: AudioBuffer, floating = false): Blob {
  const channels = buffer.numberOfChannels,
    frames = buffer.length,
    width = floating ? 4 : 2;
  const bytes = new ArrayBuffer(44 + frames * channels * width),
    view = new DataView(bytes);
  const str = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, 36 + frames * channels * width, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, floating ? 3 : 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * width, true);
  view.setUint16(32, channels * width, true);
  view.setUint16(34, width * 8, true);
  str(36, 'data');
  view.setUint32(40, frames * channels * width, true);
  const arrays = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) {
      if (floating) view.setFloat32(44 + (i * channels + c) * width, arrays[c][i], true);
      else {
        const s = Math.max(-1, Math.min(1, arrays[c][i]));
        view.setInt16(44 + (i * channels + c) * width, s < 0 ? s * 32768 : s * 32767, true);
      }
    }
  return new Blob([bytes], { type: 'audio/wav' });
}
export function parseMeasurements(logs: string[]): Measurements {
  const matches = logs.join('\n').match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!matches?.length) throw new Error('O motor não retornou medições de loudness.');
  const v = JSON.parse(matches[matches.length - 1]);
  const number = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : null);
  return { lufs: number(v.input_i), truePeak: number(v.input_tp), lra: number(v.input_lra) };
}
async function measureFile(ff: FFmpeg, path: string): Promise<Measurements> {
  const logs: string[] = [];
  const listener = ({ message }: { message: string }) => logs.push(message);
  ff.on('log', listener);
  try {
    await execChecked(ff, [
      '-i',
      path,
      '-af',
      'loudnorm=I=-16:TP=-1:LRA=11:print_format=json',
      '-f',
      'null',
      '-',
    ]);
    return parseMeasurements(logs);
  } finally {
    ff.off('log', listener);
  }
}
async function deliveryFilter(
  ff: FFmpeg,
  options: ProcessOptions,
  sourcePath = 'source.wav',
): Promise<string> {
  const logs: string[] = [];
  const listener = ({ message }: { message: string }) => logs.push(message);
  ff.on('log', listener);
  const base = treatmentFilter(
    'master',
    options.intensity,
    options.target,
    options.peak,
    options.settings,
  );
  const range = options.region
    ? `atrim=start=${options.region.start}:end=${options.region.end},asetpts=PTS-STARTPTS,`
    : '';
  try {
    options.onStatus?.('Analisando o volume para normalização em duas passagens…');
    await execChecked(ff, ['-i', sourcePath, '-af', range + base, '-f', 'null', '-']);
  } finally {
    ff.off('log', listener);
  }
  const matches = logs.join('\n').match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!matches?.length) throw new Error('Não foi possível analisar a entrega.');
  const data = JSON.parse(matches[matches.length - 1]);
  if (
    !['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'].every((k) =>
      Number.isFinite(Number(data[k])),
    )
  )
    return 'anull';
  return `${base}:measured_I=${data.input_i}:measured_TP=${data.input_tp}:measured_LRA=${data.input_lra}:measured_thresh=${data.input_thresh}:offset=${data.target_offset}:linear=true`;
}
/** Reconstruct identifiable clipped peaks before denoising. This is not generative resynthesis. */
async function repairClippedPeaks(ff: FFmpeg, source: AudioBuffer, epoch: number) {
  const dense = denseClipping(
    Array.from({ length: source.numberOfChannels }, (_, c) => source.getChannelData(c)),
  );
  if (dense.tooDense)
    return {
      buffer: source,
      report: {
        method: 'autoregressive' as const,
        detected: dense.flatSamples,
        headroomGainDb: 0,
        status: 'limited' as const,
      },
    };
  const logs: string[] = [];
  const listener = ({ message }: { message: string }) => logs.push(message);
  const input = 'declip-input.wav',
    output = 'declip-output.wav';
  ff.on('log', listener);
  try {
    await ff.writeFile(input, new Uint8Array(await encodeWav(source, true).arrayBuffer()));
    await execChecked(ff, [
      '-i',
      input,
      '-af',
      clippingRepairFilter(source.duration),
      '-ar',
      '48000',
      '-c:a',
      'pcm_f32le',
      output,
    ]);
    checkCancellation(epoch);
    const match = logs.join('\n').match(/Detected clips in (\d+) of \d+ samples/);
    if (!match) throw new Error('O motor não retornou a análise de saturação.');
    const detected = Number(match[1]);
    const report = {
      method: 'autoregressive' as const,
      detected,
      headroomGainDb: 0,
      status: detected > 0 ? ('reconstructed' as const) : ('not-detected' as const),
    };
    if (!detected) return { buffer: source, report };
    const bytes = await ff.readFile(output);
    if (typeof bytes === 'string') throw new Error('A reconstrução não gerou áudio válido.');
    const buffer = await decode(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }),
    );
    if (buffer.length !== source.length || buffer.numberOfChannels !== source.numberOfChannels)
      throw new Error('A reconstrução alterou a duração ou os canais do áudio.');
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++)
      for (const sample of buffer.getChannelData(c)) {
        if (!Number.isFinite(sample)) throw new Error('A reconstrução gerou uma amostra inválida.');
        peak = Math.max(peak, Math.abs(sample));
      }
    const gain = peak > 0.9 ? 0.9 / peak : 1;
    report.headroomGainDb = 20 * Math.log10(gain);
    if (gain < 1)
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const samples = buffer.getChannelData(c);
        for (let i = 0; i < samples.length; i++) samples[i] *= gain;
      }
    return { buffer, report };
  } finally {
    ff.off('log', listener);
    for (const file of [input, output]) await ff.deleteFile(file).catch(() => {});
  }
}
function preserveDuration(filter: string, frames: number, channels: number) {
  // Flush look-ahead stages, then trim in the delivery rate rather than loudnorm's 192 kHz.
  return `apad=pad_dur=0.1,${filter},aresample=48000,aformat=channel_layouts=${channels === 1 ? 'mono' : 'stereo'},apad=whole_len=${frames},atrim=end_sample=${frames}`;
}
export async function measure(blob: Blob, onStatus?: (s: string) => void): Promise<Measurements> {
  return exclusive(async () => {
    const ff = await getEngine(onStatus);
    onStatus?.('Medindo loudness e true peak…');
    await ff.writeFile('measure.wav', new Uint8Array(await blob.arrayBuffer()));
    try {
      return await measureFile(ff, 'measure.wav');
    } finally {
      await ff.deleteFile('measure.wav').catch(() => {});
    }
  });
}
export async function importAudio(file: File, onStatus?: (s: string) => void) {
  const epoch = cancellationEpoch;
  if (file.size === 0) throw new Error('Este arquivo está vazio.');
  if (file.size > MAX_BYTES) throw new Error('O limite por arquivo é de 100 MB.');
  let buffer: AudioBuffer;
  try {
    buffer = await decode(file);
  } catch {
    checkCancellation(epoch);
    const converted = await exclusive(async () => {
      const ff = await getEngine(onStatus);
      onStatus?.('Extraindo o áudio…');
      await ff.writeFile('upload', new Uint8Array(await file.arrayBuffer()));
      try {
        await execChecked(ff, [
          '-i',
          'upload',
          '-vn',
          '-t',
          '601',
          '-ar',
          '48000',
          '-c:a',
          'pcm_f32le',
          'import.wav',
        ]);
        const bytes = await ff.readFile('import.wav');
        return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' });
      } finally {
        await ff.deleteFile('upload').catch(() => {});
        await ff.deleteFile('import.wav').catch(() => {});
      }
    });
    buffer = await decode(converted);
  }
  checkCancellation(epoch);
  if (buffer.duration > MAX_DURATION)
    throw new Error('O limite desta versão é de 10 minutos por arquivo.');
  if (buffer.duration < 0.1) throw new Error('O áudio precisa ter pelo menos 0,1 segundo.');
  if (buffer.numberOfChannels > 2)
    throw new Error('Use um arquivo mono ou estéreo. Áudio multicanal ainda não é suportado.');
  // Keep float headroom through import; restoration must see the original peaks.
  const blob = encodeWav(buffer, true),
    info = inspect(buffer),
    metrics = await measure(blob, onStatus);
  checkCancellation(epoch);
  return { blob, info, metrics };
}
export type ProcessOptions = {
  operation: Operation;
  intensity: Intensity;
  target: number;
  peak: number;
  music?: Blob;
  musicGain?: number;
  region?: { start: number; end: number };
  mode?: DenoiseMode;
  settings?: FilterSettings;
  onStatus?: (s: string) => void;
  onProgress?: (n: number) => void;
};
export async function processAudio(blob: Blob, options: ProcessOptions) {
  if (options.operation === 'vocals')
    throw new Error('A separação musical usa o serviço de IA. Ela não é uma limpeza local.');
  const epoch = cancellationEpoch;
  return exclusive(async () => {
    const ff = await getEngine(options.onStatus);
    const files = [
      'source.wav',
      'result.wav',
      'corrected.wav',
      'peak-safe.wav',
      'delivery.wav',
      'music.wav',
    ];
    let source = await decode(blob);
    checkCancellation(epoch);
    const profile = estimateNoiseFloor(source.getChannelData(0), source.sampleRate);
    const automatic =
      options.operation === 'auto' ||
      (options.settings?.automatic === true && ['denoise', 'clarity'].includes(options.operation));
    const mode = automatic ? 'studio' : (options.mode ?? 'studio');
    const intensity = automatic ? 100 : options.intensity;
    const strength = options.operation === 'effects' ? 100 : strengthValue(intensity);
    const neural =
      mode !== 'general' &&
      ['auto', 'denoise', 'clarity'].includes(options.operation) &&
      strength > 0;
    let restoration: RestorationAnalysis | undefined;
    const settings: FilterSettings = {
      ...options.settings,
      noiseFloor: options.settings?.noiseFloor ?? profile.floorDb,
      neural,
      automatic,
    };
    if (options.operation === 'auto') {
      options.onStatus?.('Analisando saturação e reconstruindo picos identificáveis…');
      const repaired = await repairClippedPeaks(ff, source, epoch);
      source = repaired.buffer;
      settings.clippingRepair = repaired.report;
    }
    if (neural) {
      options.onStatus?.(
        mode === 'voice'
          ? 'Limpando fala com RNNoise…'
          : automatic
            ? 'Analisando a voz e ajustando a restauração automaticamente…'
            : 'Restaurando a voz e preservando o estéreo…',
      );
      const cleaned = await denoiseVoice(
        source,
        (n) => options.onProgress?.(Math.round(n * 0.65)),
        mode === 'voice' ? 'rnnoise' : 'deepfilter',
        options.settings?.neuralAttenuation ?? 24,
        automatic,
      );
      restoration = cleaned.analysis;
      settings.restoration = restoration;
      if (automatic && restoration) {
        settings.neuralAttenuation = restoration.attenuationDb;
        if (options.operation === 'clarity' || options.operation === 'auto')
          Object.assign(settings, {
            presence: restoration.presence,
            compression: restoration.compression,
            deess: restoration.deess,
            mudCut: restoration.mudCut,
            hum: 0,
          });
        if (options.operation === 'auto') {
          settings.masterPreset = 'broadcast';
          settings.broadcast = freshBroadcast();
        }
      }
      checkCancellation(epoch);
      const start = Math.round((options.region?.start ?? 0) * source.sampleRate);
      const end = Math.min(
        source.length,
        Math.round((options.region?.end ?? source.duration) * source.sampleRate),
      );
      const wet = strength / 100;
      for (let c = 0; c < source.numberOfChannels; c++) {
        const samples = source.getChannelData(c);
        for (let i = start; i < end; i++) {
          const fade = options.region ? Math.min(1, (i - start) / 240, (end - 1 - i) / 240) : 1;
          const mix = wet * Math.max(0, fade);
          samples[i] = samples[i] * (1 - mix) + cleaned.channels[c][i] * mix;
        }
      }
    }
    if (options.operation === 'effects') {
      if (options.region)
        throw new Error(
          'Desative a seleção de trecho para preservar a cauda do efeito no áudio completo.',
        );
      options.onStatus?.('Criando o ambiente e preservando a cauda do efeito…');
      settings.effect = options.settings?.effect ?? 'none';
      settings.effectMix = options.settings?.effectMix ?? 0;
      const effect = renderEffect(
        Array.from({ length: source.numberOfChannels }, (_, c) => source.getChannelData(c)),
        source.sampleRate,
        settings.effect,
        (settings.effectMix * strength) / 100,
      );
      settings.effectTailSeconds = effect.tailSeconds;
      const rendered = new AudioBuffer({
        length: effect.channels[0].length,
        numberOfChannels: effect.channels.length,
        sampleRate: source.sampleRate,
      });
      effect.channels.forEach((channel, c) =>
        rendered.copyToChannel(channel as Float32Array<ArrayBuffer>, c),
      );
      source = rendered;
    }
    const sourceBlob = neural || options.operation === 'effects' ? encodeWav(source, true) : blob;
    await ff.writeFile('source.wav', new Uint8Array(await sourceBlob.arrayBuffer()));
    const progress = ({ progress }: { progress: number }) =>
      options.onProgress?.(
        Math.min(95, Math.max(0, Math.round((neural ? 65 : 0) + progress * (neural ? 30 : 95)))),
      );
    ff.on('progress', progress);
    try {
      options.onStatus?.('Tratando seu áudio…');
      let args = ['-i', 'source.wav'];
      if (options.operation === 'mix') {
        if (!options.music) throw new Error('Adicione a faixa de música para fazer a mixagem.');
        await ff.writeFile('music.wav', new Uint8Array(await options.music.arrayBuffer()));
        args.push(
          '-stream_loop',
          '-1',
          '-i',
          'music.wav',
          '-filter_complex',
          `[0:a]asplit=2[voice][side];[1:a]volume=${options.musicGain ?? 0.25}[music];[music][side]sidechaincompress=threshold=0.02:ratio=${(1 + (strength / 100) * 15).toFixed(2)}:attack=15:release=400[duck];[voice][duck]amix=inputs=2:duration=first:normalize=0,${preserveDuration('alimiter=limit=0.8913:level=0:latency=1', source.length, 2)}[out]`,
          '-map',
          '[out]',
        );
      } else {
        let filter =
          options.operation === 'master' && options.settings?.masterPreset !== 'broadcast'
            ? await deliveryFilter(ff, options)
            : treatmentFilter(options.operation, intensity, options.target, options.peak, settings);
        if (automatic && restoration && options.operation !== 'auto')
          filter += `,volume=${restoration.gainCompensationDb}dB,aresample=192000,alimiter=limit=0.870964:level=0:latency=1,aresample=48000`;
        if (
          options.operation === 'effects' &&
          settings.effect !== 'none' &&
          (settings.effectMix ?? 0) > 0 &&
          strength > 0
        )
          filter += ',aresample=192000,alimiter=limit=0.870964:level=0:latency=1,aresample=48000';
        if (options.region) {
          const { start, end } = options.region;
          filter = preserveDuration(
            filter,
            Math.round((end - start) * source.sampleRate),
            source.numberOfChannels,
          );
          // Apply the filter only to the chosen region, keeping the timeline and original surroundings.
          const nodes: string[] = [];
          const labels: string[] = [];
          if (start > 0) {
            nodes.push(`[0:a]atrim=end=${start},asetpts=PTS-STARTPTS[pre]`);
            labels.push('[pre]');
          }
          nodes.push(
            `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,${filter}[selected]`,
          );
          labels.push('[selected]');
          nodes.push(`[0:a]atrim=start=${end},asetpts=PTS-STARTPTS[post]`);
          labels.push('[post]');
          nodes.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`);
          args.push('-filter_complex', nodes.join(';'), '-map', '[out]');
        } else args.push('-af', preserveDuration(filter, source.length, source.numberOfChannels));
      }
      args.push('-ar', '48000', '-c:a', 'pcm_s16le', 'result.wav');
      await execChecked(ff, args);
      ff.off('progress', progress);
      options.onStatus?.('Verificando o resultado…');
      let rendered = 'result.wav';
      const destination =
        options.operation === 'auto'
          ? deliveryPresets.find((p) => p.id === settings.deliveryPreset)
          : undefined;
      if (destination) {
        const delivery = {
          ...options,
          operation: 'master' as const,
          target: destination.lufs,
          peak: destination.peak,
          settings: {},
        };
        const filter = await deliveryFilter(ff, delivery, rendered);
        await execChecked(ff, [
          '-i',
          rendered,
          '-af',
          preserveDuration(filter, source.length, source.numberOfChannels),
          '-ar',
          '48000',
          '-c:a',
          'pcm_s16le',
          'delivery.wav',
        ]);
        rendered = 'delivery.wav';
      }
      let metrics = await measureFile(ff, rendered);
      const automaticCeiling = destination?.peak ?? -1;
      if (
        automatic &&
        !options.region &&
        metrics.truePeak !== null &&
        metrics.truePeak > automaticCeiling
      ) {
        const trim = automaticCeiling - 0.1 - metrics.truePeak;
        await execChecked(ff, [
          '-i',
          rendered,
          '-af',
          `volume=${trim.toFixed(3)}dB`,
          '-ar',
          '48000',
          '-c:a',
          'pcm_s16le',
          'peak-safe.wav',
        ]);
        rendered = 'peak-safe.wav';
        metrics = await measureFile(ff, rendered);
      }
      // Short or highly dynamic material can miss loudnorm's target. Correct the measured
      // render only within verified true-peak headroom. Never alter outside a selected region.
      if (
        ((options.operation === 'master' && options.settings?.masterPreset !== 'broadcast') ||
          destination) &&
        !options.region &&
        metrics.lufs !== null &&
        metrics.truePeak !== null
      ) {
        const delta = (destination?.lufs ?? options.target) - metrics.lufs;
        const gain =
          delta > 0
            ? Math.min(
                delta,
                Math.max(0, (destination?.peak ?? options.peak) - metrics.truePeak - 0.15),
              )
            : delta;
        if (Math.abs(gain) > 0.1) {
          options.onStatus?.('Ajustando o volume medido, respeitando o teto de pico…');
          await execChecked(ff, [
            '-i',
            rendered,
            '-af',
            `volume=${gain.toFixed(3)}dB`,
            '-ar',
            '48000',
            '-c:a',
            'pcm_s16le',
            'corrected.wav',
          ]);
          rendered = 'corrected.wav';
          metrics = await measureFile(ff, rendered);
        }
      }
      const bytes = await ff.readFile(rendered);
      if (typeof bytes === 'string' || bytes.length <= 44)
        throw new Error('O processamento não gerou áudio válido.');
      const result = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/wav' });
      const info = inspect(await decode(result));
      options.onProgress?.(100);
      return {
        blob: result,
        info,
        metrics,
        processing: {
          ...settings,
          engine: neural
            ? mode === 'voice'
              ? 'RNNoise + FFmpeg'
              : 'NOSSOM Voice Natural 3 / DeepFilterNet3 + linked spectral gains + FFmpeg'
            : 'FFmpeg',
          strength,
          noiseFloor: settings.noiseFloor ?? profile.floorDb,
          mode,
        },
      };
    } finally {
      ff.off('progress', progress);
      for (const file of files) await ff.deleteFile(file).catch(() => {});
    }
  });
}
export async function exportMp3(blob: Blob) {
  return exclusive(async () => {
    const ff = await getEngine();
    await ff.writeFile('export.wav', new Uint8Array(await blob.arrayBuffer()));
    try {
      await execChecked(ff, [
        '-i',
        'export.wav',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '320k',
        'export.mp3',
      ]);
      const data = await ff.readFile('export.mp3');
      return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'audio/mpeg' });
    } finally {
      await ff.deleteFile('export.wav').catch(() => {});
      await ff.deleteFile('export.mp3').catch(() => {});
    }
  });
}
export function makeDemo(duration = 8) {
  const buffer = new AudioBuffer({
    length: 48000 * duration,
    numberOfChannels: 1,
    sampleRate: 48000,
  });
  const data = buffer.getChannelData(0);
  let seed = 42;
  for (let i = 0; i < data.length; i++) {
    const t = i / 48000;
    seed = (seed * 16807) % 2147483647;
    const envelope = Math.pow(Math.max(0, Math.sin(t * 2.5)), 2) * 0.18;
    const melody = [220, 277.18, 329.63, 440][Math.floor(t) % 4];
    data[i] =
      envelope *
        (Math.sin(2 * Math.PI * melody * t) + 0.3 * Math.sin(2 * Math.PI * melody * 2 * t)) +
      (seed / 2147483647 - 0.5) * 0.035;
  }
  return new File([encodeWav(buffer)], 'Experimento sonoro.wav', { type: 'audio/wav' });
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}
