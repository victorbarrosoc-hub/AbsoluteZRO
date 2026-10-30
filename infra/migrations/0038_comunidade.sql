-- Absolute ZRO HUB · 0038 · a comunidade: quem os apps da família podem listar (decisão do titular, 30/10/2026).
-- "Pode usar os que estão cadastrados no ecossistema; se não confirmou o próprio @, não precisa colocar." O Carro do
-- Freela (e qualquer app com o escopo zro.pessoas) passa a LISTAR os perfis profissionais, em vez de só buscar por
-- @ ou nome: só quem aparece na busca (visivel) E já confirmou o @ (arroba_sugerida = false: escolheu no cadastro ou
-- trocou depois; a sugestão automática não conta), com conta ativa. Os mesmos campos mínimos de zro.buscar_perfis
-- (nada de e-mail ou telefone), filtro opcional por função, página por @ (cursor), até 200 por página.

create or replace function zro.comunidade_perfis(p_funcao text default null, p_depois text default null, p_limite int default 100)
returns table (user_id uuid, arroba text, nome text, foto uuid, funcoes text[], funcao_outra text, cidade text,
               portfolio text, bio text, selos text[])
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.arroba, u.display_name, av.public_id, p.funcoes, p.funcao_outra, p.cidade, p.portfolio, p.bio,
         zro.selos_efetivos(p.user_id, p.selos)
  from zro.perfis p
  join zro.users u on u.id = p.user_id
  left join zro.user_avatars av on av.user_id = p.user_id
  where zro.current_user_id() is not null
    and p.visivel and not p.arroba_sugerida and u.status = 'active'
    and (p_funcao is null or p_funcao = any (p.funcoes))
    and (p_depois is null or p.arroba > lower(p_depois))
  order by p.arroba
  limit least(greatest(coalesce(p_limite, 100), 1), 200)
$$;

revoke all on function zro.comunidade_perfis(text, text, int) from public;
grant execute on function zro.comunidade_perfis(text, text, int) to zro_app;
