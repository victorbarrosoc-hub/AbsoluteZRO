# TPeasy

Teleprompter para iPhone que roda no Safari e se instala na Tela de Início (PWA). Sem build e sem dependências: é só servir a pasta.

- **`/`** site de apresentação (`index.html`, `site.css`). Quem abre pelo ícone instalado vai direto para o app.
- **`/app/`** o app, em módulos ES (`app/js/`).
- **`/sw.js`** modo offline do site e do app.
- **`/api/zro/`** "Entrar com Absolute ZRO" (funções da Vercel, sem dependências).
- **`supabase/migrations/`** tabelas da conta e da sincronização (com RLS).

## O app

Três abas, como no iOS:

| Aba | O que tem |
| --- | --- |
| **Roteiros** | Lista com ícones coloridos, filtros (Roteiros, Recentes, Favoritos), busca e botão de novo roteiro |
| **Teleprompter** | Perfis por TP, prévia ao vivo da área, botões Área e Ler, tamanho, velocidade, espelho e todos os ajustes |
| **Ajustes** | Conta (foto e nome da conta Absolute ZRO) e sincronização, nome (só sem conta), sons, backup, instalação e a família Absolute ZRO (ícone e nome de cada app) |

Visual claro com modo escuro automático; o TP é sempre escuro.

**Editor:** meta de duração (15 s a 3 min) com medidor, barra de marcações (`# bloco`, `[pausa]`, `**ênfase**`, `((nota que não aparece no TP))`) e favoritos.

**TP:** área calibrada arrastando as bordas, palavras por minuto, **rolar com a voz** (o texto anda enquanto você fala; só mede volume), espelho, linha de leitura com foco, contagem com bip opcional de sincronia, pinça para a letra, arrasto para voltar, ← → pulam de bloco no controle Bluetooth, tela sempre acesa.

## Entrar com Absolute ZRO

A conta do TPeasy é a mesma da Absolute ZRO (login único do HUB, ADR 0012). Os roteiros **continuam salvos só no
aparelho**: entrar mostra quem você é, mas não liga sincronização.

- **`api/zro/`** funções da Vercel, só com módulos do Node (sem `package.json`, sem build; a Z, o Set e a caixa de
  entrada dos roteiros do Maestro também passam por aqui):
  - `entrar` (GET, `?volta=/app/...`): cria state, nonce e PKCE S256 num cookie assinado de 10 min (`tp_zro_ida`,
    HttpOnly, Secure, SameSite=Lax, só em `/api/zro`) e manda para o HUB. O botão **Abrir** do HUB usa este endereço.
    Com `&criar=1` é o **Criar conta**: o HUB abre o cadastro (`prompt=create`) e volta já logado.
  - `callback` (GET): confere o state, troca o código com `client_secret_basic`, confere o id_token ES256 pela JWKS
    (iss, aud, exp, nonce) e grava o cookie `tp_zro` (30 dias, assinado) com sub, nome, e-mail, foto, `zro_conta`,
    organização e produtos. O access token e o refresh token (`offline_access`) vão **cifrados** (AES-256-GCM) em
    `tp_zro_hub`, só em `/api/zro`. O navegador nunca lê token.
  - `eu` (GET): JSON com a pessoa e `acesso` (`tpeasy` está em `zro_products`), `401` sem sessão, `503` sem
    configuração. Sempre `no-store`.
    A cada abertura (no máximo uma vez por minuto) relê o perfil em `/oauth/userinfo` (troca o refresh token, que roda,
    quando o access token venceu) e regrava os dois cookies. HUB fora do ar: vale a última cópia. Acesso removido no
    Perfil da Absolute ZRO: a sessão acaba.
  - `sair` (POST, só do próprio site): revoga o refresh token no HUB e apaga `tp_zro` e `tp_zro_hub`. A conta no HUB
    continua aberta.
- As chaves dos cookies saem de `ZRO_CLIENT_SECRET` por HKDF (uma por finalidade).
- Só aceita `tpeasy.vercel.app` e `localhost`/`127.0.0.1`; outro endereço (prévia da Vercel) vai para o site oficial
  antes de começar. `volta` só aceita caminho deste site; o resto vira `/app/`.
- Erros voltam como `?zro=recusado|expirou|erro|config`; o app mostra um aviso curto e limpa o endereço.
- Sem as funções (offline, `file://`, `python3 -m http.server`) a tela de Ajustes fica como antes.
- O service worker não guarda nada de `/api/`.

**Vercel (projeto `tpeasy`)**

- Root Directory: `products/tpeasy`. Framework: Other, sem comando de build.
- Variáveis (Production; marque o segredo como sensível):
  - `ZRO_CLIENT_ID` = `tpeasy-web`
  - `ZRO_CLIENT_SECRET` = segredo do cliente `tpeasy-web` no console do HUB
  - `ZRO_ISSUER` (opcional) = `https://absolutezro.com`
