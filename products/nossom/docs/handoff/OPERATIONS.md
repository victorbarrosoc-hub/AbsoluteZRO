# Operação, configuração e continuidade

Este guia não contém credenciais e não prova a configuração atual dos painéis externos. Consulte o código e os serviços autenticados quando a tarefa exigir. O repositório é público.

## Desenvolvimento local

Node 24 e npm são a referência do CI; o projeto exige Node >=22.9. Use os lockfiles, sem atualizar dependências indiscriminadamente.

```sh
npm ci
cp .env.example .env.local
# Preencha somente as integrações necessárias, fora do Git.
npm run dev
```

Login real/local de desenvolvimento precisa de um projeto Supabase configurado. Para testes de interface, use o servidor simulado do Playwright em vez de criar usuários na produção.

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
# Com Docker disponível:
npm run test:quota
```

`predev`/`prebuild` preparam FFmpeg, RNNoise e DeepFilterNet a partir das dependências instaladas. `public/ffmpeg/`, `public/audio/`, `.next/`, `artifacts/` e `test-results/` são gerados/ignorados. A ausência deles num clone limpo é esperada.

O Playwright inicia seu próprio servidor Next e o double Supabase em portas 3000/55440; não inicie simultaneamente outro servidor ou duas suítes nessas portas. `CHROMIUM_PATH` é opcional. Os testes não substituem homologação em Safari/iPhone ou Mac/Windows físicos. Use ambiente de teste sem chaves de produção: o servidor local simulado e os mocks não são autorização para contatar serviços pagos.

## Variáveis por serviço

Os nomes abaixo são os contratos atuais. `.env.example` é o modelo. Não publique valores em docs, tickets, prompts, screenshots ou logs.

| Local                | Variável                                                                                      | Uso                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Vercel/backend       | `SUPABASE_URL`                                                                                | URL do projeto Supabase                                                                                       |
| Vercel/backend       | `SUPABASE_ANON_KEY`                                                                           | Chave anon/publishable para Auth; aliases aceitos em `lib/server/supabase.ts`                                 |
| Vercel/backend       | `SUPABASE_SERVICE_ROLE_KEY`                                                                   | Jobs, Storage privado e tarefas administrativas autorizadas; nunca pública                                    |
| Vercel/backend       | `NOSSOM_AUTH_SECRET`                                                                          | Criptografia/vínculo das sessões; preserve a existente                                                        |
| Vercel/backend       | `NOSSOM_AI_ACCESS_CODE`                                                                       | Fallback privado legado para o segredo; não é código pedido aos usuários                                      |
| Vercel/backend       | `ANTHROPIC_API_KEY`                                                                           | Integração da plataforma, separada do login do Claude Code                                                    |
| Vercel/backend       | `ANTHROPIC_MODEL`                                                                             | Código atual usa `claude-sonnet-5-5`; confirme disponibilidade/capacidades, não troque às cegas               |
| Vercel/backend       | `ANTHROPIC_AGENT_ID`, `ANTHROPIC_ENVIRONMENT_ID`                                              | Overrides opcionais da conexão Managed Agents; não usar IDs fictícios                                         |
| Vercel/backend       | `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`                                                        | Autorização e ID do endpoint **Serverless Queue**, não ID de Pod                                              |
| Vercel/backend       | `STRIPE_SECRET_KEY`                                                                           | Chave secreta (ou restrita) da Stripe para Checkout, portal e leitura de assinaturas                          |
| Vercel/backend       | `STRIPE_WEBHOOK_SECRET`                                                                       | Segredo de assinatura do webhook `/api/subscription/webhook` (`whsec_…`)                                      |
| Vercel/backend       | `ZRO_CLIENT_ID`, `ZRO_CLIENT_SECRET`, `ZRO_ISSUER` (opcional)                                 | "Continuar com Absolute ZRO"; sem as duas primeiras o botão não aparece. Veja [zro-login.md](../zro-login.md) |
| Vercel/backend       | `CRON_SECRET`                                                                                 | Autoriza limpeza de cópias temporárias; valor forte e privado                                                 |
| Vercel/build público | `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`                                                             | ID público opcional do agente de voz; não colocar API key aqui                                                |
| Vercel/build         | `NOSSOM_DOWNLOAD_MAC_ARM64_URL`, `NOSSOM_DOWNLOAD_MAC_X64_URL`, `NOSSOM_DOWNLOAD_WINDOWS_URL` | Overrides HTTPS dos instaladores publicados                                                                   |
| RunPod/worker        | `NOSSOM_STORAGE_ORIGIN`                                                                       | Origin Supabase autorizada para URLs assinadas, sem caminho nem chave                                         |
| Worker opcional      | `NOSSOM_VOCALS_MODEL`                                                                         | Caminho do checkpoint fixo no disco; normalmente deixar padrão do build                                       |
| Vercel automático    | `VERCEL_GIT_COMMIT_SHA`                                                                       | Identifica o deploy; não é segredo nem versão do instalador                                                   |

Nunca mover service role, chave Anthropic/RunPod, segredo de sessão ou certificado para `NEXT_PUBLIC_`. Alterar `NOSSOM_AUTH_SECRET` invalida sessões. Um clone do Git não transfere configurações da Vercel, do Supabase, do RunPod ou os certificados GitHub Actions.

Use os painéis/gerenciadores de segredos e autenticação oficial das CLIs para obter acesso. O novo agente não deve pedir que o titular cole chaves na conversa. Não é necessário um token Vercel extra para a integração Git existente publicar `main`.

## Supabase e migrações

A infraestrutura existente já é usada pelo produto. **Não rode reset nem reaplique SQL em produção só porque o agente mudou.** Verifique primeiro o schema e o histórico de migrações.

Para um projeto novo, a ordem é:

1. `supabase/migrations/202610220001_accounts_and_weekly_usage.sql` — base Auth/cota.
2. `supabase/migrations/202610230001_cloud_restoration.sql` — jobs/bucket privado.
3. `supabase/migrations/202610230002_plans_and_admin.sql` — planos/minutos mensais/ADM.
4. `supabase/migrations/202610240001_ai_allowance_and_orphan_sweep.sql` — limite diário de 40 conversas novas do assistente por conta (ADM sem limite), varredura diária de objetos de jobs liberados/falhos nos últimos 3 dias e no máximo 40 envios GPU por conta em 24 h. O app tolera a ausência dessa migração (mantém o limite por instância e pula a varredura); aplique-a para ativar as proteções.

5. `supabase/migrations/202610250001_stripe_subscriptions.sql` — assinaturas Stripe: tabela privada e `nossom_subscription`, executável só pela `service_role`. Aplique antes de configurar as variáveis da Stripe.

`public/setup/cloud-restoration.sql` combina as migrações 2 e 3; depende da base. A migração inicial se chama semanal por motivo histórico, mas a aplicação atual usa planos **mensais**. Não implementar de novo 10 tratamentos por semana.

Configure redirects Auth para o domínio de produção e `/auth/confirm`; confirme o e-mail ADM conforme as regras do servidor/SQL. Não conceda ADM por metadata ou parâmetro do cliente. Detalhes em [supabase-setup.md](../supabase-setup.md).

## Deploy web e verificação pública

A integração GitHub–Vercel acompanha `main`. Alterações autorizadas são publicadas pelo Git. Confira o diff, a branch, os checks e a configuração antes de enviar. Não use force push para contornar divergências.

- Configuração: `vercel.json`, `next.config.ts`, `package.json` e lockfile.
- Instalação/build: `npm ci` / `npm run build`.
- Após configurar uma variável no painel, pode ser necessário redeploy; variáveis públicas/build e links de instalador são incorporados no build.
- `/api/desktop/version` responde `{ "release": "SHA_DO_DEPLOY" }`, sem cache. Compare com o commit esperado.
- Verifique também a página, os assets, o Open Graph e o fluxo afetado; status Ready não comprova processamento GPU.

Os links de instalação, ícones e imagem social precisam responder sem autenticação. Não habilite download antes de existir o asset real. Redes sociais podem manter cache antigo de Open Graph mesmo com o site correto.

## RunPod Serverless

O worker é uma imagem Docker externa à Vercel. O workflow manual `.github/workflows/nossom-restoration.yml` (na raiz do repositório AbsoluteZRO) publica tag imutável `ghcr.io/victorbarrosoc-hub/absolutezro-nossom-worker:<SHA>`. O pacote antigo `nossom-restoration` pertence ao repositório `nossom` arquivado e recusa escrita deste repositório (`permission_denied: write_package`, 29/10/2026); por isso o nome novo. A alternativa usada pelo titular é Deploy from GitHub/Dockerfile na RunPod; confirme o mecanismo realmente conectado no painel. O repositório é público; o pacote GHCR tem configuração de acesso própria.

Configuração de referência: Queue/Serverless Flex, mínimo 0, máximo 1, concorrência 1 por worker, idle timeout de 15 s. **Isso é orientação, não prova dos valores atuais.** Não aumente workers nem deixe GPU ativa permanentemente para mascarar um problema de startup.

`NOSSOM_STORAGE_ORIGIN` ausente/incorreta pode encerrar o worker antes de processar. O valor precisa corresponder à origem do Supabase usado pelo backend. Não colocar chaves administrativas no container. Pesos são preparados na construção; não baixar um modelo arbitrário por pedido.

A imagem de referência que passou no build da separação foi `ghcr.io/victorbarrosoc-hub/nossom-restoration:9c3822607ca9aad9e5cad84faa2cc33d6ba800cf`. É uma evidência de build, não uma ordem para trocar o endpoint por essa tag nem prova do que está rodando hoje.

O build inclui Resemble Enhance D e HTDemucs. A separação musical exige que o endpoint tenha concluído e esteja executando uma imagem com esse código; atualizar apenas a Vercel não atualiza necessariamente um worker configurado por tag fixa. Nenhuma migração nova é exigida apenas para `vocals`.

### Diagnóstico sem duplicar trabalhos

Faça login como ADM e consulte `/api/audio/jobs?diagnostic=1`. Esse endpoint é autenticado, limitado e não deve expor segredos. Não remova a proteção para facilitar suporte.

| Observação                              | Interpretação e próximo passo                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `configured:false`                      | Verificar variáveis e migrações; não iniciar outra GPU                                                              |
| Provedor 404                            | Conferir Endpoint ID na Vercel e acesso da chave; não usar Pod ID                                                   |
| `initializing`                          | Worker está iniciando/carregando; acompanhar logs e tempo real                                                      |
| `throttled`                             | Capacidade/seleção de GPU pode estar indisponível; consultar painel                                                 |
| `unhealthy` / exit                      | Ler **worker logs de startup**, imagem, comando e origin; reiniciar repetidamente não corrige configuração quebrada |
| `Ready` / idle / zero execuções         | Pode ser endpoint saudável sem trabalho; não comprova que o áudio foi tratado                                       |
| App `queued` + `dispatchConfirmed:true` | Há ID de provedor confirmado; consultar status do mesmo job                                                         |
| `requestStateUnavailable:true`          | Reconciliação incompleta; não supor cancelamento nem repetir submit                                                 |

Nunca crie um segundo job nem devolva minutos manualmente enquanto a execução anterior estiver ambígua. Cancele e confirme o estado pelo fluxo existente; preserve a recuperação do resultado e o projeto original.

### Cobrança

Serverless pode cobrar inicialização, execução e período ativo/idle conforme o tipo de worker e o plano; armazenamento e outros recursos podem ser cobrados separadamente. Mínimo zero permite escala a zero, mas não garante valor zero imediatamente. Pods manuais são independentes e não são desligados pelo endpoint Serverless. Conferir valores/consumo no painel é necessário para afirmar custo atual.

O painel ADM consulta saldo/consumo por hora RunPod quando a chave tem permissão. Claude retorna saldo indisponível pela integração atual. Não substituir essa ausência por um número estimado apresentado como crédito real.

### Assinaturas (Stripe)

Os planos pagos ficam à venda só quando `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` estão definidos; antes disso, o site mostra "Solicitar ativação" e a ativação é manual. Para ligar:

1. Aplicar `202610250001_stripe_subscriptions.sql` no Supabase.
2. Na Stripe, em modo de teste primeiro: salvar a configuração do **portal do cliente** (cancelamento no fim do período, atualização de cartão e faturas).
3. Criar o webhook para `https://<domínio>/api/subscription/webhook` com os eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.
4. Colocar a chave secreta e o segredo do webhook na Vercel (Production) e publicar de novo.
5. Assinar com um cartão de teste, conferir o plano em **Meu plano** (`/studio/planos`, também no menu lateral, no cartão de minutos e no menu da conta), cancelar pelo portal e só então trocar para as chaves de produção (com um webhook de produção próprio).

