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
  /** A ferramenta da versão mais nova (a cor do passo nos Recentes); ausente no original. */
  lastOperation?: string;
};
interface NossomDB extends DBSchema {
  projects: { key: string; value: Project };
}
const databases = new Map<string, Promise<IDBPDatabase<NossomDB>>>();
/** Esquece a conexão: o Safari do iPhone derruba a do IndexedDB quando a aba vai para segundo plano. */
async function forget(owner: string) {
  const pending = databases.get(owner);
  databases.delete(owner);
  try {
    (await pending)?.close();
  } catch {
    // já estava fechada
  }
}
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
      // Conexão perdida (Safari em segundo plano, outra aba atualizando): a próxima chamada abre outra.
      terminated() {
        if (databases.get(owner) === pending) databases.delete(owner);
      },
      blocking() {
        void forget(owner);
      },
    });
  })().catch((error) => {
    databases.delete(owner);
    throw error;
  });
  databases.set(owner, pending);
  return pending;
}
/** Uma leitura com uma segunda chance: conexão perdida (comum no iPhone) abre outra e repete. */
async function reading<T>(owner: string, read: (database: IDBPDatabase<NossomDB>) => Promise<T>) {
  try {
    return await read(await db(owner));
  } catch (e) {
    if (!(e instanceof DOMException) || !['InvalidStateError', 'UnknownError'].includes(e.name))
      throw e;
    await forget(owner);
    return read(await db(owner));
  }
}
export async function listProjects(owner: string): Promise<ProjectSummary[]> {
  const all = await reading(owner, (d) => d.getAll('projects'));
  return all
    .map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      originalName: p.originalName,
      duration: p.versions[0].info.duration,
      versionCount: p.versions.length,
      lastOperation: p.versions[p.versions.length - 1]?.operation,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
/**
 * Um áudio guardado como bytes, não como Blob: o WebKit às vezes não consegue preparar o Blob para o IndexedDB
 * ("Error preparing Blob/File data"), nem depois de copiado para a memória. Bytes ele sempre guarda.
 */
type Packed = { nossomBytes: ArrayBuffer; type: string };
const isPacked = (value: unknown): value is Packed =>
  !!value &&
  typeof value === 'object' &&
  (value as Packed).nossomBytes instanceof ArrayBuffer &&
  typeof (value as Packed).type === 'string';

/** Troca cada áudio do projeto (original, versões e faixas separadas). */
async function mapBlobs(project: Project, change: (blob: Blob) => Promise<Blob>): Promise<Project> {
  return {
    ...project,
    originalFile: await change(project.originalFile),
    versions: await Promise.all(
      project.versions.map(async (v) => ({ ...v, blob: await change(v.blob) })),
    ),
    ...(project.stems
      ? {
          stems: { ...project.stems, files: await Promise.all(project.stems.files.map(change)) },
        }
      : {}),
  };
}
/** A copy whose blobs live in memory, not as references to files on disk. */
const inMemory = (project: Project) =>
  mapBlobs(project, async (blob) => new Blob([await blob.arrayBuffer()], { type: blob.type }));
/** O projeto com os áudios em bytes, para o último recurso do Safari. */
export const packProject = (project: Project) =>
  mapBlobs(
    project,
    async (blob) =>
      ({
        nossomBytes: await blob.arrayBuffer(),
        type: blob.type,
      }) satisfies Packed as unknown as Blob,
  );
/** Lê de volta um projeto guardado em bytes; um projeto com Blobs passa igual. */
export function unpackProject(project: Project): Project {
  const blob = (value: Blob) =>
    isPacked(value) ? new Blob([value.nossomBytes], { type: value.type }) : value;
  return {
    ...project,
    originalFile: blob(project.originalFile),
    versions: project.versions.map((v) => ({ ...v, blob: blob(v.blob) })),
    ...(project.stems ? { stems: { ...project.stems, files: project.stems.files.map(blob) } } : {}),
  };
}
const FULL =
  'O armazenamento deste navegador está cheio. Exclua projetos antigos e tente novamente.';
const quota = (e: unknown) => e instanceof DOMException && e.name === 'QuotaExceededError';
/**
 * Guarda o projeto no aparelho. Se o navegador recusar, tenta de novo com outra conexão e os áudios em memória e,
 * por fim, com os áudios em bytes (o caminho que o Safari do iPhone sempre aceita). Lido de volta, é o mesmo projeto.
 */
export async function saveProject(project: Project, owner: string) {
  const store = async (value: Project) => (await db(owner)).put('projects', value);
  try {
    await store(project);
    return;
  } catch (e) {
    if (quota(e)) throw new Error(FULL);
    if (!(e instanceof DOMException) || e.name === 'AbortError') throw e;
    console.warn('[nossom] IndexedDB recusou o projeto:', e.name, e.message);
  }
  for (const prepare of [inMemory, packProject]) {
    await forget(owner);
    try {
      await store(await prepare(project));
      return;
    } catch (e) {
      if (quota(e)) throw new Error(FULL);
      console.warn(
        '[nossom] IndexedDB recusou de novo:',
        e instanceof Error ? e.name : '',
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  throw new Error(
    'O navegador não conseguiu guardar este áudio. Confira o espaço livre no aparelho e, se o arquivo estiver no iCloud, baixe-o antes de importar.',
  );
}
export async function getProject(id: string, owner: string) {
  const project = await reading(owner, (d) => d.get('projects', id));
  return project && unpackProject(project);
}
export async function deleteProject(id: string, owner: string) {
  await reading(owner, (d) => d.delete('projects', id));
}