- No HUB, o cliente `tpeasy-web` tem retorno `https://tpeasy.vercel.app/api/zro/callback` e endereço de entrada
  `https://tpeasy.vercel.app/api/zro/entrar`.

No app instalado no iPhone, a ida ao HUB pode abrir numa janela do Safari; ao voltar, o app pergunta de novo quem está
logado.

**Testes:** `node --test tests/*.test.mjs` (Absolute ZRO falsa local, chave P-256 gerada no teste). Rodam no CI em
`.github/workflows/tpeasy.yml` quando `products/tpeasy/**` muda.

**Perfil único** (`docs/integration-contracts/perfil-unico.md` na raiz). Nome, e-mail e foto são os da conta Absolute
ZRO: Ajustes mostra a foto (sem foto, a inicial) e o nome da conta, e o botão **Editar na conta Absolute ZRO** abre
`zro_conta` fora do app (no app instalado, no Safari). Quem entrou com a Absolute ZRO não tem o "Nome" próprio do
TPeasy; sem conta, ele continua lá. Perfis de TP, roteiros, sons e backup continuam sendo do TPeasy.

**Conta única.** Conta nova nasce só na Absolute ZRO: em Ajustes ficam **Entrar com Absolute ZRO** e **Criar conta**.
O direito de uso vem do admin da Absolute ZRO: se a organização ativa não liberou o `tpeasy`, a pessoa entra, mas a
conta mostra "Sua conta Absolute ZRO ainda não tem acesso ao TPeasy." com o botão **Ver na Absolute ZRO**
(`/ferramentas`). O site e o teleprompter continuam abertos, com ou sem conta. A lista é reavaliada a cada entrada.

## Roteiros do Maestro (Criação F8)

O Maestro manda uma versão do roteiro **direto** para o TPeasy da pessoa ("Enviar ▾ › Para o TPeasy"). Como o TPeasy
não tem banco, a caixa de entrada fica na Absolute ZRO (migração `0040` do HUB; contrato em
`docs/integration-contracts/maestro-tpeasy.md` na raiz) e cada aparelho busca o que chegou:

- **`api/zro/entregas`** (GET `?desde=`, POST `{ ids }`): repassa para `/api/v1/apps/entregas/recebidas` com o token da
  sessão (escopo `tpeasy.roteiros`, pedido no login; HUB sem a 0040 recusa e o login refaz sem ele, `sem_roteiros=1`).
  Sem sessão ou token antigo: 401 e nada muda; o cofre não é apagado.
- **`app/js/maestro.js`**: busca ao abrir (depois do `/eu`), ao voltar para o app (no máximo uma vez por minuto) e ao
  voltar a rede; conta ao HUB o que gravou (o Maestro mostra "Recebido").
- **`app/js/entregas.js`** (puro): junta pelo `item` (`maestro-<roteiro>-<pessoa>`, o mesmo id do backup do Maestro).
  Versão nova atualiza o mesmo roteiro; se a pessoa mexeu no texto, a versão nova vira **cópia** ("· v4") e nada é
  sobrescrito; a mesma entrega duas vezes não muda nada; reenvio traz de volta o que foi apagado.
- Na lista, "Do Maestro · v3" com o ícone do Maestro; no editor, o selo abre o roteiro no Maestro; no menu, "Abrir no
  Maestro". Offline: o que já chegou fica no aparelho; o resto chega na próxima abertura com rede (até 30 dias).

Testes: `tests/entregas.test.mjs` e o bloco "roteiros do Maestro" em `tests/zro.test.mjs`.

## Conta e nuvem (sincronização, desligada)

O código está em `app/js/sync.js` (roteiros e perfis com "o mais novo vence"). O código por e-mail só serve para
**contas antigas** (`create_user: false`); o app não cria mais contas próprias nem entra pelo Google (o Google mora no
HUB). Para ligar:

1. Crie um projeto no Supabase e rode `supabase/migrations/0001_tpeasy_sync.sql`.
2. Em Authentication › Email Templates › Magic Link, inclua `{{ .Token }}` para o e-mail mandar o código de 6 dígitos.
3. Deixe desligado o cadastro novo (Authentication › Sign In / Providers › Allow new users to sign up).
4. Preencha `SUPABASE_URL` e `SUPABASE_KEY` (chave publicável) em `app/js/config.js`.

## Rodar local

```sh
python3 -m http.server 8080   # abra http://localhost:8080/app/ (sem as funções de /api)
node --test tests/*.test.mjs  # testes do login e do perfil único
```
