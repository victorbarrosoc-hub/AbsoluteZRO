# Handoff NOSSOM para Claude Code

Snapshot preparado em **24/10/2026 UTC**, após a publicação de `500bb6478258632195a13b6ec36f7c87b5d85f49`. Os commits posteriores deste handoff acrescentam documentação; confirme sempre o HEAD atual.

- Repositório público: <https://github.com/victorbarrosoc-hub/nossom>
- Branch de produção: `main`.
- Site: <https://nossom-teal.vercel.app>
- Downloads: <https://nossom-teal.vercel.app/apps>
- Open Graph: <https://nossom-teal.vercel.app/opengraph-image>
- Identificador público de deploy: <https://nossom-teal.vercel.app/api/desktop/version>
- Prompt pronto para copiar: [PROMPT-CLAUDE-CODE.md](PROMPT-CLAUDE-CODE.md).

## O que está sendo transferido

NOSSOM é um estúdio de áudio com site público, aplicação web responsiva/PWA e wrapper Electron para Mac/Windows. O backend usa Supabase para contas/cotas e RunPod Serverless para restauração de fala e separação de vocais. EQ, efeitos, finalização e várias ferramentas de limpeza rodam no dispositivo. O assistente de texto usa a integração Anthropic da plataforma.

**Claude Code é o novo ambiente de desenvolvimento. Não é o agente Anthropic que atende os usuários dentro do produto.** Entrar no Claude Code não transfere automaticamente credenciais, arquivos locais, sessões ou infraestrutura da produção.

## Leia nesta ordem

| Documento                                                                                                                                            | Para quê                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [CLAUDE.md](../../CLAUDE.md) e [AGENTS.md](../../AGENTS.md)                                                                                          | Instruções para o agente e particularidades do framework        |
| [Arquitetura atual](../architecture.md)                                                                                                              | Fluxos, limites, rotas e arquivos de implementação              |
| [Operação e infraestrutura](OPERATIONS.md)                                                                                                           | Instalação, variáveis, migrações, RunPod, deploy e releases     |
| [Validação atual](../validation.md)                                                                                                                  | O que foi efetivamente testado e o que ainda não foi homologado |
| [Motion e identidade](../homepage-performance.md)                                                                                                    | Direção aprovada e implementação da animação                    |
| [Motor local](../audio-engine.md)                                                                                                                    | DSP, medições e presets; não confundir com o worker remoto      |
| [Supabase](../supabase-setup.md), [Anthropic](../claude-setup.md), [worker](../../workers/restoration/README.md), [desktop](../../desktop/README.md) | Detalhes específicos quando a tarefa exigir                     |

## Estado funcional e limites importantes

- A identidade mais recente já está publicada: azul mais presente e iluminado, cromo/prata, linhas que realmente ondulam, superfícies discretas e títulos mais fortes.
- O movimento combina um núcleo cromado com linhas em canvas, além dos feixes do fundo. O titular pediu **os dois**, não substituir todo o cromo por linhas nem deixar apenas uma imagem estática flutuando.
- O Open Graph está ativo, em PNG 1200 × 630. O novo ícone está no manifesto, nos ícones Apple/favicon e nos instaladores **0.2.2**.
- Mac Apple Silicon, Mac Intel e Windows x64 estão publicados como prévia `desktop-v0.2.2`. O Mac tem assinatura ad-hoc de integridade, sem Developer ID/notarização. O titular informou que ainda não tem conta Apple Developer paga.
- Atualizações da interface online chegam ao aplicativo instalado. Atualizações automáticas **do binário** continuam desabilitadas nas prévias; a lógica para um canal assinado existe, mas não foi homologada entre dois instaladores assinados.
- `auto` restaura fala com Resemble Enhance D; `vocals` separa o stem vocal musical com HTDemucs. São operações diferentes. Não simular separação com EQ/denoise.
- A separação musical foi implementada e validada por contratos, download estéreo e inferência sintética com pesos reais em CPU no build da imagem. **A qualidade de músicas reais na GPU e a imagem atualmente selecionada no endpoint precisam de confirmação operacional.**
- O saldo RunPod pode ser consultado pelo ADM quando a chave permite faturamento. O saldo Claude não é retornado pela integração atual; o painel informa essa limitação.
- Projetos e áudio permanecem no perfil local do navegador/app. A conta e a franquia são compartilhadas; os arquivos não são sincronizados automaticamente entre dispositivos.
- Configurações e segredos de Vercel/Supabase/RunPod não são transportados pelo Git. Este handoff não contém suas credenciais.

## Preferências já aprovadas pelo titular

1. Interface bonita, cinematográfica e organizada, com azul luminoso e prata/cromo. Evitar voltar ao preto/cinza apagado ou a arco-íris/neon excessivo.
2. Manter o símbolo original da marca, uma fita com uma crista e um vale; não trocar por infinito ou outra onda genérica. O SVG canônico está no código.
3. Linhas visivelmente fluidas em repouso e mais intensas durante processamento. Movimento leve para não voltar à sensação de lentidão.
4. Títulos e ações em bold quando ajudarem a hierarquia; textos de apoio mais leves. Remover excesso de parágrafos, sobrelinhas pequenas e espaços vazios enormes, sobretudo no mobile.
5. Ações claras: limpar fala, isolar cantor, nivelar volumes e preparar para publicar. Usuário leigo não deve ter que entender GPU, parâmetros do modelo ou infraestrutura.
6. Navegação lateral recolhível no desktop e drawer no mobile. Troca de ferramenta preserva áudio, projeto e histórico e responde localmente.
7. O titular prefere trabalho concreto a confirmações repetidas. Respeite a autorização corrente e não anuncie como concluído algo que não foi publicado/verificado.

## Referências visuais

- [Direção visual aprovada](assets/approved-direction.webp): proposta estática, referência de atmosfera e composição, não captura do software.
- [Homepage real no desktop](assets/production-desktop.webp) e [no mobile](assets/production-mobile.webp): capturas públicas sem conta pessoal; congelam um frame de uma animação contínua.
- Fonte real da identidade: `components/brand.tsx`, `public/icon.svg`, `public/pwa/`, `app/styles/cinematic.css`, `components/cinematic-ribbon.tsx` e `components/signal-field.tsx`.

## O que não está no Git

Credenciais de serviços, arquivos `.env.local`, configuração `.vercel`, certificados, cookies, sessões, perfis IndexedDB do usuário, artefatos de teste e gravações privadas não são transferidos por este repositório. As capturas originais da conversa também não constituem um pacote de anexos no Git; as referências públicas necessárias foram selecionadas em `assets/`.

Se uma próxima tarefa depender de um áudio privado, disponibilize-o localmente ao agente por um canal apropriado, fora do repositório público. O contexto técnico está resumido aqui; não há importação automática da conversa inteira nem do estado dos serviços.

## Primeira tarefa recomendada ao novo agente

Leia os documentos e confira o código/HEAD. Apresente ao titular um resumo curto do que está ativo, dos limites conhecidos e de como executar o projeto. Depois continue a solicitação que ele indicar. Não reabra decisões visuais já aprovadas nem reprovisione infraestrutura sem necessidade.
