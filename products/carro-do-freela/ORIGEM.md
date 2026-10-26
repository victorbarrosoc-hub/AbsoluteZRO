# ORIGEM — Carro do Freela

Esta pasta é a **fonte oficial** do Carro do Freela desde 2026-10-25 (ADR 0013). Mudanças
entram por PR neste repositório; o repositório antigo fica arquivado, só para consulta do histórico.

| Campo | Valor |
| --- | --- |
| Veio de | https://github.com/victorbarrosoc-hub/carrodofreela-app |
| Commit | `5fc93a7f82f7c4674129513200e2d040351d26a8` (2026-10-19T23:41:16+00:00) |
| Subpasta | `app` |
| Licença | sem arquivo de licença; código proprietário do titular |
| Stack | HTML/JS sem dependências; build em Node (src/build.js); testes Playwright; Supabase (projeto do original) e Web3Forms |

## Não veio (segredo local ou artefato)

- `public/artifact.html`
- `public/fase-1-artifact.html`
- `public/fase-1.html`
- `public/fase-2-artifact.html`
- `public/fase-2.html`
- `public/fase-3-artifact.html`
- `public/fase-3.html`
- `public/fase-4-artifact.html`
- `public/fase-4.html`
- `public/fase-5-artifact.html`
- `public/fase-5.html`
- `public/fase-6-artifact.html`
- `public/fase-6.html`
- `public/index.html`
- `landing/index.html`

Todos são saída de build e embutiam as chaves do original. Também não vieram os arquivos da raiz do repositório antigo
(`index.html`, `fase1…6.html`, `m/`, ícones, `vercel.json`, `.vercelignore`): eram o que o `publicar.js` gerava para a
Vercel. Agora o build da Vercel gera o mesmo conjunto a partir desta pasta.

## O que mudou na vinda

- **Chaves fora do fonte.** O template tinha a chave anon do Supabase e a do Web3Forms escritas; a landing também. Agora
  há marcadores (`/*__SUPABASE_URL__*/`, `/*__SUPABASE_ANON_KEY__*/`, `/*__WEB3FORMS_KEY__*/`) e quem preenche é o build
  (`src/build.js`, `landing/gerar.js`), lendo o ambiente. Sem as variáveis, o build sai igual e o suporte e o convite
  caem na fila local, como já acontecia aberto do disco.
- **`src/publicar.js` aposentado.** Ele dava push no repositório antigo; agora só avisa e sai com erro.
- **`src/vercel-build.js`** gera o domínio em `.vercel/output` (Build Output API v3): os sete HTML anônimos, `m/`,
  ícones, manifest, `og.jpg`, as funções de `api/zro/` e as rotas com os mesmos cabeçalhos de antes e a CSP calculada
  do build. Mantém as travas do `publicar.js`: selo da lista fictícia, nome reduzido, zero telefone, tags da tela de
  início e mídia completa.
- **`src/seguranca.js`**: a origem do Supabase na CSP sai do ambiente; o hash dos scripts é tirado sem navegador
  (`scriptsDoHtml`, conferido contra o DOMParser na suíte `seguranca`); as rotas do domínio moram em `rotasVercel`.
- **Login único** (abaixo): `api/zro/`, botão na tela de entrar, `test/conta-zro.js` e `test/api/zro.test.js`.
- A mídia `home-intro` (e `@hd`) está em `src/midia/` no commit importado mas não estava no último envio ao domínio;
  o build novo copia os dois arquivos para `m/`. Nenhum HTML os usa.

## Vercel (projeto `carrodofreela-app`, domínio carrodofreela.com.br)

| Ajuste | Valor |
| --- | --- |
| Repositório | `victorbarrosoc-hub/AbsoluteZRO` |
| Root Directory | `products/carro-do-freela` |
| Framework Preset | Other |
| Build Command | `node src/vercel-build.js` (já no `vercel.json` da pasta) |
| Output Directory | nenhum: o build escreve `.vercel/output` (Build Output API) |
| Install Command | nada a instalar (o `vercel.json` só ecoa) |
| Ignored Build Step | `git diff --quiet HEAD^ HEAD -- .` (já no `vercel.json`) |
| Node | 22.x (as funções declaram `nodejs22.x`) |

### Variáveis de ambiente (só os nomes; valores ficam na Vercel, Production e Preview)

| Nome | Para quê | Sensível |
| --- | --- | --- |
| `CARRO_SUPABASE_URL` | origem do Supabase do convite (`https://<projeto>.supabase.co`); entra na CSP | não (vai no HTML) |
| `CARRO_SUPABASE_ANON_KEY` | chave anon do Supabase (insert-only) | não (vai no HTML), mas fora do fonte |
| `CARRO_WEB3FORMS_KEY` | access key do Web3Forms (suporte) | não (vai no HTML), mas fora do fonte |
| `ZRO_CLIENT_ID` | `carrodofreela-web` | não |
| `ZRO_CLIENT_SECRET` | segredo do cliente no HUB; também assina os cookies (HKDF) | **sim** |
| `ZRO_ISSUER` | opcional; padrão `https://absolutezro.vercel.app` | não |

Os valores atuais do Supabase e do Web3Forms são os que estavam no fonte do repositório antigo (projeto do Carro).
Trocar `ZRO_CLIENT_SECRET` derruba as sessões abertas (os cookies deixam de conferir), e é o comportamento certo.

