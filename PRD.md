# ABSOLUTE ZRO

## Documento mestre de produto, arquitetura e execução para Claude Code

> *Cabeçalho do documento original:* ABSOLUTE ZRO / PRODUCT & ENGINEERING BLUEPRINT
> *Rodapé do documento original:* CONFIDENCIAL • DOCUMENTO DE IMPLEMENTAÇÃO
>
> *Nota de conversão:* este arquivo é a conversão integral de `ABSOLUTE_ZRO_MASTER_PRD_CLAUDE_CODE.docx` (versão 1.0) para Markdown, feita em 2026-10-25. O texto foi preservado; só a formatação mudou (títulos em Markdown, árvore de pastas em bloco de código e numeração das listas das seções 6.2 e 15 reiniciada em 1, já que no .docx ela continuava a contagem da lista anterior). É a referência principal da implementação.

**Versão:** 1.0 • **Status:** especificação inicial para implementação •
**Idioma de implementação:** português para UI, documentação técnica
conforme padrão do projeto.

> INSTRUÇÃO OPERACIONAL AO CLAUDE CODE: Este documento descreve o que
> construir em um repositório NOVO, INDEPENDENTE, para a marca Absolute
> ZRO. Os aplicativos existentes são fontes de leitura e, quando
> permitido, de cópia controlada, nunca destinos de edição. Não alterar,
> refatorar, migrar, instalar dependências, executar SQL destrutivo,
> mudar variáveis de ambiente, configuração, autenticação, projetos
> Supabase ou deployments dos repositórios originais. Não implantar em
> produção ou publicar na Vercel sem autorização explícita do
> proprietário. Realizar o máximo de trabalho possível no novo
> repositório, documentando o que depende de acesso, dados ou decisão do
> proprietário.

## 1. VISÃO EXECUTIVA

**Absolute ZRO** é o ecossistema unificado de tecnologia audiovisual que
conecta a contratação de trabalho à preparação, captação, ingest,
backup, organização, sincronização, decupagem, edição, tratamento de
áudio, color grading, exportação e entrega. As marcas existentes
preservam identidade e continuidade operacional. O novo **Absolute ZRO
HUB** funciona como portal, camada transversal de projeto, identidade,
permissões, faturamento, orquestração e interoperabilidade.

**Promessa:** “Da oportunidade à entrega. Um só fluxo.”

**Conceito de assinatura completa:** **Ciclo do O**. Assinantes do plano
completo têm acesso aos módulos incluídos no pacote, sujeito a limites
claros de uso, infraestrutura e serviços terceiros. Um usuário pode
contratar apenas uma ferramenta e entrar pelo mesmo login, mas só acessa
funcionalidades autorizadas.

**Princípios inegociáveis:**

1.  Repositório novo; originais intocados.

2.  Um login Absolute ZRO; acesso estritamente por produto, organização,
    papel e assinatura.

3.  Aplicativos independentes podem continuar operando nos seus
    ambientes existentes.

4.  Integrações por contratos claros, adaptadores e eventos, nunca
    acoplamento cego de bases de dados.

5.  Usuário escolhe entradas e saídas: a sequência do fluxo é sugerida,
    não obrigatória.

6.  Dados, permissões e limites validados no backend, não apenas
    escondidos na interface.

7.  Arquivos-fonte imutáveis por padrão; outputs derivados com histórico
    e reversibilidade.

8.  IA assiste e sugere; operações destrutivas/publicação exigem
    confirmação e trilha de auditoria.

## 2. ESCOPO DAS MARCAS E EXPERIÊNCIA

