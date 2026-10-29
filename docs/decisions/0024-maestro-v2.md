# ADR 0024 — Maestro v2: a produtora inteira, por fases

**Status:** aceita (28/10/2026, decisões do titular)

## Contexto

O Maestro (ADR 0022) já tem Quadro, Clientes, Projetos, a Z e a demonstração, e está **fechado**: só a lista de acesso
do HUB entra (migration `0024` do HUB; abrir a todos continua sendo a `0022` e pede o titular). O plano "Maestro v2"
(28/10/2026) junta o que existia no ZRO (`/painel`), no Maestro original e no SOBEDESCE numa plataforma só para
produtoras e agências: revisão de vídeo no nível do Frame.io sem armazenamento pago, ciclo comercial ligado (pedido →
orçamento → projeto → cobrança), financeiro, inventário e freelas, em 21 fases pequenas.

## Decisão

1. **Navegação**: barra lateral em vidro com grupos (Z · Produção · Comercial · Operação · Dinheiro · Ajustes) e barra
   de baixo no celular. Um grupo só aparece quando tem tela de verdade.
2. **Página inicial pública** em `/`, no padrão das irmãs: o produto real em aparelhos (capturas da demonstração),
   só o que existe, "Em breve" honesto para o resto, "Entrar com Absolute ZRO" e "Quero acesso".
3. **Visual**: identidade Absolute ZRO (Figtree, grafite, Liquid Glass, claro padrão) com o latão do símbolo como
   acento só em superfície, traço e ícone (nunca texto), uma cor fechada por coluna do Quadro e motion só em CSS,
   sempre sob "reduzir movimento".
4. **Outros produtos** pela sessão: `temProduto()` lê `zro_products` e `zro_release` (ex.: a aba Arquivos só com o
   SOBEDESCE). Quem decide o uso continua sendo o produto dono e o HUB.

## Decisões do titular (28/10/2026)

1. Drive para o cliente: o Maestro **pode** ligar "qualquer pessoa com o link" no arquivo da versão enquanto o link do
   lote vale e desligar ao fechar ou revogar.
2. Arquivos completo: **pode** (token curto do Drive pelo SOBEDESCE, nunca guardado).
3. White-label: logo da produtora no timbrado e nas páginas do cliente **para todos**; app inteiro com a marca dela e
   "Powered by Absolute ZRO" **só no plano superior** (preço depois; `zro.plan_products` só com o titular).
4. "Quero acesso": **lista de espera** guardada no Maestro (e-mail com consentimento). Chave de API do Google **só do
   Maestro**: autorizada (nova, gratuita).
5. Impostos (DAS/ISS): em aberto; o Financeiro nasce sem eles.
6. Vídeos de aprovação: **links** cadastrados, sem armazenamento pago; player sempre, inclusive com Drive.

## Consequências

- Fases 0–2 entregues: `CLAUDE.md` do Maestro corrigido (fechado), `temProduto()`, barra lateral, página inicial,
  lista de espera (`drizzle/0004_lista_espera.sql`: RLS ligado, `maestro_app` sem privilégio na tabela, só a função
  `maestro.lista_espera_entrar()`, 5/h por IP, armadilha, consentimento obrigatório no banco) e o sistema visual.
- A lista de espera não libera ninguém: a liberação segue manual, pela lista de acesso do HUB.
- Cada fase seguinte traz RLS com teste de duas organizações, e2e e as autorizações marcadas no plano (chave do Google,
  domínio próprio, plano white-label, abrir ao público).
