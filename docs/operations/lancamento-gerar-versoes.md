# Lançamento: "Gerar versões com o Relay" e o SOBEDESCE 0.2.0

Decisão do titular (30/10/2026): "Publicar e lançar o app". O site e o Maestro vão com o botão escondido; o botão
aparece sozinho quando um computador da conta abre o SOBEDESCE 0.2.0, e o pedido para atualizar só aparece depois que
a 0.2.0 está no `/baixar`. Não há chave manual: a ordem dos deploys não importa.

## Como o botão decide

1. O app de computador 0.2.0 manda em todo pedido ao site `x-sobedesce-capacidades: relay`
   (`products/sobedesce/src/config.js` › `CAPACIDADES_DO_APP`, `src/google/cloud-auth.js`).
2. O site grava em `sessoes.capacidades` na hora em que muda (migração SOBEDESCE `0017_capacidades_do_computador`;
   `web/src/lib/auth/sessao.ts`). App antigo manda só o build: nenhuma capacidade.
3. `relay.pedido` (também com `ids: []`) devolve `computador.relay` (algum computador converte) e
   `computador.desatualizado` (só app antigo, e o instalador publicado já é 0.2.0+). `relay.converter` sem computador
   que converta: `409 sem_computador_relay`, nada na fila (`web/src/lib/zro/relay.ts`).
4. O Maestro pergunta ao abrir o card e mostra o botão só com `relay`; com `desatualizado`, "Atualize o SOBEDESCE no
   computador para gerar versões."; senão nada (`products/maestro/src/lib/relay/entregaveis.ts`, `gerarCom`).

## Passos (quem pode mesclar na main)

1. **Mesclar na main** o ramo `relay-lancamento` (atualizado com a main do momento). O push na main dispara, sem mais
   nada:
   - Vercel `sobedesce` (Root Directory `products/sobedesce/web`; o _Ignored Build Step_ deixa passar porque a pasta
     mudou): `vercel-build` = `db-migrate` (aplica a `0016_pedidos_relay` e a `0017_capacidades_do_computador` no
     schema `sobedesce`) → `copiar-do-neon` → `next build`.
   - Vercel `maestro`: `vercel-build` = `db-migrate` (aplica a `0033` e a `0034_entregaveis_relay`) → `next build`.
   - Vercel `absolutezro` (o HUB), se a pasta dele mudou (a `PONTES` com as `relay.*` já está na main).
   - GitHub Actions "SOBEDESCE · app de desktop" (`.github/workflows/sobedesce-desktop.yml`; `products/sobedesce/**`
     fora de `web/` mudou): testes → Mac e Windows (com o teste de fumaça) → instaladores
     `SOBEDESCE-0.2.0-b<N>-mac-universal.dmg` e `SOBEDESCE-0.2.0-b<N>-windows-setup.exe` no Release
     `sobedesce-versao-de-teste` → job "Avisar versão nova" sobe o `versao.json` (build, commit, SHA-256 e o nome de
     cada instalador) e apaga os builds antigos (ficam os três últimos). N = número da execução + 1000 (o último
     publicado em 30/10 foi o b1056, ainda 0.1.0).
2. **Não usar `workflow_dispatch` para lançar:** o job "Avisar versão nova" só roda em `push` na main; sem ele o
   `versao.json` continua no build antigo, os apps não avisam e o `/baixar` segue entregando a 0.1.0. Se o push não
   disparar o workflow, um commit na main que toque `products/sobedesce/` (fora de `web/` e de `.md`) resolve.
3. **Conferir o build:** Actions › "SOBEDESCE · app de desktop" › a execução do commit da mesclagem: os jobs
   "Testes do motor", "App (Mac)", "App (Windows)" e "Avisar versão nova" verdes (o Mac leva uns 20 a 40 min).
4. **Conferir o Release** `sobedesce-versao-de-teste`: os dois instaladores `0.2.0-b<N>` e o `versao.json` com
   `build: N`, o commit da mesclagem e `arquivoMac`/`arquivoWindows` apontando para eles.
5. **Conferir o site:** `GET https://sobedesce.absolutezro.com/baixar/versao` devolve o build N;
   `/baixar/mac` e `/baixar/windows` redirecionam para os arquivos `0.2.0-b<N>` (o site guarda 5 min).
6. **Conferir a atualização:** um app 0.1.0 aberto mostra "Nova versão do SOBEDESCE" (`src/version.js` lê
   `/baixar/versao`); "Atualizar" baixa e confere o SHA-256 do `versao.json` antes de instalar.
7. **Conferir o botão:** com a 0.2.0 aberta e logada, a sessão do computador fica com `capacidades = {relay}` (leitura
   no banco: `select app_build, capacidades from sobedesce.sessoes where tipo = 'dispositivo' order by ultimo_uso_em
desc limit 5`) e a ficha de um card com versão do Drive mostra "Gerar versões". Com só a 0.1.0 conectada: o pedido
   para atualizar no lugar do botão. Depois, um pedido de verdade: a versão aparece no Drive e o item fica "Pronto"
   com o MD5.
8. **Opcional, Release com nome:** a tag `sobedesce-v0.2.0` no commit da mesclagem gera os instaladores de novo e
   publica um Release próprio (job "Publicar release", notas automáticas; o texto de
   `products/sobedesce/docs/NOVIDADES.md` pode ir no corpo). Não muda o `versao.json` nem o `/baixar`: o aviso de
   versão nova sempre vem do `sobedesce-versao-de-teste`.

## Assinatura e segredos

- Mac: assinatura ad-hoc (`identity: "-"`, `notarize: false`, `hardenedRuntime: false` em
  `products/sobedesce/electron-builder.yml`). Nenhum segredo da Apple; o macOS pede "Abrir Mesmo Assim" na primeira
  vez, como hoje. Notarizar exige conta Apple Developer e os segredos (certificado e senha de app): decisão do titular.
- Windows: sem assinatura (o SmartScreen avisa, como hoje).
- Segredos do workflow: só `BRAW_SDK_CADASTRO` (o decodificador de Blackmagic RAW; sem ele o app sai sem o `.braw`) e
  o `github.token` automático. No site, `GITHUB_TOKEN` é opcional (o repositório é público).

## Se der errado

- Build vermelho: nada é publicado (o `versao.json` só sobe depois dos dois instaladores). O botão continua
  escondido.
- Voltar o site: _Instant Rollback_ no projeto `sobedesce`. As migrações `0016` e `0017` só acrescentam colunas e um
  índice; o site anterior ignora as duas.
- App 0.2.0 com problema: um commit novo na main gera outro build; quem voltar para a 0.1.0 perde o botão na hora
  (o site apaga a capacidade quando o app manda só o build).
