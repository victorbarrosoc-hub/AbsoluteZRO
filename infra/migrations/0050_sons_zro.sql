-- Absolute ZRO HUB · 0050 · Sons originais da Absolute ZRO (pedido do titular em 01/11/2026).
-- O pack de efeitos da plataforma (gerado com os créditos ElevenLabs do titular) vira o banco padrão da aba Sons do AEON
-- e de todo app da família: as mesmas categorias e as 4 versões de cada som, sem link para colar. Os arquivos ficam
-- aqui, no banco privado (o repositório é público): só quem entra com a conta ouve e baixa, pelo HUB
-- (/api/v1/sons/zro, escopo zro.sons). Leitura para todo o papel zro_app; escrita só pelo sistema (o envio do pack).
create table if not exists zro.sons_zro (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) between 3 and 100),
  som text not null check (som ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(som) between 2 and 96),
  categoria text not null check (length(categoria) between 1 and 60),
  ordem smallint not null check (ordem between 0 and 99),
  titulo text not null check (length(titulo) between 1 and 120),
  versao smallint not null check (versao between 1 and 9),
  melhor boolean not null default false,
  duracao numeric(7, 3) check (duracao is null or duracao > 0),
  content_type text not null default 'audio/mpeg' check (content_type in ('audio/mpeg', 'audio/wav', 'audio/ogg')),
  audio bytea not null check (octet_length(audio) between 1 and 26214400),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  unique (som, versao)
);
create index if not exists sons_zro_ordem on zro.sons_zro (ordem, titulo, versao);

alter table zro.sons_zro enable row level security;
revoke all on zro.sons_zro from zro_app;
grant select on zro.sons_zro to zro_app;
drop policy if exists sons_zro_select on zro.sons_zro;
create policy sons_zro_select on zro.sons_zro for select to zro_app using (true);
