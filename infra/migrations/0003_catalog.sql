-- Absolute ZRO HUB · 0003 · catálogo inicial NEUTRO (PRD §9.1).
-- Sem preço, teste grátis, periodicidade ou "ilimitado": tudo isso fica null até o titular definir no console.
-- Limites de operações medidas também começam vazios; operação medida sem limite configurado fica bloqueada.
-- Idempotente: reexecutar não sobrescreve o que o console já mudou.

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('carro-do-freela', 'Carro do Freela', 'beta', 1, 'Comunidade, oportunidades e contratação',
   'Agenda e contratação de freelas do audiovisual. Hoje é um protótipo com partes simuladas; o HUB recebe o job pelo contrato job.created.',
   'external_link', 'https://carrodofreela.com.br', false),
  ('tpeasy', 'TPeasy', 'active', 2, 'Roteiro e suporte à captação',
   'Teleprompter no celular. O HUB guarda o roteiro versionado e troca roteiros com o TPeasy pelo backup JSON do próprio app.',
   'external_link', 'https://tpeasy.vercel.app', false),
  ('sobedesce', 'SOBEDESCE', 'active', 3, 'Ingest, cópia e backup em mídia física e nuvem',
   'Cópia conferida por checksum para discos e Google Drive. O HUB importa o resumo de cada cartão e o relatório xxHash64.',
   'api_adapter', 'https://sobedesce.vercel.app', false),
  ('synquei', 'Synquei', 'active', 4, 'Organização, alinhamento e sincronização',
   'Sincronia pelo som e exportação para o editor. O HUB valida o manifest e propõe a organização sem mover nada.',
   'api_adapter', 'https://synquei.vercel.app', false),
  ('ai-edit', 'AI Edit', 'coming_soon', 5, 'Decupagem, seleção e montagem assistida',
   'Em desenvolvimento. Ainda não processa nada; os contratos de entrada e saída estão definidos.',
   'scaffold', null, true),
  ('nossom', 'NOSSOM', 'active', 6, 'Tratamento sonoro e SFX',
   'Estúdio de áudio. O áudio fica no dispositivo; o HUB só passa a timeline e as marcações pelo contrato edit.timeline.ready.',
   'external_link', 'https://nossom-teal.vercel.app', false),
  ('finishing', 'Finishing', 'coming_soon', 7, 'Media manager, color grading assistido e entregas',
   'Em desenvolvimento. Começa por QC, exportação e media manager; grading assistido vem depois.',
   'scaffold', null, true)
on conflict (id) do nothing;

insert into zro.product_features (product_id, feature_key, description, metric) values
  ('carro-do-freela', 'job_import', 'Criar projeto a partir de um job (contrato job.created)', null),
  ('tpeasy', 'script_import', 'Importar roteiro do backup do TPeasy como nova versão', null),
  ('tpeasy', 'script_export', 'Exportar o roteiro do projeto no formato de backup do TPeasy', null),
  ('sobedesce', 'manifest_import', 'Importar o resumo do cartão e o relatório de checksums', 'sobedesce.manifest_imports'),
  ('synquei', 'organization_plan', 'Validar o manifest e propor a organização (prévia, sem mover arquivos)', 'synquei.organization_plans'),
  ('nossom', 'timeline_handoff', 'Preparar a passagem de timeline e marcações para o NOSSOM', null)
on conflict (product_id, feature_key) do nothing;

-- Planos v1, ativos e sem preço. Futuras ferramentas só entram no Ciclo do O em nova versão, depois de lançadas.
insert into zro.plans (code, version, name, kind, status, description) values
  ('conta-absolute-zro', 1, 'Conta Absolute ZRO', 'free', 'active', 'Identidade, painel, organização e catálogo.'),
  ('ciclo-do-o', 1, 'Ciclo do O', 'bundle', 'active', 'Acesso às ferramentas lançadas incluídas na oferta ativa, com limites explícitos.'),
  ('individual-carro-do-freela', 1, 'Carro do Freela', 'individual', 'active', 'Somente Carro do Freela.'),
  ('individual-tpeasy', 1, 'TPeasy', 'individual', 'active', 'Somente TPeasy.'),
  ('individual-sobedesce', 1, 'SOBEDESCE', 'individual', 'active', 'Somente SOBEDESCE.'),
  ('individual-synquei', 1, 'Synquei', 'individual', 'active', 'Somente Synquei.'),
  ('individual-nossom', 1, 'NOSSOM', 'individual', 'active', 'Somente NOSSOM.')
on conflict (code, version) do nothing;

insert into zro.plan_products (plan_id, product_id)
select p.id, x.product_id
from zro.plans p
join (values
  ('ciclo-do-o', 'carro-do-freela'), ('ciclo-do-o', 'tpeasy'), ('ciclo-do-o', 'sobedesce'),
  ('ciclo-do-o', 'synquei'), ('ciclo-do-o', 'nossom'),
  ('individual-carro-do-freela', 'carro-do-freela'), ('individual-tpeasy', 'tpeasy'),
  ('individual-sobedesce', 'sobedesce'), ('individual-synquei', 'synquei'), ('individual-nossom', 'nossom')
) as x (code, product_id) on x.code = p.code
where p.version = 1
on conflict (plan_id, product_id) do nothing;
