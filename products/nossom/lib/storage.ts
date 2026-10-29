import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AudioInfo, Measurements } from './audio';
import type { FilterSettings } from './presets';
export type Version = {
  id: string;
  label: string;
  createdAt: number;
  blob: Blob;
  info: AudioInfo;
  metrics: Measurements;
  parentId?: string;
  operation?: string;
  preset?: string;
  processing?: FilterSettings & {
    engine: string;
    strength: number;
    noiseFloor: number;
    mode: string;
    noiseReduction?: number;
    presence?: number;
    compression?: number;
    highpass?: number;
  };
};
export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeVersionId?: string;
  redoVersionIds?: string[];
  originalFile: Blob;
  originalName: string;
  /** The original is a video with a picture: the treated audio can go back under it. */
  hasVideo?: boolean;
  /** Words with times from Legendas; subtitles are rebuilt from them on export. */
  transcript?: import('./transcript').Transcript & { createdAt: number };
  /** Remixer stems (FLAC, in STEM_NAMES order) that add back up to the original. */
  stems?: { files: Blob[]; gainDb: number; createdAt: number };
  versions: Version[];
};
export type ProjectSummary = Omit<Project, 'versions' | 'originalFile'> & {
  duration: number;
  versionCount: number;
};
interface NossomDB extends DBSchema {
  projects: { key: string; value: Project };
}
const databases = new Map<string, Promise<IDBPDatabase<NossomDB>>>();
function db(owner: string) {
  if (!/^[a-f0-9-]{36}$/.test(owner)) throw new Error('Entre na sua conta para abrir os projetos.');
  const existing = databases.get(owner);
  if (existing) return existing;
  const pending = (async () => {
    const legacyOwner = localStorage.getItem('nossom-legacy-owner');
    if (!legacyOwner) localStorage.setItem('nossom-legacy-owner', owner);
    // The first account keeps the original workspace in place; no duplicate blobs or deleted data.
    const name = !legacyOwner || legacyOwner === owner ? 'nossom-studio' : 'nossom-studio-' + owner;
    return openDB<NossomDB>(name, 1, {
      upgrade(database) {
        database.createObjectStore('projects', { keyPath: 'id' });
      },
    });
  })().catch((error) => {
    databases.delete(owner);
    throw error;
  });
  databases.set(owner, pending);
  return pending;
}
export async function listProjects(owner: string): Promise<ProjectSummary[]> {
  const all = await (await db(owner)).getAll('projects');
  return all
    .map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      originalName: p.originalName,
      duration: p.versions[0].info.duration,
      versionCount: p.versions.length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveProject(project: Project, owner: string) {
  try {
    await (await db(owner)).put('projects', project);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError')
      throw new Error(
        'O armazenamento deste navegador está cheio. Exclua projetos antigos e tente novamente.',
      );
    throw e;
  }
}
export async function getProject(id: string, owner: string) {
  return (await db(owner)).get('projects', id);
}
export async function deleteProject(id: string, owner: string) {
  await (await db(owner)).delete('projects', id);
}
