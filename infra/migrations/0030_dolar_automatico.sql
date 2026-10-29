-- Absolute ZRO HUB · 0030 · Dólar automático nos Custos (pedido do titular, 29/10/2026; adendo ao ADR 0028).
--
-- A cotação do dólar dos Custos passa a vir sozinha do Banco Central (PTAX, cotação de venda do último dia útil,
-- serviço Olinda, público e sem chave). Um agendamento diário (Vercel Cron em /api/cron/dolar, com CRON_SECRET) e a
-- própria página (depois de responder, se a última busca passou de 24 h) atualizam estas colunas.
--
-- - `cotacao_modo`: 'auto' (vale a do Banco Central) ou 'manual' (vale `cotacao_usd_brl`/`cotacao_em`, digitada no
--   console). Todos começam no automático, como o titular pediu; o valor digitado antes fica guardado e volta com
--   "Usar valor manual".
-- - `cotacao_auto*`: o último valor que veio do Banco Central, o dia da cotação, a fonte e quando foi buscado. Uma falha
--   grava só `cotacao_auto_erro*`: o último valor bom continua valendo, com a data dele. Nada é inventado.
-- - Mesmas regras da 0028: só o console (sistema) lê e grava; zro_app continua sem privilégio. Mudança manual vai para
--   audit_logs (pelo código).

alter table zro.custos_config
  add column if not exists cotacao_modo text not null default 'auto' check (cotacao_modo in ('auto', 'manual')),
  add column if not exists cotacao_auto numeric(8, 4) check (cotacao_auto is null or (cotacao_auto > 0 and cotacao_auto < 100)),
  add column if not exists cotacao_auto_em date,
  add column if not exists cotacao_auto_fonte text check (cotacao_auto_fonte is null or cotacao_auto_fonte in ('bcb-ptax')),
  add column if not exists cotacao_auto_buscada_em timestamptz,
  add column if not exists cotacao_auto_erro text check (cotacao_auto_erro is null or char_length(cotacao_auto_erro) <= 300),
  add column if not exists cotacao_auto_erro_em timestamptz;

-- Valor automático sem data ou sem fonte não existe.
alter table zro.custos_config drop constraint if exists custos_config_cotacao_auto_completa;
alter table zro.custos_config add constraint custos_config_cotacao_auto_completa
  check (cotacao_auto is null or (cotacao_auto_em is not null and cotacao_auto_fonte is not null and cotacao_auto_buscada_em is not null));

revoke all on zro.custos_config from zro_app;
