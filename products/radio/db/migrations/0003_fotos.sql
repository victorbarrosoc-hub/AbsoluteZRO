-- RADION · 0003 · a foto de cada pessoa da equipe (titular, 07/11/2026: "quero" as fotos da equipe, depois da própria).
-- Arquivo novo; as anteriores não mudam.
--
-- O membro guarda só o identificador público da foto do perfil único da Absolute ZRO (o fim de /api/v1/foto/<id>), que
-- muda a cada foto nova e não revela nada. Cada site monta o endereço com a Absolute ZRO dele. A pessoa só atualiza a
-- própria foto (a política membros_mudar_o_seu já limita a linha à pessoa; aqui, só a coluna).

alter table radio.membros add column if not exists foto text check (foto is null or foto ~ '^[A-Za-z0-9_-]{8,80}$');
grant update (foto) on radio.membros to radio_app;
