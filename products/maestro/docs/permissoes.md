# Maestro: quem vê o quê

Pedido do titular (29/10/2026): "o Administrador da conta tem o controle de quem tem que função dentro da plataforma…
uma aba do financeiro, só algumas pessoas podem ver, não pode deixar um editor ver". Decisão em
[ADR 0031](../../../docs/decisions/0031-maestro-acesso-por-area.md). Código: `src/lib/acessos.ts` (puro),
`src/lib/acessos-servidor.ts`, `drizzle/0027_acessos.sql`. Testes: `tests/acessos.test.mts`, `e2e/acessos.spec.ts`.

## Duas camadas

1. **Papel** (não muda): vem da organização da Absolute ZRO a cada login (`src/lib/papeis.ts`: owner/admin →
   Administração, manager → Gestão, editor → Equipe, viewer/guest → Leitura). Decide **escrever, remover, convidar**.
2. **Áreas sensíveis** (novo): cada papel tem um padrão; **só a Administração** liga ou desliga por pessoa em Ajustes →
   Pessoas → "O que vê". A Administração vê tudo, sempre (não dá para se trancar fora).

A **Função na produtora** (`members.funcao`: Editor, Câmera, Financeiro…) é só um rótulo: não muda nada disto.

## As seis áreas e o padrão

| Área                                             | O que guarda                                                                                                                                     | Administração | Gestão  | Equipe | Leitura |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------- | ------ | ------- |
| **Financeiro** (`financeiro`)                    | lançamentos, baixas, recorrências, metas; caixa, a receber e a pagar no Hoje e na Z; status de pagamento da escala                               | sempre        | **não** | não    | não     |
| **Orçamentos e preços** (`orcamentos`)           | orçamentos com valores, custos e margens, timbrado, tabela de preços, links de orçamento e de pedido, valor estimado do pedido, valor do projeto | sempre        | sim     | não    | não     |
| **Contratos** (`contratos`)                      | contratos aceitos (CPF/CNPJ e endereço do cliente) e o modelo                                                                                    | sempre        | sim     | não    | não     |
| **Diárias e cachês** (`diarias`)                 | valores do freela, diária e total da escala, custo da equipe no projeto, diária do kit e aluguel                                                 | sempre        | sim     | não    | não     |
| **Dados da equipe** (`dados_equipe`)             | CPF e PIX (cifrados), e-mail e WhatsApp dos freelas, e-mail das pessoas em Ajustes → Pessoas                                                     | sempre        | sim     | não    | não     |
| **Valores do inventário** (`inventario_valores`) | valor de compra de cada equipamento                                                                                                              | sempre        | sim     | não    | não     |

Fixo, sem interruptor: **mudar o acesso, convidar e a função na produtora** só Administração; marca, empresa e modelo
de contrato só Administração (como antes); restringir a alguns clientes, Administração e Gestão (como antes, ADR da
0018). Ter a área e ser **Leitura** = ver sem gravar. Ter a área e ser **Equipe** = ver e gravar nela (ex.: a pessoa do
financeiro entra como editor no HUB e ganha o Financeiro aqui). Link do orçamento/pedido e a tabela de preços seguem
pedindo Gestão pelo papel **e** a área. Aprovar um orçamento na tela lança as parcelas: pede Orçamentos **e**
Financeiro. A demonstração preenche tudo: só quem vê todas as áreas carrega ou remove.

## Criação (roteiros e fluxos)

Não é área sensível: é um nível por papel, pronto para a frente Criação trocar a regra própria
(`podeVerCriacao/podeEditarCriacao/podeEnviarCriacao`) por esta. No banco `maestro.pode_criacao(org, nivel)`
(`maestro.criacao_padrao`); na tela `podeCriacao(sessao, nivel)` (`CRIACAO_PADRAO` em `src/lib/acessos.ts`).

| Nível                     | Administração | Gestão | Equipe | Leitura |
| ------------------------- | ------------- | ------ | ------ | ------- |
| `ver` (roteiros e fluxos) | sim           | sim    | sim    | sim     |
| `editar`                  | sim           | sim    | sim    | não     |
| `enviar` (para o cliente) | sim           | sim    | não    | não     |

