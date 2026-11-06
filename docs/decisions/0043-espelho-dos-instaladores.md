# ADR 0043 — Espelho dos instaladores em São Paulo

**Status:** aceita (06/11/2026, pedido do titular). Código pronto; o espelho só liga depois que o titular cria as chaves
S3 no Supabase e põe os três secrets no GitHub (passos no fim). Sem eles, tudo segue pelo GitHub, como antes.

## Contexto

O titular (Brasil, internet de 210 Mbps) baixava os instaladores (~220 MB, `.dmg` e `.exe`) a **5–64 KB/s**. Todos são
arquivos de Release no GitHub (`hub-desktop`, `sobedesce-versao-de-teste`, `synquei-app-desktop`,
`relay-versao-de-teste`, `maestro-versao-de-teste`, `tpeasy-versao-de-teste`, `carro-versao-de-teste`), servidos pelo
servidor de arquivos do GitHub (Fastly). O mesmo arquivo sai a 16 MB/s de um servidor nos EUA: o gargalo é a rota do
GitHub até o provedor brasileiro (provavelmente por IPv6), não a internet da pessoa. Isso pega a central (instalar e
atualizar todos os apps e ela mesma), as páginas `/baixar/...` e o aviso de versão de cada app.

## Decisão

1. **Espelho no Supabase Storage do AbsoluteZRO-SP** (`sa-east-1`, plano Pro: 100 GB de armazenamento e 250 GB de
   tráfego inclusos, sem custo a mais). Bucket `apps` (migração `0060`), **leitura pública e escrita só com as chaves
   S3** (sem policy em `storage.objects`). Um arquivo por build e por tag: `apps/<tag>/<arquivo>` mais o `versao.json`.
   Só o build atual fica (o passo apaga os antigos): ~450 MB por app, menos de 4 GB no total.
2. **Quem grava:** o job "versao" de cada workflow de app de computador (`hub-desktop`, `sobedesce-desktop`,
   `synquei-desktop`, `relay-desktop`, `maestro-desktop`, `tpeasy-desktop`, `carro-desktop`; não os apps não lançados
   AEON, Rift Motion e NOSSOM) roda `scripts/espelho-apps.mjs` depois de gerar o `versao.json`: baixa os dois instaladores
   do Release, confere o SHA-256 com o `versao.json`, sobe para o bucket (S3, assinatura v4, sem dependência), grava o
   campo `espelho` (a pasta pública, `https://<ref>.supabase.co/storage/v1/object/public/apps/<tag>`) no `versao.json`
   e só então ele sobe para o Release. Sem os secrets, o passo avisa e pula; se falhar, `continue-on-error` e o
   `versao.json` fica sem `espelho` (tudo pelo GitHub).
3. **Quem lê, sempre com o GitHub de reserva e o SHA-256 conferido:**
   - **HUB** (`apps/hub-web/lib/espelho.ts`): manda para o espelho só quando o `espelho` do `versao.json` tem a forma
     exata do bucket e o arquivo responde ao HEAD (2,5 s, guardado 10 min; "não" por 1 min) com o tamanho que o GitHub
     informa. `/baixar/hub/mac|windows` (inclusive `?build=N`) e `/baixar/app/<id>/mac|windows`: espelho por padrão.
     `/baixar/app/<id>/<arquivo exato>`: espelho só com `?origem=espelho`, porque a **central 1.4.3 recusa qualquer
     destino que não seja o GitHub** (`regras.downloadPermitido`) e falharia. `?origem=github` força o GitHub. O
     `versao.json` dos apps nunca vai para o espelho (é pequeno, e o aviso de versão de cada app continua igual).
   - **Central 1.4.4** (`apps/hub-desktop/desktop/baixador.cjs`): tenta `/baixar/app/<id>/<arquivo>?origem=espelho` e
     depois o mesmo sem `origem` (GitHub); ela mesma tenta `/baixar/hub/<sistema>?build=N` e depois `&origem=github`.
     Arquivo que não confere com o SHA-256 num endereço passa para o próximo; nada é instalado sem conferir.
     Download robusto: um pedido de 1 byte descobre se o servidor aceita Range, o tamanho e o endereço final; com Range,
     pedaços de 8 MB em até 6 conexões, gravados na posição certa; pedaço que cai ou para de andar (30 s) volta de onde
     parou; link assinado do GitHub vencido no meio (401/403/404/410) é renovado pelo endereço do HUB. Os pedaços vão
     direto ao endereço final pelo `https` do Node com **IPv4 primeiro** (rede só IPv6: tenta sem escolher a família) e
     `dns.setDefaultResultOrder('ipv4first')` no processo principal. A regra de destino ganhou o espelho:
     `https://<ref de 20 letras>.supabase.co/storage/v1/object/public/apps/<tag>/<arquivo>`, nada além.
   - **Apps** (SOBEDESCE, Synquei, Relay, Maestro, TPeasy, Carro do Freela): só leem o `versao.json` (alguns KB) para
     avisar "Atualizar na Absolute ZRO"; quem baixa é a central. Nada muda neles (e nenhum projeto Vercel de app recebe
     build por isso).

