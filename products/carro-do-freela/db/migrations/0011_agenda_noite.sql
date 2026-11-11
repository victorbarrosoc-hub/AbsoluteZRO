-- Carro do Freela · 0011 · a noite na agenda declarada (11/11/2026).
-- Retorno de um freela marcando trabalhos de verdade: "boa parte dos trabalhos é à noite, não tem opção de marcar
-- dizendo que a noite está ocupada; aí eu tô marcando como se fosse à tarde." A agenda (0001) só sabia 'dia', 'manha'
-- e 'tarde'. Agora também 'noite'.
--
-- O que cada parte ocupa (minutos do dia, [início, fim), a conta da 0007):
--   'dia'   = [00:00, 24:00)                       (igual)
--   'manha' = [00:00, hora ou 12:00)               (igual)
--   'tarde' = [hora ou 12:00, 24:00)               (igual, de propósito)
--   'noite' = [hora ou 18:00, 24:00)               (nova)
-- Por que a tarde NÃO passa a acabar às 18:00: quem já marcou "tarde" para um trabalho da noite (o retorno acima é
-- exatamente isso) ficaria dado como livre à noite, e a guilda o chamaria para um horário em que ele está ocupado.
-- Dizer ocupado a mais é um engano que a pessoa corrige; dizer livre a mais marca duas pessoas no mesmo horário. A
-- tela diz "Tarde ocupada · do meio-dia em diante" e "Noite ocupada · das 18h em diante"; a manhã segue livre nas duas.
--
-- Continua uma linha por dia (pk sub, dia): o dia tem um estado só. A hora, como antes, só existe fora de 'dia'.
-- Quem lê a agenda: `pessoas()` (0001) e `agendas()` (0002) devolvem `p` como texto, sem escolher por parte, e não
-- mudam; `guilda_estado_em()` (0007) cruza pela `faixa_da_agenda()`, que é a única que escolhe por parte e é refeita
-- aqui (o corpo da 0007, fiel, + o ramo 'noite').

alter table carro_do_freela.agenda_dias drop constraint if exists agenda_dias_parte_check;
alter table carro_do_freela.agenda_dias
  add constraint agenda_dias_parte_check check (parte in ('dia', 'manha', 'tarde', 'noite'));

create or replace function carro_do_freela.faixa_da_agenda(p_parte text, p_hora time) returns int4range
language sql immutable set search_path = '' as $$
  select case p_parte
           when 'manha' then int4range(0, coalesce((extract(epoch from p_hora) / 60)::integer, 720), '[)')
           when 'tarde' then int4range(coalesce((extract(epoch from p_hora) / 60)::integer, 720), 1440, '[)')
           when 'noite' then int4range(coalesce((extract(epoch from p_hora) / 60)::integer, 1080), 1440, '[)')
           else int4range(0, 1440, '[)')
         end
$$;

revoke all on function carro_do_freela.faixa_da_agenda(text, time) from public;