Ajuste por pessoa para a Criação ainda não existe (quando pedirem, entra em `maestro.acessos` como as áreas).

## Cronômetro e tempo por tipo (`drizzle/0038`)

| O quê                                | Administração | Gestão | Equipe | Leitura |
| ------------------------------------ | ------------- | ------ | ------ | ------- |
| Cronometrar, Ajustar e Zerar (o seu) | sim           | sim    | sim    | não     |
| Ver o próprio tempo                  | sim           | sim    | sim    | —       |
| Ver o tempo do time (Semana, Tempo)  | sim           | sim    | não    | não     |
| Mudar o tempo de outra pessoa        | não           | não    | não    | não     |
| Criar, renomear e recolorir tipos    | sim           | sim    | sim    | não     |
| Arquivar e restaurar tipos           | sim           | sim    | não    | não     |

No banco: `tempo_registros_quem_ve` (select: o dono ou admin/gestão), `tempo_registros_so_o_seu*` (insert/update só do
dono), `tempo_registros_cliente` (acesso por cliente pelo card), sem DELETE para `maestro_app`; `tipos_video_guarda`
barra arquivar fora de admin/gestão. O típico que sugere o previsto é calculado com o que a pessoa vê.

## Freela (a área do freela, `/trabalhos`)

Pedido do titular (30/10/2026): o freela ligado a uma conta (pelo @ ou pelo convite, `drizzle/0036`) entra no Maestro
com a própria conta e vê o "quadro de freelas" dele. Não é papel nem área: é um **escopo** à parte
(`drizzle/0037_area_do_freela.sql`, `src/lib/freelas/area.ts`, `getBanco().asFreela(sub)`): a transação assume
`maestro_app` com a pessoa da sessão e **sem organização**. Toda política de toda tabela da produtora pede organização
ativa e ser membro, então nada sai direto (o `tests/area-freela.test.mts` confere tabela por tabela). O que sai passa
pela porta `maestro.freela_trabalhos()`/`freela_trabalho(id)`/`freela_produtoras()` (security definer), linha a linha
por `freelas.zro_sub = a pessoa`, freela ativo, produtora com o Maestro e **sem** a pessoa ser da equipe dela.

| O freela vê (só os dele)                                                          | O freela nunca vê                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| título (diária ou projeto), datas, horário, local                                 | notas internas (escala, diária, projeto, freela), briefing do projeto |
| cliente, se a produtora deixa (Ajustes → Empresa, padrão sim)                     | valor do projeto, orçamentos, contratos, financeiro, Quadro, Criação  |
| a função, a diária e o total **dele** (com o aluguel do kit dele), se já foi pago | outros freelas (nome, valor, CPF, PIX, contato), outras produtoras    |
| o recado da produção (`escalas.para_freela`) e o link de entrega (`entrega_url`)  | qualquer linha de outro freela, pelo endereço inclusive (404)         |
| o contato público da marca (telefone/e-mail de Ajustes → Marca)                   | as telas e rotas da produtora (vão para `/trabalhos`, API 401/403)    |

- **Confirmar ou recusar** (`maestro.escala_respostas`): só o freela grava (política `escala_respostas_freela`, RLS do
  escopo dele), só enquanto a escala não passou; a resposta vale para as datas em que foi dada (mudou a data, volta a
  "sem resposta"); toda resposta no `audit_log` (`escala.freela_confirmou`/`escala.freela_recusou`). A produtora lê
  (política `escala_respostas_org`, que respeita o acesso por cliente) e não grava.
- **Quem escreve a escala** (Administração, Gestão, Equipe) escreve o recado e o link (ficha do projeto e da diária,
  "Para o freela", só para freela com conta). Leitura não.
- **Entrada**: a volta do login sem acesso ao Maestro vai para `/trabalhos` quando há vínculo (senão `/sem-acesso`);
  `/sem-acesso` também manda. Quem é da equipe de uma produtora e freela de outra tem o Maestro normal com o atalho
  "Seus trabalhos" no topo, e na área do freela o botão "Produtora" de volta.

