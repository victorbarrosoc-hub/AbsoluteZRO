# ADR 0028 — Custos do ecossistema no console

**Status:** aceita (29/10/2026, pedido do titular)

## Contexto

O titular quer acompanhar, no console da plataforma, quanto investe por mês e por ano para manter o ecossistema no ar:
fornecedores, planos, o que está por vir, metas e quando a receita paga a conta. Até aqui isso vivia de cabeça.

## Decisão

- **Página `/admin/custos`** (seção "Custos" do console), **só papel admin** da plataforma: o suporte não vê a seção e a
  rota responde 404 (layout do segmento, fora do esqueleto de carregamento). Leitura e escrita como sistema
  (`db.asSystem`) depois de `requirePlatformAdmin(['admin'])`.
- **Dados** (`infra/migrations/0028_custos.sql`): `zro.custos` (fornecedor, item, categoria, plano, valor, moeda US$/R$,
  periodicidade mensal/anual/por uso, estado ativo/previsto/futuro/pausado, gatilho, `comeca_em` — o mês estimado para
  previsto e futuro —, `termina_em`, link, observação, `conferido_em`, `a_conferir`, apps afetados, "cobra uso além do
  fixo", teto de gasto e preço no anual) e `zro.custos_config` (uma linha: cotação do dólar com data, meta de receita
  mensal, meta de assinantes, data-alvo). RLS ligado e forçado, **sem política e sem privilégio para `zro_app`**.
  Itens iniciais: os 12 que o titular listou em 29/10/2026; o que ninguém confirmou entra com valor 0 e "a conferir".
  A cotação e as metas começam vazias: nada de número inventado.
- **Conta** (`packages/core/src/custos.ts`, funções puras): mês = mensal + anual ÷ 12 dos itens ativos vigentes; por uso
  fica à parte ("+ uso"); ano = 12 × mensal + anual. Cada item na sua moeda; sem cotação, o que precisa converter vira
  "sem cotação" (os gráficos ficam em US$ e o que é em reais fica fora, contado). Projeção de 12 meses empilha ativo,
  previsto e futuro pelo `comeca_em`; previsto e futuro sem data ficam listados fora do gráfico.
- **Ponto de equilíbrio**: preço dos planos publicados em `zro.plans` (um por nome, mensal primeiro, avulsos juntos
  como "Avulso (1 app)") e receita das assinaturas **pagas** ativas (fora grátis e concessão manual). Hoje é zero e a
  tela diz isso.
- **Recomendações por regra**, sem IA e sem uso estimado: anual mais barato (quando o preço anual foi anotado), cobrança
  por uso sem teto, itens a conferir, conferência com mais de 6 meses, custo por conta ativa (contas `active` de verdade),
  sem receita / receita abaixo do custo, próximos gatilhos e cotação faltando ou velha. A contagem de quem conectou o
  Drive mora no SOBEDESCE; o HUB não lê o banco de outro app, então o gatilho da avaliação CASA aparece sem contagem.
- **Auditoria**: criar, alterar (campos que mudaram e, para valor/moeda/periodicidade/estado, de → para; textos livres
  só como "mudou"), apagar, mudar cotação/metas e exportar a planilha vão para `zro.audit_logs` com `actor_kind = admin`.
- **Tela** no padrão do console: número do mês grande que conta até o valor, rosca por categoria (paleta categórica
  validada para claro e escuro, cor fixa por categoria), barras por fornecedor, projeção empilhada, cartões de
  equilíbrio e metas, lista agrupada por estado com filtros e uma folha (`<dialog>`) para criar, editar e apagar (com
  confirmação). Planilha em `/admin/custos/csv` (BOM, sem fórmula). Movimento só em CSS e na contagem do número, parado
  com "reduzir movimento". Sem biblioteca de gráfico.

## Consequências

- O titular corrige os números no console; nenhuma integração com faturas dos fornecedores (Vercel, Anthropic etc.).
  Se um dia vier, entra como item "por uso" com estimativa, não como número escondido.
- Mudar categorias ou estados pede migration nova (são `check` no banco e listas em `custos.ts`).
