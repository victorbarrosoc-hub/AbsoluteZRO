import { supabaseConfig } from './supabase';
// Profile photos live in a private bucket, one object per account, served only to its owner.
const bucket = 'nossom-avatars';
export const AVATAR_MAX_BYTES = 300 * 1024;
const types: Record<string, (b: Uint8Array) => boolean> = {
  'image/webp': (b) =>
    b.length > 12 &&
    String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d,
};
/** The declared type must match the file's own signature; anything else is refused. */
export function avatarType(declared: string | null, bytes: Uint8Array) {
  const type = (declared || '').split(';')[0].trim().toLowerCase();
  return types[type]?.(bytes) ? type : null;
}
function storage() {
  const sb = supabaseConfig(),
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sb || !key) throw new Error('As fotos de perfil ainda não estão disponíveis.');
  return {
    url: sb.url,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  };
}
const objectPath = (user: string) => `/storage/v1/object/${bucket}/${user}`;
export async function saveAvatar(user: string, bytes: Uint8Array<ArrayBuffer>, type: string) {
  const { url, headers } = storage();
  const upload = () =>
    fetch(url + objectPath(user), {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { ...headers, 'Content-Type': type, 'x-upsert': 'true' },
      body: bytes,
    });
  let response = await upload();
  if (response.status === 404 || response.status === 400) {
    // First photo ever: create the private bucket, then retry once.
    await fetch(url + '/storage/v1/bucket', {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: false,
        file_size_limit: AVATAR_MAX_BYTES,
        allowed_mime_types: Object.keys(types),
      }),
    });
    response = await upload();
  }
  if (!response.ok) throw new Error('Não foi possível salvar a foto. Tente novamente.');
}
export async function readAvatar(user: string) {
  const { url, headers } = storage();
  const response = await fetch(url + '/storage/v1/object/authenticated/' + bucket + '/' + user, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers,
  });
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = avatarType(response.headers.get('content-type'), bytes);
  return type && bytes.length <= AVATAR_MAX_BYTES ? { bytes, type } : null;
}
export async function removeAvatar(user: string) {
  const { url, headers } = storage();
  await fetch(url + `/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [user] }),
  });
}