## Onde a regra vale (servidor, nunca só a tela)

- **Tabela inteira de uma área**: política RESTRITIVA `<tabela>_area` com `maestro.pode(org_id, área)` em
  `lancamentos`, `baixas`, `recorrencias`, `recorrencia_execucoes`, `metas` (Financeiro); `orcamentos`,
  `orcamento_itens`, `precos_itens`, `precos_faixas`, `precos_variaveis`, `orcamento_modelos`, `links_publicos`
  (Orçamentos); `contratos` (leitura), `contrato_modelos` (Contratos); `freela_valores` (Diárias);
  `freela_pagamento` (Dados da equipe). Soma-se às políticas de organização, papel e cliente.
- **Coluna de dinheiro numa tabela de todos** (escala, freela, kit, equipamento, pedido, projeto): o servidor manda
  vazio (`case when maestro.pode(...)` na consulta, `areasNaTx`) e o gatilho `*_guarda_area` impede gravar o que a
  pessoa não vê: na mudança fica o valor de antes; na escala nova a diária vem do cadastro do freela
  (`maestro.diaria_do_cadastro`), então quem não vê diárias escala gente sem errar o "a pagar".
- **Telas**: a navegação (cápsula e "Mais") esconde Financeiro e Orçamentos de quem não tem; cartões do Hoje, blocos das
  fichas e campos dos formulários somem. Quem digita o endereço vê "<Área>: sem acesso" (lista) ou "Essa página não
  existe." (ficha), sem nada da área carregado. Server Actions conferem a área antes de gravar.
- **Z**: o resumo (`/api/zro/maestro/resumo`) lê as áreas no banco: `dinheiro` só com Financeiro;
  `orcamentos_aguardando` só com Orçamentos (null para os outros). A Z do HUB já não fala de valores sem o bloco.
- **Sessão**: `autenticar()` traz `acessos` (padrão + ajustes); a tela decide por `pode(sessao, área)`.
- **Mudança de acesso**: `salvarAreas` confere a Administração no banco (políticas `acessos_*`), guarda só o que difere
  do padrão e grava `audit_log` `acesso.areas` com papel, antes e depois.

## Auditoria (antes desta mudança)

Superfície → dado sensível → quem via → onde era conferido.

