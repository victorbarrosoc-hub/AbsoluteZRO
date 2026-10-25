# 0012 — Login único: o HUB como provedor OpenID Connect

**Contexto.** O titular quer uma conta Absolute ZRO para entrar em todas as plataformas, como a Adobe ID. Os apps
originais têm login próprio (SOBEDESCE: contas com senha, sessões e Google Drive conectado; NOSSOM e Carro do Freela:
Supabase; Synquei e TPeasy: sem conta). Mudar os originais exige autorização específica (CLAUDE.md).

**Decisão.** O HUB vira provedor OpenID Connect; cada app vira cliente cadastrado no console.

- Fluxo: authorization code com PKCE S256 obrigatório para todo cliente (OAuth 2.1). Sem implicit nem senha.
- Clientes: **confidencial** (site do app, com segredo) ou **público** (desktop/celular, só PKCE, retorno em
  `http://127.0.0.1:<porta>/caminho` — RFC 8252).
- Tokens: access token JWT ES256 de 10 min (`typ: at+jwt`, `aud` = client_id) com `zro_org` e `zro_products`
  (contratados, recalculados do banco); id_token com e-mail, confirmação e nome; refresh token opaco de 30 dias com
  rotação e detecção de reuso (revoga a família; teto de 90 dias). Código de 60 s, uso único.
- Chave: gerada pelo HUB no primeiro uso e guardada em `zro.oidc_keys` (só o sistema lê); `ZRO_OIDC_SIGNING_KEY`
  substitui se definida. Rotação: aposentar a ativa; o JWKS segue publicando as dos últimos 30 dias.
- Permissão: tela "Entrar no <app>" mostra o que será compartilhado; vale até ser removida em Perfil › Apps com acesso.
  Retorno não cadastrado nunca é seguido (sem redirecionamento aberto).

**Conta e conexões são coisas separadas.** Login responde "quem é"; conexões (Google Drive no SOBEDESCE) respondem
"onde salvar". A pessoa entra com a Absolute ZRO e o Drive continua conectado à conta do app, como hoje.

**Plano por app (cada passo exige autorização do titular para mexer no original):**

1. **SOBEDESCE** (site Next + desktop por código de aparelho): botão "Entrar com Absolute ZRO" no site; ligação com
   a conta existente pelo e-mail confirmado (com confirmação da senha antiga na primeira vez); o desktop continua
   entrando pelo código de aparelho do site. Drive: sem mudança (tokens cifrados no servidor do SOBEDESCE). Planos:
   o SOBEDESCE passa a ler `zro_products` para liberar o que a organização contratou.
2. **Synquei**: hoje sem conta. Login opcional para recursos pagos; desktop como cliente público com loopback.
3. **NOSSOM** e **Carro do Freela**: Supabase Auth com provedor OIDC personalizado ou troca de token no servidor.
4. **TPeasy**: sem conta; entra só se surgir recurso de nuvem.

**Fora do escopo agora:** logout federado (encerrar a sessão em todos os apps), login social no HUB, 2FA.

**Como reverter.** Desativar o cliente no console derruba as sessões dele; os apps mantêm o login próprio durante a
transição.

## Adendo (25/10/2026): apps da família entram direto

Pedido do titular: funcionar como uma central de apps. Migration `0005_family_apps.sql`:

- `oauth_clients.trusted`: app da própria Absolute ZRO. O HUB registra o consentimento sozinho e devolve a pessoa ao
  app sem a tela "Permitir" (`prompt=consent` ainda força a tela). O acesso continua listado e removível em Perfil ›
  Apps com acesso. Só o console marca um app como da família.
- `products.sso_start_url`: endereço do app que já começa o "Entrar com Absolute ZRO" (`/api/zro/entrar`). O botão
  Abrir do HUB e dos projetos usa esse endereço; quem está logado no HUB chega ao app logado. Vazio = `external_url`.
- Clientes cadastrados (confidenciais, segredo só como sha256 no HUB e como env sensível no projeto Vercel do app):
  `sobedesce-web`, `nossom-web`, `synquei-web`, `tpeasy-web`, `carrodofreela-web`. Retorno sempre
  `https://<domínio do app>/api/zro/callback`.
