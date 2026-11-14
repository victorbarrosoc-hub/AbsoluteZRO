-- Plataforma de fotos · 0004 · "evento com crianças" na busca por rosto (docs/estudo/rosto-em-evento.md, B.4: menores,
-- art. 14 da LGPD). Só acrescenta; 0003 fica como está.
--
-- Uma marca do evento que o fotógrafo liga ao criar. Com ela:
--   - o modo é obrigatoriamente "com consentimento": busca aberta não existe (constraint e porta estreita). Ninguém tem
--     a assinatura do rosto guardada sem que um responsável tenha pedido;
--   - o prazo cai para no máximo 15 dias (o comum dos eventos é 30): menos tempo com dado de criança guardado. 15 dias
--     cobrem a semana em que as fotos saem e a seguinte; é suposição de produto e pede revisão jurídica;
--   - publicar pede o aceite do aviso próprio (`ativacao-criancas-…`): o fotógrafo avisa os responsáveis antes;
--   - o pedido do visitante usa o texto para responsáveis (`cadastro-criancas-…`), com a caixa "sou responsável por
--     quem aparece na selfie" obrigatória; a porta recusa o texto comum num evento com crianças e vice-versa.
-- Nada de estimar idade pelo rosto: não é confiável e seria outra biometria.

alter table foto.eventos add column criancas boolean not null default false;
alter table foto.eventos add constraint eventos_criancas check (not criancas or modo = 'consentimento');

-- Roda antes de foto.eventos_guarda (gatilhos BEFORE vão em ordem alfabética): só confere.
create function foto.eventos_criancas_guarda() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.criancas then
    -- desligar a marca só no rascunho (o que subiu com ela continua com as regras dela)
    if tg_op = 'UPDATE' and old.criancas and old.estado <> 'rascunho' then
      raise exception 'evento:criancas' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.modo <> 'consentimento' then
    raise exception 'evento:criancas' using errcode = 'P0001';
  end if;
  if current_user = 'foto_app' and (tg_op = 'INSERT' or new.prazo <> old.prazo or not old.criancas)
     and new.prazo > now() + interval '15 days 5 minutes' then
    raise exception 'evento:prazo' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.estado = 'publicado' and old.estado = 'rascunho'
     and (new.aviso_versao is null or new.aviso_versao !~ '^ativacao-criancas-') then
    raise exception 'evento:sem_aviso' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function foto.eventos_criancas_guarda() from public;
create trigger eventos_criancas before insert or update on foto.eventos for each row execute function foto.eventos_criancas_guarda();

grant insert (criancas) on foto.eventos to foto_app;
grant update (criancas) on foto.eventos to foto_app;

-- ───────── porta estreita: a ficha leva a marca; a busca aberta e a remoção recusam; o pedido confere o texto ─────────

