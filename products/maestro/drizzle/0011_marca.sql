-- Maestro · 0011 · Marca da produtora (plano v2 §8, fase 11; decisão do titular §13.3: para todos os planos).
-- Só acrescenta: nada das 0000–0010 é editado.
--
-- A marca básica (logo, cor de destaque, nome, CNPJ, contato, endereço e a linha de assinatura) sai no timbrado e nas
-- páginas do cliente (/a, /p, /o). O app inteiro com a marca da produtora (white-label) NÃO é desta fase.
--
-- O logo mora no próprio Postgres (bytea): o servidor decodifica o que a pessoa mandou (PNG, JPEG ou WebP; SVG nunca),
-- reencoda em WebP limpo (sem metadados, no máximo 1024 px) e só então grava. Poucos KB por organização, sem bucket.
-- Quem não tem conta só chega ao logo por maestro.marca_logo(org, sha256) (a rota /api/marca/<org>/<sha>).

create table if not exists maestro.org_marca (
  org_id uuid primary key references maestro.organizations (id) on delete cascade,
  logo bytea check (logo is null or octet_length(logo) between 1 and 524288),
  logo_mime text check (logo_mime is null or logo_mime in ('image/webp', 'image/png')),
  logo_sha256 text check (logo_sha256 is null or logo_sha256 ~ '^[0-9a-f]{64}$'),
  logo_largura integer check (logo_largura is null or logo_largura between 1 and 4096),
  logo_altura integer check (logo_altura is null or logo_altura between 1 and 4096),
  -- Cor de destaque (#rrggbb, minúsculas). O contraste com o papel branco é conferido no servidor (src/lib/marca).
  cor text check (cor is null or cor ~ '^#[0-9a-f]{6}$'),
  nome text check (nome is null or char_length(nome) between 1 and 120),
  cnpj text check (cnpj is null or char_length(cnpj) <= 20),
  email text check (email is null or char_length(email) <= 254),
  telefone text check (telefone is null or char_length(telefone) <= 30),
  endereco text check (endereco is null or char_length(endereco) <= 300),
  assinatura text check (assinatura is null or char_length(assinatura) <= 200),
  demo boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((logo is null) = (logo_sha256 is null) and (logo is null) = (logo_mime is null))
);
create or replace trigger org_marca_touch before update on maestro.org_marca for each row execute function maestro.touch_updated_at();

-- Todos da organização leem (o timbrado é de todos); só a administração muda (como os dados da empresa).
select maestro.politicas_padrao('org_marca', array['admin'], array['admin']);

-- Os dados de identidade que já estavam em Ajustes → Empresa passam para a marca (uma vez; a empresa fica com o resto).
insert into maestro.org_marca (org_id, nome, cnpj, email, telefone, endereco, demo)
select o.id,
       nullif(left(btrim(o.settings -> 'empresa' ->> 'fantasia'), 120), ''),
       nullif(left(btrim(o.settings -> 'empresa' ->> 'cnpj'), 20), ''),
       nullif(left(btrim(o.settings -> 'empresa' ->> 'email'), 254), ''),
       nullif(left(btrim(o.settings -> 'empresa' ->> 'telefone'), 30), ''),
       nullif(left(btrim(o.settings -> 'empresa' ->> 'endereco'), 300), ''),
       coalesce((o.settings -> 'empresa' ->> 'demo')::boolean, false)
  from maestro.organizations o
 where o.settings ? 'empresa'
on conflict (org_id) do nothing;

-- O que as páginas públicas mostram da produtora: nome, cor, endereço do logo e o contato comercial. Interna (sem grant):
-- só as funções da porta estreita chamam.
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
           'assinatura', m.assinatura)
    from maestro.organizations o
    left join maestro.org_marca m on m.org_id = o.id
   where o.id = p_org
$$;

-- O logo para a rota pública: só com a organização E o sha256 certos (o sha é o nome do arquivo: muda quando o logo
-- muda, então o cache pode ser imutável).
create or replace function maestro.marca_logo(p_org uuid, p_sha text) returns table (mime text, logo bytea)
language sql stable security definer set search_path = '' as $$
  select m.logo_mime, m.logo
    from maestro.org_marca m
   where m.org_id = p_org and p_sha ~ '^[0-9a-f]{64}$' and m.logo_sha256 = p_sha
$$;

-- A marca da produtora na página de aprovação (/a): a do link de lote vivo, nada além.
create or replace function maestro.link_marca(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l maestro.approval_links;
begin
  v_l := maestro.link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  return maestro.marca_publica(v_l.org_id);
end
$$;

revoke all on function maestro.marca_publica(uuid), maestro.marca_logo(uuid, text), maestro.link_marca(text) from public;
grant execute on function maestro.marca_logo(uuid, text), maestro.link_marca(text) to maestro_app;
