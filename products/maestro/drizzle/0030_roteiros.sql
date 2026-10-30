-- Maestro · 0030 · Criação: roteiros (plano da Criação §4 e §8, fase F1). Só acrescenta.
-- (0025–0029 são de outras frentes. O migrador aplica cada migração do journal que ainda não rodou, pelo `when`, então
-- a ordem em que as frentes entram na main não importa; ver src/lib/db/migrador.ts.)
--
-- Um roteiro é UM documento estruturado (cenas → blocos) em `conteudo` (jsonb), conferido pela aplicação em
-- src/lib/criacao/roteiro/modelo.ts (`lerRoteiro`); as vistas (Literário, Técnico, Teleprompter, Edição, impressão) saem
-- dele no servidor e na tela, nunca ficam gravadas.
--
--   * maestro.roteiros: o rascunho vivo. `rev` sobe a cada mudança de conteúdo ou título (gatilho): a gravação manda o
--     `rev` que viu e, se mudou, a aplicação devolve 409 com o atual para juntar por id (`juntar.ts`). Pode ser de um
--     projeto e/ou de um card (chaves compostas com org_id: nunca aponta para a linha de outra organização) e pode ter
--     vindo de um documento antigo do projeto ("Abrir no editor novo", um por documento; o antigo fica intacto).
--     Lixeira = `apagado_em`. Estado (`rascunho`, `com_cliente`, `aprovado`, `ajuste`) só muda por administração e
--     gestão (gatilho; o mesmo corte do link de aprovação). `versao_atual`, `rev`, `org_id`, `demo` e autoria não se
--     mudam por `maestro_app` (privilégio por coluna).
--   * maestro.roteiro_versoes: "Salvar versão" congela o conteudo (n, sha256 conferido por check, título, nota, autor).
--     Só de inclusão (gatilho `registro_imutavel` da 0020: nada muda e só a linha demo sai) e só pela função
--     `maestro.roteiro_versao_salvar`, que copia o rascunho do próprio banco (a versão é sempre o que estava salvo).
--
-- Papéis (provisório até a área `criacao` do acesso por área; src/lib/criacao/permissoes.ts): todos leem; admin, gestor
-- e equipe escrevem; apagar de vez só admin e gestão (e o roteiro com versão salva não sai, porque as versões não saem).
-- Acesso por cliente (0018): roteiro ligado a projeto/card segue o alcance deles; o sem vínculo fica escondido de quem
-- é restrito (políticas `_cliente`).

-- documentos ganha a chave composta para o vínculo de origem.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documentos_org_id_uq' and conrelid = 'maestro.documentos'::regclass) then
    alter table maestro.documentos add constraint documentos_org_id_uq unique (org_id, id);
  end if;
end
$$;

create table if not exists maestro.roteiros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  projeto_id uuid,
  card_id text,
  origem_documento_id uuid,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200 and char_length(titulo) <= 200),
  modelo text not null default 'branco' check (modelo in ('institucional', 'reels', 'comercial30', 'documentario', 'evento', 'branco', 'documento')),
  formato text not null default '16:9' check (formato in ('16:9', '9:16', '1:1', '4:5')),
  estado text not null default 'rascunho' check (estado in ('rascunho', 'com_cliente', 'aprovado', 'ajuste')),
  conteudo jsonb not null check (jsonb_typeof(conteudo) = 'object' and pg_column_size(conteudo) <= 262144),
  -- total estimado (segundos), recalculado pela aplicação a cada gravação: só para listas e cartões
  duracao_seg integer not null default 0 check (duracao_seg between 0 and 1080000),
  rev integer not null default 1 check (rev >= 1),
  versao_atual integer not null default 0 check (versao_atual between 0 and 100000),
  demo boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  apagado_em timestamptz,
  unique (org_id, id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id) on delete set null (projeto_id),
  foreign key (org_id, card_id) references maestro.cards (org_id, id) on delete set null (card_id),
  foreign key (org_id, origem_documento_id) references maestro.documentos (org_id, id) on delete set null (origem_documento_id)
);
create index if not exists roteiros_org_lista_idx on maestro.roteiros (org_id, updated_at desc) where apagado_em is null;
create index if not exists roteiros_org_projeto_idx on maestro.roteiros (org_id, projeto_id) where projeto_id is not null;
create index if not exists roteiros_org_card_idx on maestro.roteiros (org_id, card_id) where card_id is not null;
create unique index if not exists roteiros_origem_uq on maestro.roteiros (org_id, origem_documento_id) where origem_documento_id is not null;
create or replace trigger roteiros_touch before update on maestro.roteiros for each row execute function maestro.touch_updated_at();

