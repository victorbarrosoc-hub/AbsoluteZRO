-- Absolute ZRO HUB · 0028 · Custos do ecossistema (pedido do titular, 29/10/2026; ADR 0028). O console mostra quanto
-- custa manter tudo no ar, por mês e por ano, com metas, ponto de equilíbrio e recomendações.
--
-- - `zro.custos`: um item por fornecedor e serviço. Mensal, anual (dividido por 12 na conta do mês) ou por uso (mostrado
--   à parte, como "+ uso"). Estado ativo, previsto, futuro (com gatilho e data estimada em `comeca_em`) ou pausado.
-- - `zro.custos_config`: uma linha só. Cotação do dólar (com data), metas de receita mensal e de assinantes e a data-alvo.
--   Nada vem preenchido: o titular informa no console.
-- - Só o console da plataforma lê e grava, como sistema, depois de requirePlatformAdmin. O papel zro_app não tem
--   privilégio nenhum nas duas tabelas (RLS ligado e forçado, sem política). Toda mudança vai para audit_logs.
-- - Os itens iniciais são os que o titular listou em 29/10/2026. Valor 0 com "a conferir" = ninguém confirmou o número
--   ainda; o titular corrige no console. Nenhum número além desses.

create table if not exists zro.custos (
  id uuid primary key default gen_random_uuid(),
  fornecedor text not null check (char_length(btrim(fornecedor)) between 1 and 80),
  item text not null check (char_length(btrim(item)) between 1 and 120),
  categoria text not null check (categoria in (
    'ia', 'hospedagem', 'banco', 'pagamentos', 'gpu', 'email', 'lojas', 'seguranca', 'dominio', 'outros')),
  plano text check (plano is null or char_length(plano) <= 80),
  valor numeric(12, 2) not null default 0 check (valor >= 0 and valor < 10000000),
  moeda text not null default 'USD' check (moeda in ('USD', 'BRL')),
  periodicidade text not null check (periodicidade in ('mensal', 'anual', 'por_uso')),
  estado text not null check (estado in ('ativo', 'previsto', 'futuro', 'pausado')),
  -- Quando um item futuro passa a valer ("quando passar de 100 usuários do Drive").
  gatilho text check (gatilho is null or char_length(gatilho) <= 200),
  -- Início (ou mês estimado, para previsto e futuro) e fim. Usados na projeção de 12 meses.
  comeca_em date,
  termina_em date check (termina_em is null or comeca_em is null or termina_em >= comeca_em),
  link text check (link is null or (link ~ '^https://' and char_length(link) <= 500)),
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  conferido_em date,
  a_conferir boolean not null default false,
  -- Apps que dependem do item (ids de zro.products); vazio = o ecossistema todo.
  produtos text[] not null default '{}' check (cardinality(produtos) <= 20),
  -- Mensal com cobrança variável além do fixo (Vercel, Supabase): conta como "+ uso".
  cobra_uso boolean not null default false,
  -- Limite de gasto configurado no fornecedor, por mês, na moeda do item. Sem teto + uso = aviso.
  teto_mensal numeric(12, 2) check (teto_mensal is null or teto_mensal >= 0),
  -- Preço anual oferecido para um item mensal (mesma moeda). Mais barato que 12× = recomendação.
  valor_anual numeric(12, 2) check (valor_anual is null or valor_anual >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists custos_item_unico on zro.custos (lower(fornecedor), lower(item));

create table if not exists zro.custos_config (
  id boolean primary key default true check (id),
  cotacao_usd_brl numeric(8, 4) check (cotacao_usd_brl is null or (cotacao_usd_brl > 0 and cotacao_usd_brl < 100)),
  cotacao_em date,
  meta_receita_mensal numeric(12, 2) check (meta_receita_mensal is null or meta_receita_mensal >= 0),
  meta_assinantes int check (meta_assinantes is null or meta_assinantes >= 0),
  data_alvo date,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references zro.users (id) on delete set null
);
insert into zro.custos_config (id) values (true) on conflict do nothing;

alter table zro.custos enable row level security;
alter table zro.custos force row level security;
alter table zro.custos_config enable row level security;
alter table zro.custos_config force row level security;
-- Sem política e sem privilégio: só o console (sistema) enxerga.
revoke all on zro.custos, zro.custos_config from zro_app;

insert into zro.custos
  (fornecedor, item, categoria, plano, valor, moeda, periodicidade, estado, gatilho, link, observacao, conferido_em, a_conferir, produtos, cobra_uso)
values
  ('Anthropic', 'Claude (desenvolvimento)', 'ia', 'Max 20x', 200, 'USD', 'mensal', 'ativo', null,
   'https://claude.ai', 'Assinatura de desenvolvimento do titular.', date '2026-10-29', false, '{}', false),
  ('Anthropic', 'API da Z', 'ia', 'API', 0, 'USD', 'por_uso', 'ativo', null,
   'https://console.anthropic.com', 'Cobrança por uso; ver console da Anthropic.', date '2026-10-29', true, '{}', false),
  ('Vercel', 'Hospedagem do HUB e dos apps', 'hospedagem', 'Pro', 20, 'USD', 'mensal', 'ativo', null,
   'https://vercel.com/pricing', 'US$ 20 por membro por mês, mais o uso acima do incluído.', date '2026-10-29', true, '{}', true),
  ('ElevenLabs', 'Voz e ditado', 'ia', 'Creator', 22, 'USD', 'mensal', 'ativo', null,
   'https://elevenlabs.io/pricing',
   'Inclui 275 min de agente de voz e 56 h de ditado em tempo real. Minuto extra de voz: US$ 0,08.', date '2026-10-29', false, '{}', true),
  ('Supabase', 'Banco de dados', 'banco', 'Pro', 25, 'USD', 'mensal', 'futuro', 'Quando o banco sair do plano grátis',
   'https://supabase.com/pricing', 'US$ 25 por mês, mais o uso acima do incluído.', date '2026-10-29', false, '{}', true),
  ('Stripe', 'Cobrança com cartão', 'pagamentos', 'Cartão', 0, 'BRL', 'por_uso', 'futuro', 'Quando os planos começarem a vender',
   'https://stripe.com/br/pricing', '3,99% + R$ 0,39 por cartão nacional (a conferir na página oficial do Stripe Brasil).',
   date '2026-10-29', true, '{}', false),
  ('RunPod', 'GPU sob demanda', 'gpu', null, 0, 'USD', 'por_uso', 'previsto', null,
   'https://www.runpod.io/pricing', null, date '2026-10-29', true, '{}', false),
  ('Apple', 'Apple Developer Program', 'lojas', null, 99, 'USD', 'anual', 'futuro', 'Assinar e publicar os apps para Mac e iPhone',
   'https://developer.apple.com/programs/', null, date '2026-10-29', false, '{}', false),
  ('Google Cloud', 'Projeto Absolute ZRO (APIs do Drive e da Agenda)', 'hospedagem', null, 0, 'BRL', 'mensal', 'ativo', null,
   'https://console.cloud.google.com', 'Grátis no volume atual.', date '2026-10-29', false, '{}', false),
  ('Google', 'Avaliação de segurança CASA', 'seguranca', null, 0, 'USD', 'anual', 'futuro', 'Quando o app do Google passar de 100 usuários',
   null, 'Exigida pelo escopo restrito do Drive. Anual, de algumas centenas a alguns milhares de dólares.', date '2026-10-29', true,
   '{sobedesce}', false),
  ('Resend', 'E-mails do sistema', 'email', 'Grátis', 0, 'BRL', 'mensal', 'ativo', null,
   'https://resend.com/pricing', 'Plano grátis.', date '2026-10-29', true, '{}', false),
  ('Domínio', 'absolutezro.com', 'dominio', null, 0, 'USD', 'anual', 'ativo', null,
   null, 'Registrador e valor a conferir.', date '2026-10-29', true, '{}', false)
on conflict do nothing;
