-- Maestro · 0012 · Pedido público e aceite do orçamento (plano v2 §6.2, §6.3 e §4.4; fase 14). Só acrescenta.
--
-- Dois links públicos, os dois com token de 32 bytes que o banco guarda só como sha256 (e a cópia cifrada, token_enc,
-- para a equipe copiar de novo), revogação individual e uso registrado:
--   * `pedido`: o formulário de pedido de orçamento da produtora (/p/<token>). Sem validade, revogável e trocável; um
--     ativo por organização.
--   * `orcamento`: o orçamento para o cliente ver e aceitar (/o/<token>). Vale até o fim da validade do orçamento; um
--     ativo por orçamento (gerar outro troca).
-- Quem não tem conta só passa pela porta estreita (security definer, chamadas por maestro_app SEM organização na
-- sessão): pedido_form, pedido_enviar, orcamento_link_abrir, orcamento_link_aceitar e orcamento_link_ajuste. Cada uma
-- confere o hash, a revogação e a validade, e só toca as linhas daquele link. O aceite vale uma vez: abre o projeto
-- (e o cliente, se ainda não existe) e lança as parcelas a receber no Financeiro, numa transação.

-- ───────────── links públicos ─────────────

create table if not exists maestro.links_publicos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  tipo text not null check (tipo in ('pedido', 'orcamento')),
  orcamento_id uuid,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_enc text,
  expira_em timestamptz,
  revogado_em timestamptz,
  revogado_por uuid,
  -- pedido: { perguntas: { ideia, datas, local, investimento: bool }, boasVindas }
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) <= 8192),
  uses integer not null default 0,
  last_used_at timestamptz,
  demo boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  check ((tipo = 'orcamento') = (orcamento_id is not null)),
  foreign key (org_id, orcamento_id) references maestro.orcamentos (org_id, id) on delete cascade
);
create unique index if not exists links_publicos_um_pedido_uq on maestro.links_publicos (org_id) where tipo = 'pedido' and revogado_em is null;
create unique index if not exists links_publicos_um_por_orcamento_uq on maestro.links_publicos (orcamento_id) where tipo = 'orcamento' and revogado_em is null;

-- ───────────── pedidos ─────────────

create table if not exists maestro.pedidos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references maestro.organizations (id) on delete cascade,
  link_id uuid,
  protocolo text not null check (protocolo ~ '^[A-Z0-9]{6,10}$'),
  status text not null default 'novo' check (status in ('novo', 'em_orcamento', 'recusado', 'virou_projeto')),
  nome text not null check (char_length(nome) between 2 and 120),
  empresa text check (empresa is null or char_length(empresa) <= 120),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  -- { modelo, tipo, nicho, vars: { chave: valor }, inicio, fim, local, investimento, ideia } (validado no servidor e aqui)
  respostas jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object' and pg_column_size(respostas) <= 16384),
  consentimento_em timestamptz not null,
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  idem text check (idem is null or char_length(idem) between 8 and 64),
  cliente_id uuid,
  orcamento_id uuid,
  notas text check (notas is null or char_length(notas) <= 2000),
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, protocolo),
  check (email is not null or whatsapp is not null),
  foreign key (org_id, link_id) references maestro.links_publicos (org_id, id) on delete set null (link_id),
  foreign key (org_id, cliente_id) references maestro.clients (org_id, id) on delete set null (cliente_id),
  foreign key (org_id, orcamento_id) references maestro.orcamentos (org_id, id) on delete set null (orcamento_id)
);
create unique index if not exists pedidos_idem_uq on maestro.pedidos (link_id, idem) where idem is not null;
create index if not exists pedidos_org_idx on maestro.pedidos (org_id, status, created_at desc);
create or replace trigger pedidos_touch before update on maestro.pedidos for each row execute function maestro.touch_updated_at();