| Marca                       | Papel no fluxo                                        | Entradas                                                            | Saídas                                                              |
|-----------------------------|-------------------------------------------------------|---------------------------------------------------------------------|---------------------------------------------------------------------|
| Carro do Freela             | Comunidade, oportunidades e contratação               | Oportunidade, briefing, equipe, datas                               | Job, projeto, referências, checklist                                |
| TPeasy                      | Roteiro e suporte à captação                          | Briefing/roteiro opcional                                           | Roteiro versionado, plano de gravação, metadados                    |
| SOBEDESCE                   | Ingest, cópia e backup em mídia física e nuvem        | Arquivos brutos, destinos, regras de cópia                          | Manifest de arquivos, checksums, destinos, relatório de integridade |
| Synquei                     | Organização, alinhamento e sincronização              | Manifest SOBEDESCE ou import manual, mídias e áudio                 | Pastas, logs, metadados, sync maps, projeto de edição               |
| AI Edit — nome provisório   | Decupagem, seleção e montagem assistida               | Mídias, transcrições, brief, referências e presets de linguagem     | Decupagem, selects, markers, edição preliminar/timeline editável    |
| NOSSOM                      | Tratamento sonoro e SFX                               | Sequência/timeline, áudio, marcações da edição e bancos autorizados | Sugestões de efeitos, áudio limpo, mix, master e relatórios         |
| Revela (ex-Finishing)       | GMA/Media Manager, color grading assistido e entregas | Timeline aprovada, mídia vinculada, perfis de destino               | Master, versões, QC e pacotes de entrega                            |

**Importante:** AI Edit e Finishing **ainda não existem**. São espaços
de produto, com interfaces e contratos iniciais e implementação
progressiva; não fingir motores de IA ou grading prontos. O Carro do
Freela, TPeasy, SOBEDESCE, Synquei e NOSSOM só poderão ter recursos
reaproveitados conforme código realmente disponível e licenças
verificadas.

## 3. ARQUITETURA DE MARCA E POSICIONAMENTO

Absolute ZRO é a marca-mãe institucional e de conta. Produtos possuem
marcas e experiências específicas, porém compartilhando padrões de
navegação, conta, centro de projetos e autorização no HUB. Assinatura
sutil nos produtos: “An Absolute ZRO Company” ou “Powered by Absolute
ZRO”, sujeita à aprovação de branding.

**Ciclo do O:** metáfora visual de fluxo contínuo, com marcos ao redor
da letra O; cada plataforma ocupa uma etapa, mas o usuário pode iniciar
em qualquer uma. Evitar representar o processo como sequência forçada.

**Tom da interface:** premium, claro, tecnológico, minimalista e humano,
inspirado em experiências de produtos bem acabadas, mas sem copiar
interfaces/marcas de terceiros. Marca central em preto/branco/cinza;
produtos preservam paletas e logos próprias. Usar a arte oficial ZRO
somente se fornecida ou presente nos arquivos autorizados; nunca
inventar uma substituta e apresentá-la como oficial.

## 4. MODELO DE PRODUTO: HUB TRANSVERSAL

### 4.1 Navegação principal

- Início: projetos recentes, próximos passos, atividades, alertas,
  consumo do plano, atalhos das ferramentas autorizadas.

- Meus Projetos: lista, filtros, status, participantes, versões,
  arquivos e conexões entre etapas.

- Ciclo do O: mapa visual de etapas e cartões com status real (não
  simulado), próximas ações e abrir cada ferramenta.

- Ferramentas: catálogo de todas as marcas, separando
  **Contratadas**, **Disponíveis para contratar** e **Em
  desenvolvimento**.

- Arquivos: visão unificada de manifests e localizações; nunca afirmar
  que hospedamos mídia não importada/conectada.

- Atividades: jobs, processamento, filas, alertas, pendências e
  auditoria acessível ao usuário.

- Equipe: organizações, membros, convites, papéis e permissões.

- Assinatura e consumo: produtos habilitados, limites, uso, faturas e
  upgrade.

- Perfil e segurança: conta, dispositivos, sessões, 2FA se suportado,
  dados pessoais e integrações.

- Administração: console isolado de suporte/planos/produtos, protegido
  por papéis privilegiados.

### 4.2 Página de projeto

Cabeçalho: nome, cliente, tipo de produção, responsável, equipe, status,
data de criação, origem, links de referência e próximos passos. Seções:
Visão geral; Briefing/Roteiro; Mídias & Backups; Organização & Sync;
Decupagem & Edição; Som; Finalização & Entregas; Atividades e Auditoria.

