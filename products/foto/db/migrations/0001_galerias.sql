-- Plataforma de fotos · 0001 · galeria de seleção do cliente (ADR 0044; pedido do titular: "link de enviar pra o cliente
-- pra ele selecionar as fotos a serem tratadas"). Só acrescenta.
--
-- O que sobe para cá: a ficha da galeria, a lista de fotos (id do catálogo, nome do arquivo, medidas e sha256 da PRÉVIA)
-- e o que o cliente escolheu. A foto original não sai do aparelho; a prévia reduzida fica no armazenamento
-- (api/_arquivos.js), na chave que este banco calcula (`g/<galeria>/<foto>`; `-m` no fim é a miniatura).
--
--   foto.galerias       o trabalho: nome, nome do fotógrafo que o cliente vê, quantidade contratada, extras (o preço é
--                       só TEXTO informativo: não há cobrança), prazo, marca-d'água, mensagem e o estado
--                       (rascunho → publicada → concluida ⇄ reaberta; qualquer uma publicada → encerrada).
--   foto.galeria_fotos  as fotos da galeria (até 1.500), com pilha (`grupo`) e a melhor da pilha.
--   foto.links          o link do cliente. O token (32 bytes) nunca é guardado: só o sha256. PIN opcional como scrypt
--                       (conferido no servidor). Validade (até 90 dias), revogação para sempre, contagem de aberturas.
--                       Um link vivo por galeria; trocar = revogar e criar outro.
--   foto.selecao        o que o cliente marcou em cada foto: escolhida, comentário curto e etiquetas de pedido (lista
--                       fechada, foto.etiquetas_validas()).
--   foto.envios         o envio final: nome de quem enviou, data, quantas escolhidas e extras, e a lista congelada.
--   foto.limites        limites de uso (api/_limite.js): só o dono do schema lê e escreve.
--
-- Quem vê: a pessoa dona, na organização em que criou (foto.sub() e foto.org()); as tabelas filhas seguem a galeria.
-- O papel foto_app não lê token_hash nem pin_hash (permissão por coluna) e não escreve seleção nem envio.
--
-- Porta estreita (molde: products/maestro, drizzle/0005 e 0032). O cliente NÃO tem papel no banco: a transação assume
-- foto_app sem pessoa (o RLS esconde tudo) e só as funções `foto.link_*` (security definer) respondem, pelo sha256 do
-- token. Link desconhecido, revogado, vencido ou de galeria encerrada: a mesma resposta (null ou {"erro":"link"}).
-- Depois de enviada, a seleção trava (estado `concluida`) até o fotógrafo reabrir.
--
-- Sem FORCE ROW LEVEL SECURITY: as funções da porta rodam como o dono do schema e precisam passar. O dono só é usado
-- pelo migrador, pela porta e pela limpeza (api/_arquivos.js `limparVencidas`).

-- ───────────── galerias ─────────────

create table foto.galerias (
  id uuid primary key default gen_random_uuid(),
  dono text not null default foto.sub() check (char_length(dono) between 1 and 200),
  organizacao text default foto.org() check (organizacao is null or char_length(organizacao) between 1 and 100),
  nome text not null check (char_length(btrim(nome)) between 1 and 120 and char_length(nome) <= 120),
  fotografo text not null check (char_length(btrim(fotografo)) between 1 and 80 and char_length(fotografo) <= 80),
  contratadas integer not null check (contratadas between 1 and 5000),
  permite_extras boolean not null default false,
  preco_extra text check (preco_extra is null or char_length(preco_extra) between 1 and 60),
  prazo timestamptz,
  estado text not null default 'rascunho' check (estado in ('rascunho', 'publicada', 'concluida', 'reaberta', 'encerrada')),
  marca_dagua boolean not null default true,
  mensagem text check (mensagem is null or char_length(mensagem) between 1 and 280),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  publicada_em timestamptz,
  arquivos_apagados_em timestamptz
);
create index galerias_dono_idx on foto.galerias (dono, criada_em desc);

create table foto.galeria_fotos (
  id uuid primary key default gen_random_uuid(),
  galeria uuid not null references foto.galerias (id) on delete cascade,
  foto_id text not null check (char_length(foto_id) between 1 and 120),
  nome text not null check (char_length(nome) between 1 and 255),
  ordem integer not null default 0 check (ordem between 0 and 1000000),
  grupo text check (grupo is null or char_length(grupo) between 1 and 64),
  melhor boolean not null default false,
  largura integer not null check (largura between 16 and 8192),
  altura integer not null check (altura between 16 and 8192),
  tipo text not null check (tipo in ('image/jpeg', 'image/webp')),
  tamanho integer not null check (tamanho between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  chave text generated always as ('g/' || galeria::text || '/' || id::text) stored,
  enviada_em timestamptz,
  mini_tipo text check (mini_tipo is null or mini_tipo in ('image/jpeg', 'image/webp')),
  mini_tamanho integer check (mini_tamanho is null or mini_tamanho between 1 and 524288),
  mini_sha256 text check (mini_sha256 is null or mini_sha256 ~ '^[0-9a-f]{64}$'),
  mini_enviada_em timestamptz,
  criada_em timestamptz not null default now(),
  unique (galeria, foto_id),
  constraint galeria_fotos_mini check ((mini_tipo is null) = (mini_tamanho is null) and (mini_tipo is null) = (mini_sha256 is null))
);
create index galeria_fotos_ordem_idx on foto.galeria_fotos (galeria, ordem, id);

create table foto.links (
  id uuid primary key default gen_random_uuid(),
  galeria uuid not null references foto.galerias (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  pin_hash text check (pin_hash is null or pin_hash ~ '^s1\$[A-Za-z0-9_-]{16,64}\$[A-Za-z0-9_-]{16,128}$'),
  pin_versao integer not null default 0,
  tem_pin boolean generated always as (pin_hash is not null) stored,
  expira_em timestamptz not null,
  revogado_em timestamptz,
  aberturas integer not null default 0 check (aberturas >= 0),
  aberto_em timestamptz,
  criado_em timestamptz not null default now()
);
create index links_galeria_idx on foto.links (galeria, criado_em desc);
create unique index links_um_vivo on foto.links (galeria) where revogado_em is null;

-- As etiquetas de pedido que o cliente pode pôr numa foto (lista fechada; mudar = migração nova).
create function foto.etiquetas_validas() returns text[]
language sql immutable set search_path = '' as $$
  select array['suavizar_pele', 'preto_e_branco', 'remover_objeto', 'clarear', 'recortar']::text[]
$$;

create table foto.selecao (
  foto uuid primary key references foto.galeria_fotos (id) on delete cascade,
  galeria uuid not null references foto.galerias (id) on delete cascade,
  escolhida boolean not null default false,
  comentario text check (comentario is null or char_length(comentario) between 1 and 500),
  etiquetas text[] not null default '{}'::text[] check (etiquetas <@ foto.etiquetas_validas() and cardinality(etiquetas) <= 8),
  atualizada_em timestamptz not null default now()
);
create index selecao_galeria_idx on foto.selecao (galeria) where escolhida;

create table foto.envios (
  id uuid primary key default gen_random_uuid(),
  galeria uuid not null references foto.galerias (id) on delete cascade,
  link uuid references foto.links (id) on delete set null,
  nome text not null check (char_length(nome) between 1 and 80),
  escolhidas integer not null check (escolhidas >= 0),
  extras integer not null check (extras >= 0),
  fotos uuid[] not null default '{}'::uuid[],
  enviado_em timestamptz not null default now()
);
create index envios_galeria_idx on foto.envios (galeria, enviado_em desc);

create table foto.limites (
  chave text not null check (char_length(chave) between 1 and 200),
  em timestamptz not null default now()
);
create index limites_chave_idx on foto.limites (chave, em);

-- ───────────── guardas ─────────────
-- Não são security definer de propósito: `current_user` diz quem mexe. foto_app = a pessoa pelo app (regras valem);
-- o dono do schema = a porta estreita e a limpeza (que já conferiram o que podem).

create function foto.galerias_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'foto_app' then
      new.dono := foto.sub();
      new.organizacao := foto.org();
      new.estado := 'rascunho';
      new.publicada_em := null;
      new.arquivos_apagados_em := null;
    end if;
    new.criada_em := now();
    new.atualizada_em := now();
    return new;
  end if;
  if new.id <> old.id or new.dono <> old.dono or new.organizacao is distinct from old.organizacao or new.criada_em <> old.criada_em then
    raise exception 'galeria:fixo' using errcode = 'P0001';
  end if;
  if new.estado <> old.estado then
    if current_user = 'foto_app' and not (
         (old.estado = 'rascunho' and new.estado = 'publicada')
      or (old.estado = 'concluida' and new.estado = 'reaberta')
      or (old.estado in ('publicada', 'concluida', 'reaberta') and new.estado = 'encerrada')) then
      raise exception 'galeria:estado' using errcode = 'P0001';
    end if;
    if new.estado = 'publicada' then
      if not exists (select 1 from foto.galeria_fotos f where f.galeria = new.id) then
        raise exception 'galeria:sem_fotos' using errcode = 'P0001';
      end if;
      if exists (select 1 from foto.galeria_fotos f where f.galeria = new.id and f.enviada_em is null) then
        raise exception 'galeria:faltam_arquivos' using errcode = 'P0001';
      end if;
      new.publicada_em := now();
    end if;
  end if;
  new.atualizada_em := now();
  return new;
end
$$;
revoke all on function foto.galerias_guarda() from public;
create trigger galerias_guarda before insert or update on foto.galerias for each row execute function foto.galerias_guarda();

-- Fotos: entram, saem e trocam de arquivo só com a galeria em rascunho, publicada ou reaberta (enviada = congelada).
-- Arquivo novo (sha256 diferente) volta a "não enviada": o servidor confere os bytes de novo.
create function foto.galeria_fotos_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare v_estado text;
begin
  if current_user <> 'foto_app' then
    return coalesce(new, old);
  end if;
  select g.estado into v_estado from foto.galerias g where g.id = coalesce(new.galeria, old.galeria);
  -- (apagar a galeria leva as fotos junto: aí a galeria já não aparece e v_estado é null)
  if v_estado in ('concluida', 'encerrada') then
    raise exception 'fotos:travada' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.enviada_em := null;
    new.mini_enviada_em := null;
    new.criada_em := now();
    return new;
  end if;
  if new.id <> old.id or new.galeria <> old.galeria or new.foto_id <> old.foto_id then
    raise exception 'fotos:fixo' using errcode = 'P0001';
  end if;
  if new.sha256 <> old.sha256 or new.tamanho <> old.tamanho or new.tipo <> old.tipo then
    new.enviada_em := null;
  end if;
  if new.mini_sha256 is distinct from old.mini_sha256 or new.mini_tamanho is distinct from old.mini_tamanho or new.mini_tipo is distinct from old.mini_tipo then
    new.mini_enviada_em := null;
  end if;
  if new.mini_sha256 is null then
    new.mini_enviada_em := null;
  end if;
  return new;
end
$$;
revoke all on function foto.galeria_fotos_guarda() from public;
create trigger galeria_fotos_guarda before insert or update or delete on foto.galeria_fotos for each row execute function foto.galeria_fotos_guarda();

create function foto.galeria_fotos_teto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from foto.galeria_fotos f
     where f.galeria in (select distinct n.galeria from novas n)
     group by f.galeria having count(*) > 1500) then
    raise exception 'fotos:teto' using errcode = 'P0001';
  end if;
  return null;
end
$$;
revoke all on function foto.galeria_fotos_teto() from public;
create trigger galeria_fotos_teto after insert on foto.galeria_fotos referencing new table as novas for each statement execute function foto.galeria_fotos_teto();

-- Links: nascem só em galeria publicada (ou depois), com validade no futuro e até 90 dias. Revogar é para sempre.
-- Trocar o PIN sobe a versão (a prova antiga do navegador deixa de valer). Aberturas mudam só pela porta.
create function foto.links_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare v_estado text;
begin
  if tg_op = 'INSERT' then
    if current_user = 'foto_app' then
      select g.estado into v_estado from foto.galerias g where g.id = new.galeria;
      if v_estado is null or v_estado not in ('publicada', 'concluida', 'reaberta') then
        raise exception 'link:estado' using errcode = 'P0001';
      end if;
    end if;
    new.criado_em := now();
    new.aberturas := 0;
    new.aberto_em := null;
    new.revogado_em := null;
    new.pin_versao := 0;
    if new.expira_em <= now() or new.expira_em > now() + interval '90 days 5 minutes' then
      raise exception 'link:validade' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.galeria <> old.galeria or new.token_hash <> old.token_hash or new.criado_em <> old.criado_em then
    raise exception 'link:fixo' using errcode = 'P0001';
  end if;
  if old.revogado_em is not null and (new.revogado_em is distinct from old.revogado_em or new.pin_hash is distinct from old.pin_hash
     or new.expira_em <> old.expira_em) then
    raise exception 'link:revogado' using errcode = 'P0001';
  end if;
  if old.revogado_em is null and new.revogado_em is not null then
    new.revogado_em := now();
  end if;
  if new.pin_hash is distinct from old.pin_hash then
    new.pin_versao := old.pin_versao + 1;
  else
    new.pin_versao := old.pin_versao;
  end if;
  if new.expira_em <> old.expira_em and (new.expira_em <= now() or new.expira_em > now() + interval '90 days 5 minutes') then
    raise exception 'link:validade' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function foto.links_guarda() from public;
create trigger links_guarda before insert or update on foto.links for each row execute function foto.links_guarda();

-- ───────────── RLS e permissões ─────────────

alter table foto.galerias enable row level security;
alter table foto.galeria_fotos enable row level security;
alter table foto.links enable row level security;
alter table foto.selecao enable row level security;
alter table foto.envios enable row level security;
alter table foto.limites enable row level security;

create policy galerias_dono on foto.galerias for all to foto_app
  using (dono = foto.sub() and organizacao is not distinct from foto.org())
  with check (dono = foto.sub() and organizacao is not distinct from foto.org());

-- as filhas seguem a galeria (a subconsulta passa pelo RLS da galeria com o papel de quem pede)
create policy galeria_fotos_dono on foto.galeria_fotos for all to foto_app
  using (exists (select 1 from foto.galerias g where g.id = galeria))
  with check (exists (select 1 from foto.galerias g where g.id = galeria));
create policy links_dono on foto.links for all to foto_app
  using (exists (select 1 from foto.galerias g where g.id = galeria))
  with check (exists (select 1 from foto.galerias g where g.id = galeria));
create policy selecao_dono on foto.selecao for select to foto_app
  using (exists (select 1 from foto.galerias g where g.id = galeria));
create policy envios_dono on foto.envios for select to foto_app
  using (exists (select 1 from foto.galerias g where g.id = galeria));
-- foto.limites: nenhuma política e nenhuma permissão para foto_app.

grant select, delete on foto.galerias to foto_app;
grant insert (nome, fotografo, contratadas, permite_extras, preco_extra, prazo, marca_dagua, mensagem) on foto.galerias to foto_app;
grant update (nome, fotografo, contratadas, permite_extras, preco_extra, prazo, marca_dagua, mensagem, estado) on foto.galerias to foto_app;

grant select, delete on foto.galeria_fotos to foto_app;
grant insert (galeria, foto_id, nome, ordem, grupo, melhor, largura, altura, tipo, tamanho, sha256, mini_tipo, mini_tamanho, mini_sha256)
  on foto.galeria_fotos to foto_app;
grant update (nome, ordem, grupo, melhor, largura, altura, tipo, tamanho, sha256, mini_tipo, mini_tamanho, mini_sha256, enviada_em, mini_enviada_em)
  on foto.galeria_fotos to foto_app;

-- o link: foto_app cria, troca o PIN, estende e revoga, mas nunca lê o hash do token nem o do PIN; apagar, só com a galeria
grant select (id, galeria, tem_pin, pin_versao, expira_em, revogado_em, aberturas, aberto_em, criado_em) on foto.links to foto_app;
grant insert (galeria, token_hash, pin_hash, expira_em) on foto.links to foto_app;
grant update (pin_hash, expira_em, revogado_em) on foto.links to foto_app;

grant select on foto.selecao, foto.envios to foto_app;

revoke all on function foto.etiquetas_validas() from public;
grant execute on function foto.etiquetas_validas() to foto_app;

-- ───────────── porta estreita ─────────────

-- O link vivo do hash: não revogado, dentro da validade e a galeria publicada (não rascunho, não encerrada).
-- Interna (sem grant): devolve a linha inteira.
create function foto.link_vivo(p_token_hash text) returns foto.links
language sql stable security definer set search_path = '' as $$
  select l.*
    from foto.links l
    join foto.galerias g on g.id = l.galeria
   where p_token_hash ~ '^[0-9a-f]{64}$'
     and l.token_hash = p_token_hash
     and l.revogado_em is null
     and l.expira_em > now()
     and g.estado in ('publicada', 'concluida', 'reaberta')
$$;

-- O que o servidor precisa para conferir o PIN (scrypt, no servidor) e montar a prova. Link morto = null.
create function foto.link_pin(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l foto.links;
begin
  v_l := foto.link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  return jsonb_build_object('link', v_l.id, 'pin', v_l.pin_hash, 'versao', v_l.pin_versao);
end
$$;

-- Quantas fotos estão escolhidas na galeria (interna).
create function foto.link_contagem(p_galeria uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from foto.selecao s where s.galeria = p_galeria and s.escolhida
$$;

-- Abre a galeria do link: a ficha, as fotos com arquivo (sem nome de arquivo, sem id do catálogo) e a seleção atual.
-- null = link morto. Com PIN e sem a prova: só {"estado":"pin"}. `p_contar` = abertura da página.
create function foto.link_abrir(p_token_hash text, p_pin_ok boolean, p_contar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.links;
  v_g foto.galerias;
  v_n integer;
begin
  v_l := foto.link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('estado', 'pin');
  end if;
  select * into v_g from foto.galerias g where g.id = v_l.galeria;
  if p_contar then
    update foto.links l set aberturas = l.aberturas + 1, aberto_em = now() where l.id = v_l.id;
  end if;
  v_n := foto.link_contagem(v_g.id);
  return jsonb_build_object(
    'estado', 'ok',
    'galeria', jsonb_build_object(
      'nome', v_g.nome, 'fotografo', v_g.fotografo, 'contratadas', v_g.contratadas, 'permiteExtras', v_g.permite_extras,
      'precoExtra', v_g.preco_extra, 'prazo', v_g.prazo, 'mensagem', v_g.mensagem, 'marcaDagua', v_g.marca_dagua,
      'estado', v_g.estado, 'travada', v_g.estado = 'concluida'),
    'expira', v_l.expira_em,
    'etiquetas', to_jsonb(foto.etiquetas_validas()),
    'escolhidas', v_n,
    'extras', greatest(v_n - v_g.contratadas, 0),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'grupo', f.grupo, 'melhor', f.melhor, 'largura', f.largura, 'altura', f.altura,
               'v', left(f.sha256, 12),
               'mini', case when f.mini_enviada_em is not null then left(f.mini_sha256, 12) end,
               'escolhida', coalesce(s.escolhida, false), 'comentario', s.comentario,
               'etiquetas', coalesce(to_jsonb(s.etiquetas), '[]'::jsonb))
             order by f.ordem, f.nome, f.id)
        from foto.galeria_fotos f
        left join foto.selecao s on s.foto = f.id
       where f.galeria = v_g.id and f.enviada_em is not null), '[]'::jsonb),
    'envio', (
      select jsonb_build_object('nome', e.nome, 'em', e.enviado_em, 'escolhidas', e.escolhidas, 'extras', e.extras)
        from foto.envios e where e.galeria = v_g.id order by e.enviado_em desc, e.id limit 1)
  );
end
$$;

-- Escolher ou desfazer uma foto. Sem extras, a galeria enche na quantidade contratada ({"erro":"cheia"}).
create function foto.link_escolher(p_token_hash text, p_pin_ok boolean, p_foto uuid, p_escolhida boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.links;
  v_g foto.galerias;
  v_ja boolean;
  v_n integer;
begin
  v_l := foto.link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  if p_foto is null or p_escolhida is null then
    return jsonb_build_object('erro', 'formato');
  end if;
  -- a galeria trava a contagem: dois toques juntos não passam do contratado
  select * into v_g from foto.galerias g where g.id = v_l.galeria for update;
  if v_g.estado = 'concluida' then
    return jsonb_build_object('erro', 'travada');
  end if;
  perform 1 from foto.galeria_fotos f where f.id = p_foto and f.galeria = v_g.id and f.enviada_em is not null;
  if not found then
    return jsonb_build_object('erro', 'foto');
  end if;
  select s.escolhida into v_ja from foto.selecao s where s.foto = p_foto;
  v_n := foto.link_contagem(v_g.id);
  if p_escolhida and not coalesce(v_ja, false) and not v_g.permite_extras and v_n >= v_g.contratadas then
    return jsonb_build_object('erro', 'cheia', 'escolhidas', v_n);
  end if;
  insert into foto.selecao (foto, galeria, escolhida) values (p_foto, v_g.id, p_escolhida)
  on conflict (foto) do update set escolhida = excluded.escolhida, atualizada_em = now();
  v_n := foto.link_contagem(v_g.id);
  return jsonb_build_object('ok', true, 'escolhida', p_escolhida, 'escolhidas', v_n, 'extras', greatest(v_n - v_g.contratadas, 0));
end
$$;

-- Comentário curto e etiquetas de pedido de uma foto (os dois de uma vez; vazio apaga).
create function foto.link_comentar(p_token_hash text, p_pin_ok boolean, p_foto uuid, p_comentario text, p_etiquetas text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.links;
  v_g foto.galerias;
  v_texto text := nullif(btrim(regexp_replace(coalesce(p_comentario, ''), '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]', '', 'g')), '');
  v_etq text[];
begin
  v_l := foto.link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  if p_foto is null then
    return jsonb_build_object('erro', 'formato');
  end if;
  select * into v_g from foto.galerias g where g.id = v_l.galeria for update;
  if v_g.estado = 'concluida' then
    return jsonb_build_object('erro', 'travada');
  end if;
  perform 1 from foto.galeria_fotos f where f.id = p_foto and f.galeria = v_g.id and f.enviada_em is not null;
  if not found then
    return jsonb_build_object('erro', 'foto');
  end if;
  if char_length(coalesce(v_texto, '')) > 500 then
    return jsonb_build_object('erro', 'texto');
  end if;
  select coalesce(array_agg(distinct e order by e), '{}'::text[]) into v_etq from unnest(coalesce(p_etiquetas, '{}'::text[])) as e;
  if not (v_etq <@ foto.etiquetas_validas()) or cardinality(v_etq) > 8 then
    return jsonb_build_object('erro', 'etiquetas');
  end if;
  insert into foto.selecao (foto, galeria, comentario, etiquetas) values (p_foto, v_g.id, v_texto, v_etq)
  on conflict (foto) do update set comentario = excluded.comentario, etiquetas = excluded.etiquetas, atualizada_em = now();
  return jsonb_build_object('ok', true, 'comentario', v_texto, 'etiquetas', to_jsonb(v_etq));
end
$$;

-- O envio final, com o nome de quem envia. Trava a seleção (estado `concluida`) até o fotógrafo reabrir.
create function foto.link_enviar(p_token_hash text, p_pin_ok boolean, p_nome text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.links;
  v_g foto.galerias;
  v_nome text := left(btrim(regexp_replace(regexp_replace(coalesce(p_nome, ''), '[\u0001-\u001f\u007f<>]', ' ', 'g'), '\s+', ' ', 'g')), 80);
  v_fotos uuid[];
  v_n integer;
  v_e foto.envios;
begin
  v_l := foto.link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  select * into v_g from foto.galerias g where g.id = v_l.galeria for update;
  if v_g.estado = 'concluida' then
    return jsonb_build_object('erro', 'travada');
  end if;
  if char_length(v_nome) < 1 then
    return jsonb_build_object('erro', 'nome');
  end if;
  select coalesce(array_agg(s.foto order by f.ordem, f.nome, f.id), '{}'::uuid[]) into v_fotos
    from foto.selecao s join foto.galeria_fotos f on f.id = s.foto
   where s.galeria = v_g.id and s.escolhida;
  v_n := cardinality(v_fotos);
  if v_n = 0 then
    return jsonb_build_object('erro', 'vazia');
  end if;
  if not v_g.permite_extras and v_n > v_g.contratadas then
    return jsonb_build_object('erro', 'cheia', 'escolhidas', v_n);
  end if;
  insert into foto.envios (galeria, link, nome, escolhidas, extras, fotos)
  values (v_g.id, v_l.id, v_nome, v_n, greatest(v_n - v_g.contratadas, 0), v_fotos)
  returning * into v_e;
  update foto.galerias g set estado = 'concluida' where g.id = v_g.id;
  return jsonb_build_object('ok', true, 'envio',
    jsonb_build_object('nome', v_e.nome, 'em', v_e.enviado_em, 'escolhidas', v_e.escolhidas, 'extras', v_e.extras));
end
$$;

-- Onde está o arquivo de uma foto do link (a chave do armazenamento, o tipo, o tamanho e o sha256). null = não há:
-- link morto, PIN sem prova, foto de outra galeria ou sem arquivo. Miniatura que não veio cai na prévia.
create function foto.link_imagem(p_token_hash text, p_pin_ok boolean, p_foto uuid, p_mini boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_l foto.links;
  v_f foto.galeria_fotos;
begin
  v_l := foto.link_vivo(p_token_hash);
  if v_l.id is null or (v_l.pin_hash is not null and p_pin_ok is distinct from true) or p_foto is null then
    return null;
  end if;
  select * into v_f from foto.galeria_fotos f where f.id = p_foto and f.galeria = v_l.galeria and f.enviada_em is not null;
  if not found then
    return null;
  end if;
  if coalesce(p_mini, false) and v_f.mini_enviada_em is not null then
    return jsonb_build_object('chave', v_f.chave || '-m', 'tipo', v_f.mini_tipo, 'tamanho', v_f.mini_tamanho, 'sha256', v_f.mini_sha256);
  end if;
  return jsonb_build_object('chave', v_f.chave, 'tipo', v_f.tipo, 'tamanho', v_f.tamanho, 'sha256', v_f.sha256);
end
$$;

revoke all on function
  foto.link_vivo(text), foto.link_pin(text), foto.link_contagem(uuid), foto.link_abrir(text, boolean, boolean),
  foto.link_escolher(text, boolean, uuid, boolean), foto.link_comentar(text, boolean, uuid, text, text[]),
  foto.link_enviar(text, boolean, text), foto.link_imagem(text, boolean, uuid, boolean)
from public;
grant execute on function
  foto.link_pin(text), foto.link_abrir(text, boolean, boolean), foto.link_escolher(text, boolean, uuid, boolean),
  foto.link_comentar(text, boolean, uuid, text, text[]), foto.link_enviar(text, boolean, text),
  foto.link_imagem(text, boolean, uuid, boolean)
to foto_app;
