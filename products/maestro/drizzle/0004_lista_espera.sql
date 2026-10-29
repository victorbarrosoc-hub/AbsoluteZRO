-- Maestro · 0004 · Lista de espera da página inicial (decisão do titular, 28/10/2026; plano v2 §10 e §13.4).
-- O Maestro está fechado (migration 0024 do HUB): quem não tem acesso deixa o e-mail, com consentimento, e a liberação
-- continua manual, pela lista de acesso do HUB. Só acrescenta: nada das 0000–0003 é editado.
--
-- Porta estreita: a tabela não tem nenhum privilégio para maestro_app (nem leitura) e o RLS fecha tudo. A única entrada
-- é maestro.lista_espera_entrar() (security definer), que só insere e devolve se a linha é nova. Mesmo e-mail de novo
-- não duplica nem conta que já estava (a resposta da tela é a mesma). Ler a lista é só do dono do schema (console).

create table if not exists maestro.lista_espera (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 6 and 254 and email = lower(email)),
  nome text check (nome is null or char_length(nome) between 1 and 80),
  consentimento_em timestamptz not null,
  -- sha256 do IP com chave (nunca o IP): só para conferir abuso.
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists lista_espera_email_uq on maestro.lista_espera (email);

alter table maestro.lista_espera enable row level security;
revoke all on maestro.lista_espera from public;
revoke all on maestro.lista_espera from maestro_app;
drop policy if exists lista_espera_fechada on maestro.lista_espera;
create policy lista_espera_fechada on maestro.lista_espera for all to maestro_app using (false) with check (false);

-- No Supabase, os papéis da API pública também ficam de fora (o schema nem é exposto; isto é cinto e suspensório).
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on maestro.lista_espera from %I', r);
    end if;
  end loop;
end
$$;

-- Entra na lista: e-mail normalizado e conferido, nome opcional (até 80), consentimento obrigatório. true = linha nova;
-- false = o e-mail já estava (nada muda). Não lê nada além da própria inserção.
create or replace function maestro.lista_espera_entrar(p_email text, p_nome text, p_consentimento boolean, p_ip_hash text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text := nullif(left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 80), '');
  v_id uuid;
begin
  if p_consentimento is distinct from true then
    raise exception 'Sem consentimento, o e-mail não entra na lista.' using errcode = '22023';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = '22023';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    p_ip_hash := null;
  end if;
  insert into maestro.lista_espera (email, nome, consentimento_em, ip_hash)
  values (v_email, v_nome, now(), p_ip_hash)
  on conflict (email) do nothing
  returning id into v_id;
  return v_id is not null;
end
$$;

revoke all on function maestro.lista_espera_entrar(text, text, boolean, text) from public;
grant execute on function maestro.lista_espera_entrar(text, text, boolean, text) to maestro_app;