Cada etapa deve suportar estados: não iniciado / aguardando material /
pronto / em processamento / requer revisão / concluído / falhou /
bloqueado por assinatura / indisponível. Exibir origem dos dados, última
sincronização e ação segura de repetir.

### 4.3 Experiência de assinatura

Todos criam conta Absolute ZRO, mas possuir conta **não concede** acesso
universal. O catálogo apresenta produtos não contratados com prévia e
convite para upgrade, sem expor seus dados ou executar suas APIs.
Contratos individuais podem ser combinados com plano completo. O plano
total **Ciclo do O** libera as ferramentas incluídas, incluindo futuras
ferramentas apenas depois de lançadas e incorporadas contratualmente ao
plano. Cobrança por usuário, organização, armazenamento, processamento
ou créditos deve ser parametrizável, não presumida.

## 5. AUTENTICAÇÃO ÚNICA (SSO) E SEGURANÇA

**Objetivo:** conta central Absolute ZRO, login único no HUB e,
futuramente, passagem segura para os produtos copiados ou integrados.
Não substituir a autenticação dos aplicativos originais à força.

### 5.1 Entidades e modelo de acesso

- `users`: identidade global (UUID, e-mail normalizado, verificação,
  perfil, status).

- `organizations`: pessoa/equipe/empresa, dono e status.

- `memberships`: usuário x organização x papel (owner, admin, manager,
  editor, viewer, billing), com escopo real de projeto quando
  necessário.

- `products`: catálogo e disponibilidade (`active`, `beta`,
  `coming_soon`, `disabled`).

- `plans`: catálogo versionado de ofertas; `plan_products` vincula
  plano aos produtos incluídos.

- `subscriptions`: organização/usuário titular, plano, período,
  status, provedor externo, cancelamento.

- `entitlements`: permissões efetivas por produto/feature, períodos e
  origem (assinatura, trial, concessão administrativa).

- `quotas` e `usage_events`: limites de execução, armazenamento,
  membros e créditos com contabilização idempotente.

- `projects`, `project_members`, `project_steps`,
  `project_assets`, `asset_locations`, `asset_checksums`,
  `integration_links`, `workflow_runs`, `workflow_events`,
  `audit_logs`.

### 5.2 Regras de autorização

Verificar em servidor, **em toda operação relevante**, na ordem:
identidade autenticada → organização ativa → membership e papel → acesso
ao projeto → entitlement válido → feature habilitada → quota disponível
→ autorização sobre recurso externo. Nunca confiar em productId,
organizationId ou role enviados pelo cliente. UI oculta botões conforme
entitlement, mas a API deve negar acesso mesmo por chamada direta.
Revogação/cancelamento interrompe novos jobs pagos, preservando regras
de acesso/exportação de dados previamente definida; jobs em execução
seguem política explícita.

Implementar RLS se Supabase/Postgres for adotado, com testes de
isolamento entre organizações. Segredos e chaves de serviço apenas no
servidor. Sessões de curta duração, tokens de escopo reduzido,
rotação/revogação, proteção CSRF quando aplicável, validação de
webhooks, logs com informações pessoais minimizadas. Não utilizar tokens
compartilhados ou reutilizar secrets dos apps originais.

### 5.3 Estratégia de SSO entre apps

**Fase 1:** autenticação real e consistente no HUB; experiências
transversais nativas; abertura de produto externo através de link
seguro, com login independente quando o produto original não suportar
SSO.

**Fase 2:** cópias/adaptadores no novo repositório passam a aceitar
identidade central via padrões OIDC/OAuth2, tokens curtos e audiência
definida; de preferência Authorization Code + PKCE em clientes
apropriados.

**Fase 3:** SSO federado com aplicativos externos **somente mediante
aprovação para alterações em cada original**. Enquanto isso, não
prometer login universal dentro dos originais.

## 6. ESTRATÉGIA DE REPOSITÓRIO E NÃO INTERFERÊNCIA

### 6.1 Repositório alvo

Criar absolute-zro-hub (nome sugerido; se indisponível, usar variação
aprovada) sob a conta/organização autorizada. Monorepo sugerido:

