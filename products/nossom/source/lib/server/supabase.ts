export function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
    /\/$/,
    '',
  );
  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))
      return null;
  } catch {
    return null;
  }
  return { url, key };
}
export class SupabaseError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super('Não foi possível concluir a operação.');
  }
}
export async function supabase<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const config = supabaseConfig();
  if (!config) throw new Error('O acesso ao Supabase ainda não está configurado na plataforma.');
  const response = await fetch(config.url + path, {
    method: options.method || 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: config.key,
      ...(options.token || config.key.startsWith('eyJ')
        ? { Authorization: 'Bearer ' + (options.token || config.key) }
        : {}),
      'Content-Type': 'application/json',
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new SupabaseError(response.status, error.error_code || error.code || 'provider_error');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
