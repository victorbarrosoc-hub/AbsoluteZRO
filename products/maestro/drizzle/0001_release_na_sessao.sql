-- Maestro · 0001 · a claim zro_release (gate de lançamento, ADR 0023 do HUB) passa a ficar na sessão (28/10/2026).
-- temAcesso() confere em todo pedido: "released" ou "allowed" entra; "closed" ou sem a claim, não. Vem do login e de
-- cada releitura do perfil (/api/zro/eu). Sessões de antes desta migração ficam com null (fechado) até a releitura.
alter table maestro.sessions add column if not exists zro_release jsonb;