create or replace function foto.evento_abrir(p_token_hash text, p_pin_ok boolean, p_contar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_e foto.eventos;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return null;
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('estado', 'pin');
  end if;
  select * into v_e from foto.eventos e where e.id = v_l.evento;
  if p_contar then
    update foto.evento_links l set aberturas = l.aberturas + 1, aberto_em = now() where l.id = v_l.id;
  end if;
  return jsonb_build_object('estado', 'ok', 'evento', jsonb_build_object(
    'nome', v_e.nome, 'data', v_e.data, 'modo', v_e.modo, 'prazo', v_e.prazo, 'marcaDagua', v_e.marca_dagua, 'criancas', v_e.criancas,
    'fotos', (select count(*) from foto.evento_fotos f where f.evento = v_e.id and f.enviada_em is not null)));
end
$$;

-- Busca aberta: a de 0003, com a marca conferida antes de tudo (o modo já não deixa; aqui fica escrito de novo).
create or replace function foto.evento_achar(p_token_hash text, p_pin_ok boolean, p_sondas bytea[], p_versao text, p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_e foto.eventos;
  v_eu uuid[];
  v_talvez uuid[];
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  select * into v_e from foto.eventos e where e.id = v_l.evento;
  if v_e.modo <> 'aberta' or v_e.criancas then
    return jsonb_build_object('erro', 'modo');
  end if;
  if foto.evento_sondas(p_sondas) is null then
    return jsonb_build_object('erro', 'vetor');
  end if;
  if not foto.evento_registrar(v_e.id, 'busca', 'aceitou', p_versao, p_sha) then
    return jsonb_build_object('erro', 'formato');
  end if;
  perform foto.evento_contar(v_e.id, 'buscas');
  with c as (
    select c.foto, foto.rosto_faixa(c.cs, c.largura, c.nota, c.colado, c.perfil) as faixa,
           (select max(x) from unnest(c.cs) x) as nota
      from foto.evento_cossenos(v_e.id, p_sondas) c
  ),
  por_foto as (
    select distinct on (c.foto) c.foto, c.faixa, c.nota
      from c where c.faixa is not null
     order by c.foto, (c.faixa = 'eu') desc, c.nota desc
  ),
  topo as (select * from por_foto order by (faixa = 'eu') desc, nota desc limit 200)
  select coalesce(array_agg(foto order by nota desc) filter (where faixa = 'eu'), '{}'),
         coalesce(array_agg(foto order by nota desc) filter (where faixa = 'talvez'), '{}')
    into v_eu, v_talvez
    from topo;
  return jsonb_build_object('ok', true, 'eu', foto.evento_fotos_json(v_e.id, v_eu), 'talvez', foto.evento_fotos_json(v_e.id, v_talvez));
end
$$;

-- Com consentimento: a de 0003, e o texto aceito tem de ser o do evento (para responsáveis, com crianças; o comum, sem).
create or replace function foto.evento_cadastrar(p_token_hash text, p_pin_ok boolean, p_sondas bytea[], p_chave_hash text, p_versao text, p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_e foto.eventos;
  v_p foto.evento_pessoas;
  v_n integer;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  select * into v_e from foto.eventos e where e.id = v_l.evento;
  if v_e.modo <> 'consentimento' then
    return jsonb_build_object('erro', 'modo');
  end if;
  if foto.evento_sondas(p_sondas) is null then
    return jsonb_build_object('erro', 'vetor');
  end if;
  if p_chave_hash !~ '^[0-9a-f]{64}$' or v_e.criancas is distinct from (coalesce(p_versao, '') ~ '^cadastro-criancas-') then
    return jsonb_build_object('erro', 'formato');
  end if;
  if not foto.evento_registrar(v_e.id, 'cadastro', 'aceitou', p_versao, p_sha) then
    return jsonb_build_object('erro', 'formato');
  end if;
  perform foto.evento_contar(v_e.id, 'cadastros');
  select count(*) into v_n from foto.evento_pessoas p where p.evento = v_e.id;
  select p.* into v_p
    from foto.evento_pessoas p
   where p.evento = v_e.id
     and foto.rosto_faixa(array(
           select (select sum(a * b) from unnest(foto.vetor_int(g), foto.vetor_int(s)) as t(a, b))::float8 / sqrt(foto.vetor_n2(g)::float8 * foto.vetor_n2(s))
             from unnest(p_sondas) s, unnest(array_remove(array[p.v1, p.v2, p.v3], null)) g), 24, 100, false, false) = 'eu'
   order by p.atualizado_em desc
   limit 1;
  if v_p.id is not null then
    update foto.evento_pessoas set chave_hash = p_chave_hash, v1 = p_sondas[1], v2 = p_sondas[2], v3 = p_sondas[3], atualizado_em = now()
     where id = v_p.id;
  else
    if v_n >= 20000 then
      return jsonb_build_object('erro', 'cheio');
    end if;
    insert into foto.evento_pessoas (evento, chave_hash, v1, v2, v3) values (v_e.id, p_chave_hash, p_sondas[1], p_sondas[2], p_sondas[3])
    returning * into v_p;
  end if;
  return foto.evento_minhas_de(v_p.id);
end
$$;

-- "Não quero aparecer" é da busca aberta: com crianças, a mesma recusa do modo.
create or replace function foto.evento_remover(p_token_hash text, p_pin_ok boolean, p_sondas bytea[], p_fotos uuid[], p_versao text, p_sha text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l foto.evento_links;
  v_e foto.eventos;
  v_ids bigint[];
  v_fotos uuid[];
  v_n integer;
begin
  v_l := foto.evento_link_vivo(p_token_hash);
  if v_l.id is null then
    return jsonb_build_object('erro', 'link');
  end if;
  if v_l.pin_hash is not null and p_pin_ok is distinct from true then
    return jsonb_build_object('erro', 'pin');
  end if;
  select * into v_e from foto.eventos e where e.id = v_l.evento;
  if v_e.modo <> 'aberta' or v_e.criancas then
    return jsonb_build_object('erro', 'modo');
  end if;
  if foto.evento_sondas(p_sondas) is null then
    return jsonb_build_object('erro', 'vetor');
  end if;
  select coalesce(array_agg(c.rosto), '{}'), coalesce(array_agg(distinct c.foto), '{}') into v_ids, v_fotos
    from foto.evento_cossenos(v_e.id, p_sondas) c
   where (select max(x) from unnest(c.cs) x) >= 0.45
     and (p_fotos is null or c.foto = any(p_fotos));
  if p_fotos is null then
    return jsonb_build_object('ok', true, 'fotos', foto.evento_fotos_json(v_e.id, v_fotos[1:200]));
  end if;
  if not foto.evento_registrar(v_e.id, 'remocao', 'aceitou', p_versao, p_sha) then
    return jsonb_build_object('erro', 'formato');
  end if;
  delete from foto.evento_rostos r where r.id = any(v_ids);
  get diagnostics v_n = row_count;
  insert into foto.evento_remocoes (evento, v, n2, removidos) values (v_e.id, p_sondas[1], foto.vetor_n2(p_sondas[1]), v_n);
  perform foto.evento_contar(v_e.id, 'remocoes');
  return jsonb_build_object('ok', true, 'removidos', v_n);
end
$$;
