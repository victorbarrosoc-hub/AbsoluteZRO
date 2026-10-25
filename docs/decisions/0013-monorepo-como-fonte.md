# 0013 — O repositório AbsoluteZRO vira a fonte de todas as plataformas

**Contexto.** Até 25/10/2026, `products/<app>/source` era só uma cópia de leitura (ADR 0004). Cada plataforma tinha
repositório, banco e projeto Vercel próprios. O titular pediu para controlar tudo num lugar só: mesmo repositório, mesmo
Supabase e mesma conta Vercel. Escolhas dele (25/10/2026): um projeto Vercel por app lendo deste repositório; dados
migrados com backup e conferência; repositórios antigos arquivados depois da virada. Substitui o ADR 0004.

**Decisão.**

- **Código.** Cada plataforma mora em `products/<app>/` e é a fonte oficial. `ORIGEM.md` registra de onde e de qual
  commit ela veio; o histórico anterior fica no repositório antigo, arquivado (só leitura). Os apps não entram nos
  workspaces npm da raiz: cada um mantém o próprio `package.json`, lockfile, testes e regras (`CLAUDE.md`/`AGENTS.md`
  da pasta valem dentro dela).
- **Vercel.** Os projetos existentes (`sobedesce`, `nossom`, `synquei`, `tpeasy`, `carrodofreela-app`) continuam os
  mesmos, com domínios e variáveis intactos, e passam a ler este repositório com o _Root Directory_ da pasta do app.
  Cada um só publica quando a própria pasta muda (_Ignored Build Step_).
- **Banco.** Um projeto Supabase (`AbsoluteZRO`). Cada app tem um schema e um papel de banco próprios
  (`sobedesce`, `nossom`, `carro_do_freela`), sem acesso aos schemas dos outros nem ao `zro`. O HUB continua em `zro`.
  Migração: cópia tabela a tabela, contagem e checksum por tabela nos dois lados; o banco antigo fica intacto como
  reserva até o titular mandar desligar.
- **Login.** Continua pelo HUB (ADR 0012): os apps estão em domínios diferentes, então cookie não atravessa; o
  "Entrar com Absolute ZRO" é o que dá a conta única.
- **CI.** Workflows na raiz, um por app, disparados só por mudanças na pasta dele. Releases de desktop usam tag com
  prefixo do app (`synquei-v1.2.3`); releases antigas seguem baixáveis nos repositórios arquivados.

**Ordem da virada, app por app.** 1) PR de login mesclado no repositório antigo; 2) importação para `products/<app>`; 3) Vercel religado a este repositório e deploy conferido; 4) dados migrados e conferidos (onde houver banco); 5) repositório antigo arquivado.

**Como reverter.** Religar o projeto Vercel ao repositório antigo (desarquivar) e apontar a variável do banco de volta
para o banco antigo, que não é apagado.
