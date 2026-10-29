-- Maestro · 0020 · Contrato junto com o orçamento e "Maestro com a sua marca" (decisões do titular, 29/10/2026). Só acrescenta.
--
-- CONTRATO (estudo MakersHub §4, item 4): a produtora tem um modelo de contrato de prestação de serviços audiovisuais
-- (Ajustes → Contrato) com {{variáveis}}. O Maestro traz um modelo base (src/lib/contrato/modelo.ts) que a produtora
-- revisa com um advogado; cada "Salvar" é uma versão nova (só inclusão). Por orçamento, "Enviar contrato junto": o
-- cliente vê o contrato preenchido em /o/<token>, informa nome, CPF/CNPJ e endereço, marca "Li e aceito" e aceita. É um
-- ACEITE ELETRÔNICO (registro de quem, quando e o quê), não assinatura com certificado ICP-Brasil.
-- O aceite grava `maestro.contratos`: o HTML preenchido, o sha256 dele (conferido pelo banco num check), a hora, o IP
-- só como HMAC do dia, o navegador, nome e documento. Imutável: nada atualiza; só sai a linha de demonstração (ou junto
-- com a organização). Só administração e gestão leem (tem valor e documento do cliente); ninguém insere direto: só a
-- porta `orcamento_link_aceitar_contrato`, que aceita o orçamento (a mesma `orcamento_link_aceitar` da 0012) e grava o
-- contrato na mesma transação. Orçamento com contrato não aceita pelo link sem o contrato (gatilho).
--
-- MARCA PRÓPRIA (plano v2 §8, fase 20): `organizations.zro_features` guarda a claim `zro_features` do HUB (gravada no
-- login e na releitura do perfil, como `zro_products`). Com `maestro.marca_propria`, o app inteiro e as páginas do
-- cliente usam a marca da produtora e só um "Powered by Absolute ZRO"; sem, nada muda. A `marca_publica` passa a dizer
-- `propria` às páginas sem conta.

-- ───────────── marca própria ─────────────

alter table maestro.organizations add column if not exists zro_features text[] not null default '{}'::text[];

create or replace function maestro.marca_publica(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'nome', coalesce(m.nome, o.name),
           'cor', m.cor,
           'logo', case when m.logo_sha256 is not null then '/api/marca/' || o.id::text || '/' || m.logo_sha256 end,
           'email', m.email,
           'telefone', m.telefone,
           'cnpj', m.cnpj,
           'endereco', m.endereco,
           'assinatura', m.assinatura,
           'propria', 'maestro.marca_propria' = any (o.zro_features))
    from maestro.organizations o
    left join maestro.org_marca m on m.org_id = o.id
   where o.id = p_org
$$;
revoke all on function maestro.marca_publica(uuid) from public;

-- ───────────── modelo do contrato (versões) ─────────────

create table if not exists maestro.contrato_modelos (
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  versao integer not null check (versao between 1 and 100000),
  texto text not null check (char_length(texto) between 20 and 40000),
  -- números e textos que o modelo usa ({{revisoes_incluidas}}, {{multa_cancelamento_pct}}…): src/lib/contrato/modelo.ts
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 8192),
  -- true = "Restaurar o modelo base" (o texto é o do Maestro daquele dia)
  padrao boolean not null default false,
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (org_id, versao)
);
-- Administração escreve; gestão lê (monta o orçamento e liga o contrato); só a demonstração se apaga.
select maestro.politicas_padrao('contrato_modelos', array['admin'], array['admin'], array['admin', 'gestor']);

-- ───────────── contrato aceito (registro imutável) ─────────────

create table if not exists maestro.contratos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  orcamento_id uuid not null,
  cliente_id uuid,
  projeto_id uuid,
  link_id uuid,
  modelo_versao integer not null check (modelo_versao >= 0),
  html text not null check (char_length(html) between 50 and 200000),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  nome text not null check (char_length(nome) between 2 and 120),
  documento text not null check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  endereco text not null check (char_length(endereco) between 5 and 300),
  portfolio boolean not null default true,
  aceito_em timestamptz not null default now(),
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (orcamento_id),
  -- o hash é do HTML gravado, sempre: o banco confere
  constraint contratos_hash_confere check (hash = encode(sha256(convert_to(html, 'UTF8')), 'hex')),
  foreign key (org_id, orcamento_id) references maestro.orcamentos (org_id, id),
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id),
  foreign key (org_id, projeto_id) references maestro.projects (org_id, id)
);
create index if not exists contratos_projeto_idx on maestro.contratos (org_id, projeto_id);
create index if not exists contratos_cliente_idx on maestro.contratos (org_id, cliente_id);