-- rev, autoria e estado: o banco decide (a aplicação não precisa lembrar).
create or replace function maestro.roteiros_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_sub uuid := maestro.current_sub();
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.versao_atual := 0;
    new.created_by := coalesce(v_sub, new.created_by);
    new.updated_by := coalesce(v_sub, new.updated_by);
    if new.estado <> 'rascunho' and v_sub is not null and not maestro.has_role(new.org_id, array['admin', 'gestor']) then
      raise exception 'Só administração e gestão mudam o estado do roteiro.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.conteudo is distinct from old.conteudo or new.titulo is distinct from old.titulo or new.formato is distinct from old.formato then
    new.rev := old.rev + 1;
  else
    new.rev := old.rev;
  end if;
  if v_sub is not null then
    new.updated_by := v_sub;
  end if;
  if new.estado is distinct from old.estado and v_sub is not null and not maestro.has_role(new.org_id, array['admin', 'gestor']) then
    raise exception 'Só administração e gestão mudam o estado do roteiro.' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function maestro.roteiros_guarda() from public;
drop trigger if exists roteiros_guarda on maestro.roteiros;
create trigger roteiros_guarda before insert or update on maestro.roteiros for each row execute function maestro.roteiros_guarda();

select maestro.politicas_padrao('roteiros', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
-- Só estas colunas mudam por maestro_app; rev e versao_atual são do banco, org/autoria/demo nunca mudam.
revoke update on maestro.roteiros from maestro_app;
grant update (projeto_id, card_id, titulo, formato, estado, conteudo, duracao_seg, apagado_em) on maestro.roteiros to maestro_app;

-- ───────────── acesso por cliente (0018) ─────────────

-- O vínculo do roteiro está no alcance da pessoa? Restrita: precisa de projeto e/ou card, todos visíveis.
create or replace function maestro.roteiro_ligacao_visivel(p_org uuid, p_projeto uuid, p_card text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org)
      or ((p_projeto is not null or p_card is not null)
          and (p_projeto is null or maestro.projeto_visivel(p_org, p_projeto))
          and (p_card is null or maestro.card_visivel(p_org, p_card)))
$$;

create or replace function maestro.roteiro_visivel(p_org uuid, p_roteiro uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not maestro.restrito(p_org)
      or exists (select 1 from maestro.roteiros r
                  where r.org_id = p_org and r.id = p_roteiro and maestro.roteiro_ligacao_visivel(r.org_id, r.projeto_id, r.card_id))
$$;
revoke all on function maestro.roteiro_ligacao_visivel(uuid, uuid, text), maestro.roteiro_visivel(uuid, uuid) from public;
grant execute on function maestro.roteiro_ligacao_visivel(uuid, uuid, text), maestro.roteiro_visivel(uuid, uuid) to maestro_app;

drop policy if exists roteiros_cliente on maestro.roteiros;
create policy roteiros_cliente on maestro.roteiros as restrictive for all to maestro_app
  using (maestro.roteiro_ligacao_visivel(org_id, projeto_id, card_id)) with check (maestro.roteiro_ligacao_visivel(org_id, projeto_id, card_id));

-- ───────────── versões (só inclusão) ─────────────

create table if not exists maestro.roteiro_versoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  roteiro_id uuid not null,
  n integer not null check (n between 1 and 100000),
  titulo text not null check (char_length(titulo) between 1 and 200),
  conteudo jsonb not null check (jsonb_typeof(conteudo) = 'object' and pg_column_size(conteudo) <= 262144),
  -- sha256 do texto canônico do jsonb (`conteudo::text`), conferido aqui
  sha256 text not null,
  duracao_seg integer not null default 0 check (duracao_seg between 0 and 1080000),
  nota text check (nota is null or char_length(nota) between 1 and 500),
  demo boolean not null default false,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, roteiro_id, n),
  foreign key (org_id, roteiro_id) references maestro.roteiros (org_id, id) on delete cascade,
  constraint roteiro_versoes_hash_confere check (sha256 = encode(sha256(convert_to(conteudo::text, 'UTF8')), 'hex'))
);
create index if not exists roteiro_versoes_roteiro_idx on maestro.roteiro_versoes (org_id, roteiro_id, n desc);

