# Login único: "Continuar com Absolute ZRO"

Estado em 25/10/2026. A NOSSOM é cliente do login único da Absolute ZRO (ADR 0012 e 0013 na raiz do repositório). O
login com e-mail e senha continua igual; a Absolute ZRO é um jeito a mais de entrar.

## Como funciona

1. `GET /api/zro/entrar` (aceita `?volta=/caminho` relativo; padrão `/studio`) gera `state`, `nonce` e o verificador
   PKCE S256, guarda os três num cookie `nossom-zro` cifrado e autenticado (AES-256-GCM, chave derivada de
   `NOSSOM_AUTH_SECRET`), `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/zro`, 10 minutos, e redireciona para a
   Absolute ZRO. O HUB abre o app direto por essa rota, sem passar pela tela de entrar.
2. A Absolute ZRO volta em `GET /api/zro/callback`. O servidor confere o `state` (comparação de tempo constante), o
   `iss` do redirect (RFC 9207) e troca o código no `token_endpoint` com `client_secret_basic` e o verificador PKCE.
3. O `id_token` é conferido pela JWKS (ES256): assinatura, `iss`, `aud` = `ZRO_CLIENT_ID`, `exp` e `nonce`. Nada da
   Absolute ZRO é aceito sem isso.
4. Conta:
   - `sub` já ligado (`nossom_private.zro_links`): entra nessa conta.
   - Sem vínculo e sem conta com o e-mail: cria a conta pela Admin API do Supabase (service role, só no servidor), já
     confirmada, **só se `email_verified=true`**. A conta nasce sem senha e marcada como criada pela Absolute ZRO.
   - Sem vínculo e o e-mail já tem conta NOSSOM: **não mescla**. Volta para `/entrar?erro=zro_email_em_uso` pedindo
     para entrar com a senha e ligar em Minha conta.
5. Sessão: `admin/generate_link` (tipo `magiclink`, não envia e-mail) e `verify` com o `token_hash`, no servidor. A
   sessão Supabase resultante vai para o mesmo cookie cifrado `nossom-account` do login com senha.

Erros voltam como `?erro=<código>` e viram mensagens curtas (`lib/zro-messages.ts`).

## Minha conta

O cartão **Absolute ZRO** (`/studio/conta`) mostra a ligação. **Ligar** passa por `/api/zro/entrar?modo=ligar`
(exige estar logado; a volta confere que é a mesma conta). **Desligar** chama `DELETE /api/zro/conta` e é recusado
quando a conta foi criada pela Absolute ZRO, porque ela é o único jeito de entrar. Nessas contas os cartões de e-mail
e senha ficam ocultos (não há senha atual para confirmar).

## A Z no Início (27/10/2026)

A Z, a IA da Absolute ZRO, abre o Início do estúdio (`/studio`: site, celular/PWA e o app de computador, que carrega
o mesmo endereço). O painel é o `<zro-ia>` publicado em `https://absolutezro.com/ia/v1/zro-ia.js`
(`components/zro-ia-panel.tsx`); o assistente do NOSSOM e o envio de áudio seguem logo abaixo, e `/studio/ia` continua
só com o assistente.

- **Escopo:** a ida à Absolute ZRO pede `openid email profile org offline_access zro.ia`.
- **Token:** o callback guarda access e refresh token no cookie `nossom-zro-ia` (AES-256-GCM com chave derivada de
  `NOSSOM_AUTH_SECRET`, `HttpOnly`, `SameSite=Lax`, `Path=/api/zro/ia`, 30 dias), preso à conta NOSSOM que entrou.
  Sem `zro.ia` no token, o cookie é apagado. Sair (`DELETE /api/account`) e desligar a Absolute ZRO apagam o cookie;
  sair também revoga o refresh token.
- **Repasse:** `/api/zro/ia/{estado,conversas,conversas/:id,mensagens}` (`lib/server/zro/ia.ts`) confere a sessão
  NOSSOM, a mesma origem em POST/DELETE e a conta dona do token; renova o access token pelo refresh (uma renovação por
  vez, sem reuso) e encaminha para `<ZRO_ISSUER>/api/v1/ia/*` com `Authorization: Bearer`. A resposta NDJSON passa em
  streaming. Nenhum token vai para o navegador, para log ou para a resposta.
- **Sem token** (entrou com senha, sessão anterior a esta versão, token sem `zro.ia`, revogado): 401, o painel
  dispara `zro-ia:sem-login` e aparece **Conectar com Absolute ZRO** (`/api/zro/entrar?modo=ligar&volta=/studio`).
- **CSP:** `script-src` e `img-src` liberam `https://absolutezro.com` (o repasse é da mesma origem, `connect-src` não
  muda). Se o script não carregar, o Início fica como antes.
- **Home pública:** com o login Absolute ZRO configurado no build, a seção da Z diz "Já no NOSSOM" e leva ao estúdio;
  sem ele, continua "Chegando ao NOSSOM".

## Banco

Migração `supabase/migrations/202610250002_zro_links.sql`: tabela `nossom_private.zro_links` (RLS ligada, sem acesso
para `anon`/`authenticated`) e função `public.nossom_zro_link(action, user, sub, data)` `security definer`, com
`EXECUTE` só para `service_role`. Uma pessoa ZRO para uma conta e vice-versa; excluir a conta apaga o vínculo.
Teste com PostgreSQL real em `tests/quota-postgres.integration.ts` (`npm run test:quota`).

## Variáveis (Vercel, projeto `nossom`)

| Variável                    | Valor                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `ZRO_CLIENT_ID`             | `nossom-web`                                                |
| `ZRO_CLIENT_SECRET`         | segredo do cliente no console da Absolute ZRO (sensível)    |
| `ZRO_ISSUER`                | opcional; padrão `https://absolutezro.com`                  |
| `SUPABASE_SERVICE_ROLE_KEY` | já existente; necessária para criar contas e vínculos       |
| `NOSSOM_AUTH_SECRET`        | já existente; também protege o cookie da ida à Absolute ZRO |

Sem `ZRO_CLIENT_ID` e `ZRO_CLIENT_SECRET` o botão não aparece e o site fica igual. O retorno cadastrado no HUB é
`https://nossom-teal.vercel.app/api/zro/callback`; o app usa o endereço em que foi aberto, então prévias da Vercel em
outro domínio são recusadas pelo HUB (comportamento esperado).

## Vercel

- **Root Directory:** `products/nossom`. O build (`npm ci`, `npm run build`, `prebuild` com `scripts/prepare-audio.mjs`)
  usa só arquivos da pasta; nada fora dela é necessário.
- `vercel.json` da pasta continua valendo (cron de limpeza incluso).

## Passos manuais

1. Aplicar `202610250002_zro_links.sql` no Supabase em uso pela NOSSOM (o projeto AbsoluteZRO, onde já estão
   `nossom_private` e as funções `public.nossom_*`).
2. Definir `ZRO_CLIENT_ID` e `ZRO_CLIENT_SECRET` no projeto Vercel `nossom` e publicar.
3. Testar com uma conta Absolute ZRO: entrar pelo botão, abrir pelo HUB e ligar/desligar em Minha conta.
