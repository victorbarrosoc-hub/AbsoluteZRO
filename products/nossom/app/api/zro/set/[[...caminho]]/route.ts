import { proxySet } from '@/lib/server/zro/set';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// O Set da Absolute ZRO (presença e conversas): /api/zro/set e /api/zro/set/<caminho>, repassados com o token da conta.
type Context = { params: Promise<{ caminho?: string[] }> };
const handle = async (request: Request, { params }: Context) =>
  proxySet(request, (await params).caminho ?? []);
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