select maestro.politicas_padrao('roteiro_versoes', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);
-- maestro_app só lê; a versão nasce pela função abaixo e nunca muda (sai só a demo, junto com o roteiro).
revoke insert, update, delete on maestro.roteiro_versoes from maestro_app;
drop trigger if exists roteiro_versoes_imutavel on maestro.roteiro_versoes;
create trigger roteiro_versoes_imutavel before update or delete on maestro.roteiro_versoes for each row execute function maestro.registro_imutavel();

drop policy if exists roteiro_versoes_cliente on maestro.roteiro_versoes;
create policy roteiro_versoes_cliente on maestro.roteiro_versoes as restrictive for all to maestro_app
  using (maestro.roteiro_visivel(org_id, roteiro_id)) with check (maestro.roteiro_visivel(org_id, roteiro_id));

-- "Salvar versão": congela o rascunho como está no banco (trava a linha; n = a maior já salva + 1).
create or replace function maestro.roteiro_versao_salvar(p_roteiro uuid, p_nota text default null) returns maestro.roteiro_versoes
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.current_org_id();
  v_r maestro.roteiros;
  v_v maestro.roteiro_versoes;
  v_n integer;
  v_nota text := nullif(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g')), '');
begin
  if v_org is null or not maestro.has_role(v_org, array['admin', 'gestor', 'equipe']) then
    raise exception 'Seu papel nesta organização só lê.' using errcode = '42501';
  end if;
  select * into v_r from maestro.roteiros r where r.org_id = v_org and r.id = p_roteiro and r.apagado_em is null for update;
  if not found or not maestro.roteiro_ligacao_visivel(v_org, v_r.projeto_id, v_r.card_id) then
    raise exception 'roteiro:nao_existe' using errcode = 'P0002';
  end if;
  if char_length(v_nota) > 500 then
    raise exception 'roteiro:nota' using errcode = 'P0001';
  end if;
  select greatest(v_r.versao_atual, coalesce(max(v.n), 0)) + 1 into v_n from maestro.roteiro_versoes v where v.org_id = v_org and v.roteiro_id = v_r.id;
  insert into maestro.roteiro_versoes (org_id, roteiro_id, n, titulo, conteudo, sha256, duracao_seg, nota, demo, criado_por)
    values (v_org, v_r.id, v_n, v_r.titulo, v_r.conteudo, encode(sha256(convert_to(v_r.conteudo::text, 'UTF8')), 'hex'),
            v_r.duracao_seg, v_nota, v_r.demo, maestro.current_sub())
    returning * into v_v;
  update maestro.roteiros r set versao_atual = v_v.n where r.org_id = v_org and r.id = v_r.id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_org, maestro.current_sub(), 'roteiro.versao', 'roteiro', v_r.id::text, jsonb_build_object('n', v_v.n, 'sha256', v_v.sha256));
  return v_v;
end
$$;
revoke all on function maestro.roteiro_versao_salvar(uuid, text) from public;
grant execute on function maestro.roteiro_versao_salvar(uuid, text) to maestro_app;
