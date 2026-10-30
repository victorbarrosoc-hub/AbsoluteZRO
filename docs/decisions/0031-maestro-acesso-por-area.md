# ADR 0031 — Maestro: o que cada pessoa vê, por área

**Status:** aceita (29/10/2026, pedido do titular; padrões a confirmar, ver "Perguntas")

## Contexto

O titular pediu que a Administração da conta controle quem vê o quê no Maestro: "uma aba do financeiro, só algumas
pessoas podem ver, não pode deixar um editor ver. Privacidade pra empresa." Até aqui o acesso era só o papel vindo do
HUB (Administração, Gestão, Equipe, Leitura). A auditoria
([products/maestro/docs/permissoes.md](../../products/maestro/docs/permissoes.md)) achou dinheiro aberto a todos:
orçamentos com custo e margem, tabela de preços, diárias da equipe, custo da equipe no projeto, valor do inventário,
contato dos freelas, valor estimado no payload do funil e o e-mail das pessoas.

## Decisão

- O papel segue vindo do HUB e decide escrever/remover. Por cima, **seis áreas sensíveis** (Financeiro, Orçamentos e
  preços, Contratos, Diárias e cachês, Dados da equipe, Valores do inventário), com padrão por papel e ajuste por
  pessoa feito **só pela Administração** em Ajustes → Pessoas ("O que vê", um interruptor por área, salva na hora,
  auditado). A Administração vê tudo sempre.
- Padrões mais seguros: Gestão com todas menos o Financeiro; Equipe e Leitura com nenhuma.
- A regra é do banco (`products/maestro/drizzle/0027_acessos.sql`): `maestro.pode(org, área)` nas políticas
  restritivas das tabelas de cada área, máscara nas consultas das colunas de dinheiro em tabelas de todos e gatilhos
  que guardam o valor de antes quando quem não vê grava. Navegação sem link morto; a Z não recebe dinheiro sem a área.
- A Função na produtora continua sendo só um rótulo.

## Consequências

- Quem era Gestão e usava o Financeiro precisa da Administração ligar a área (uma vez por pessoa).
- Equipe que criava orçamentos precisa da área "Orçamentos e preços".
- Tabela nova com dinheiro: política `<tabela>_area` (`maestro.politica_area`) e entrada em `tests/acessos.test.mts`.

## Perguntas

Em [permissoes.md](../../products/maestro/docs/permissoes.md#perguntas-para-o-titular): Gestão vê o Financeiro por
padrão? Equipe vê o contato dos freelas? Restringir clientes fica só com a Administração? Aprovar na tela pedir também o
Financeiro.