```text
absolute-zro-hub/
  apps/
    hub-web/            # Portal central
    admin-console/      # Administração protegida
    worker/             # Orquestração assíncrona
  packages/
    ui/                 # Design system compartilhado
    auth/               # Identidade, sessão, entitlement
    core/               # Projetos, eventos, domínio
    integrations/       # Adaptadores dos produtos
    media-contracts/    # Manifest, timeline, schemas
    billing/            # Catálogo, planos, quotas
    observability/      # Logs, telemetria, auditoria
  products/
    carro-do-freela/    # Somente cópia autorizada
    tpeasy/             # Somente cópia autorizada
    sobedesce/          # Somente cópia autorizada
    synquei/            # Somente cópia autorizada
    nossom/             # Somente cópia autorizada
    ai-edit/            # Scaffold de produto futuro
    finishing/          # Scaffold de produto futuro
  docs/
    architecture/
    integration-contracts/
    decisions/
    runbooks/
  infra/
    migrations/         # Apenas banco NOVO
    policies/
  .env.example          # Sem credenciais reais
  README.md
  CLAUDE.md
```

**Não criar pastas de cópia vazias fingindo integrações completas.**
Caso repos não estejam acessíveis, registrar estado pendente no
inventário e montar adaptadores com mocks claramente identificados para
desenvolvimento, nunca como dados reais em produção.

### 6.2 Copiar código, sem alterar originais

1.  Inventariar cada repositório de origem: caminho, URL, branch, commit
    SHA, licença, stack, dependências, infraestrutura e restrições de
    uso.

2. Somente **ler/clonar** repositórios autorizados; não fazer
    checkout com mudanças, commits, PRs, pushes, migrations ou deploys
    neles.

3. Criar snapshot/cópia no novo repositório com a proveniência
    documentada (`SOURCE_MANIFEST.md` contendo origem e commit),
    respeitando código proprietário, segredos e licenças.

4. Remover dos snapshots: `.env*` reais, `.git`, tokens,
    credenciais, dados privados, dumps de banco e artefatos não
    necessários. Preservar avisos de licença.

5. Adaptar as cópias **dentro do novo repositório**, em branches
    dedicadas, sem compartilhar banco/serviço de produção por padrão.

6. Configurar endpoints, bancos, storage, auth, OAuth callbacks e
    domínios **novos** para o HUB.

7. Testar que `git status` dos projetos originais não mudou, que não
    houve execução de SQL neles e que nenhum deployment original foi
    afetado.

8. Se uma origem for inacessível, falhar de forma explícita com
    checklist de acesso necessário; jamais inventar código-fonte nem
    contornar permissões.

**Atenção à ambiguidade:** “copiar os códigos” não significa
automaticamente trazer para o HUB todas as funcionalidades de cinco
sistemas já implantados. Primeiro realizar análise de dependências e
escolher por produto: (a) código adaptado ao monorepo; (b)
microfrontend/módulo isolado; (c) adaptador API; (d) link externo com
identidade separada. Priorizar manutenção, segurança e menor
acoplamento, em vez de consolidar tudo num deploy monolítico.

## 7. CAMADA DE PROJETOS, ARQUIVOS E EVENTOS

### 7.1 Entidade canônica `ZroProject`

Campos iniciais: id, organization_id, title, type, client_reference,
status, created_by, created_at, updated_at, brief, delivery_targets,
external_links, workflow_version. UUID global e IDs externos separados
por adaptador. Todas as etapas vinculadas ao mesmo project_id.

### 7.2 Manifest de ingest (`ZroMediaManifest`)

Formato versionado (JSON Schema + exemplos): manifest_id,
schema_version, project_id, source_app, created_at, job_id, assets[],
copy_operations[], verification_summary. Cada asset: asset_id, nome
original, tamanho, MIME detectado, metadados de mídia, duração/timecode
quando existente, hash/checksum e algoritmo, fonte, destinos (URI lógico
ou caminho, nunca URL pública com segredo), status por destino, datas,
câmera/cartão quando conhecido, warnings.

