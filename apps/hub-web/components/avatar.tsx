/** Foto do perfil, ou as iniciais quando não há foto. Serve no topo, no menu e na central da conta. */
export const initials = (s: string) =>
  s
    .replace(/\[.*?\]/g, '')
    .trim()
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '·'

export function Avatar({ userId, name, version, size = 32 }: { userId: string; name: string; version: number | null; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }} aria-hidden="true">
      {version ? <img src={`/api/v1/users/${userId}/avatar?v=${version}`} alt="" width={size} height={size} /> : initials(name)}
    </span>
  )
}
