# Validação atual e limites

Snapshot conferido em **24/10/2026 UTC**, código de referência `500bb6478258632195a13b6ec36f7c87b5d85f49`. Mudanças posteriores deste handoff são documentais; confira o CI do HEAD para alterações futuras.

## Evidências verificadas

| Área               | Evidência                                                                                                                                                            | Limite                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pipeline final     | [Validate NOSSOM 40046043907](https://github.com/victorbarrosoc-hub/nossom/actions/runs/40046043907), `success`, no SHA acima                                        | Não valida credenciais/infra de produção                                     |
| Checks do pipeline | Formatação, TypeScript, unitários, build, PostgreSQL isolado e E2E                                                                                                   | Serviços de conta/IA/GPU são simulados nos testes correspondentes            |
| Testes Node        | 43 casos na revisão local                                                                                                                                            | Contratos/algoritmos; não audição perceptual                                 |
| Browser            | A suíte contém 60 cenários; fixture privado opcional é pulado quando ausente                                                                                         | Chromium Linux; não homologação física Safari/iPhone                         |
| Produção web       | SHA público conferido e homepage carregada em Chromium através do proxy do ambiente                                                                                  | Não é monitoramento contínuo de disponibilidade                              |
| Motion real        | Em produção, pixels do canvas mudaram entre frames; cromo continuou visível; mobile sem overflow; reduzir movimento parou o canvas                                   | Não certifica FPS em todo hardware                                           |
| Compartilhamento   | `/opengraph-image`, HTTP 200, PNG 1200 × 630                                                                                                                         | Prévia de rede social pode estar em cache                                    |
| Ícone              | `/pwa/icon-512.png?v=4`, HTTP 200, PNG 512 × 512; demais tamanhos em testes                                                                                          | Ícone do binário instalado não troca apenas com deploy web                   |
| Instaladores       | [Build 40043745664](https://github.com/victorbarrosoc-hub/nossom/actions/runs/40043745664), `success`; release pública `desktop-v0.2.2`                              | Prévias, não distribuição Apple/Microsoft assinada e homologada              |
| Worker musical     | [Build 40037041426](https://github.com/victorbarrosoc-hub/nossom/actions/runs/40037041426), `success`, inclui checkpoint real e inferência sintética HTDemucs em CPU | Não comprova a imagem em uso no endpoint nem qualidade de música real na GPU |

Os três assets 0.2.2 foram verificados por HEAD HTTPS sem login:

- `NOSSOM-0.2.2-mac-arm64.dmg`: 120576823 bytes.
- `NOSSOM-0.2.2-mac-x64.dmg`: 126672992 bytes.
- `NOSSOM-0.2.2-win-x64.exe`: 112674320 bytes.

A revisão ampla identificou expectativas antigas de texto/cor e o teste de abertura do login anterior ao fim da animação. Elas foram alinhadas à interface aprovada, preservando as verificações de autenticação, separação de contas, cota, conversa, contraste e pausa da animação. O CI final acima passou após esses ajustes.

## 25/10/2026 · Login único e CI no monorepo

- `tests/zro.test.ts` (ZRO e Supabase falsos em `tests/helpers/zro-fake.ts`): abertura direta pelo HUB, conta nova só com e-mail confirmado, vínculo existente → sessão, state/nonce/iss (token e redirect)/aud/assinatura errados, e-mail em uso sem vínculo, ligar/desligar e recusa de desligar o único login.
- `tests/quota-postgres.integration.ts`: `nossom_zro_link` só para `service_role`, tabela com RLS e sem acesso de `anon`/`authenticated`, uma pessoa por conta, exclusão em cascata (rodado em PostgreSQL 16 local).
- `tests/desktop-releases.test.ts`: downloads seguem na prévia `desktop-v0.2.2` até a release `nossom-v<versão>` existir.
- `tests/desktop-releases.test.ts` (GitHub falso, 25/10/2026, repositórios privados): `/baixar/<sistema>` com token lê a API e redireciona para o endereço assinado (Accept octet-stream, sem seguir o 302), sem token usa o link normal, release ausente ou sem o arquivo cai na reserva, nada encontrado volta para `/apps?baixar=indisponivel`, `/baixar/diag` dá o motivo sem mostrar o token, e o canal `/baixar/atualizacoes/<arquivo>` só aceita os arquivos do atualizador. Limite: sem teste contra o GitHub real com o token de produção.
- `tests/e2e/zro-login.spec.ts`: botão, volta preservada e aviso quando a Absolute ZRO não responde.
- Limite: sem teste contra a Absolute ZRO e o Supabase reais; isso fica para depois de aplicar a migração e configurar as variáveis.

## 25/10/2026 · Conta única Absolute ZRO e direito de uso

- Conta nova só pela Absolute ZRO: "Criar conta" leva a `/api/zro/entrar?modo=criar`, que pede `prompt=create` ao HUB; `POST /api/account` recusa `register` (403, `zro_only`) antes de falar com o Supabase. Contas antigas entram com e-mail e senha como sempre; o botão recomendado é "Entrar com Absolute ZRO".
- Direito de uso: `zro_products` (já guardado em `nossom_private.zro_links.products`) vai para a sessão no login ZRO, no login com senha de conta ligada, ao ligar em Minha conta e a cada renovação. Sem `nossom` na lista, a pessoa entra, vê "Sua conta Absolute ZRO ainda não tem acesso ao NOSSOM." e as APIs da conta respondem como sem conta (`currentAccount` = null). Conta sem vínculo ZRO nunca é bloqueada. Nada do dispositivo (projetos, versões, jobs) é apagado.
- `tests/zro.test.ts`: `prompt=create` só em "criar"; produto fora da lista → bloqueio; liberado → acesso; renovação relê o vínculo; conta antiga sem vínculo segue igual. `tests/account.test.ts`: login sem cadastro.
- `tests/e2e/zro-access.spec.ts` (Supabase falso com `nossom_zro_link`): tela de bloqueio, APIs 401, página pública aberta, liberação na próxima entrada; conta antiga sem vínculo entra normalmente. `tests/e2e/zro-login.spec.ts`: criar conta vai para a Absolute ZRO e o formulário de cadastro sumiu.

## 27/10/2026 · A Z no Início

- A Z (IA da Absolute ZRO) no topo de `/studio`, repasse `/api/zro/ia` com o token `zro.ia` só no servidor (detalhes em
  [zro-login.md](zro-login.md#a-z-no-início-27102026)). `tests/zro.test.ts` cobre cookie, repasse, recusas, renovação e
  saída; `tests/e2e/zro-ia.spec.ts` cobre a tela, o "Conectar com Absolute ZRO" e o caminho até a API falsa do HUB
  (`scripts/test-server.mjs`, `/zro/api/v1/ia`). Sem conta Absolute ZRO real nesta validação.

## 27/10/2026 · A Z em aba própria

- `/studio/z` é a primeira aba e a entrada de `/studio` (redirecionamento no servidor, com a busca). O Início mora em
  `/studio/inicio`, sem a Z. `tests/e2e/zro-ia.spec.ts` cobre a aba, a entrada, a tela toda, o Início sem a Z e o aviso
  quando o painel não carrega; contagens da navegação em `install-navigation.spec.ts` (6 na lateral, 5 no celular).

## 28/10/2026 · Conta no padrão Absolute ZRO

- Menu "Sua conta": foto da conta Absolute ZRO (claim `picture`, só `https` do emissor em `/api/v1/foto/…`), nome,
  e-mail · organização, selo "Conta Absolute ZRO" e "Editar na conta Absolute ZRO" (claim `zro_conta`, ou
  absolutezro.com/perfil; abre fora do app). Sem vínculo, "Ligar conta Absolute ZRO" (só com o cliente ZRO
  configurado). A identidade fica na sessão cifrada; a renovação relê e-mail e organização no vínculo; desligar apaga.
  "ADM · Ilimitado" só com `unlimited` do servidor.
- `tests/zro.test.ts` 24/24 (identidade no login, renovação, foto/endereço de outro emissor ou http recusados,
  convite sem vínculo, desligar limpa); `npm test` 85/85; typecheck, format:check e build ok;
  `tests/e2e/account-menu.spec.ts` (menu ligado em 1440 e 390, axe, sem rolagem lateral). Suíte E2E: 77 ok, 1
  pulado e 3 que gravam do microfone falham neste ambiente ("Não foi possível acessar o microfone"), fora da conta.
- Não validado: a foto de uma conta real vinda do HUB em produção (a tela com foto foi conferida com a foto servida
  por rota falsa no Playwright).

## 28/10/2026 · Fechado ao público (Etapa B)

- Regra única: `temAcesso()` em `lib/server/release.ts`. `RELEASE` (padrão `closed`, só `released` abre) × claim
  `zro_release` do HUB guardada no vínculo (migração `202610280001_zro_release.sql`) e relida no login, ao ligar a
  conta, na renovação e em cada pedido à API. Fechado, só `zro_release.nossom === 'allowed'` entra; conta própria,
  vínculo sem a claim e `closed` são negados. `ADMIN_EMAIL` ficou como estava (só dá o painel ADM a quem já entrou).
- Negado: `/studio/*` (inclusive `/studio/z`) vira "Em desenvolvimento" (HTTP 200) pelo proxy e pelo layout; APIs do
  produto (`/api/usage`, `/api/ai/*`, `/api/audio/jobs*`, `/api/plans`, `/api/admin*`, `/api/zro/ia/*`) → 403;
  `/baixar`, instaladores e canal de atualização → 404; `/apps` e `/entrar` → "Em desenvolvimento" (em `/entrar`, só
  a porta "Entrar com Absolute ZRO"); `instalar.sh` → mensagem e `exit 1`; login com senha → 403 sem cookie;
  checkout/portal Stripe → 403 e `GET /api/subscription` → `enabled: false`. Home sem CTA funcional ("Conhecer o
  projeto"), sem planos, a Z "Chegando ao NOSSOM" sem link. Ficam abertos o cron de limpeza (CRON_SECRET) e o webhook
  assinado da Stripe.
- `npm test` **101/101**, `typecheck`, `format:check` e `build` ok. E2E: suíte completa 83 cenários; depois do ajuste, as specs afetadas de novo: só falham os 2 de microfone (o Chromium daqui não dá o microfone, como antes) e 26 ficam pulados por descreverem o produto aberto. `tests/e2e/zro-access.spec.ts`
  cobre as personas anônimo, conta própria, Absolute ZRO `closed` (e vínculo sem a claim), `allowed` e sessão antiga
  que sai da lista (perde o acesso no pedido seguinte). Testes que descrevem o produto aberto (entrar com senha,
  assinar, instalar no iPhone) só rodam com `RELEASE=released` (`onlyWhenOpen`).
- Não validado: o HUB real emitindo `zro_release`, a migração no Supabase de produção e a conta do proprietário
  entrando de verdade.

## Reproduzir

```sh
npm ci
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
# Requer Docker/PostgreSQL isolado:
npm run test:quota
```

Não execute duas suítes simultaneamente nas portas 3000/55440. Para investigação, escolha os arquivos afetados; após passarem, só amplie/reexecute quando houver mudança ou preocupação ainda não resolvida. Não reduza uma garantia de autorização, cota, áudio ou qualidade de sinal para fazer um teste passar.

`tests/fixtures/README.md` descreve as referências públicas/sintéticas. O teste com gravação privada depende das variáveis indicadas no próprio teste e deve continuar explicitamente pulado sem os arquivos. Não publique gravações privadas para habilitá-lo.

## O que não foi comprovado por esta entrega

- Notarização Apple, assinatura Windows e atualização real entre dois instaladores assinados.
- Qualidade perceptual de separação de uma música real na GPU de produção.
- Configuração atual, fatura, cold start ou desligamento efetivo do endpoint RunPod em cada momento.
- Sincronização de projetos/arquivos entre dispositivos ou operação offline completa — não são funcionalidades implementadas.
- Saldo de créditos Anthropic pela integração atual.
- Equivalência de qualidade a motores proprietários ou certificação de entrega audiovisual.

[Registros históricos de medição e validação](validation-history.md) permanecem para auditoria, mas contêm versões, cotas e hipóteses antigas. Não os use como checklist operacional atual. Consulte [handoff/OPERATIONS.md](handoff/OPERATIONS.md).
