-- Maestro · 0019 · Drive pelo SOBEDESCE na revisão e nos Arquivos (plano v2 §4.1 e §5, fases 8–10). Só acrescenta.
--
-- 1. `versoes.compartilhamento` (já existe desde a 0005) passa a ser escrito pela função `versao_compartilhamento`: o
--    que o SOBEDESCE mudou no arquivo do Drive da versão quando o link do cliente foi gerado ("qualquer pessoa com o
--    link", decisão do titular de 28/10/2026), para desfazer ao revogar, fechar ou vencer. Forma:
--    { permissao_id: text | null, ja_publico: bool, sub: uuid (quem ligou), em: timestamptz, recolhido_em?: timestamptz,
--      erro?: text }. Escrita só por função (a tabela segue só com select para maestro_app).
-- 2. `projects.drive_folder_nome`: o nome da pasta do Drive ligada ao projeto (o id já existia em `drive_folder_id`).
--    O Maestro guarda só id e nome, nunca bytes.

alter table maestro.projects add column if not exists drive_folder_nome text check (drive_folder_nome is null or char_length(drive_folder_nome) between 1 and 200);
alter table maestro.projects drop constraint if exists projects_drive_folder_id_formato;
alter table maestro.projects add constraint projects_drive_folder_id_formato check (drive_folder_id is null or drive_folder_id ~ '^[A-Za-z0-9_-]{1,200}$') not valid;

create or replace function maestro.versao_compartilhamento(p_versao uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := maestro.exigir_escrita_no_quadro();
begin
  if p_dados is not null and (jsonb_typeof(p_dados) <> 'object' or pg_column_size(p_dados) > 2048) then
    raise exception 'compartilhamento precisa ser um objeto pequeno.' using errcode = 'P0001';
  end if;
  update maestro.versoes v set compartilhamento = p_dados
   where v.id = p_versao and v.org_id = v_org and v.fonte = 'drive' and v.drive_file_id is not null;
  if not found then
    raise exception 'Versão do Drive não encontrada.' using errcode = 'P0002';
  end if;
end
$$;
revoke all on function maestro.versao_compartilhamento(uuid, jsonb) from public;
grant execute on function maestro.versao_compartilhamento(uuid, jsonb) to maestro_app;