-- O orçamento lembra de que pedido nasceu, o aceite do cliente (termo) e o último pedido de ajuste.
alter table maestro.orcamentos add column if not exists pedido_id uuid;
alter table maestro.orcamentos add column if not exists aceite jsonb;
alter table maestro.orcamentos add column if not exists retorno jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orcamentos_pedido_fk' and conrelid = 'maestro.orcamentos'::regclass) then
    alter table maestro.orcamentos add constraint orcamentos_pedido_fk
      foreign key (org_id, pedido_id) references maestro.pedidos (org_id, id) on delete set null (pedido_id);
  end if;
end
$$;

-- ───────────── RLS e papéis ─────────────
-- Links públicos: só administração e gestão veem, criam e revogam (aceite lança no Financeiro, que é deles).
-- Pedidos: a equipe comercial (admin, gestor e equipe) trabalha; administração e gestão apagam (LGPD: apagar a pedido).
select maestro.politicas_padrao('links_publicos', array['admin', 'gestor'], array['admin', 'gestor'], array['admin', 'gestor']);
select maestro.politicas_padrao('pedidos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor']);

-- ───────────── porta estreita ─────────────

-- O link público vivo do hash e do tipo: não revogado e dentro da validade. Interna (sem grant).
create or replace function maestro.publico_link_vivo(p_token_hash text, p_tipo text) returns maestro.links_publicos
language sql stable security definer set search_path = '' as $$
  select l.*
    from maestro.links_publicos l
   where p_token_hash ~ '^[0-9a-f]{64}$'
     and l.token_hash = p_token_hash
     and l.tipo = p_tipo
     and l.revogado_em is null
     and (l.expira_em is null or l.expira_em > now())
$$;

-- Uso do link: conta sempre; audita no máximo uma abertura a cada 10 minutos. Interna.
create or replace function maestro.publico_link_usar(p_link maestro.links_publicos, p_acao text, p_alvo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_link.last_used_at is null or p_link.last_used_at < now() - interval '10 minutes' then
    insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
      values (p_link.org_id, null, p_acao, p_alvo, coalesce(p_link.orcamento_id::text, p_link.id::text), jsonb_build_object('link', p_link.id));
  end if;
  update maestro.links_publicos l set uses = l.uses + 1, last_used_at = now() where l.id = p_link.id;
end
$$;

-- O formulário de pedido: a marca, as perguntas ativas, os tipos de trabalho (modelos ativos) e as variáveis da tabela
-- de preços (sem multiplicador nem preço: o cliente nunca vê conta interna). null = link morto.
create or replace function maestro.pedido_form(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_l maestro.links_publicos;
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'pedido');
  if v_l.id is null then
    return null;
  end if;
  perform maestro.publico_link_usar(v_l, 'pedido.abrir', 'link');
  return jsonb_build_object(
    'marca', maestro.marca_publica(v_l.org_id),
    'config', v_l.config,
    'modelos', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'descricao', m.descricao, 'nicho', m.nicho) order by m.nome)
        from maestro.orcamento_modelos m where m.org_id = v_l.org_id and m.ativo), '[]'::jsonb),
    'variaveis', coalesce((
      select jsonb_agg(jsonb_build_object(
               'chave', v.chave, 'rotulo', v.rotulo, 'tipo', v.tipo,
               'opcoes', (select coalesce(jsonb_agg(jsonb_build_object('valor', o ->> 'valor', 'rotulo', o ->> 'rotulo')), '[]'::jsonb)
                            from jsonb_array_elements(v.opcoes) o)
             ) order by v.ordem, v.rotulo)
        from maestro.precos_variaveis v where v.org_id = v_l.org_id), '[]'::jsonb)
  );
end
$$;

