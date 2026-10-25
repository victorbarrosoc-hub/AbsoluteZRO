import type { Operation } from './presets';
export const toolGroups: { label: string; tools: Operation[] }[] = [
  { label: 'Tratar', tools: ['auto', 'vocals', 'denoise', 'wind'] },
  { label: 'Ajustar', tools: ['clarity', 'eq', 'level'] },
  { label: 'Criar', tools: ['effects', 'mix'] },
  { label: 'Entregar', tools: ['master'] },
];