SOBEDESCE registra operações de transferência e evidências de
verificação. **Não declarar backup concluído apenas porque uma cópia foi
iniciada.** Synquei consome manifest validado, preserva asset IDs e
produz mapa de organização/sync e relatório. Falhas, duplicatas,
arquivos ausentes e divergência de checksum devem aparecer
explicitamente.

### 7.3 Contratos de eventos

Eventos versionados, com event_id, event_type, project_id,
organization_id, producer, occurred_at, schema_version, correlation_id,
idempotency_key, payload mínimo. Exemplos:

- `job.created` → projeto disponível para roteiro.

- `script.ready` → apoio opcional ao TPeasy.

- `ingest.started`, `ingest.completed`, `ingest.failed`.

- `media.manifest.ready` → Synquei.

- `media.sync.completed` → AI Edit.

- `edit.selects.ready`, `edit.timeline.ready` → NOSSOM.

- `audio.mix.ready` → Finishing.

- `finishing.qc.completed`, `delivery.ready`.

Processamento com fila confiável, retries com backoff, idempotência,
dead-letter queue, reprocessamento manual seguro e logs rastreáveis. Não
criar ciclos infinitos de triggers. Mostrar estados reais de cada job no
HUB.

### 7.4 Timeline e interoperabilidade

Investigar OpenTimelineIO e formatos suportados pelos editores-alvo,
como XML/AAF/EDL, sem prometer fidelidade total de efeitos, áudio,
multicam ou correções de cor. Definir primeiro um editor-alvo e testes
de roundtrip com projetos reais. Caminhos de mídia relativos e mapa de
relink por asset ID. Mudanças no programa de edição não devem
sobrescrever os arquivos originais.

## 8. INTEGRAÇÕES POR ETAPA

### Carro do Freela → TPeasy

Job aprovado ou aceito pode criar ZroProject; dados de cliente,
briefing, referências, equipe e prazo entram no HUB. Roteiro é opcional.
TPeasy recebe roteiro (com consentimento/permissões) e guarda revisões.
Usuário pode pular a etapa.

### TPeasy → SOBEDESCE

Associar dados de produção e nomenclatura esperada às mídias. Não
presumir que roteiro identifica automaticamente cada tomada; sugerir
mapeamento, permitir confirmação.

### SOBEDESCE → Synquei

Receber relatório estruturado e validar integridade. Propor organização
de diretórios física sem mover/deletar nada automaticamente por padrão;
usar preview/dry-run, plano de movimentação, validação de caminhos,
backup e undo onde viável. Gerar sync map e projeto exportável para o
editor suportado.

### Synquei → AI Edit

Consumir mídias/sync map + briefing + roteiro + referências. Criar
transcrição, classificação, selects e markers. Presets por formato
(casamento, institucional, comercial, documentário, aftermovie) devem
conter objetivos, prioridades, ritmo, estrutura, duração e critérios de
revisão, **não** prompts secretos misturados ao código. Presets
editáveis/versionados. IA gera propostas comparáveis; editor aprova ou
altera antes de gravar timeline final.

### AI Edit → NOSSOM

Passar timeline, regiões de áudio, diálogos, intenção editorial e
marcações sugestivas de SFX. NOSSOM pode consultar acervo próprio e
provedores **autorizados pelo usuário** com APIs/licenças válidas;
registrar origem/licença e nunca copiar bibliotecas indiscriminadamente.
Oferecer limpeza, equalização, mix/master assistidos e pré-escuta com
comparação A/B; preservar stems e original.

### NOSSOM → Finishing

Importar timeline e mix aprovado; validar a correspondência temporal e
assets. Finishing centraliza media management, relink, normalização e
gestão de cor, QC e exportações por destino. Perfis configuráveis para
cada canal; informar que plataformas alteram requisitos. Começar com
presets técnicos e validação antes de qualquer promessa de grading
criativo autônomo.

## 9. PLANOS, CICLO DO O E BILLING

### 9.1 Catálogo inicial (configurável)

- **Conta Absolute ZRO:** gratuita para identidade, painel, cadastro
  de organização e visualização do catálogo; projetos e dados conforme
  política do plano.