-- Grava o pedido. Confere tudo de novo (o servidor já validou): nome, um contato, consentimento, tamanhos, o modelo
-- (só se for um modelo ativo da própria organização) e a chave do aparelho (mandar duas vezes devolve o mesmo protocolo).
create or replace function maestro.pedido_enviar(p_token_hash text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_r jsonb := coalesce(p_dados -> 'respostas', '{}'::jsonb);
  v_nome text := left(btrim(regexp_replace(coalesce(p_dados ->> 'nome', ''), '\s+', ' ', 'g')), 120);
  v_empresa text := nullif(left(btrim(regexp_replace(coalesce(p_dados ->> 'empresa', ''), '\s+', ' ', 'g')), 120), '');
  v_email text := nullif(lower(btrim(coalesce(p_dados ->> 'email', ''))), '');
  v_whats text := nullif(regexp_replace(coalesce(p_dados ->> 'whatsapp', ''), '\D', '', 'g'), '');
  v_idem text := nullif(p_dados ->> 'idem', '');
  v_modelo uuid;
  v_p maestro.pedidos;
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'pedido');
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if (v_d ->> 'consentimento') is distinct from 'true' then
    return jsonb_build_object('erro', 'consentimento');
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('erro', 'email');
  end if;
  if v_whats is not null and v_whats !~ '^[0-9]{10,13}$' then
    return jsonb_build_object('erro', 'whatsapp');
  end if;
  if v_email is null and v_whats is null then
    return jsonb_build_object('erro', 'contato');
  end if;
  if jsonb_typeof(v_r) <> 'object' or pg_column_size(v_r) > 16384 then
    return jsonb_build_object('erro', 'respostas');
  end if;
  if v_idem is not null and char_length(v_idem) not between 8 and 64 then
    return jsonb_build_object('erro', 'idem');
  end if;
  if (v_r ->> 'modelo') ~ '^[0-9a-f-]{36}$' then
    select m.id into v_modelo from maestro.orcamento_modelos m where m.org_id = v_l.org_id and m.id = (v_r ->> 'modelo')::uuid and m.ativo;
  end if;
  v_r := case when v_modelo is null then v_r - 'modelo' else v_r || jsonb_build_object('modelo', v_modelo) end;

  if v_idem is not null then
    select * into v_p from maestro.pedidos p where p.link_id = v_l.id and p.idem = v_idem;
    if found then
      return jsonb_build_object('ok', true, 'protocolo', v_p.protocolo, 'repetido', true);
    end if;
  end if;
  insert into maestro.pedidos (org_id, link_id, protocolo, nome, empresa, email, whatsapp, respostas, consentimento_em, ip_hash, idem, demo)
  values (v_l.org_id, v_l.id, upper(substr(md5(gen_random_uuid()::text), 1, 8)), v_nome, v_empresa, v_email, v_whats, v_r, now(),
          case when (v_d ->> 'ip') ~ '^[0-9a-f]{64}$' then v_d ->> 'ip' end, v_idem, v_l.demo)
  returning * into v_p;
  update maestro.links_publicos l set uses = l.uses + 1, last_used_at = now() where l.id = v_l.id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_l.org_id, null, 'pedido.recebeu', 'pedido', v_p.id::text, jsonb_build_object('link', v_l.id));
  return jsonb_build_object('ok', true, 'protocolo', v_p.protocolo, 'repetido', false);
end
$$;

-- O orçamento como o cliente vê: a marca, o documento (sem custo, margem nem nota interna), as parcelas, o aceite e o
-- último pedido de ajuste. Só orçamento enviado ou aprovado aparece; o resto (rascunho, recusado) é link morto.
create or replace function maestro.orcamento_link_abrir(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_q maestro.orcamentos;
  v_r jsonb;
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'orcamento');
  if v_l.id is null then
    return null;
  end if;
  select * into v_q from maestro.orcamentos q where q.org_id = v_l.org_id and q.id = v_l.orcamento_id;
  if not found or v_q.status not in ('enviado', 'aprovado') then
    return null;
  end if;
  perform maestro.publico_link_usar(v_l, 'orcamento.abrir', 'orcamento');
  select jsonb_build_object(
    'marca', maestro.marca_publica(v_l.org_id),
    'empresa', jsonb_build_object(
      'razao', o.settings -> 'empresa' ->> 'razao', 'instagram', o.settings -> 'empresa' ->> 'instagram',
      'site', o.settings -> 'empresa' ->> 'site', 'fechamento', o.settings -> 'empresa' ->> 'fechamento'),
    'orcamento', jsonb_build_object(
      'numero', v_q.numero, 'versao', v_q.versao, 'titulo', v_q.titulo, 'status', v_q.status,
      'emissao', v_q.emissao, 'validade', v_q.validade, 'periodo', v_q.periodo, 'escopo', v_q.escopo,
      'pagamento', v_q.pagamento, 'condicoes', v_q.condicoes, 'desconto', v_q.desconto_cents,
      'parcelas', v_q.parcelas, 'aceite', case when v_q.aceite is not null then jsonb_build_object('nome', v_q.aceite ->> 'nome', 'em', v_q.aceite ->> 'em') end,
      'retorno', v_q.retorno, 'hoje', current_date),
    'para', (select jsonb_build_object('nome', coalesce(nullif(c.company, ''), c.name), 'contato', c.contact_name, 'cidade', c.city, 'documento', c.document)
               from maestro.clients c where c.org_id = v_l.org_id and c.id = v_q.cliente_id),
    'pedido', (select jsonb_build_object('nome', coalesce(p.empresa, p.nome), 'contato', p.nome)
                 from maestro.pedidos p where p.org_id = v_l.org_id and p.id = v_q.pedido_id),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object('descricao', i.descricao, 'detalhe', i.detalhe, 'quantidade', i.quantidade, 'unidade', i.unidade,
                                          'preco', i.preco_cents) order by i.ordem)
        from maestro.orcamento_itens i where i.org_id = v_l.org_id and i.orcamento_id = v_q.id), '[]'::jsonb)
  ) into v_r
  from maestro.organizations o where o.id = v_l.org_id;
  return v_r;
