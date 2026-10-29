# Perfil único (27/10/2026)

A conta Absolute ZRO é o perfil de todas as plataformas, como o Adobe ID. **Nome, e-mail e foto são editados num lugar
só**: `https://absolutezro.com/perfil`. Cada plataforma guarda apenas os dados que são dela (no Carro do Freela, a
função e a praça do freela; no TPeasy, os roteiros; e assim por diante) e lê os dados básicos da conta.

## O que o login único entrega

Com o escopo `profile` (além de `openid email`), o `id_token` e o `/oauth/userinfo` trazem:

| Claim        | O que é                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `sub`        | id da pessoa na Absolute ZRO (estável; é a chave que liga a conta do app à conta Absolute ZRO) |
| `name`       | nome de exibição                                                                               |
| `email`      | e-mail (com `email_verified`)                                                                  |
| `picture`    | foto: `https://absolutezro.com/api/v1/foto/<uuid>`. Ausente = sem foto (mostre as iniciais)    |
| `updated_at` | segundos desde 1970 da última mudança de nome ou foto                                          |
| `zro_conta`  | onde editar: `https://absolutezro.com/perfil`                                                  |

O endereço da foto é público (funciona num `<img>`, sem cookie), impossível de adivinhar e **muda a cada foto nova**:
pode ficar em cache para sempre. O endereço antigo passa a responder 404.

## O que cada plataforma faz

1. **Lê o perfil ao abrir.** Sempre que a pessoa abre o app (ou a cada nova sessão/renovação de token), chama
   `/oauth/userinfo` com o access token (ou usa o `id_token` novo do refresh) e atualiza a cópia local de `name`,
   `email` e `picture`. Mudou na conta, muda no app na próxima abertura, sem a pessoa fazer nada.
2. **Mostra a foto e o nome da conta.** Avatar = `picture` (sem `picture`, iniciais do `name`). Nada de foto ou nome
   próprios do app para quem entrou com a Absolute ZRO.
3. **Não edita dado básico.** Onde o app deixava trocar nome, foto ou e-mail, passa a ter **"Editar na conta Absolute
   ZRO"** apontando para `zro_conta` (abre fora do app, no navegador). Campos que são do app continuam editáveis nele.
4. **Não guarda segredo.** Só a cópia do que veio nos claims; nada de senha. A chave é o `sub`.

## Onde está no HUB

- `infra/migrations/0015_perfil_unico.sql` (endereço público da foto, novo a cada foto)
- `packages/auth/src/oidc.ts` (`profileClaims`, `claims_supported`)
- `packages/core/src/account.ts` (`publicAvatar`) e `apps/hub-web/app/api/v1/foto/[id]/route.ts`
- Teste: `tests/integration/oidc.test.ts` › "perfil único (0015)"
