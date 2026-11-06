-- Absolute ZRO HUB · 0060 · espelho dos instaladores em São Paulo (ADR 0043; titular, 06/11/2026: downloads a 5–64 KB/s
-- pelo servidor de arquivos do GitHub numa internet de 210 Mbps no Brasil).
--
-- Cria o bucket `apps` do Supabase Storage no AbsoluteZRO-SP (sa-east-1): LEITURA PÚBLICA (o endereço
-- /storage/v1/object/public/apps/<tag>/<arquivo> não pede login, como o link público do Release no GitHub) e escrita
-- só com as chaves S3 do projeto, que ficam nos secrets do GitHub Actions (os workflows de cada app copiam o build
-- novo e apagam o antigo). Nenhuma policy em storage.objects: sem policy, anon e authenticated não gravam nem apagam
-- nada; as chaves S3 passam por cima do RLS (são de servidor). O que o bucket guarda é o mesmo que já é público no
-- Release (instaladores e versao.json, sem segredo); a garantia do arquivo continua sendo o SHA-256 do catálogo.
--
-- Limite por arquivo: 1 GB (os instaladores têm ~220 MB). O limite GLOBAL do projeto (Storage › Settings, 50 MB de
-- padrão) precisa ser maior ou igual; isso é configuração do painel, não do banco.
--
-- Sem o schema `storage` (o Postgres dos testes e do CI): não faz nada. Sem permissão no storage: avisa e segue, para
-- o deploy do HUB não parar por causa do espelho (o bucket pode ser criado no painel com os mesmos valores).
-- Idempotente.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Sem storage.buckets (banco sem Supabase Storage): bucket apps não criado.';
    return;
  end if;
  begin
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'apps',
      'apps',
      true,
      1073741824,
      array[
        'application/x-apple-diskimage',
        'application/vnd.microsoft.portable-executable',
        'application/x-msdownload',
        'application/octet-stream',
        'application/json'
      ]
    )
    on conflict (id) do update
      set public = excluded.public,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  exception when insufficient_privilege then
    raise warning 'Sem permissão para criar o bucket apps: crie no painel (público, 1 GB, dmg/exe/json).';
  end;
end
$$;
