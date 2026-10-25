# Contas Supabase e planos mensais

O login e cadastro usam e-mail/senha no Supabase Auth. Contas já criadas nesse projeto podem entrar diretamente. A aplicação não guarda contas fictícias ou senhas no localStorage. O nome de exibição pode ser fictício; com confirmação de e-mail habilitada, o endereço precisa receber o link.

## Ativação no projeto NOSSOM

1. Projeto: `https://iaavcsyoybnswtfnrvtu.supabase.co`.
2. Em Supabase → Settings → API Keys, copie a chave **publishable** (ou anon legada). Na Vercel → NOSSOM → Settings → Environment Variables, defina `SUPABASE_URL` com essa URL e `SUPABASE_ANON_KEY` com a chave pública. Os aliases `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` também são aceitos. Não use service_role como chave pública.
3. Preserve o segredo privado `NOSSOM_AUTH_SECRET` (32 caracteres aleatórios recomendados). A instalação existente pode continuar usando `NOSSOM_AI_ACCESS_CODE` como fallback privado; esse valor não é mais solicitado na interface. Alterá-lo invalida sessões, sem apagar contas Supabase.
4. Aplique `supabase/migrations/202610220001_accounts_and_weekly_usage.sql` pelo SQL Editor do projeto ou por `supabase db push` com o projeto vinculado. A migração não modifica usuários existentes e não exige chave service_role na aplicação.
5. Supabase → Authentication → URL Configuration: Site URL `https://nossom-teal.vercel.app`; adicione `https://nossom-teal.vercel.app/auth/confirm` à lista de redirects. Mantenha confirmação de e-mail habilitada. Configure SMTP para convites/cadastros públicos além dos limites do serviço de e-mail padrão do Supabase.
6. Entre com `victorbarrosoc@gmail.com` e confirme o endereço no Supabase. Não provisionamos uma senha nem alteramos uma conta existente. A conta ADM será reconhecida automaticamente pelo e-mail confirmado; `user_metadata`, nome, parâmetros de URL e corpo do pedido não concedem esse papel.
7. Faça novo deploy após configurar as variáveis. O diagnóstico público `GET /api/account?verify=1` verifica as credenciais e a presença da função de quota sem criar usuários, enviar e-mails ou gerar chamadas pagas; retorna apenas indicadores de disponibilidade. A chave Anthropic e o agente são da plataforma, configurados uma vez no servidor conforme `docs/claude-setup.md`. Usuários nunca preenchem IDs, API keys ou código de conexão.

## Restauração e planos atuais

Execute `public/setup/cloud-restoration.sql`, que combina `202610230001_cloud_restoration.sql` e `202610230002_plans_and_admin.sql`, após a migração original de contas. Isso cria bucket privado, jobs, planos, minutos mensais, assinaturas manuais e RPCs do painel ADM. Nenhuma chave administrativa deve ser colocada em variável `NEXT_PUBLIC_`.

Grátis: 300 segundos/mês; Essencial: 7200 por R$ 39; Studio: 21600 por R$ 99. A reserva cobra a duração do arquivo (arredondada para cima) com mínimo de 60 segundos por restauração. A duração vem do job autorizado, não de um valor escolhido na RPC pelo navegador. O worker também verifica o arquivo. Falha/cancelamento confirmado devolve a reserva. Somente restauração remota gasta minutos; edição e acabamento locais não gastam. A franquia renova dia 1 à 0h em America/Fortaleza. ADM confirmado é ilimitado, mas seu uso continua registrado.

A migração antiga semanal permanece como histórico; a aplicação atual consulta `nossom_plan_usage`. `/studio/admin` permite administrar planos, franquias, vencimentos e bloqueios; acesso é validado também no SQL. Não há cobrança de cartão automática.

Para ativar a GPU, siga `workers/restoration/README.md`: imagem Docker, endpoint Serverless com mínimo zero, RUNPOD_ENDPOINT_ID e CRON_SECRET na Vercel, além das chaves já configuradas. A aplicação mostra conexão pendente enquanto a configuração/migração não estiver pronta.

## Sessões e arquivos

Tokens Supabase ficam criptografados por AES-256-GCM em cookie HttpOnly/SameSite=Lax/Secure em produção. O proxy renova tokens e propaga a sessão atualizada para a mesma renderização. As APIs verificam a identidade no Auth; não confiam apenas em campos enviados pelo navegador. Logout solicita revogação da sessão de refresh e apaga o cookie local.

Contas e contadores estão na nuvem. Projetos e versões continuam no navegador; a restauração usa cópias temporárias privadas na nuvem. Os dados locais são separados por ID da conta: login em outro aparelho não transfere arquivos. A primeira conta que entrar neste navegador herda o workspace local anterior, sem apagar arquivos. Isso separa espaços na interface, sem criptografar blobs contra acesso físico/DevTools no mesmo perfil do navegador.

## Testes

`npm test` verifica identidade, confirmação/admin, criptografia, renovação, isolamento de conversas e API de autorização com HTTP simulado. `npm run build` seguido de `npm run test:e2e` inicia automaticamente um servidor Supabase simulado apenas local e o build de produção; os fluxos não criam usuários no projeto real ou chamadas Anthropic pagas.

A migração também pode ser validada em PostgreSQL 17 isolado com `npm run test:quota`. Esse comando precisa de Docker e testa 18 conexões concorrentes, renovação semanal, exceção ADM, usuário não confirmado e permissões reais. Uma execução local bem-sucedida não aplica a migração no Supabase de produção.
