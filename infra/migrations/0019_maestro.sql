-- Absolute ZRO HUB · 0019 · o Maestro entra no catálogo (ADR 0022; decisão do titular, 28/10/2026).
-- Plataforma nova em products/maestro: pauta (Quadro), aprovação do cliente e projetos para agências e produtoras.
-- Nasce fechada: stage 'coming_soon' (o gate de lançamento da 0018 decide quando e para quem abre; o Maestro só deixa
-- entrar quem tem 'maestro' em zro_products, concedido pelo console). Sem endereço público ainda: external_url e
-- sso_start_url ficam vazios até o projeto Vercel e o domínio maestro.absolutezro.com serem autorizados pelo titular.
-- Planos não mudam (avulso, decisão 7): entitlement de teste só por concessão do console.
-- step_order 8: a última etapa do Ciclo do O (components/cycle-o.tsx divide o anel pelo número de etapas).

insert into zro.products (id, name, stage, step_order, role_in_flow, description, integration_mode, external_url, provisional_name) values
  ('maestro', 'Maestro', 'coming_soon', 8, 'Pauta, aprovação do cliente e projetos para agências e produtoras',
   'Em desenvolvimento. Quadro de pautas em oito colunas, aprovação do cliente por link sem conta e projetos ligados ao projeto da Absolute ZRO.',
   'api_adapter', null, false)
on conflict (id) do nothing;

-- O projeto do Maestro liga-se ao projeto canônico do HUB ao nascer (contrato maestro.project/1, etapa 3). Sem métrica.
insert into zro.product_features (product_id, feature_key, description, metric) values
  ('maestro', 'project_link', 'Ligar um projeto do Maestro ao projeto da Absolute ZRO (maestro.project/1)', null)
on conflict (product_id, feature_key) do nothing;
