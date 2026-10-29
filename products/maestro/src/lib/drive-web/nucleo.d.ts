// Tipos do núcleo do navegador do Drive (nucleo.js). Só o que os apps usam; o resto é `unknown`.

export type ArquivoDrive = {
  id: string
  name: string
  mimeType: string
  size?: string | number | null
  modifiedTime?: string
  thumbnailLink?: string
  iconLink?: string
  hasThumbnail?: boolean
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string }
  imageMediaMetadata?: { width?: number; height?: number }
  webViewLink?: string
  driveId?: string
  parents?: string[]
  shortcutDetails?: { targetId?: string; targetMimeType?: string }
  capabilities?: Record<string, boolean>
  appProperties?: Record<string, string>
  isDrive?: boolean
  shortcut?: string
}

export type Lugar = { scope: 'mine' | 'shared' | 'drives'; folder: { id: string; name: string } | null; driveId?: string | null; search?: string }
export type Tipo = 'folder' | 'video' | 'audio' | 'image' | 'pdf' | 'gdoc' | 'archive' | 'doc' | 'generic'
export type Ordem = 'name' | 'date' | 'size' | 'type'
export type Filtro = 'all' | 'video' | 'image' | 'audio' | 'folder' | 'other'
export type DriveCall = (caminho: string, o: { query?: Record<string, unknown>; signal?: AbortSignal }) => Promise<Record<string, unknown>>

export const FOLDER_MIME: string
export function q(s: string): string
export const FILE_FIELDS: string
export const SCOPES: { id: Lugar['scope']; label: string; aria: string }[]
export const SORTS: Record<Ordem, { label: string; order: string | null; desc: string | null; hint: [string, string]; chip: [string, string] }>
export function sortChip(sort: Ordem, flip: boolean): string
export function serverSort(sort: Ordem, flip: boolean): { sort: Ordem; flip: boolean }
export function needsAll(sort: Ordem): boolean
export function autoView(files: ArquivoDrive[]): 'grid' | 'list'
export function isFolder(f: ArquivoDrive | null | undefined): boolean
export function isGoogleDoc(f: ArquivoDrive | null | undefined): boolean
export function target(f: ArquivoDrive): ArquivoDrive
export function kindOf(f: ArquivoDrive): Tipo
export const FILTERS: { id: Filtro; label: string; one?: string; many?: string; none?: string }[]
export function filterById(id: string): (typeof FILTERS)[number]
export function categoryOf(f: ArquivoDrive): Exclude<Filtro, 'all'>
export function matchesFilter(f: ArquivoDrive, id: Filtro | null | undefined): boolean
export function filterQuery(id: Filtro): string
export const MAC_JUNK_MAX: number
export function isMacJunk(f: ArquivoDrive): boolean
export function isTrashableJunk(f: ArquivoDrive): boolean
export function mayPlay(f: ArquivoDrive, el?: HTMLMediaElement | null): boolean
export function showsAsImage(f: ArquivoDrive): boolean
export function canDownload(f: ArquivoDrive): boolean
export function driveUrl(f: ArquivoDrive): string
export function sizedThumb(link: string | null | undefined, px: number): string | null
export function sortLocal(files: ArquivoDrive[], sort: Ordem, flip: boolean): ArquivoDrive[]
export function criarListador(driveCall: DriveCall): {
  listPage(
    where: Lugar,
    o?: { sort?: Ordem; flip?: boolean; filter?: Filtro; pageToken?: string | null; pageSize?: number; signal?: AbortSignal },
  ): Promise<{ files: ArquivoDrive[]; next: string | null }>
  listDrives(signal?: AbortSignal): Promise<ArquivoDrive[]>
  getFile(id: string, signal?: AbortSignal): Promise<ArquivoDrive>
}