- **Ferramenta individual:** contratação de um ou mais produtos, com
  limites próprios.

- **Ciclo do O — Full Access:** acesso aos produtos incluídos na
  oferta ativa, com experiências integradas; limites de armazenamento,
  computação, IA, assentos e provedores terceiros explícitos.

- **Equipe/Studio (possibilidade futura):** assentos, permissões,
  faturamento central e quotas organizacionais.

**Não assumir preços, teste grátis, periodicidade ou ilimitado.** Criar
catálogo parametrizável em banco e console, com configuração inicial
neutra. Produtos em desenvolvimento não são cobrados nem aparecem como
disponíveis sem lançamento.

### 9.2 Regras de acesso

Caso A: usuário assina só SOBEDESCE → acessa conta, HUB básico e
SOBEDESCE; vê Synquei como upgrade; tentativas à API Synquei retornam
403/entitlement obrigatório.

Caso B: usuário assina SOBEDESCE + Synquei → usa fluxo combinado,
condicionado às permissões do projeto.

Caso C: organização contrata Ciclo do O → membros autorizados recebem
acesso aos módulos incluídos, segundo papéis/assentos e limites
contratados.

Caso D: pagamento falha ou assinatura cancela → aplicar estado e período
de carência configurados, bloquear novas operações pagas no prazo
correto, não apagar arquivos arbitrariamente.

Caso E: usuário tem múltiplas organizações → selecionar organização
ativa e aplicar entitlement e dados da organização correspondente, sem
vazamento cruzado.

### 9.3 Segurança financeira

Usar provedor de cobrança apenas quando escolhido/autorizado; pagamentos
nunca validados pelo frontend. Webhooks assinados, idempotentes,
reconciliáveis e auditados. Nunca conceder acesso com base apenas no
retorno da página de checkout. Permitir upgrades/downgrades,
cancelamento, prorrateio conforme regras aprovadas.

## 10. DESIGN E EXPERIÊNCIA

Construir identidade HUB editorial e premium: fundo claro com
preto/branco e cinza, opção escura; tipografia elegante, cards com
espaçamento generoso, ícones contidos, motion discreto. Componentes
responsivos desktop, tablet e mobile. No desktop: sidebar, área de
projeto com trilha do Ciclo do O e painel de atividade. No mobile:
navegação curta, ferramentas acessíveis e timeline simplificada.

Telas essenciais: Landing institucional, Pricing, Login/Cadastro,
Onboarding, Home, Catálogo, Ciclo do O, Projetos, Detalhe do projeto,
Assets/Manifest, Execuções, Assinatura, Equipe/Convites, Configurações,
Admin. Estados vazios úteis, loading, error, retry, upgrade e permission
denied. WCAG básico, contraste, navegação por teclado, feedback de ação
e responsividade.

**Conceito do Ciclo do O:** diagrama circular interativo dividido em
etapas com labels, status e conexão visual entre módulos. Não usar
apenas animação decorativa: cada segmento deve abrir a etapa do projeto
e mostrar estados/limites reais. Para leitores de tela, disponibilizar
lista linear equivalente.

## 11. STACK E INFRAESTRUTURA: DECISÃO CONTROLADA

Não presumir stack dos apps antes de inspeção. Como referência inicial:
TypeScript, Next.js para HUB, PostgreSQL/Supabase em projeto **novo**,
autenticação compatível com SSO, API tipada, filas/jobs, object storage
segregado e infraestrutura de observabilidade. Reutilizar bibliotecas
quando apropriado; evitar reescrever sistemas inteiros por preferência
tecnológica.

Ambientes separados: local, staging, production. Variáveis nomeadas no
.env.example, nunca valores reais commitados. Migrations idempotentes e
reversíveis sempre que possível, somente no banco novo. CI com lint,
typecheck, testes e build. Branch protection, dependabot/scanner de
segredos, backups, monitoramento, rastreamento de custo de computação/IA
e retenção de logs definida.

