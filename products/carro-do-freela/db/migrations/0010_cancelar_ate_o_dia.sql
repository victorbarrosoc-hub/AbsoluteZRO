-- Carro do Freela · 0010 · o job aceito só se cancela ATÉ a véspera do dia (03/11/2026).
-- Decisão do titular: pela guarda da 0003, quem mandou (`de_sub`) podia levar uma proposta `aceita` a `cancelada` a
-- qualquer hora, mesmo depois do dia do job. Isso tirava do selo um job que os dois lados já tinham confirmado (0009,
-- `job_confirmacoes`). Regra nova: um job (`tipo = 'job'`) aceito só se cancela enquanto o `dia` for DEPOIS de hoje em
-- São Paulo (a mesma conta de "hoje" da 0009). Do dia em diante, não: "Aconteceu? Não" (0009) é o jeito de dizer que
-- ele não aconteceu.
--
-- O que NÃO muda: cancelar uma proposta `nova` (qualquer dia), o job aceito sem dia marcado (não há dia que chegue), o
-- brechó (como era), aceitar/recusar de quem recebe e o "a proposta não muda depois de mandada". A função é a da 0003,
-- copiada fielmente, só com o portão do dia no caminho de cancelar. O gatilho `propostas_guarda` da 0003 já aponta para
-- ela; trocar o corpo basta. O desmontar da missão (0006, `guilda_missao_cancelar`) cancela pelo mesmo UPDATE, então
-- também para no dia do job.

create or replace function carro_do_freela.propostas_guarda() returns trigger
language plpgsql set search_path = '' as $$
declare eu uuid := carro_do_freela.sub_atual();
begin
  if (new.de_sub, new.para_sub, new.de_nome, new.tipo, new.anuncio_id, new.dia, new.ini, new.fim, new.funcao, new.local,
      new.mensagem, new.valor_cents, new.criado_em)
     is distinct from
     (old.de_sub, old.para_sub, old.de_nome, old.tipo, old.anuncio_id, old.dia, old.ini, old.fim, old.funcao, old.local,
      old.mensagem, old.valor_cents, old.criado_em) then
    raise exception 'A proposta não muda depois de mandada.' using errcode = '42501';
  end if;
  if eu = old.para_sub and old.estado = 'nova' and new.estado in ('aceita', 'recusada') then
    return new;
  end if;
  if eu = old.de_sub and old.estado in ('nova', 'aceita') and new.estado = 'cancelada' then
    -- (0010) o job aceito só se cancela até a véspera; do dia em diante, só o "Aconteceu? Não"
    if old.tipo = 'job' and old.estado = 'aceita' and old.dia is not null
       and old.dia <= (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'O job não se cancela depois que o dia chega.' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'Mudança de estado não permitida.' using errcode = '42501';
end
$$;
revoke all on function carro_do_freela.propostas_guarda() from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function carro_do_freela.propostas_guarda() from %I', r);
    end if;
  end loop;
end
$$;