Os produtos `nossom_essential` e `nossom_studio` são criados na primeira compra; o valor cobrado é o do catálogo do painel ADM. Trocar de plano cobra a diferença na hora e só vale se o cartão aprovar. A franquia continua renovando no dia 1; a assinatura define até quando o plano vale (fim do período pago + 3 dias de tolerância para novas tentativas da Stripe).

## Desktop, PWA e ícones

O Electron carrega o estúdio online; seus projetos ficam no perfil próprio do app. A PWA é instalada pelo navegador, sem cache offline/service worker. Login compartilhado significa a mesma conta/backend, não transferência dos Blobs locais.

Release de referência: `desktop-v0.2.2`, prévia no repositório antigo `victorbarrosoc-hub/nossom` (arquivado e privado), com DMGs arm64/x64 e EXE Windows x64. Releases novas saem no repositório AbsoluteZRO (privado) com a tag `nossom-v<versão>`. Nenhuma página aponta para o github.com: `/apps` (e o HUB) usam `/baixar/mac-arm64`, `/baixar/mac-x64` e `/baixar/windows` (`app/baixar/[arquivo]/route.ts`, `lib/desktop-releases.ts`). A rota lê o Release pela API do GitHub com `GITHUB_TOKEN` — primeiro `nossom-v<versão de desktop/package.json>` no AbsoluteZRO, depois a reserva `desktop-v0.2.2` — e redireciona (302) para o endereço assinado e temporário do arquivo; o arquivo não passa pela Vercel. Sem token, usa o link normal (só serve com repositório público). Sem instalador, volta para `/apps?baixar=indisponivel`, que mostra um aviso. `/baixar/diag` diz o motivo (sem token, token recusado, sem acesso, Release ausente) sem mostrar o token. **Variável obrigatória no projeto Vercel `nossom`:** `GITHUB_TOKEN` = token fino do GitHub, só leitura de Contents, com acesso a AbsoluteZRO e nossom (detalhes em `docs/operations/downloads-privados.md` na raiz). Os overrides `NOSSOM_DOWNLOAD_*_URL` têm prioridade. Ícones: `public/pwa/` e `scripts/generate-brand-assets.tsx`.

