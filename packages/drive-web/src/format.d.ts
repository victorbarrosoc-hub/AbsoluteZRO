// Tipos da formatação em pt-BR (format.js).
export function bytes(n: number | null | undefined, o?: { fixed?: boolean; precise?: boolean }): string
export function speed(bps: number): string
export function timecode(sec: number | null | undefined): string
export function count(n: number): string
export function plural(n: number, one: string, many: string): string
export function percent(frac: number): string
export function extOf(name?: string): string
export function fileKind(name: string, mimeType?: string): 'video' | 'audio' | 'image' | 'archive' | 'doc' | 'generic'
export const KIND_ICON: Record<string, string>
export function initials(name?: string, email?: string): string
export function duration(ms: number | string | null | undefined): string
export function clock(sec: number): string
export function shortDate(iso: string | null | undefined): string
export function fullDate(iso: string | null | undefined): string
