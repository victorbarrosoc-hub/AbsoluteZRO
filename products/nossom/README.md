# NOSSOM

Estúdio de áudio para criadores, com aplicação web responsiva, instalação pelo navegador e aplicativo Electron para Mac/Windows.

**Produção:** <https://nossom.absolutezro.com> · **Downloads:** <https://nossom.absolutezro.com/apps>

## Continuar no Claude Code

Comece pelo **[handoff completo](docs/handoff/README.md)** e pelo **[prompt pronto para copiar](docs/handoff/PROMPT-CLAUDE-CODE.md)**. O arquivo [CLAUDE.md](CLAUDE.md) na raiz orienta a leitura automática do projeto. Leia também [AGENTS.md](AGENTS.md), especialmente antes de alterar APIs do Next.js.

O handoff registra o estado publicado, as preferências visuais aprovadas, a arquitetura, as configurações, os testes e as pendências reais. Não contém credenciais ou gravações privadas.

## Executar

Requisitos: Node >=22.9 (Node 24 no CI), npm e navegador moderno com Web Audio, WebAssembly, Workers e IndexedDB.

```sh
npm ci
cp .env.example .env.local
# Configure as integrações necessárias fora do Git.
npm run dev
```

Para o build de produção:

```sh
npm run build
npm run start
```

`predev` e `prebuild` preparam FFmpeg/WASM, RNNoise e DeepFilterNet a partir dos pacotes instalados. Os assets gerados ficam fora do Git. Desenvolvimento/build usam Webpack por compatibilidade com os workers. A aplicação exige login; os testes de navegador possuem servidor Supabase simulado, sem precisar de contas da produção.

## Funcionalidades atuais

- Homepage com azul luminoso, prata/cromo, linhas fluidas em movimento, títulos mais fortes e demonstração real A/B, sem autoplay.
- Estúdio com assistente/anexo, projetos, conta, navegação recolhível e ferramentas agrupadas. Trocar de ferramenta mantém projeto, histórico e áudio.
- **Restauração remota de fala:** Resemble Enhance D, em RunPod Serverless; preserva o original e cria resultado mono float32/44,1 kHz.
- **Separação musical:** HTDemucs em `/studio/isolar-voz`, para obter o stem vocal estéreo float32/44,1 kHz. Precisa de worker atualizado; qualidade de uma música real na GPU ainda requer homologação.
- **Processamento local:** limpeza DeepFilterNet3/RNNoise/espectral, reconstrução de clipping identificável, EQ, de-esser, dinâmica, efeitos, mixagem/ducking e finalização.
- Waveform real, seleção por mouse/toque/teclado, A/B com posição preservada, volume de comparação, versões, desfazer/refazer, exportação WAV/MP3 e relatório de medições.
- Importação/gravação de até 100 MiB e 10 minutos, com validação do conteúdo. Originais e versões ficam em IndexedDB por conta/perfil, sem sincronização automática entre aparelhos.
- Contas Supabase, planos mensais, reservas/devoluções atômicas de minutos e painel ADM protegido. O assistente Anthropic recebe texto e medições; não recebe o arquivo de áudio.
- Manifesto/ícones de instalação e Open Graph PNG 1200 × 630. PWA sem promessa de funcionamento offline completo.
- Instaladores públicos **0.2.2** para Mac arm64/Intel e Windows x64. São prévias; atualização da interface online é separada da atualização nativa do binário.

## Planos e infraestrutura

Grátis: 5 min/mês; Essencial: 2 h/R$39; Studio: 6 h/R$99. Assinatura mensal no cartão via Stripe quando configurada; sem ela, ativação manual pelo administrador. Restauração e separação compartilham a franquia, com mínimo de um minuto por job. Edição/acabamento locais não gastam minutos GPU. ADM confirmado não tem limite de franquia NOSSOM; custos dos provedores continuam existindo.

Backend Next.js/Vercel, Supabase Auth/PostgreSQL/Storage privado, Anthropic e RunPod Serverless. Não coloque chaves de servidor no cliente. A integração GitHub–Vercel publica `main`; publicar código web não comprova que o worker GPU foi atualizado. Consulte [operação e variáveis](docs/handoff/OPERATIONS.md).

## Documentação

| Documento                                           | Conteúdo                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| [Handoff](docs/handoff/README.md)                   | Contexto para continuar o projeto, decisões e referências visuais |
| [Arquitetura](docs/architecture.md)                 | Fluxos, dados, mapa de código, contratos e limites                |
| [Operação](docs/handoff/OPERATIONS.md)              | Setup, variáveis, migrações, diagnósticos, deploy e releases      |
| [Validação](docs/validation.md)                     | Evidências verificadas e comandos reproduzíveis                   |
| [Identidade e motion](docs/homepage-performance.md) | Direção aprovada e desempenho da animação atual                   |
| [Motor local](docs/audio-engine.md)                 | DSP, presets, medições e exportação                               |
| [Supabase](docs/supabase-setup.md)                  | Auth, migrações, planos e isolamento                              |
| [Anthropic](docs/claude-setup.md)                   | IA compartilhada, permissões e limites                            |
| [Worker](workers/restoration/README.md)             | Contratos e configuração do processamento remoto                  |
| [Desktop](desktop/README.md)                        | Empacotamento, distribuição e atualização nativa                  |

Arquivos `*-history.md` são registros anteriores, não instruções de configuração atual.

## Verificar

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
# Com Docker:
npm run test:quota
```

Não rode duas suítes/servidores nas mesmas portas. Testes usam contratos simulados e referências públicas/sintéticas; o cenário de áudio privado é opcional. Não confundem render válido, métricas de sinal ou viewport com qualidade perceptual, GPU em produção ou homologação em dispositivos físicos.

## Distribuição e limites

O Mac 0.2.2 tem assinatura ad-hoc de integridade, sem Developer ID/notarização Apple. As prévias não têm canal nativo de atualização automática habilitado. A infraestrutura para uma distribuição assinada existe, mas requer certificados, nova versão e homologação real. As orientações de instalação estão em `/apps`.

Projetos não são backup na nuvem e não são transferidos pelo Git. A cópia temporária de processamento remoto é privada e limpa após salvar o resultado, com limpeza adicional por cron. Nunca apague IndexedDB ou originais como correção genérica de interface.

## Licenças e materiais

Veja [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), as licenças dos workers/modelos e os créditos em `public/demo/README.txt` e `tests/fixtures/README.md`. Os modelos não foram treinados do zero pela NOSSOM. Não se afirma equivalência a Adobe/RX/Resolve, separação perfeita ou recuperação garantida de fala ausente. Referências editoriais de loudness não são certificações de entrega.
