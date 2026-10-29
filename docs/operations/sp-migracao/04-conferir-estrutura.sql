-- Absolute ZRO · mudança do banco para São Paulo · passo 4: conferir a estrutura (só lê, não muda nada)
-- RODE NOS DOIS PROJETOS: no AbsoluteZRO-SP (NOVO, depois do passo 2e) e no AbsoluteZRO (ANTIGO).
-- Nos dois, todas as linhas têm de dar "ok". No ANTIGO, "ok" quer dizer que o banco não mudou desde que este kit
-- foi gerado (29/10/2026); se der DIFERENTE lá, PARE: alguém publicou uma migration nova e o kit precisa ser refeito.
--
-- Compara uma "impressão digital" do catálogo (tabelas, colunas, tipos, padrões, chaves, índices, políticas de RLS,
-- funções, gatilhos, views, sequências, papéis, permissões e buckets) com a do banco antigo, tirada na geração do kit.
-- Funções: compara o código sem comentários e sem espaços (no banco antigo algumas foram coladas com quebras de
-- linha do Windows e sem os comentários do arquivo; o código é o mesmo). O login temporário migracao_sp não conta.
set search_path to pg_catalog;
with
sch as (select oid, nspname from pg_namespace where nspname in ('zro','maestro','sobedesce','nossom_private','carro_do_freela','public')),
approles as (select oid, rolname from pg_roles where rolname in ('maestro','maestro_app','sobedesce_app','zro_app','carro_do_freela','carro_do_freela_app')),
ext_objs as (select objid from pg_depend where deptype = 'e'),
fp(kind, k, v) as (
  -- esquemas
  select 'schema'::text, n.nspname::text, pg_get_userbyid(n.nspowner) || ' ' ||
    coalesce((select string_agg(case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type || case when x.is_grantable then '*' else '' end, ',' order by 1)
              from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) x where x.grantee not in (select oid from pg_roles where rolname = 'migracao_sp')), '')
  from pg_namespace n where n.nspname in ('zro','maestro','sobedesce','nossom_private','carro_do_freela')
  union all
  -- papéis dos apps
  select 'role', r.rolname, concat_ws(' ', 'login=' || r.rolcanlogin, 'bypassrls=' || r.rolbypassrls, 'inherit=' || r.rolinherit,
    'createrole=' || r.rolcreaterole, 'createdb=' || r.rolcreatedb, 'conn=' || r.rolconnlimit,
    'cfg=' || coalesce((select string_agg(c, ',' order by c) from unnest(r.rolconfig) c), ''))
  from pg_roles r where r.rolname in (select rolname from approles)
  union all
  select 'member', a.rolname || '>' || b.rolname, string_agg(distinct 'admin=' || m.admin_option || ' inherit=' || m.inherit_option || ' set=' || m.set_option, ';')
  from pg_auth_members m join pg_roles a on a.oid = m.roleid join pg_roles b on b.oid = m.member
  where a.oid in (select oid from approles) or b.oid in (select oid from approles)
  group by 1, 2
  union all
  -- tabelas, views e sequências (fora das extensões)
  select 'rel', n.nspname || '.' || c.relname, concat_ws(' ', c.relkind::text, pg_get_userbyid(c.relowner), 'rls=' || c.relrowsecurity, 'force=' || c.relforcerowsecurity,
    'opts=' || coalesce(array_to_string(c.reloptions, ','), ''),
    'acl=' || coalesce((select string_agg(case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type || case when x.is_grantable then '*' else '' end, ',' order by 1)
              from aclexplode(coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner))) x where x.grantee not in (select oid from pg_roles where rolname = 'migracao_sp')), ''))
  from pg_class c join sch n on n.oid = c.relnamespace
  where c.relkind in ('r','p','v','m','S','f') and c.oid not in (select objid from ext_objs)
  union all
  select 'column', n.nspname || '.' || c.relname || '.' || lpad(row_number() over (partition by c.oid order by a.attnum)::text, 3, '0') || '.' || a.attname,
    concat_ws(' ', format_type(a.atttypid, a.atttypmod), case when a.attnotnull then 'notnull' end,
      'def=' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), 'id=' || a.attidentity::text, 'gen=' || a.attgenerated::text,
      'coll=' || coalesce((select collname from pg_collation co where co.oid = a.attcollation and a.attcollation <> 100), ''),
      'acl=' || coalesce((select string_agg(case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type, ',' order by 1) from aclexplode(a.attacl) x where x.grantee not in (select oid from pg_roles where rolname = 'migracao_sp')), ''))
  from pg_attribute a join pg_class c on c.oid = a.attrelid join sch n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped and c.relkind in ('r','p','v','m','f') and c.oid not in (select objid from ext_objs)
  union all
  select 'constraint', n.nspname || '.' || c.relname || '.' || co.conname, co.contype::text || ' ' || pg_get_constraintdef(co.oid) || case when co.condeferrable then ' deferrable' else '' end
  from pg_constraint co join pg_class c on c.oid = co.conrelid join sch n on n.oid = c.relnamespace
  where c.oid not in (select objid from ext_objs)
  union all
  select 'index', n.nspname || '.' || ic.relname, pg_get_indexdef(i.indexrelid)
  from pg_index i join pg_class ic on ic.oid = i.indexrelid join pg_class c on c.oid = i.indrelid join sch n on n.oid = c.relnamespace
  where c.oid not in (select objid from ext_objs)
  union all
  select 'policy', n.nspname || '.' || c.relname || '.' || p.polname,
    concat_ws(' | ', case when p.polpermissive then 'permissive' else 'restrictive' end, p.polcmd::text,
      (select string_agg(case when r = 0 then 'PUBLIC' else pg_get_userbyid(r) end, ',' order by 1) from unnest(p.polroles) r),
      coalesce(pg_get_expr(p.polqual, p.polrelid), ''), coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
  from pg_policy p join pg_class c on c.oid = p.polrelid join sch n on n.oid = c.relnamespace
  union all
  select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    concat_ws(' ', pg_get_userbyid(p.proowner), p.prokind::text, (select lanname from pg_language l where l.oid = p.prolang),
      'ret=' || pg_get_function_result(p.oid), 'secdef=' || p.prosecdef, 'vol=' || p.provolatile::text, 'strict=' || p.proisstrict,
      'cfg=' || coalesce(array_to_string(p.proconfig, ','), ''), 'src=' || md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')),
      'args=' || md5(coalesce(pg_get_function_arguments(p.oid), '')),
      'acl=' || coalesce((select string_agg(case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type || case when x.is_grantable then '*' else '' end, ',' order by 1)
              from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x), ''))
  from pg_proc p join sch n on n.oid = p.pronamespace
  where p.oid not in (select objid from ext_objs)
  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, t.tgenabled::text || ' ' || pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join sch n on n.oid = c.relnamespace
  where not t.tgisinternal
  union all
  select 'view', n.nspname || '.' || c.relname, md5(pg_get_viewdef(c.oid))
  from pg_class c join sch n on n.oid = c.relnamespace where c.relkind in ('v','m') and c.oid not in (select objid from ext_objs)
  union all
  select 'sequence', n.nspname || '.' || c.relname,
    concat_ws(' ', format_type(s.seqtypid, null), s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcache, s.seqcycle,
      'owned=' || coalesce((select dc.relname || '.' || da.attname from pg_depend dp join pg_class dc on dc.oid = dp.refobjid
        join pg_attribute da on da.attrelid = dp.refobjid and da.attnum = dp.refobjsubid
        where dp.objid = c.oid and dp.classid = 'pg_class'::regclass and dp.deptype in ('a','i') limit 1), ''))
  from pg_sequence s join pg_class c on c.oid = s.seqrelid join sch n on n.oid = c.relnamespace
  union all
  select 'type', n.nspname || '.' || t.typname, t.typtype::text || ' ' || coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid), '')
    || ' ' || coalesce(format_type(t.typbasetype, t.typtypmod), '')
  from pg_type t join sch n on n.oid = t.typnamespace
  where t.typtype in ('e','d') and t.oid not in (select objid from ext_objs)
  union all
  select 'extension', e.extname, e.extnamespace::regnamespace::text || ' ' || e.extversion
  from pg_extension e where e.extname in ('btree_gist','pgcrypto','uuid-ossp','pg_stat_statements','plpgsql')
  union all
  select 'defacl', pg_get_userbyid(d.defaclrole) || ' ' || coalesce(d.defaclnamespace::regnamespace::text, '*') || ' ' || d.defaclobjtype::text,
    coalesce((select string_agg(case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type, ',' order by 1) from aclexplode(d.defaclacl) x where x.grantee not in (select oid from pg_roles where rolname = 'migracao_sp')), '')
  from pg_default_acl d
  where d.defaclrole in (select oid from approles) or d.defaclnamespace in (select oid from sch where nspname <> 'public')
  union all
  select 'bucket', b.id, concat_ws(' ', b.name, b.public, b.file_size_limit, array_to_string(b.allowed_mime_types, ','))
  from storage.buckets b
  union all
  select 'storage_policy', p.tablename || '.' || p.policyname, md5(concat_ws('|', p.cmd, p.roles::text, p.qual, p.with_check))
  from pg_policies p where p.schemaname = 'storage'
  union all
  select 'database', d.datname, pg_get_userbyid(d.datdba) || ' ' ||
    coalesce((select string_agg(case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end || ':' || x.privilege_type, ',' order by 1)
              from aclexplode(d.datacl) x where x.grantee in (select oid from approles)), '')
  from pg_database d where d.datname = current_database()
),
esperado(kind, n, h) as (values
  ('bucket', 2, '437db318026104313b887ab96ad5ef28'),
  ('column', 1328, '7caed4f23dbe2029224398e83a5816dd'),
  ('constraint', 749, '8fa41d699ffc63f16e3b39ffed693ae9'),
  ('database', 1, 'dd0b1b1434b564be7add3bb9f0f51969'),
  ('extension', 5, '98518b4b1046015371fbe5f942b0f64c'),
  ('function', 88, 'ab3286cc9ef95481f305a94fc7af6d59'),
  ('index', 309, '087cf1d6fdb96f7a1cde8a74edc8ea32'),
  ('member', 8, '7575987d720d290571ca2bb248e70642'),
  ('policy', 253, '41cb551f97be57b9abf71fc4e96af0ae'),
  ('rel', 144, 'd302ed26f41fcee8721a82399c6fe1d2'),
  ('role', 6, 'dee0fa45804b652631524b128905cbbc'),
  ('schema', 5, '5c74f2b026e2987d14e81550c5184cf9'),
  ('sequence', 11, '5c6e2d190c18e8d9be615909db7657c7'),
  ('trigger', 54, '285428df983cb576f32724023aa8280f'),
  ('view', 3, '18fc46195982f90d7c0be9fc005c0b75')
),
atual as (
  select kind, count(*) n, md5(string_agg(k || '=' || coalesce(v, ''), E'\n' order by k)) h from fp group by kind
)
select coalesce(e.kind, a.kind) as item,
       case when e.h = a.h and e.n = a.n then 'ok' else 'DIFERENTE' end as resultado,
       e.n as esperado, a.n as encontrado
from esperado e full join atual a on a.kind = e.kind
order by (e.h = a.h and e.n = a.n) nulls first, 1;
