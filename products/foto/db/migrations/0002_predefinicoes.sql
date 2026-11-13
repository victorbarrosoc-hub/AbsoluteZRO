-- Plataforma de fotos · 0002 · predefinições na conta. Só acrescenta.
--
-- A biblioteca de predefinições mora no aparelho; aqui fica a cópia que a pessoa mandou guardar na conta (para abrir
-- em outro aparelho) e as que ela divide com a equipe.
--
--   foto.predefinicoes  uma predefinição por linha: `chave` é o id que vem dentro do arquivo (.zropreset), única por
--                       dono (gravar de novo com a mesma chave atualiza); `json` é o arquivo inteiro, até 256 KB.
--                       `organizacao` é a equipe ativa de quem gravou por último; `compartilhada` só com equipe.
--
-- Quem vê: a pessoa vê as suas (em qualquer organização) e as compartilhadas da organização ativa dela.
-- Quem altera e apaga: só o dono. Até 500 por pessoa.

create table foto.predefinicoes (
  id uuid primary key default gen_random_uuid(),
  dono text not null default foto.sub() check (char_length(dono) between 1 and 200),
  organizacao text default foto.org() check (organizacao is null or char_length(organizacao) between 1 and 100),
  chave text not null check (chave ~ '^[A-Za-z0-9._-]{1,80}$'),
  nome text not null check (char_length(btrim(nome)) between 1 and 80 and char_length(nome) <= 80),
  familia text not null default '' check (char_length(familia) <= 60),
  json jsonb not null check (jsonb_typeof(json) = 'object' and octet_length(json::text) <= 262144),
  compartilhada boolean not null default false,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  unique (dono, chave),
  constraint predefinicoes_equipe check (not compartilhada or organizacao is not null)
);
create index predefinicoes_equipe_idx on foto.predefinicoes (organizacao, atualizada_em desc) where compartilhada;

create function foto.predefinicoes_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'foto_app' then
      new.dono := foto.sub();
      new.organizacao := foto.org();
      -- (gravar de novo a mesma chave é atualizar: não conta)
      if (select count(*) from foto.predefinicoes p where p.dono = new.dono and p.chave <> new.chave) >= 500 then
        raise exception 'predefinicao:teto' using errcode = 'P0001';
      end if;
    end if;
    new.criada_em := now();
    new.atualizada_em := now();
    return new;
  end if;
  if new.id <> old.id or new.dono <> old.dono or new.chave <> old.chave or new.criada_em <> old.criada_em then
    raise exception 'predefinicao:fixo' using errcode = 'P0001';
  end if;
  if current_user = 'foto_app' then
    new.organizacao := foto.org();
  end if;
  new.atualizada_em := now();
  return new;
end
$$;
revoke all on function foto.predefinicoes_guarda() from public;
create trigger predefinicoes_guarda before insert or update on foto.predefinicoes for each row execute function foto.predefinicoes_guarda();

alter table foto.predefinicoes enable row level security;

create policy predefinicoes_ver on foto.predefinicoes for select to foto_app
  using (dono = foto.sub() or (compartilhada and organizacao is not null and organizacao = foto.org()));
create policy predefinicoes_criar on foto.predefinicoes for insert to foto_app
  with check (dono = foto.sub());
create policy predefinicoes_alterar on foto.predefinicoes for update to foto_app
  using (dono = foto.sub()) with check (dono = foto.sub());
create policy predefinicoes_apagar on foto.predefinicoes for delete to foto_app
  using (dono = foto.sub());

grant select, delete on foto.predefinicoes to foto_app;
grant insert (chave, nome, familia, json, compartilhada) on foto.predefinicoes to foto_app;
grant update (nome, familia, json, compartilhada) on foto.predefinicoes to foto_app;
