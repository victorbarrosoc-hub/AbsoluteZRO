-- Absolute ZRO HUB · 0015 · perfil único (pedido do titular, 27/10/2026): a conta Absolute ZRO é o perfil de todas as
-- plataformas, como o Adobe ID. Nome, e-mail e foto são editados num lugar só (/perfil) e cada app lê do login único
-- (claims name, picture, updated_at). A foto ganha um endereço público e impossível de adivinhar, que muda a cada foto
-- nova: os apps mostram a foto sem cookie do HUB e nunca exibem uma versão velha por cache.

alter table zro.user_avatars add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists user_avatars_public_id on zro.user_avatars (public_id);

create or replace function zro.user_avatars_novo_endereco() returns trigger
language plpgsql as $$
begin
  if new.data is distinct from old.data or new.content_type is distinct from old.content_type then
    new.public_id := gen_random_uuid();
  end if;
  return new;
end
$$;
create or replace trigger user_avatars_novo_endereco before update on zro.user_avatars
  for each row execute function zro.user_avatars_novo_endereco();
