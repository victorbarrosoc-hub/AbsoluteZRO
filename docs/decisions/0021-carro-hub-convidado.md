# ADR 0021 — Carro do Freela → HUB: token de app e o papel "convidado"

Data: 26/10/2026 · Pedido do titular (job vira projeto; a equipe da escala vira a equipe do projeto)

## Contexto

O HUB já aceitava `carro-do-freela.job/1`, mas só com o cookie de sessão do próprio HUB: o site do Carro (outro
domínio) não tinha como enviar. E a equipe escalada não tinha lugar no HUB sem entrar na organização inteira — um
`viewer` veria todos os projetos da produtora.

## Decisão

- **Token de app nas rotas do produto.** Escopo `carro-do-freela.jobs` (`PRODUCT_SCOPES` em `packages/auth/src/oidc.ts`),
  dado só ao cliente do Carro (no cadastro e pela migration 0014). `route(handler, { bearer })` aceita
  `Authorization: Bearer <at+jwt>`: confere assinatura, emissor, validade, escopo, app ativo e acesso não removido no
  Perfil (`authenticateAccessToken`). Pedido com Bearer pula a checagem de origem (não é credencial que o navegador
  manda sozinho). A organização é a do token e o papel sai do banco no `authorize()`; papel de plataforma nunca vem
  por token. O site do Carro guarda o refresh token cifrado num cookie httpOnly do próprio servidor.
- **Contrato `carro-do-freela.crew/1`** (`POST /api/v1/carro-do-freela/jobs/crew`): pessoas por conta Absolute ZRO
  (`zro_user_id`) e e-mail da conta, função e papel no projeto. Só dono, administração e gestão, com e-mail confirmado.
- **Papel `guest` (convidado).** Entra na organização para os projetos em que está e vê só eles: sem lista de
  membros, plano, vínculos, eventos da organização nem nomes de quem não está com ele num projeto
  (`zro.is_full_member`, `shares_org_with` revisto). Gestão (manager) pode convidar convidados; os outros papéis
  seguem só com dono e administração.
- **Convite com projeto.** `invitations` ganha `project_id`, `project_role`, `project_function` e `invitee_user_id`:
  aceitar põe a pessoa na equipe do projeto, só a mesma conta aceita, e convite de convidado nunca rebaixa quem já é
  da organização. Quem já é membro entra no projeto direto, sem convite.

## Consequências

- Sem cadastro duplicado: o convite vai para a conta que já existe; aceitar exige entrar com ela.
- O link do convite só vai por e-mail; sem provedor de e-mail, o convite fica pendente e aparece no projeto.
- Antes de ligar em produção: aplicar a migration 0014 (o Carro recua sozinho para o login sem o escopo enquanto ela
  não existir) e quem já entrou no Carro precisa entrar de novo para guardar o acesso.
