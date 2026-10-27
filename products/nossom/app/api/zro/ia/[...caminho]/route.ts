import { proxyIa } from '@/lib/server/zro/ia';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A resposta da Z chega em streaming e pode levar até dois minutos.
export const maxDuration = 150;

type Context = { params: Promise<{ caminho: string[] }> };
const handle = async (request: Request, { params }: Context) =>
  proxyIa(request, (await params).caminho ?? []);
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