**Governança de deploy:** Claude Code pode executar builds/testes
locais, criar migrations para o banco **novo** e executar operações
autorizadas no ambiente de desenvolvimento do HUB. **Não publicar na
Vercel, alterar DNS ou criar deploy de produção antes de perguntar e
obter autorização explícita do proprietário**. Para ações externas com
custo, irreversíveis, destrutivas ou impacto em dados reais, solicitar
autorização específica.

## 12. MIGRAÇÃO E CONTINUIDADE

Não migrar automaticamente usuários nem replicar dados pessoais dos
aplicativos existentes. Criar fluxo de vinculação de conta via
autenticação/consentimento, quando houver mecanismo seguro e autorização
do proprietário. IDs externos mapeados em integration_links; não inserir
passwords, hashes ou tokens antigos sem justificativa e procedimento de
segurança. Se não houver integração disponível, mostrar conta central e
serviço original sem prometer SSO completo.

Mantenha compatibilidade e disponibilidade dos aplicativos atuais. O HUB
começa como camada adicional. Mudanças futuras nas plataformas originais
exigem projeto, autorização e rollout independentes.

## 13. ROADMAP DE ENTREGA

**Fase 0 — Auditoria (sem tocar originais):** inventário de repositórios
e serviços, arquitetura atual, arquivos oficiais de marca,
riscos/licenças, escolha de estratégia por produto, lista de acessos
pendentes. Saída: docs/architecture/source-inventory.md e ADRs.

**Fase 1 — Fundação:** novo repo, monorepo e CI, design system, landing,
conta central, organizações, membros, RLS, catálogo/entitlements/quotas,
projeto canônico e dashboard sem integrações falsas. Saída: HUB
funcional com autenticação e isolamento.

**Fase 2 — Conexão real:** adaptadores/contratos de Carro do Freela,
TPeasy, SOBEDESCE, Synquei, NOSSOM em ordem da disponibilidade; manifest
de mídia, projeto e timeline; atividades, jobs e provas de
interoperabilidade. Saída: pelo menos um fluxo ponta a ponta validado
com fixtures reais/anonimizadas.

**Fase 3 — Monetização:** catálogo de produtos, individual e Ciclo do O,
checkout, webhooks e console de assinaturas após seleção do provedor.
Saída: permissão backend coberta por testes; upgrade correto.

**Fase 4 — AI Edit:** primeiro decupagem/transcrição/marcação, depois
propostas de selects e timeline editável. Presets versionados por gênero
e avaliações humanas.

**Fase 5 — Finishing:** QC/exportação/media manager primeiro; color
management e grading assistido depois. Suporte de editores/exportação
comprovado em testes.

**Fase 6 — Escala:** multi-organização, observabilidade, billing
avançado, hardening, documentação para parceiros e fluxos empresariais.

## 14. CRITÉRIOS DE ACEITE

☐ Repositório `absolute-zro-hub` criado e independente, com commit
inicial, README e CLAUDE.md.

☐ Originais documentados com commit SHA e sem qualquer alteração (`git
status` inalterado).

☐ Todas as integrações implementadas têm origem comprovada; pendências
aparecem claramente.

☐ Usuário consegue cadastrar/login, criar organização, projeto, convidar
equipe e trocar organização.

☐ Usuário sem assinatura recebe 403 em API protegida, inclusive por URL
direta.

☐ Cliente de outra organização não acessa projetos/assets de terceiros
(testes de isolamento).

☐ Plano individual habilita apenas produtos previstos; Ciclo do O aplica
catálogo versionado e limites.

☐ Rotas de upgrade, expiração, cancelamento, webhook duplicado e erro
têm cobertura de teste.

☐ Eventos têm versão, idempotência, auditoria, reprocessamento seguro e
estados visíveis.

☐ SOBEDESCE → Synquei executa validação do manifest e não perde IDs de
assets.

☐ Fluxos de mídia jamais apagam/sobrescrevem brutos silenciosamente;
previews e confirmação em mudanças de arquivos.

☐ Módulos futuros são claramente identificados como não disponíveis, sem
IA de fachada.

