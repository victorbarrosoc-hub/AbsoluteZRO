# 0003 · RLS com papel restrito e contexto por transação

**Decisão.** O servidor conecta como dono das tabelas, mas toda operação de usuário roda em
`db.asUser(ctx, fn)`: `BEGIN; set_config('zro.user_id'), set_config('zro.org_id'); SET LOCAL ROLE zro_app`. O
`zro_app` não é dono nem tem BYPASSRLS. Funções `security definer` (`member_role`, `can_view_project`…) evitam recursão.
`asSystem` (dono, sem RLS) fica restrito a autenticação, webhook assinado, worker e console após checar papel de
plataforma, sempre com motivo no log.

**Por quê.** Defesa em profundidade: a checagem do servidor (`authorize`) e o banco precisam falhar juntos para vazar.
Compatível com o pooler do Supabase em modo transação (`set_config(..., true)` e `SET LOCAL`).

**Consequências.** Toda tabela nova precisa de `enable row level security`, grants mínimos e teste em
`packages/db/test/rls.test.ts` (há um teste que falha se alguma tabela do schema ficar sem RLS).
