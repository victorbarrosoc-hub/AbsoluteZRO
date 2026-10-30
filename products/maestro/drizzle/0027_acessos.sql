-- Maestro · 0027 · Acesso por área (pedido do titular, 29/10/2026: "o Administrador da conta tem o controle de quem tem
-- que função dentro da plataforma… uma aba do financeiro, só algumas pessoas podem ver, não pode deixar um editor ver").
-- Só acrescenta: nada das 0000–0024 é editado (0025 e 0026 ficam para outras frentes). Mapa em docs/permissoes.md.
--
-- Duas camadas, as duas aqui no banco:
--   1. O papel (admin, gestor, equipe, leitura) segue vindo da Absolute ZRO a cada login e decide escrever/remover.
--   2. Seis ÁREAS SENSÍVEIS. Cada papel tem um padrão (maestro.area_padrao, igual a PADRAO em src/lib/acessos.ts) e a
--      administração liga ou desliga por pessoa (maestro.acessos). Administração vê tudo, sempre.
--        financeiro          contas, baixas, recorrências, metas (e o caixa, a receber e a pagar do Hoje e da Z)
--        orcamentos          orçamentos com valores, custos e margens, tabela de preços, links de orçamento e de pedido,
--                            valor estimado do pedido e valor do projeto
--        contratos           contratos aceitos (documento e endereço do cliente) e o modelo
--        diarias             diárias e cachês da equipe (cadastro do freela, escala, diária do kit)
--        dados_equipe        CPF e PIX (freela_pagamento), e-mail e WhatsApp dos freelas
--        inventario_valores  valor de cada equipamento
-- Tabela inteira de uma área: política RESTRITIVA `<tabela>_area` com maestro.pode() (soma-se à da organização, do
-- papel e do cliente). Coluna de dinheiro numa tabela que todos usam (escala, freela, equipamento, kit, pedido,
-- projeto): o servidor mascara na leitura (`case when maestro.pode(...)`) e o gatilho `*_guarda_area` impede gravar o
-- que a pessoa não vê (na mudança fica o valor de antes; na escala nova a diária vem do cadastro do freela).

-- ───────────── padrão e ajustes ─────────────

create or replace function maestro.area_padrao(p_role text, p_area text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_role
    when 'admin' then true
    -- Gestão vê tudo menos o Financeiro (escolha mais segura; a administração liga por pessoa).
    when 'gestor' then p_area <> 'financeiro'
    else false
  end
$$;

create table if not exists maestro.acessos (
  org_id uuid not null,
  zro_sub uuid not null,
  area text not null check (area in ('financeiro', 'orcamentos', 'contratos', 'diarias', 'dados_equipe', 'inventario_valores')),
  permitido boolean not null,
  atualizado_por uuid not null,
  atualizado_em timestamptz not null default now(),
  primary key (org_id, zro_sub, area),
  foreign key (org_id, zro_sub) references maestro.members (org_id, zro_sub) on delete cascade
);

-- A pessoa da sessão pode ver a área? Administração sempre; os outros, o ajuste da pessoa ou o padrão do papel.
create or replace function maestro.pode(p_org uuid, p_area text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case when m.role = 'admin' then true else coalesce(a.permitido, maestro.area_padrao(m.role, p_area)) end
      from maestro.members m
      left join maestro.acessos a on a.org_id = m.org_id and a.zro_sub = m.zro_sub and a.area = p_area
     where m.org_id = p_org and m.zro_sub = maestro.current_sub() and m.status = 'active'
       and p_org = maestro.current_org_id()
  ), false)
$$;

-- Cada pessoa lê os próprios ajustes; a administração lê e muda os de todos. Mudança vai para audit_log pelo servidor.
alter table maestro.acessos enable row level security;
drop policy if exists acessos_org on maestro.acessos;
create policy acessos_org on maestro.acessos for all to maestro_app
  using (org_id = maestro.current_org_id() and maestro.is_member(org_id))
  with check (org_id = maestro.current_org_id() and maestro.is_member(org_id));
drop policy if exists acessos_leitura on maestro.acessos;
create policy acessos_leitura on maestro.acessos as restrictive for select to maestro_app
  using (zro_sub = maestro.current_sub() or maestro.has_role(org_id, array['admin']));
drop policy if exists acessos_escrita on maestro.acessos;
create policy acessos_escrita on maestro.acessos as restrictive for insert to maestro_app
  with check (maestro.has_role(org_id, array['admin']) and atualizado_por = maestro.current_sub());
drop policy if exists acessos_mudanca on maestro.acessos;
create policy acessos_mudanca on maestro.acessos as restrictive for update to maestro_app
  using (maestro.has_role(org_id, array['admin'])) with check (maestro.has_role(org_id, array['admin']) and atualizado_por = maestro.current_sub());
drop policy if exists acessos_remocao on maestro.acessos;
create policy acessos_remocao on maestro.acessos as restrictive for delete to maestro_app
  using (maestro.has_role(org_id, array['admin']));
grant select, insert, update, delete on maestro.acessos to maestro_app;

-- ───────────── tabelas inteiras de uma área ─────────────

-- Política restritiva `<tabela>_area` (todas as operações). Só o dono das migrações usa.
create or replace function maestro.politica_area(p_tabela text, p_area text) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('drop policy if exists %I on maestro.%I', p_tabela || '_area', p_tabela);
  execute format('create policy %I on maestro.%I as restrictive for all to maestro_app using (maestro.pode(org_id, %L)) with check (maestro.pode(org_id, %L))',
    p_tabela || '_area', p_tabela, p_area, p_area);
end
$$;
revoke all on function maestro.politica_area(text, text) from public;

-- Financeiro: quem tem a área lê; quem tem e não é só leitura escreve (antes: só admin e gestão, pelo papel).
select maestro.politicas_padrao('lancamentos', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('baixas', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('recorrencias', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('recorrencia_execucoes', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politicas_padrao('metas', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politica_area(t, 'financeiro') from unnest(array['lancamentos', 'baixas', 'recorrencias', 'recorrencia_execucoes', 'metas']) t;

-- Orçamentos e preços: antes qualquer papel lia valores, custos e margens.
select maestro.politica_area(t, 'orcamentos')
  from unnest(array['orcamentos', 'orcamento_itens', 'precos_itens', 'precos_faixas', 'precos_variaveis', 'orcamento_modelos', 'links_publicos']) t;
-- Os links (de orçamento e de pedido) seguem com admin e gestão pelo papel, e agora também pela área.

-- Contratos: a leitura deixa de ser "admin e gestão" fixo e passa a ser a área.
drop policy if exists contratos_leitura on maestro.contratos;
create policy contratos_leitura on maestro.contratos for select to maestro_app
  using (org_id = maestro.current_org_id() and maestro.is_member(org_id) and maestro.pode(org_id, 'contratos'));
select maestro.politicas_padrao('contrato_modelos', array['admin'], array['admin']);
select maestro.politica_area('contrato_modelos', 'contratos');

-- Diárias: o cadastro de valores do freela (todos liam).
select maestro.politica_area('freela_valores', 'diarias');

-- Dados da equipe: CPF e PIX. Quem tem a área e não é só leitura grava (antes: admin e gestão pelo papel).
select maestro.politicas_padrao('freela_pagamento', array['admin', 'gestor', 'equipe'], array['admin', 'gestor', 'equipe']);
select maestro.politica_area('freela_pagamento', 'dados_equipe');

-- ───────────── colunas de dinheiro em tabelas de todos: o gatilho guarda ─────────────
-- Vale só para quem chega como maestro_app (pessoa); funções security definer (link do cliente, gatilhos) e o
-- sistema seguem como estão.

-- A diária do cadastro do freela (a da função, senão a menor). Security definer: quem não vê diárias não lê a tabela.
create or replace function maestro.diaria_do_cadastro(p_org uuid, p_freela uuid, p_funcao text) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select v.valor_cents from maestro.freela_valores v
      where v.org_id = p_org and v.freela_id = p_freela and v.unidade = 'diaria' and v.funcao = p_funcao limit 1),
    (select min(v.valor_cents) from maestro.freela_valores v
      where v.org_id = p_org and v.freela_id = p_freela and v.unidade = 'diaria'))
   where p_org = maestro.current_org_id() and maestro.is_member(p_org)
$$;

-- Os gatilhos de guarda rodam como quem chama (security invoker): `current_user` diz se é a pessoa (maestro_app).
create or replace function maestro.escalas_guarda_area() returns trigger
language plpgsql set search_path = '' as $$
declare v bigint;
begin
  if current_user <> 'maestro_app' or maestro.pode(new.org_id, 'diarias') then return new; end if;
  if tg_op = 'INSERT' then
    -- Quem não vê diárias escala a pessoa com a diária do cadastro dela (o valor nunca vem de quem não vê).
    v := maestro.diaria_do_cadastro(new.org_id, new.freela_id, new.funcao);
    new.diaria_cents := v;
    new.valor_cents := coalesce(v, 0) * greatest(new.dias, 0);
  else
    new.diaria_cents := old.diaria_cents;
    new.valor_cents := case when old.diaria_cents is null then old.valor_cents else old.diaria_cents * greatest(new.dias, 0) end;
  end if;
  return new;
end
$$;
drop trigger if exists escalas_guarda_area on maestro.escalas;
create trigger escalas_guarda_area before insert or update on maestro.escalas for each row execute function maestro.escalas_guarda_area();

create or replace function maestro.freela_equipamentos_guarda_area() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'maestro_app' or maestro.pode(new.org_id, 'diarias') then return new; end if;
  new.diaria_cents := case when tg_op = 'INSERT' then null else old.diaria_cents end;
  return new;
end
$$;
drop trigger if exists freela_equipamentos_guarda_area on maestro.freela_equipamentos;
create trigger freela_equipamentos_guarda_area before insert or update on maestro.freela_equipamentos
  for each row execute function maestro.freela_equipamentos_guarda_area();

create or replace function maestro.equipamentos_guarda_area() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'maestro_app' or maestro.pode(new.org_id, 'inventario_valores') then return new; end if;
  new.valor_cents := case when tg_op = 'INSERT' then null else old.valor_cents end;
  return new;
end
$$;
drop trigger if exists equipamentos_guarda_area on maestro.equipamentos;
create trigger equipamentos_guarda_area before insert or update on maestro.equipamentos for each row execute function maestro.equipamentos_guarda_area();

-- Contato do freela: quem não vê não apaga nem troca (no cadastro novo, o que a pessoa digitou fica).
create or replace function maestro.freelas_guarda_area() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or current_user <> 'maestro_app' or maestro.pode(new.org_id, 'dados_equipe') then return new; end if;
  new.email := old.email;
  new.whatsapp := old.whatsapp;
  return new;
end
$$;
drop trigger if exists freelas_guarda_area on maestro.freelas;
create trigger freelas_guarda_area before update on maestro.freelas for each row execute function maestro.freelas_guarda_area();

create or replace function maestro.pedidos_guarda_area() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'maestro_app' or maestro.pode(new.org_id, 'orcamentos') then return new; end if;
  new.valor_estimado_cents := case when tg_op = 'INSERT' then null else old.valor_estimado_cents end;
  return new;
end
$$;
drop trigger if exists pedidos_guarda_area on maestro.pedidos;
create trigger pedidos_guarda_area before insert or update on maestro.pedidos for each row execute function maestro.pedidos_guarda_area();

create or replace function maestro.projects_guarda_area() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'maestro_app' or maestro.pode(new.org_id, 'orcamentos') then return new; end if;
  new.value_cents := case when tg_op = 'INSERT' then null else old.value_cents end;
  return new;
end
$$;
drop trigger if exists projects_guarda_area on maestro.projects;
create trigger projects_guarda_area before insert or update on maestro.projects for each row execute function maestro.projects_guarda_area();

-- ───────────── Criação (roteiros e fluxos) ─────────────
-- Não é área sensível (não guarda dinheiro nem dado pessoal): é um nível por papel, para a frente Criação usar no lugar
-- de regra própria. ver = todos da organização; editar = administração, gestão e equipe; enviar para fora (cliente) =
-- administração e gestão. Igual a CRIACAO_PADRAO em src/lib/acessos.ts (tests/acessos.test.mts confere).
create or replace function maestro.criacao_padrao(p_role text, p_nivel text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_nivel
    when 'ver' then p_role in ('admin', 'gestor', 'equipe', 'leitura')
    when 'editar' then p_role in ('admin', 'gestor', 'equipe')
    when 'enviar' then p_role in ('admin', 'gestor')
    else false
  end
$$;

create or replace function maestro.pode_criacao(p_org uuid, p_nivel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select maestro.criacao_padrao(m.role, p_nivel)
      from maestro.members m
     where m.org_id = p_org and m.zro_sub = maestro.current_sub() and m.status = 'active'
       and p_org = maestro.current_org_id()
  ), false)
$$;
revoke all on function maestro.criacao_padrao(text, text), maestro.pode_criacao(uuid, text) from public;
grant execute on function maestro.criacao_padrao(text, text), maestro.pode_criacao(uuid, text) to maestro_app;

revoke all on function maestro.escalas_guarda_area(), maestro.freela_equipamentos_guarda_area(), maestro.equipamentos_guarda_area(),
  maestro.freelas_guarda_area(), maestro.pedidos_guarda_area(), maestro.projects_guarda_area() from public;
revoke all on function maestro.area_padrao(text, text), maestro.pode(uuid, text), maestro.diaria_do_cadastro(uuid, uuid, text) from public;
grant execute on function maestro.area_padrao(text, text), maestro.pode(uuid, text), maestro.diaria_do_cadastro(uuid, uuid, text) to maestro_app;
