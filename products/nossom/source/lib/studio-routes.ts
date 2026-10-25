import type { Operation } from './presets';
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
};
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