end
$$;

-- "Aceitar": nome e aceite. Vale uma vez (aceitar de novo devolve o que já foi feito). Abre o projeto (e o cliente, se o
-- orçamento ainda não tem), lança as parcelas a receber (as datas andam para frente se o aceite chegou depois da
-- primeira), marca o orçamento como aprovado com o termo (nome, hora e o sha256 do que foi aceito) e o pedido como
-- "virou projeto". Tudo numa transação.
create or replace function maestro.orcamento_link_aceitar(p_token_hash text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_q maestro.orcamentos;
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_nome text := left(btrim(regexp_replace(coalesce(p_dados ->> 'nome', ''), '\s+', ' ', 'g')), 80);
  v_sub bigint;
  v_total bigint;
  v_parcelas jsonb;
  v_desloca integer;
  v_soma bigint;
  v_n integer;
  v_p jsonb;
  v_i integer := 0;
  v_cliente uuid;
  v_ped maestro.pedidos;
  v_projeto uuid;
  v_codigo text;
  v_ano text := to_char(current_date, 'YYYY');
  v_hash text;
  v_em text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'orcamento');
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  select * into v_q from maestro.orcamentos q where q.org_id = v_l.org_id and q.id = v_l.orcamento_id for update;
  if not found then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_q.status = 'aprovado' then
    if v_q.aceite is not null then
      return jsonb_build_object('ok', true, 'repetido', true, 'nome', v_q.aceite ->> 'nome');
    end if;
    return jsonb_build_object('erro', 'status');
  end if;
  if v_q.status <> 'enviado' then
    return jsonb_build_object('erro', 'status');
  end if;
  if v_q.validade is not null and v_q.validade < current_date then
    return jsonb_build_object('erro', 'vencido');
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if (v_d ->> 'aceite') is distinct from 'true' then
    return jsonb_build_object('erro', 'aceite');
  end if;
  if exists (select 1 from maestro.orcamentos q where q.org_id = v_q.org_id and q.numero = v_q.numero and q.status = 'aprovado') then
    return jsonb_build_object('erro', 'status');
  end if;
  -- Uma versão mais nova do mesmo número tira o valor desta: a equipe manda o link novo.
  if exists (select 1 from maestro.orcamentos q where q.org_id = v_q.org_id and q.numero = v_q.numero and q.versao > v_q.versao) then
    return jsonb_build_object('erro', 'versao_nova');
  end if;

  -- Os mesmos totais do motor (src/lib/orcamento/motor.ts): linha = round(qtd × preço); desconto até o subtotal.
  select coalesce(sum(round(i.quantidade * i.preco_cents)), 0)::bigint into v_sub
    from maestro.orcamento_itens i where i.org_id = v_q.org_id and i.orcamento_id = v_q.id;
  v_total := v_sub - least(greatest(v_q.desconto_cents, 0), v_sub);
  if v_total <= 0 then
    return jsonb_build_object('erro', 'sem_valor');
  end if;

  v_parcelas := coalesce(v_q.parcelas, '[]'::jsonb);
  if jsonb_typeof(v_parcelas) <> 'array' or jsonb_array_length(v_parcelas) = 0 then
    v_parcelas := jsonb_build_array(jsonb_build_object('rotulo', 'parcela única', 'valorCents', v_total, 'vencimento', current_date));
  end if;
  v_n := jsonb_array_length(v_parcelas);
  select coalesce(sum((p ->> 'valorCents')::bigint), 0) into v_soma from jsonb_array_elements(v_parcelas) p;
  if v_n > 3 or v_soma <> v_total then
    return jsonb_build_object('erro', 'parcelas');
  end if;
  v_desloca := greatest(0, current_date - (v_parcelas -> 0 ->> 'vencimento')::date);
  select jsonb_agg(p || jsonb_build_object('vencimento', ((p ->> 'vencimento')::date + v_desloca)::text) order by ord)
    into v_parcelas from jsonb_array_elements(v_parcelas) with ordinality as t(p, ord);

  -- Cliente: o do orçamento (um lead vira ativo) ou um novo, com os dados do pedido.
  v_cliente := v_q.cliente_id;
  if v_q.pedido_id is not null then
    select * into v_ped from maestro.pedidos p where p.org_id = v_q.org_id and p.id = v_q.pedido_id for update;
  end if;
  if v_cliente is null then
    insert into maestro.clients (org_id, name, company, contact_name, email, whatsapp, status, notes, demo)
    values (v_q.org_id, coalesce(v_ped.empresa, v_ped.nome, v_nome), v_ped.empresa, coalesce(v_ped.nome, v_nome), v_ped.email, v_ped.whatsapp, 'ativo',
            'Chegou pelo aceite do orçamento ' || v_q.numero || '.', v_q.demo)
    returning id into v_cliente;
  else
    update maestro.clients c set status = 'ativo' where c.org_id = v_q.org_id and c.id = v_cliente and c.status = 'lead';
  end if;

  -- Projeto: o do orçamento ou um novo (MAE-AAAA-NNN, a mesma numeração de src/lib/crm/projetos.ts).
  v_projeto := v_q.projeto_id;
  if v_projeto is null then
    perform pg_advisory_xact_lock(hashtext('maestro:codigo:' || v_q.org_id::text || ':' || v_ano));
    select 'MAE-' || v_ano || '-' || lpad((coalesce(max(substring(p.code from '^MAE-[0-9]{4}-([0-9]{3,5})$')::int), 0) + 1)::text, 3, '0')
      into v_codigo from maestro.projects p where p.org_id = v_q.org_id and p.code like 'MAE-' || v_ano || '-%';
    insert into maestro.projects (org_id, client_id, code, title, category, status, value_cents, briefing, link_status, demo)
    values (v_q.org_id, v_cliente, v_codigo, v_q.titulo, v_q.categoria, 'active', v_total, v_q.escopo, 'pending', v_q.demo)
    returning id into v_projeto;
  else
    update maestro.projects p set value_cents = v_total where p.org_id = v_q.org_id and p.id = v_projeto returning p.code into v_codigo;
  end if;

  for v_p in select value from jsonb_array_elements(v_parcelas) loop
    v_i := v_i + 1;
    insert into maestro.lancamentos (org_id, tipo, categoria, descricao, valor_cents, vencimento, parcela, projeto_id, cliente_id, orcamento_id, demo)
    values (v_q.org_id, 'entrada', 'cliente',
            left(coalesce((select c.name from maestro.clients c where c.id = v_cliente), v_q.titulo) || ' · ' || coalesce(v_p ->> 'rotulo', 'parcela'), 200),
            (v_p ->> 'valorCents')::bigint, (v_p ->> 'vencimento')::date, v_i || '/' || v_n, v_projeto, v_cliente, v_q.id, v_q.demo);
  end loop;

  v_hash := encode(sha256(convert_to(v_q.id::text || E'\n' || v_q.numero || E'\n' || v_q.versao || E'\n' || v_total || E'\n' || v_parcelas::text
                                     || E'\n' || v_nome || E'\n' || v_em, 'UTF8')), 'hex');
  update maestro.orcamentos q
     set status = 'aprovado', decidido_em = now(), projeto_id = v_projeto, cliente_id = v_cliente, parcelas = v_parcelas,
         aceite = jsonb_build_object('nome', v_nome, 'em', v_em, 'hash', v_hash, 'total', v_total, 'link', v_l.id,
                                     'ip', case when (v_d ->> 'ip') ~ '^[0-9a-f]{64}$' then v_d ->> 'ip' end, 'ua', left(v_d ->> 'ua', 300))
   where q.org_id = v_q.org_id and q.id = v_q.id;
  if v_ped.id is not null then
    update maestro.pedidos p set status = 'virou_projeto', cliente_id = coalesce(p.cliente_id, v_cliente), orcamento_id = coalesce(p.orcamento_id, v_q.id)
     where p.org_id = v_q.org_id and p.id = v_ped.id;
  end if;
  update maestro.links_publicos l set uses = l.uses + 1, last_used_at = now() where l.id = v_l.id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_q.org_id, null, 'orcamento.aceite', 'orcamento', v_q.id::text,
            jsonb_build_object('link', v_l.id, 'numero', v_q.numero, 'versao', v_q.versao, 'projeto', v_codigo, 'hash', v_hash));
  return jsonb_build_object('ok', true, 'repetido', false, 'nome', v_nome, 'hash', v_hash);