Reabra/atualize o app para receber a interface online quando estiver sem trabalho pendente. O polling de `/api/desktop/version` espera trabalho terminar, 30 s de inatividade, campos sem foco e diálogos fechados antes de recarregar. O novo ícone nativo só chega com um instalador que o contenha.

Não sobrescreva binários já publicados. Incremente `desktop/package.json` **e** `desktop/package-lock.json`; gere uma nova release e valide os três arquivos antes de apontar os downloads para ela.

Workflow manual **NOSSOM · instaladores desktop** (`.github/workflows/nossom-desktop.yml` na raiz):

- Prévia: `platform=all`, `publish_preview=true`, `publish_signed=false`.
- Canal assinado futuro: nova versão maior que a prévia instalada, `platform=all`, `publish_signed=true`, `publish_preview=false`; requer certificados e notarização reais. Prévia e assinada usam a mesma tag `nossom-v<versão>`, então cada versão é uma ou outra. O feed fica na release fixa `nossom-atualizacoes` (o "latest" do monorepo pode ser de outra plataforma) e o app o lê por `https://nossom-teal.vercel.app/baixar/atualizacoes/<arquivo>` (`app/baixar/atualizacoes/[arquivo]/route.ts`), que redireciona para o endereço assinado: com o repositório privado, o app não consegue ler o GitHub direto.

