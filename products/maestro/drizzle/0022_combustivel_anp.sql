-- Maestro · 0022 · Combustível automático na calculadora de deslocamento (pedido do titular, 29/10/2026).
--
-- O preço do litro vem da ANP: o Levantamento de Preços de Combustíveis, planilha semanal "resumo_semanal_lpc" da
-- página "últimas semanas pesquisadas" (abas MUNICIPIOS, ESTADOS e BRASIL). Um agendamento semanal
-- (GET /api/cron/combustivel, Vercel Cron com CRON_SECRET) guarda a semana aqui; a calculadora só lê.
--
-- - Dado de referência, público, sem organização e sem pessoa: todo mundo do Maestro lê (maestro_app só SELECT, pela
--   política), só o sistema escreve (o agendamento, como dono da tabela).
-- - Uma linha por semana × lugar × combustível. `uf` = 'BR' é a média nacional; `municipio` = '' é a média do estado
--   (ou do Brasil); senão o nome como a ANP escreve (maiúsculas, sem acento).
-- - Guardamos só gasolina comum, etanol hidratado e diesel S10 e só as últimas 8 semanas (o agendamento apaga as mais
--   velhas): uns 1.500 registros por semana (cerca de 460 municípios pesquisados + 27 estados + Brasil), ~12 mil no
--   total, poucos MB. Cabe com folga no plano grátis do banco.
-- - Orçamento salvo não muda: a linha "Deslocamento" grava o preço usado no texto e no valor; esta tabela não é lida
--   depois.
-- - A antiga maestro.cache_combustivel (cache de 12 h por chave, 0006) sai: o agendamento substitui.

create table if not exists maestro.combustivel_precos (
  semana date not null,
  semana_fim date not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  municipio text not null default '' check (char_length(municipio) <= 80),
  combustivel text not null check (combustivel in ('gasolina', 'etanol', 'diesel')),
  preco_medio numeric(6, 3) not null check (preco_medio > 0 and preco_medio < 100),
  postos int not null default 0 check (postos >= 0),
  fonte text not null check (fonte ~ '^https?://' and char_length(fonte) <= 400),
  buscado_em timestamptz not null default now(),
  primary key (semana, uf, municipio, combustivel),
  check (semana_fim >= semana and semana_fim - semana <= 14)
);
create index if not exists combustivel_precos_lugar_idx on maestro.combustivel_precos (uf, municipio, combustivel, semana desc);

alter table maestro.combustivel_precos enable row level security;
revoke all on maestro.combustivel_precos from public;
revoke all on maestro.combustivel_precos from maestro_app;
grant select on maestro.combustivel_precos to maestro_app;
drop policy if exists combustivel_precos_leitura on maestro.combustivel_precos;
create policy combustivel_precos_leitura on maestro.combustivel_precos for select to maestro_app using (true);

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on maestro.combustivel_precos from %I', r);
    end if;
  end loop;
end
$$;

drop table if exists maestro.cache_combustivel;