end
$$;

-- "Pedir ajuste": o nome e o que mudar. Fica no orçamento (o último) e na auditoria; a equipe faz uma versão nova.
create or replace function maestro.orcamento_link_ajuste(p_token_hash text, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l maestro.links_publicos;
  v_q maestro.orcamentos;
  v_nome text := left(btrim(regexp_replace(coalesce(p_dados ->> 'nome', ''), '\s+', ' ', 'g')), 80);
  v_texto text := btrim(coalesce(p_dados ->> 'texto', ''));
begin
  v_l := maestro.publico_link_vivo(p_token_hash, 'orcamento');
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  select * into v_q from maestro.orcamentos q where q.org_id = v_l.org_id and q.id = v_l.orcamento_id for update;
  if not found or v_q.status <> 'enviado' then
    return jsonb_build_object('erro', 'status');
  end if;
  if exists (select 1 from maestro.orcamentos q where q.org_id = v_q.org_id and q.numero = v_q.numero and q.versao > v_q.versao) then
    return jsonb_build_object('erro', 'versao_nova');
  end if;
  if char_length(v_nome) < 2 then
    return jsonb_build_object('erro', 'nome');
  end if;
  if char_length(v_texto) not between 1 and 2000 then
    return jsonb_build_object('erro', 'texto');
  end if;
  update maestro.orcamentos q
     set retorno = jsonb_build_object('tipo', 'ajuste', 'nome', v_nome, 'texto', v_texto, 'em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where q.org_id = v_q.org_id and q.id = v_q.id;
  insert into maestro.audit_log (org_id, actor_sub, action, target_type, target_id, metadata)
    values (v_q.org_id, null, 'orcamento.ajuste', 'orcamento', v_q.id::text, jsonb_build_object('link', v_l.id));
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function
  maestro.publico_link_vivo(text, text), maestro.publico_link_usar(maestro.links_publicos, text, text),
  maestro.pedido_form(text), maestro.pedido_enviar(text, jsonb),
  maestro.orcamento_link_abrir(text), maestro.orcamento_link_aceitar(text, jsonb), maestro.orcamento_link_ajuste(text, jsonb)
from public;
grant execute on function
  maestro.pedido_form(text), maestro.pedido_enviar(text, jsonb),
  maestro.orcamento_link_abrir(text), maestro.orcamento_link_aceitar(text, jsonb), maestro.orcamento_link_ajuste(text, jsonb)
to maestro_app;
