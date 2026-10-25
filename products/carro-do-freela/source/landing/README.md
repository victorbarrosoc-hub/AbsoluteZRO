# Landing de pré-cadastro

> **CONFIG já preenchido** com o projeto `projeto-novo-substituir`. A `anon key`
> fica exposta no HTML de propósito — ela só é segura porque a política é
> **insert-only**. Se a RLS for desligada ou uma policy de `select` for criada,
> a lista inteira vaza. Confira com o `curl` do fim deste arquivo.

Etapa 1 do plano de lançamento. Arquivo único (`index.html`), sem framework,
sem build — as fontes da casa já estão embutidas. `corpo.html` é a fonte;
`node gerar.js` injeta as fontes e escreve `index.html`.

## Subir na Vercel

1. No painel da Vercel: **Add New → Project**, aponte para este repositório.
2. Em **Root Directory**, escolha `landing/`.
3. Framework preset: **Other**. Sem build command, output `.`.
4. Deploy. Aponte o domínio (`carrodofreela.com.br`) quando o registro.br
   propagar.

Sem mais nada, a página sobe em **modo demonstração** — funciona inteira, mas
avisa que não está gravando. É proposital: a página nunca finge que gravou.

## Ligar o envio de verdade (Supabase)

1. Crie um projeto grátis em supabase.com.
2. SQL Editor → rode:

```sql
create table public.leads (
  id          bigint generated always as identity primary key,
  criado_em   timestamptz not null default now(),
  lado        text not null check (lado in ('freela','contratante')),
  nome        text not null,
  whatsapp    text not null,
  praca       text not null,
  funcao      text,
  tipo_negocio text,
  jobs_mes    text,
  aceite_contato    boolean not null,
  aceite_publicacao boolean,
  dias_livres date[]
);

alter table public.leads enable row level security;

-- o site só INSERE. Ninguém lê nem apaga com a chave pública.
create policy "insercao publica" on public.leads
  for insert to anon with check (true);
```

3. Settings → API: copie a **URL** e a **anon public key**.
4. Em `corpo.html`, preencha o bloco `CONFIG` no topo do `<script>`,
   rode `node gerar.js` e faça o deploy de novo.

A anon key só consegue inserir (a política acima não dá SELECT), então pode
ficar no HTML. Os leads você lê no painel do Supabase, logado.

## Se o envio falhar no celular de alguém

O lead cai em `localStorage` (`cdf-leads-fila`) em vez de se perder em
silêncio. Numa conversa de suporte, peça para a pessoa abrir o console e
mandar o conteúdo — ou simplesmente refazer o cadastro.

## O que a página colhe, e por quê

| Campo | Por quê |
|---|---|
| lado (freela/contratante) | as duas mensagens de campanha são diferentes |
| nome, WhatsApp, praça | o convite da primeira leva sai pelo WhatsApp |
| função principal (freela) | monta o censo real de abertura |
| tipo de negócio + jobs/mês (contratante) | qualifica quem vai pagar o Volante |
| aceite de contato (LGPD) | consentimento com data — obrigatório |
| aceite de publicação (freela) | é o que autoriza o perfil a existir na plataforma |
| dias livres dos próximos 15 | a plataforma abre com agenda viva, não vazia |


## Conferir que a anon key não lê nada

Rode no seu terminal. Com a RLS ligada e só a policy de insert, tem que voltar
`[]` — mesmo havendo linhas na tabela:

```bash
K="<sua anon key>"
curl "https://projeto-novo-substituir.supabase.co/rest/v1/leads?select=*" \
  -H "apikey: $K" -H "Authorization: Bearer $K"
```

- `[]` → certo, a chave só escreve.
- Linhas de verdade → **a RLS está desligada**. Volte e rode o `alter table ...
  enable row level security`.
