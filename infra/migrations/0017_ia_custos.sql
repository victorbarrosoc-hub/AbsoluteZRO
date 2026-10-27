-- Absolute ZRO HUB · 0017 · quanto custa a IA do ecossistema: cada resposta guarda o modelo e os tokens que o provedor
-- informou (entrada, saída e lidos do cache). O console da plataforma soma isso pela tabela de preços pública do modelo.
alter table zro.ia_mensagens add column if not exists modelo text;
alter table zro.ia_mensagens add column if not exists tokens_entrada integer not null default 0 check (tokens_entrada >= 0);
alter table zro.ia_mensagens add column if not exists tokens_saida integer not null default 0 check (tokens_saida >= 0);
alter table zro.ia_mensagens add column if not exists tokens_cache integer not null default 0 check (tokens_cache >= 0);
create index if not exists ia_mensagens_quando on zro.ia_mensagens (created_at) where papel = 'assistant';