☐ UI responsiva e acessível; Ciclo do O navegável e com alternativa
textual.

☐ Testes unitários, integração, E2E, segurança básica, lint e build
passam.

☐ Sem segredos/dados pessoais nos commits, sem apontamento não
autorizado para produção original.

☐ Nenhum deploy de produção sem consentimento explícito.

## 15. ENTREGÁVEIS EXIGIDOS DO CLAUDE CODE

1. Novo repositório com estrutura documentada e histórico de commits no
    repositório alvo.

2. `README.md`: setup local, arquitetura, ambientes, execução,
    limitações e comandos.

3. `CLAUDE.md`: regras permanentes, proibição de edição de originais
    e política de deploy.

4. `docs/architecture`: diagramas Mermaid, inventário, ADRs, modelo
    de dados, ameaças e decisões.

5. Contratos OpenAPI/JSON Schema de projetos, manifest, eventos,
    entitlement e integrações.

6. Interface HUB funcional conforme escopo aprovado; dados de
    demonstração identificados como demo.

7. Migrations, RLS e testes para banco novo.

8. Testes e relatório de resultados com evidências.

9. `docs/roadmap.md`: entregue, parcialmente entregue, não iniciado,
    bloqueios e dependências.

10. `docs/operations/deployment-checklist.md`: passos de deploy
    aguardando autorização.

11. Relatório final dos arquivos alterados **somente no novo
    repositório**, commits criados e evidência de originais intocados.

## 16. PROMPT DE EXECUÇÃO PARA COLAR NO CLAUDE CODE

Leia integralmente o documento ABSOLUTE_ZRO_MASTER_PRD_CLAUDE_CODE.md.
Você é o líder técnico responsável por criar um **novo produto chamado
Absolute ZRO HUB**, com a arquitetura e a experiência descritas. Faça a
implementação no repositório novo, com prioridade para a Fundação (Fase
0 e Fase 1), preparando contratos e scaffolds para fases seguintes. Aja
de forma proativa e execute as tarefas técnicas locais sem interromper a
cada comando seguro, mas respeite limites de acesso, gastos, destruição
de dados e produção.

**Restrições absolutas:** não modificar, commitar, migrar, publicar,
configurar ou executar comandos mutáveis nos repositórios, bancos,
autenticação ou deployments das marcas já existentes. Você pode
inspecionar e copiar código autorizado, registrando origem/commit e
saneando credenciais, e adaptar as cópias apenas dentro do novo
repositório. Não reutilize credenciais dos aplicativos originais em
produção. Não suba a Vercel sem autorização explícita. Não declare que
existe SSO entre sistemas antigos se só o HUB tiver autenticação
central.

Comece auditando o ambiente e listando origens efetivamente acessíveis.
Em seguida crie o novo repo/estrutura, schemas, auth/RLS/entitlements,
design system, telas base, painel de projetos, Ciclo do O,
catálogo/planos e testes. Faça commits organizados. Quando informações
essenciais não estiverem disponíveis, tome decisões reversíveis e
documente hipóteses; não invente integrações, dados ou assinaturas
ativas. Ao terminar, forneça relatório completo de execução, pendências
e próximos passos, e **pergunte se está autorizado a fazer deploy na
Vercel**. Até essa autorização, limite-se a build/testes/ambientes
locais ou de desenvolvimento autorizados.

## DECISÕES A SEREM CONFIRMADAS POSTERIORMENTE (NÃO BLOQUEIAM SCAFFOLD)

- URLs/IDs e permissões de leitura dos cinco repositórios de origem.

- Logo oficial, fontes, tokens de cor e domínios do grupo.

- Stack e projeto Supabase **novos**, titularidade do GitHub e
  organização Vercel.

- Provedor de pagamentos, política de preços, assentos, créditos e
  quotas.

- Mecanismo de SSO suportado por cada produto e editor inicial de
  integração (Premiere, Resolve, Final Cut etc.).

- Nome definitivo da plataforma de AI Edit (Finishing virou Revela, ADR 0015).

- Política de propriedade e retenção de mídia, LGPD, termos,
  privacidade, licenças e suporte.