Segredos GitHub para distribuição assinada: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`; variável `NOSSOM_WINDOWS_PUBLISHER`. Overrides de feed: `NOSSOM_UPDATE_BASE_URL` e `NOSSOM_UPDATE_FLAT_FEED`. Nunca envie esses valores ao renderer/chat/Git.

O titular ainda não tem Apple Developer pago. A prévia Mac é ad-hoc, sem notarização; o updater nativo está desabilitado. Não resolver isso desativando assinatura/validação do atualizador ou a proteção global do sistema. Instruções limitadas ao app de origem confiável estão em `/apps`.

Mais detalhes: [desktop/README.md](../../desktop/README.md).

## Pendências reais e próxima ação

1. Confirmar a imagem/configuração atual do endpoint e homologar uma música real com `vocals`: estéreo, duração, qualidade, recuperação, cancelamento e cota.
2. Conferir cold start e retorno dos workers a zero numa execução real autorizada; não deduzir isso de mocks.
3. Obter certificados/Apple Developer e homologar a primeira atualização nativa entre dois builds assinados, quando o titular decidir distribuir dessa forma.
4. Homologar Safari/iPhone e instaladores em equipamentos físicos; runners e viewport em Chromium não substituem isso.
5. Manter os testes, a documentação e as versões de download consistentes com cada mudança.

Não há mudança funcional adicional aprovada apenas por este handoff. O próximo agente deve pedir o objetivo seguinte, não inventar um redesign ou reprovisionamento.