alter table maestro.contratos enable row level security;
drop policy if exists contratos_leitura on maestro.contratos;
create policy contratos_leitura on maestro.contratos for select to maestro_app
  using (org_id = maestro.current_org_id() and maestro.is_member(org_id) and maestro.has_role(org_id, array['admin', 'gestor']));
drop policy if exists contratos_demo on maestro.contratos;
create policy contratos_demo on maestro.contratos for delete to maestro_app
  using (demo and org_id = maestro.current_org_id() and maestro.has_role(org_id, array['admin', 'gestor']));
-- Acesso por cliente (0018): tabela ligada a cliente leva a política restritiva `_cliente`.
drop policy if exists contratos_cliente on maestro.contratos;
create policy contratos_cliente on maestro.contratos as restrictive for all to maestro_app
  using (maestro.cliente_visivel(org_id, cliente_id)) with check (maestro.cliente_visivel(org_id, cliente_id));
grant select, delete on maestro.contratos to maestro_app;

-- Imutáveis: o registro do aceite não muda nunca; só sai a linha de demonstração ou junto com a organização. Modelos:
-- versões só se acrescentam (mesma regra).
create or replace function maestro.registro_imutavel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'registro imutável: % não muda', tg_table_name using errcode = '42501';
  end if;
  if old.demo or not exists (select 1 from maestro.organizations o where o.id = old.org_id) then
    return old;
  end if;
  raise exception 'registro imutável: % não se apaga', tg_table_name using errcode = '42501';
end
$$;
revoke all on function maestro.registro_imutavel() from public;
drop trigger if exists contratos_imutavel on maestro.contratos;
create trigger contratos_imutavel before update or delete on maestro.contratos for each row execute function maestro.registro_imutavel();
drop trigger if exists contrato_modelos_imutavel on maestro.contrato_modelos;
create trigger contrato_modelos_imutavel before update or delete on maestro.contrato_modelos for each row execute function maestro.registro_imutavel();

-- ───────────── orçamento: "Enviar contrato junto" ─────────────

alter table maestro.orcamentos add column if not exists contrato boolean not null default false;

-- Orçamento com contrato só se aceita pelo link com o contrato (a porta abaixo marca a transação); e o contrato de um
-- orçamento aprovado não se liga nem se desliga.
create or replace function maestro.orcamento_exige_contrato() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.contrato is distinct from old.contrato and old.status = 'aprovado' then
    raise exception 'orçamento aprovado: o contrato não muda' using errcode = '42501';
  end if;
  if new.contrato and new.aceite is not null and old.aceite is null
     and coalesce(current_setting('maestro.contrato_aceite', true), '') <> new.id::text then
    raise exception 'este orçamento pede o aceite do contrato' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists orcamentos_exige_contrato on maestro.orcamentos;
create trigger orcamentos_exige_contrato before update on maestro.orcamentos for each row execute function maestro.orcamento_exige_contrato();

-- ───────────── porta estreita (cliente sem conta) ─────────────

-- O que a página /o precisa do contrato: se vai junto, o modelo vigente (null = o modelo base do Maestro, versão 0), a
-- sede da produtora (foro padrão) e, se já aceito, o registro (o HTML gravado e o hash).
create or replace function maestro.orcamento_link_contrato(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_q maestro.orcamentos;
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'orcamento');
  if v_l.id is null then
    return null;
  end if;
  select * into v_q from maestro.orcamentos q where q.org_id = v_l.org_id and q.id = v_l.orcamento_id;
  if not found or v_q.status not in ('enviado', 'aprovado') then
    return null;
  end if;
  if not v_q.contrato then
    return jsonb_build_object('enviar', false);
  end if;
  return jsonb_build_object(
    'enviar', true,
    'modelo', (select jsonb_build_object('versao', m.versao, 'texto', m.texto, 'config', m.config)
                 from maestro.contrato_modelos m where m.org_id = v_q.org_id order by m.versao desc limit 1),
    'sede', (select jsonb_build_object('cidade', o.settings -> 'empresa' ->> 'cidade', 'uf', o.settings -> 'empresa' ->> 'uf')
               from maestro.organizations o where o.id = v_q.org_id),
    'aceito', (select jsonb_build_object('id', c.id, 'html', c.html, 'hash', c.hash, 'em', c.aceito_em, 'nome', c.nome)
                 from maestro.contratos c where c.org_id = v_q.org_id and c.orcamento_id = v_q.id));