## Como a correção chega a quem já tem a central

A 1.4.3 se atualiza baixando `/baixar/hub/<sistema>?build=N` pelo `fetch` do Node (sem regra de destino, segue qualquer
redirecionamento). Com o HUB novo no ar e o espelho ligado, **a própria atualização para a 1.4.4 já vem de São Paulo**:
basta o deploy do HUB. Já as ferramentas que a 1.4.3 instala continuam pelo GitHub (ela não aceita o espelho) até a
pessoa estar na 1.4.4.

## Consequências

- Custo zero dentro da cota do Pro (armazenamento ~4 GB; tráfego: cada instalação ~220 MB, 250 GB/mês ≈ 1.100
  downloads antes de cobrar além). Se passar disso, o titular decide (o GitHub continua de reserva: basta tirar os
  secrets ou o `espelho` some no próximo build).
- O espelho é público como o Release já era: só instaladores e `versao.json`, sem segredo. O acesso por plano continua
  no HUB (`/baixar/app/...` confere antes de redirecionar), como era com o link público do GitHub.
- Não foi possível testar o upload de verdade sem as chaves: a assinatura S3 confere com os exemplos da documentação da
  AWS e o passo inteiro roda contra um S3 falso (`tests/integration/espelho-ci.test.ts`).

## Passos do titular (uma vez)

1. Supabase › projeto **AbsoluteZRO-SP** › Storage › **Settings**: "Global file size limit" em pelo menos **1 GB**
   (o padrão é 50 MB e barra o instalador).
2. Storage › **S3** (em painéis mais antigos: Project Settings › Storage › S3 Connection): deixar a conexão por S3
   ligada, copiar o **Endpoint** (`https://<ref>.storage.supabase.co/storage/v1/s3`; a região mostrada deve ser
   `sa-east-1`) e, em **S3 Access Keys › New access key**, criar uma chave ("GitHub Actions espelho"): copiar o
   **Access key ID** e o **Secret access key** (aparece uma vez só). Essa chave grava em todos os buckets do projeto:
   só nos secrets do GitHub, nunca em `.env`, chat ou issue.
3. GitHub › `victorbarrosoc-hub/AbsoluteZRO` › Settings › Secrets and variables › **Actions** › New repository secret:
   `SUPABASE_STORAGE_S3_ENDPOINT`, `SUPABASE_STORAGE_S3_ACCESS_KEY_ID`, `SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY`.
4. O bucket `apps` sai da migração `0060` no próximo deploy do HUB; se o deploy avisar falta de permissão, criar no
   painel: Storage › New bucket › `apps`, público, limite 1 GB, tipos `application/x-apple-diskimage`,
   `application/vnd.microsoft.portable-executable`, `application/x-msdownload`, `application/octet-stream`,
   `application/json`.
5. O próximo build de cada app (ou "Run workflow" no Actions) preenche o espelho. O passo "Espelho em São Paulo" do job
   de versão mostra o que subiu; sem os secrets, mostra o aviso de pulado.