## Login único (Absolute ZRO)

- Cliente confidencial `carrodofreela-web`, app da família (sem tela de permissão). Retornos cadastrados no HUB:
  `https://carrodofreela.com.br/api/zro/callback`, `https://www.carrodofreela.com.br/api/zro/callback` e
  `https://carrodofreela-app.vercel.app/api/zro/callback`. Endereço do Abrir do HUB (`sso_start_url`):
  `https://carrodofreela.com.br/api/zro/entrar`.
- `GET /api/zro/entrar?volta=/caminho[&criar=1]`: gera state, nonce e verificador PKCE, guarda os três num cookie `cdf_zro`
  assinado (HMAC, 10 min, httpOnly, Secure, SameSite=Lax, só em `/api/zro`) e leva ao HUB com
  `code_challenge_method=S256` e escopos `openid email profile org offline_access carro-do-freela.jobs`. Se o HUB
  responder `invalid_scope` (ainda sem a migration 0012), o callback refaz o pedido com `basico=1`, só com
  `openid email profile org`, e o login segue sem o envio de jobs. `volta` só aceita caminho do próprio site. Com
  `criar=1` (o "Criar conta" da tela) o HUB recebe `prompt=create` e cria a conta Absolute ZRO.
- `GET /api/zro/callback`: confere state (e o `iss` da resposta), troca o código com `client_secret_basic` + verificador,
  confere o id_token pela JWKS (ES256: assinatura, `iss`, `aud`, `exp`, `nonce`) e grava `cdf_sessao` (assinado, 30
  dias) com sub, nome, e-mail, organização e `zro_products` (relido a cada login). Volta para `volta?zro=entrou`; erro volta como `?zro=erro|recusado|expirou`.
  Quando o HUB concede o escopo de jobs, o refresh token (e o access token de 10 min) vai para `cdf_hub`: **cifrado**
  (AES-256-GCM, chave própria por HKDF do `ZRO_CLIENT_SECRET`), httpOnly, 30 dias, só em `/api/zro`.
- `GET /api/zro/eu`: JSON `{sub, nome, email, organizacao, produtos, liberado, hub}` ou 401, sempre `no-store`.
  `hub` = existe acesso guardado da mesma conta para levar jobs.
  `liberado` = `carro-do-freela` está em `zro_products`. Sessão antiga sem a lista dá 401 (entra de novo pelo HUB).
  Sem as variáveis do ZRO: 503.
- `POST /api/zro/sair`: apaga `cdf_sessao` e `cdf_hub` e revoga o refresh token no HUB (não encerra a sessão do HUB).
- `POST /api/zro/enviar` (26/out · 3): `{job, equipe}` do painel do job. Só da própria origem (Origin obrigatório), JSON
  até 64 KB, sessão liberada e `cdf_hub` da mesma conta. Monta `carro-do-freela.job/1` só com os campos do contrato
  (telefone e o resto do pedido ficam de fora) e `carro-do-freela.crew/1` com quem tem conta Absolute ZRO; usa o
  access token guardado ou troca o refresh (que roda: o novo volta no cookie em toda resposta) e chama
  `POST /api/v1/carro-do-freela/jobs` e `/jobs/crew` do HUB com Bearer. Responde `{projeto: {id, link, criado},
  equipe}` ou `{erro}`: `reconectar` (401, apaga o cookie), `plano`, `papel`, `email`, `organizacao`, `hub`.
  ⚠️ **Antes de ligar em produção**: a migration 0012 do HUB precisa estar aplicada (ela dá o escopo ao cliente
  `carrodofreela-web`) e quem já entrou precisa entrar de novo para o login guardar o acesso.
- Só respondem nos três domínios acima e em `localhost`/`127.0.0.1`; outro Host recebe 400.
- Na tela: "Continuar com Absolute ZRO" nasce escondido e só aparece quando `/api/zro/eu` responde 200 ou 401 num site
  servido (nunca em `file://`, iframe ou nas suítes). Com sessão, entra como o login do protótipo, com nome e e-mail da
  conta; o Sair do menu também apaga a sessão deste site.
- **Conta única (25/out · 2, regra do titular).** No domínio, "Entrar com Absolute ZRO" é a porta principal e "Criar
  conta" vira "Criar conta Absolute ZRO" (HUB com `prompt=create`). O Carro não cria conta própria: quem chega agora
  não vê o formulário de e-mail/senha nem o Google. Quem já tinha entrado neste aparelho (conta antiga, sem vínculo
  ZRO) continua vendo o formulário para entrar. Com sessão ZRO sem `carro-do-freela` em `zro_products`, a tela de
  entrar vira o aviso "Sua conta Absolute ZRO ainda não tem acesso ao Carro do Freela." + "Ver na Absolute ZRO"
  (`/ferramentas`) e nenhuma porta abre a conta. A landing e a lista de convite continuam abertas, sem conta.

## Como conferir

```bash
npm run build:fases && npm test   # bateria de navegador (precisa de Playwright/Chromium; CHROME=/caminho)
npm run test:api                  # login único contra uma Absolute ZRO falsa (só Node)
npm run build:vercel              # gera .vercel/output como a Vercel gera
npm run servir                    # serve .vercel/output com as mesmas rotas, em http://localhost:5180
node src/blindar.js .vercel/output/static   # prova a CSP do build num Chromium
```