end
$$;

-- Aceitar com o contrato. Sem contrato no orçamento, é a `orcamento_link_aceitar` de sempre. Com contrato: confere o
-- documento (11 ou 14 dígitos), o endereço, o HTML e o sha256 dele e se o modelo ainda é o vigente; aceita o orçamento
-- (projeto, cliente, parcelas, termo) e grava o contrato, tudo numa transação. Repetir devolve o que já foi feito.
create or replace function maestro.orcamento_link_aceitar_contrato(p_token_hash text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_q maestro.orcamentos;
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_c jsonb := p_dados -> 'contrato';
  v_doc text;
  v_end text;
  v_html text;
  v_hash text;
  v_versao integer;
  v_r jsonb;
  v_id uuid;
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'orcamento');
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  select * into v_q from maestro.orcamentos q where q.org_id = v_l.org_id and q.id = v_l.orcamento_id for update;
  if not found then
    return jsonb_build_object('erro', 'link');
  end if;
  if not v_q.contrato or v_q.status <> 'enviado' then
    return maestro.orcamento_link_aceitar(p_token_hash, p_dados);
  end if;
  if v_c is null or jsonb_typeof(v_c) <> 'object' then
    return jsonb_build_object('erro', 'contrato');
  end if;
  if (v_d ->> 'aceite') is distinct from 'true' then
    return jsonb_build_object('erro', 'aceite');
  end if;
  v_doc := regexp_replace(coalesce(v_c ->> 'documento', ''), '\D', '', 'g');
  if v_doc !~ '^([0-9]{11}|[0-9]{14})$' then
    return jsonb_build_object('erro', 'documento');
  end if;
  v_end := btrim(regexp_replace(coalesce(v_c ->> 'endereco', ''), '\s+', ' ', 'g'));
  if char_length(v_end) not between 5 and 300 then
    return jsonb_build_object('erro', 'endereco');
  end if;
  v_html := coalesce(v_c ->> 'html', '');
  if char_length(v_html) not between 50 and 200000 then
    return jsonb_build_object('erro', 'contrato');
  end if;
  v_hash := encode(sha256(convert_to(v_html, 'UTF8')), 'hex');
  if (v_c ->> 'hash') is distinct from v_hash then
    return jsonb_build_object('erro', 'hash');
  end if;
  select coalesce(max(m.versao), 0) into v_versao from maestro.contrato_modelos m where m.org_id = v_q.org_id;
  if (v_c ->> 'modelo_versao') is distinct from v_versao::text then
    return jsonb_build_object('erro', 'contrato_mudou');
  end if;

  perform set_config('maestro.contrato_aceite', v_q.id::text, true);
  v_r := maestro.orcamento_link_aceitar(p_token_hash, p_dados);
  perform set_config('maestro.contrato_aceite', '', true);
  if v_r ? 'erro' or coalesce((v_r ->> 'repetido')::boolean, false) then
    return v_r;
  end if;

  select * into v_q from maestro.orcamentos q where q.org_id = v_q.org_id and q.id = v_q.id;
  insert into maestro.contratos (org_id, orcamento_id, cliente_id, projeto_id, link_id, modelo_versao, html, hash, nome, documento, endereco,
                                 portfolio, ip_hash, user_agent, demo)
  values (v_q.org_id, v_q.id, v_q.cliente_id, v_q.projeto_id, v_l.id, v_versao, v_html, v_hash, left(v_r ->> 'nome', 120), v_doc, v_end,
          coalesce((v_c ->> 'portfolio')::boolean, true),
          case when (v_d ->> 'ip') ~ '^[0-9a-f]{64}$' then v_d ->> 'ip' end, left(v_d ->> 'ua', 300), v_q.demo)
  returning id into v_id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_q.org_id, null, 'contrato.aceito', 'contrato', v_id::text,
            jsonb_build_object('orcamento', v_q.id, 'numero', v_q.numero, 'versao', v_q.versao, 'modelo', v_versao, 'hash', v_hash));
  return v_r || jsonb_build_object('contrato', v_id, 'contrato_hash', v_hash);
end
$$;

revoke all on function maestro.orcamento_link_contrato(text), maestro.orcamento_link_aceitar_contrato(text, jsonb) from public;
grant execute on function maestro.orcamento_link_contrato(text), maestro.orcamento_link_aceitar_contrato(text, jsonb) to maestro_app;
