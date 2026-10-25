import { currentAccount } from '@/lib/server/account';
import { allowRequest, privateHeaders } from '@/lib/server/ai-access';
import { providerBalances } from '@/lib/server/provider-balances';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account?.isAdmin)
    return Response.json(
      { error: 'Acesso restrito ao administrador.' },
      { status: 403, headers: privateHeaders },
    );
  if (!allowRequest('admin-billing:' + account.id, 10, 60000))
    return Response.json(
      { error: 'Aguarde um instante para atualizar.' },
      { status: 429, headers: privateHeaders },
    );
  return Response.json(await providerBalances(), { headers: privateHeaders });
}
