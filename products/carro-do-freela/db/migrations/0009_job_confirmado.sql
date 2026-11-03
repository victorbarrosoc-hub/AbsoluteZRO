-- Carro do Freela · 0009 · o job só conta para o selo quando os DOIS lados confirmam que aconteceu (03/11/2026).
-- Titular, aprovando o endurecimento do selo: um job entra nos "6 jobs concluídos" só quando quem contratou e quem fez
-- dizem, depois do dia, que ele aconteceu. Até a 0008 bastava a proposta aceita com o dia já passado: duas contas
-- combinadas fabricavam jobs sem que nenhum tivesse existido.
--
-- O que entra:
--   1. `job_confirmacoes`: UMA resposta por lado de cada proposta de job (`de_sub`, quem contratou, e `para_sub`, quem
--      fez): "aconteceu" (true) ou "não aconteceu" (false). Só depois do dia (data de São Paulo), só em proposta de job
--      aceita, cada lado só a própria linha e uma vez só: não há UPDATE nem DELETE para o app (resposta dada não vira).
--      Lê quem é das duas pontas da proposta (cada lado precisa ver se o outro já respondeu).
--   2. `selo_fatos(sub)` passa a contar só o job confirmado pelos dois com `aconteceu = true` (o resto da conta da 0008
--      fica igual: proposta de job aceita, a pessoa é quem FEZ, dia passado, o mesmo contratante no mesmo dia uma vez).
--      Continua sem security definer: para outra conta, o app só vê as próprias linhas e nada vaza; a `vitrine()` (0008,
--      security definer) a chama com os direitos da dona do schema e passa a dar o ✓ só com jobs confirmados.
-- A guarda das propostas (0003) não muda: confirmar não mexe na proposta, mora numa tabela à parte.

create table if not exists carro_do_freela.job_confirmacoes (
  proposta uuid not null references carro_do_freela.propostas (id) on delete cascade,
  sub uuid not null,
  aconteceu boolean not null,
  em timestamptz not null default clock_timestamp(),
  primary key (proposta, sub)
);

alter table carro_do_freela.job_confirmacoes enable row level security;
-- ler: as respostas das propostas em que eu sou uma das pontas (a minha e a do outro lado)
drop policy if exists job_confirmacoes_ver on carro_do_freela.job_confirmacoes;
create policy job_confirmacoes_ver on carro_do_freela.job_confirmacoes for select to carro_do_freela_app
  using (exists (select 1 from carro_do_freela.propostas p
                  where p.id = proposta and carro_do_freela.sub_atual() in (p.de_sub, p.para_sub)));
-- responder: só a minha linha, só numa proposta de job ACEITA em que sou uma das pontas, só depois do dia
drop policy if exists job_confirmacoes_responder on carro_do_freela.job_confirmacoes;
create policy job_confirmacoes_responder on carro_do_freela.job_confirmacoes for insert to carro_do_freela_app
  with check (sub = carro_do_freela.sub_atual()
              and exists (select 1 from carro_do_freela.propostas p
                           where p.id = proposta and carro_do_freela.sub_atual() in (p.de_sub, p.para_sub)
                             and p.tipo = 'job' and p.estado = 'aceita' and p.dia is not null
                             and p.dia < (now() at time zone 'America/Sao_Paulo')::date));
-- nada de UPDATE nem DELETE; e `em` é do banco (o INSERT do app só escolhe proposta, sub e a resposta)
grant select on carro_do_freela.job_confirmacoes to carro_do_freela_app;
grant insert (proposta, sub, aconteceu) on carro_do_freela.job_confirmacoes to carro_do_freela_app;

-- Os fatos do selo: igual à 0008, menos a contagem dos jobs, que agora exige as DUAS respostas "aconteceu".
create or replace function carro_do_freela.selo_fatos(p_sub uuid) returns table (fatos jsonb, jobs integer)
language sql stable set search_path = '' as $$
  select jsonb_build_object(
           'nome', coalesce((select char_length(btrim(p.nome_exibicao)) > 0 and p.cidade is not null
                               from carro_do_freela.perfis p where p.sub = p_sub), false),
           'port', exists (select 1 from carro_do_freela.perfis p where p.sub = p_sub and p.portfolio_url is not null),
           'func', exists (select 1 from carro_do_freela.perfis p where p.sub = p_sub and cardinality(p.funcoes) > 0),
           'nicho', exists (select 1 from carro_do_freela.perfis p where p.sub = p_sub and cardinality(p.nichos) > 0),
           'equip', exists (select 1 from carro_do_freela.inventario i where i.sub = p_sub and i.ativo and i.categoria = 'camera')
                    and exists (select 1 from carro_do_freela.inventario i where i.sub = p_sub and i.ativo and i.categoria = 'lente'),
           'tabela', exists (select 1 from carro_do_freela.tabelas t, unnest(t.so_eu_cents || t.com_equip_cents) v
                              where t.sub = p_sub and v > 0),
           'regras', exists (select 1 from carro_do_freela.tabelas t
                              where t.sub = p_sub and t.hora_extra_cents is not null and t.deslocamento_cents is not null)),
         (select count(distinct (pr.de_sub, pr.dia))::integer
            from carro_do_freela.propostas pr
           where pr.para_sub = p_sub and pr.tipo = 'job' and pr.estado = 'aceita'
             and pr.dia < (now() at time zone 'America/Sao_Paulo')::date
             and exists (select 1 from carro_do_freela.job_confirmacoes c
                          where c.proposta = pr.id and c.sub = pr.de_sub and c.aconteceu)
             and exists (select 1 from carro_do_freela.job_confirmacoes c
                          where c.proposta = pr.id and c.sub = pr.para_sub and c.aconteceu))
$$;
revoke all on function carro_do_freela.selo_fatos(uuid) from public;
grant execute on function carro_do_freela.selo_fatos(uuid) to carro_do_freela_app;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on carro_do_freela.job_confirmacoes from %I', r);
      execute format('revoke all on function carro_do_freela.selo_fatos(uuid) from %I', r);
    end if;
  end loop;
end
$$;
