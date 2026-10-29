# ADR 0029 — Perfil profissional com @: achar e convidar gente do audiovisual

**Status:** aceita (29/10/2026, decisões do titular)

## Contexto

O titular quer que cada conta Absolute ZRO seja um **perfil profissional do ecossistema audiovisual**, com um **@**,
para as pessoas se acharem e se adicionarem (na central, no Maestro, no Carro do Freela). Antes, só dava para convidar
pelo e-mail exato, e cada app guardava um "perfil" próprio. Também pediu para arrumar a coluna "Ações" da tela Equipe
(select solto, "Mudar papel" em texto e "Remover" separado).

## Decisão

- **@ único por conta** (`zro.perfis.arroba`, migração `0029_perfil_profissional.sql`): 3 a 30 caracteres `a-z 0-9 . _`,
  sem ponto no começo/fim/dobrado, pelo menos uma letra, sempre minúsculo (único sem diferença de maiúsculas), palavras
  reservadas recusadas também com ponto ou sublinhado no meio. Regras iguais em `packages/auth/src/arroba.ts`
  (`@zro/auth/arroba`, usado pela tela) e no banco (`zro.arroba_valida`); um teste confere as listas.
- **Escolhido no cadastro** (passo "Escolha seu @" na conversa de criar conta, sugerido pelo nome). Toda conta nova
  nasce com um perfil por gatilho; quem já tinha conta ganhou uma sugestão do nome (`arroba_sugerida`). Sugestão aceita
  sem mexer e já ocupada vira a do banco com um número. **Troca**: 2 a cada 30 dias (sair da sugestão não conta); o @
  antigo leva ao perfil por 90 dias e, nesse tempo, ninguém pega (`zro.perfil_arrobas_antigas`). Conta excluída: o
  perfil sai na hora e o @ fica guardado 90 dias.
- **Perfil**: nome e foto (os da conta), @, funções (lista fixa: Direção, Produção, Câmera, Edição, Color, Som, Drone,
  Fotografia, Motion, Roteiro + "Outra" com texto), cidade, portfólio (só https) e bio curta (280). E-mail e telefone
  **nunca**: nem no perfil (o servidor recusa e-mail e número de telefone na bio, na cidade e em "Outra"), nem em
  resposta nenhuma.
- **Visível na busca por padrão** (decisão do titular), com o interruptor "Aparecer na busca" em Sua conta › Perfil
  profissional e um **aviso único** no topo da central ("Você agora é @…", Entendi / Esconder meu perfil / Editar).
  Escondido: ninguém acha pela busca nem pelo @ (a mesma resposta de um @ que não existe); o convite pelo **e-mail exato**
  continua valendo.
- **Selos de app** (opt-in por selo): "Freela no Carro do Freela", "Usa SOBEDESCE"… só aparecem quando a pessoa liga **e**
  já usa o app (conta no app pelo login único, `zro.app_accounts`). Nada de selo falso.
- **Privacidade no banco**: o papel `zro_app` lê de `zro.perfis` só a própria linha (e o @ de quem está na mesma
  organização ativa, como já acontecia com nome e foto); o @ só muda por `zro.trocar_arroba`. Os outros só chegam pelas
  funções security definer `zro.buscar_perfis` e `zro.perfil_por_arroba`, que devolvem campos mínimos e só perfis
  visíveis de contas ativas, e só com sessão.
- **Convite por @** (`zro.convidar_por_arroba`): dono ou administração da organização ativa (administrador só o dono), a
  conta resolvida no banco sem devolver o e-mail a ninguém; o convite guarda `via_arroba` e a lista de pendentes mostra o
  @. O HUB manda o aviso direto ao e-mail da pessoa; ela também vê em **Equipe › Convites para você** (com o balão no
  menu) e **sempre aceita** antes de entrar. Já na equipe ou com convite aberto: 409.
- **Equipe**: um campo só ("@fulano, nome ou e-mail") com as fichas e "Convidar"; e-mail completo convida pelo e-mail
  exato. Cada pessoa tem **um menu** ("•••"): papel marcado e "Remover da equipe…" com confirmação numa folha. Página do
  @ em `/pessoas/@fulano` (só para quem entrou; @ antigo redireciona).
- **Para os apps**: claim padrão **`preferred_username`** (o @, escopo `profile`) no `id_token` e no `userinfo`, e o escopo
  de família **`zro.pessoas`** (todo cliente com produto) para `GET /api/v1/pessoas/busca?q=`, `GET /api/v1/pessoas/@{arroba}`
  e `POST /api/v1/pessoas/convites`. `authorize()` com e-mail confirmado (e papel no convite), 60 buscas a cada 10 min por
  pessoa, 30 convites por hora por organização, só token de app (`so_app`), auditoria da busca com o app e o número de
  resultados, **nunca o texto buscado**. Contrato em [pessoas.md](../integration-contracts/pessoas.md).
- **Maestro**: pede `zro.pessoas` no login (HUB antigo: `nivel=sem_pessoas`). Ajustes › Pessoas: a administração busca e
  convida pelo @ (Equipe/Gestão/Leitura → editor/manager/viewer no HUB); cada pessoa mostra o @ e a **Função na
  produtora** (`members.funcao`, descrição separada do papel de acesso; só administração muda). Freelas: "Achar pelo @"
  adiciona o freela ligado ao perfil (`zro_sub` + `zro_arroba`, migração `drizzle/0023`, um por organização); o perfil é
  relido no HUB na hora de adicionar. O inventário do Carro do Freela segue pelo mesmo `zro_sub`, atrás do
  `CARRO_SYNC_ATIVO` (desligado).
- **Carro do Freela**: o @ chega no `/eu` pelo `preferred_username` e aparece em "Meu perfil"; o Carro continua fechado
  (lista do dono), sem página pública nova.

## Consequências

- Perfil visível por padrão é decisão do titular; a LGPD pede transparência e escolha fácil: o aviso único, o
  interruptor sempre à mão, nada de contato no perfil e o convite que a pessoa aceita.
- O @ de quem já tinha conta é uma sugestão: a primeira troca é livre. Apps guardam o `sub` (a ligação de verdade) e o
  @ só como rótulo; `antiga: true` na API avisa que o @ mudou.
- Não há página pública do perfil fora do login (nem indexação): achar alguém exige uma conta Absolute ZRO.
