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
| **Ajustes** | Conta e sincronização, nome, sons, backup e instalação |

Visual claro com modo escuro automático; o TP é sempre escuro.

**Editor:** meta de duração (15 s a 3 min) com medidor, barra de marcações (`# bloco`, `[pausa]`, `**ênfase**`, `((nota que não aparece no TP))`) e favoritos.

**TP:** área calibrada arrastando as bordas, palavras por minuto, **rolar com a voz** (o texto anda enquanto você fala; só mede volume), espelho, linha de leitura com foco, contagem com bip opcional de sincronia, pinça para a letra, arrasto para voltar, ← → pulam de bloco no controle Bluetooth, tela sempre acesa.

## Entrar com Absolute ZRO

A conta do TPeasy é a mesma da Absolute ZRO (login único do HUB, ADR 0012). Os roteiros **continuam salvos só no
aparelho**: entrar mostra quem você é, mas não liga sincronização.

- **`api/zro/`** quatro funções da Vercel, só com módulos do Node (sem `package.json`, sem build):
  - `entrar` (GET, `?volta=/app/...`): cria state, nonce e PKCE S256 num cookie assinado de 10 min (`tp_zro_ida`,
    HttpOnly, Secure, SameSite=Lax, só em `/api/zro`) e manda para o HUB. O botão **Abrir** do HUB usa este endereço.
  - `callback` (GET): confere o state, troca o código com `client_secret_basic`, confere o id_token ES256 pela JWKS
    (iss, aud, exp, nonce) e grava o cookie `tp_zro` (30 dias, assinado) com sub, nome, e-mail, organização e produtos.
    Nenhum token do HUB chega ao navegador.
  - `eu` (GET): JSON com a pessoa, `401` sem sessão, `503` sem configuração. Sempre `no-store`.
  - `sair` (POST, só do próprio site): apaga `tp_zro`. A conta no HUB continua aberta.
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
  - `ZRO_ISSUER` (opcional) = `https://absolutezro.vercel.app`
- No HUB, o cliente `tpeasy-web` tem retorno `https://tpeasy.vercel.app/api/zro/callback` e endereço de entrada
  `https://tpeasy.vercel.app/api/zro/entrar`.

No app instalado no iPhone, a ida ao HUB pode abrir numa janela do Safari; ao voltar, o app pergunta de novo quem está
logado.

**Testes:** `node --test tests/*.test.mjs` (Absolute ZRO falsa local, chave P-256 gerada no teste). Rodam no CI em
`.github/workflows/tpeasy.yml` quando `products/tpeasy/**` muda.

## Conta e nuvem (sincronização, desligada)

O código da conta está pronto em `app/js/sync.js` (código por e-mail ou Google, roteiros e perfis com "o mais novo vence"). Para ligar:

1. Crie um projeto no Supabase e rode `supabase/migrations/0001_tpeasy_sync.sql`.
2. Em Authentication › Email Templates › Magic Link, inclua `{{ .Token }}` para o e-mail mandar o código de 6 dígitos.
3. (Opcional) Ative o Google em Authentication › Providers e adicione `https://tpeasy.vercel.app/app/` às URLs de redirecionamento.
4. Preencha `SUPABASE_URL` e `SUPABASE_KEY` (chave publicável) em `app/js/config.js`.

## Rodar local

```sh
python3 -m http.server 8080   # abra http://localhost:8080/app/ (sem as funções de /api)
node --test tests/*.test.mjs  # testes do login
```
