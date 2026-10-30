import type { Operation } from './presets';
import { isVoiceToolPreset, stemSeparation, transcription } from './restoration';
export const toolSlugs: Record<Operation, string> = {
  vocals: 'isolar-voz',
  auto: 'automatico',
  denoise: 'limpeza',
  clarity: 'voz',
  eq: 'equalizacao',
  wind: 'vento',
  level: 'nivelamento',
  master: 'masterizacao',
  effects: 'efeitos',
  mix: 'mixagem',
  transcribe: 'legendas',
  remix: 'remixar',
};
/** The tool that owns a cloud job, so a pending job reopens in the right place. */
export function presetOperation(preset: unknown): Operation {
  if (preset === transcription.id) return 'transcribe';
  if (preset === stemSeparation.id) return 'remix';
  return isVoiceToolPreset(preset) ? 'vocals' : 'auto';
}
export function toolPath(operation: Operation, projectId?: string) {
  return (
    '/studio/' +
    toolSlugs[operation] +
    (projectId ? '?project=' + encodeURIComponent(projectId) : '')
  );
}
export function routeOperation(pathname: string): Operation | undefined {
  const slug = pathname.split('/')[2];
  return Object.entries(toolSlugs).find(([, value]) => value === slug)?.[0] as
    Operation | undefined;
}