| Superfície                                           | Dado sensível                                         | Quem via antes                       | Conferido em                     | Agora                                                          |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ | -------------------------------- | -------------------------------------------------------------- |
| Navegação (cápsula, Mais)                            | link para Financeiro                                  | todos (link para tela vazia)         | nada                             | some sem a área                                                |
| Financeiro (5 telas, ações, Números/meta)            | contas, caixa, metas                                  | admin, gestão                        | RLS por papel + tela             | área Financeiro (RLS + tela + ação)                            |
| Hoje: caixa, a receber/pagar, meta                   | dinheiro                                              | admin, gestão                        | RLS por papel                    | área Financeiro (servidor nem monta)                           |
| Hoje: "Orçamentos aguardando" e valor                | total dos orçamentos                                  | **todos** (valor só na tela)         | consulta lia `orcamento_itens`   | área Orçamentos                                                |
| Orçamentos (lista, ficha, editor, timbrado)          | preço, **custo, margem**, desconto                    | **todos**, inclusive leitura         | nada (RLS sem leitura por papel) | área Orçamentos (RLS)                                          |
| Tabela de preços (Ajustes)                           | preço e **custo** de cada item, faixas                | **todos** liam                       | só a escrita                     | área Orçamentos (RLS)                                          |
| Link de pedido / link do orçamento                   | token do link, parcelas                               | admin, gestão                        | RLS por papel                    | papel + área Orçamentos                                        |
| Pedidos (funil, ficha)                               | valor estimado / total do orçamento                   | **todos** no payload (tela escondia) | só a tela                        | servidor manda null sem Orçamentos                             |
| Projeto: equipe                                      | diária, total por pessoa, **custo da equipe**         | **todos**                            | nada                             | área Diárias (servidor mascara)                                |
| Projeto: status do pagamento da escala               | pago/pendente                                         | admin, gestão                        | papel                            | área Financeiro                                                |
| Freelas (lista e ficha)                              | **diária e valores**, e-mail, WhatsApp                | **todos**                            | nada                             | Diárias / Dados da equipe                                      |
| Freela: CPF e PIX                                    | documento e chave PIX (cifrados)                      | admin, gestão                        | RLS por papel                    | área Dados da equipe                                           |
| Freela: convite para o Absolute ZRO (0036)           | link do convite; WhatsApp do convite                  | —                                    | —                                | link: quem escreve; WhatsApp: área Dados da equipe             |
| Kit do freela / "leva equipamento"                   | diária do aluguel, aluguel na escala                  | **todos**                            | nada                             | área Diárias                                                   |
| Agenda: escalar na diária                            | campo "Diária"                                        | quem escreve                         | nada                             | sem a área: some, vem do cadastro                              |
| Inventário (ficha e edição)                          | **valor de compra**                                   | **todos**                            | nada                             | área Valores do inventário                                     |
| Contratos aceitos (ficha, listas no projeto/cliente) | CPF/CNPJ, endereço, texto assinado                    | admin, gestão                        | RLS por papel                    | área Contratos                                                 |
| Ajustes → Contrato (modelo)                          | texto do modelo                                       | admin, gestão                        | RLS por papel                    | área Contratos (Administração escreve)                         |
| Ajustes → Pessoas                                    | e-mail de cada pessoa                                 | **todos**                            | nada                             | Dados da equipe (o próprio, sempre)                            |
| Z (resumo do HUB)                                    | caixa, meta, a receber/pagar                          | admin, gestão                        | papel no servidor                | área Financeiro; orçamentos pela área                          |
| Demonstração                                         | grava em todas as áreas                               | admin, gestão                        | papel                            | só quem vê todas as áreas                                      |
| Quadro, Aprovações, link do cliente (`/a`)           | nenhum valor (cards não têm dinheiro)                 | todos / cliente                      | RLS, porta estreita              | sem mudança                                                    |
| `/p`, `/o` (cliente)                                 | preço sem custo nem margem (é o que o cliente recebe) | quem tem o link                      | porta estreita                   | sem mudança                                                    |
| Agenda .ics e Google Agenda                          | só título, data, local, projeto (sem valores)         | a própria pessoa                     | porta + RLS                      | sem mudança                                                    |
| Exportar notas do lote (CSV/EDL)                     | comentários do cliente                                | quem vê o lote                       | sessão + RLS                     | sem mudança                                                    |
| Modelos de planilha (`/api/importar/modelo`)         | só cabeçalhos de exemplo                              | quem tem acesso                      | sessão                           | sem mudança                                                    |
| Importar planilha                                    | grava freelas e equipamentos                          | admin, gestão                        | papel                            | sem mudança; valores sem a área ficam de fora pelo gatilho/RLS |
| App de computador (Electron)                         | abre o mesmo `/app`                                   | —                                    | o servidor                       | herda tudo                                                     |

## Perguntas para o titular

1. **Gestão vê o Financeiro por padrão?** Escolhi **não** (mais seguro). Quem já usa a gestão no Financeiro precisa
   que a Administração ligue em Ajustes → Pessoas (um toque por pessoa). Se preferir "sim", é trocar uma linha
   (`maestro.area_padrao` em migração nova + `PADRAO` em `src/lib/acessos.ts`).
2. **Equipe vê o contato (WhatsApp/e-mail) dos freelas?** Escolhi **não** por padrão: a produção liga a área "Dados da
   equipe" para quem precisa chamar o freela. Alternativa: separar "Contato" de "CPF e PIX".
3. **Restringir a alguns clientes** continua com Administração **e** Gestão (decisão de 28/10). Deve ficar só com a
   Administração, como as áreas?
4. **Gestão aprovar orçamento na tela** agora pede também o Financeiro (aprovar lança as parcelas). O aceite pelo link do
   cliente segue normal. Ok?
