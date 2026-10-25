# TPeasy

Teleprompter para iPhone que roda no Safari e se instala na Tela de Início (PWA). Sem build e sem dependências: é só servir a pasta.

- **`/`** site de apresentação (`index.html`, `site.css`). Quem abre pelo ícone instalado vai direto para o app.
- **`/app/`** o app, em módulos ES (`app/js/`).
- **`/sw.js`** modo offline do site e do app.
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

## Conta e nuvem

O código da conta está pronto em `app/js/sync.js` (código por e-mail ou Google, roteiros e perfis com "o mais novo vence"). Para ligar:

1. Crie um projeto no Supabase e rode `supabase/migrations/0001_tpeasy_sync.sql`.
2. Em Authentication › Email Templates › Magic Link, inclua `{{ .Token }}` para o e-mail mandar o código de 6 dígitos.
3. (Opcional) Ative o Google em Authentication › Providers e adicione `https://tpeasy.vercel.app/app/` às URLs de redirecionamento.
4. Preencha `SUPABASE_URL` e `SUPABASE_KEY` (chave publicável) em `app/js/config.js`.

## Rodar local

```sh
python3 -m http.server 8080   # abra http://localhost:8080/app/
```
