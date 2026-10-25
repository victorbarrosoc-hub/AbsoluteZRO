# NOSSOM para Mac e Windows

Estado em 24/10/2026: prévia pública **0.2.2**, release [`desktop-v0.2.2`](https://github.com/victorbarrosoc-hub/nossom/releases/tag/desktop-v0.2.2). Leia também [operação](../docs/handoff/OPERATIONS.md).

## Como funciona

Electron com sandbox, isolamento de contexto e sem Node no renderer. A janela carrega o domínio NOSSOM; a conta, IA e franquia são as mesmas do site. Os arquivos IndexedDB ficam no perfil próprio do aplicativo, não são copiados automaticamente do Safari/Chrome e não há servidor de áudio embutido/offline completo.

O app limita navegação interna à origem autorizada, abre HTTPS externo no navegador e restringe permissões/IPC. Não exponha chaves de servidor ou acesso arbitrário ao sistema de arquivos no renderer.

## Distribuição atual

Existem três arquivos públicos verificados sem login, disponíveis em `/apps`:

- `NOSSOM-0.2.2-mac-arm64.dmg`.
- `NOSSOM-0.2.2-mac-x64.dmg`.
- `NOSSOM-0.2.2-win-x64.exe`.

A prévia Mac tem assinatura **ad-hoc de integridade**, não Developer ID nem notarização Apple. O titular ainda não possui Apple Developer pago. A prévia não deve ser descrita como distribuição Apple/Microsoft assinada e homologada. O empacotamento foi validado em runners, não em todas as máquinas físicas.

A 0.1.0 tinha assinatura inválida/ausente e foi substituída; não oriente reinstalar essa versão. Não sobrescreva assets antigos de releases. As instruções de Gatekeeper/quarentena limitadas ao app de origem confiável estão em `/apps`; não desative proteções globais do macOS.

Os ícones vêm de `../public/pwa/icon-512.png`, gerados pelo script da marca. Atualizar a interface online não troca o ícone nativo de um binário já instalado.

## Gerar uma prévia

No GitHub, execute **Build NOSSOM installers** (`.github/workflows/desktop.yml`) com `platform=all`, `publish_preview=true`, `publish_signed=false`. O workflow usa macOS e Windows para empacotar as arquiteturas corretas, verificar os bundles e publicar assets de teste.

Antes de uma nova distribuição, incremente `desktop/package.json` e `desktop/package-lock.json`. O nome da release/arquivos deve seguir a versão efetivamente construída. Aguarde os três arquivos publicados e verifique os links HTTPS antes de alterar `/apps`.

Localmente, dentro de `desktop/`, em cada sistema compatível:

```sh
npm ci
npm run dist -- --mac --arm64
# No Mac Intel: npm run dist -- --mac --x64
# No Windows: npm run dist -- --win --x64
```

Saída em `desktop/dist/`, fora do Git. Os overrides de URLs em `/apps` são `NOSSOM_DOWNLOAD_MAC_ARM64_URL`, `NOSSOM_DOWNLOAD_MAC_X64_URL` e `NOSSOM_DOWNLOAD_WINDOWS_URL`; são lidos no build da aplicação web. Assets de Actions podem exigir login; os assets da release pública devem funcionar anonimamente.

## Dois tipos diferentes de atualização

**Interface online:** `components/desktop-updates.tsx` consulta `/api/desktop/version` ao abrir, retomar o foco e periodicamente. Uma mudança de SHA é carregada apenas depois do trabalho terminar, 30 segundos sem interação, campos sem foco e diálogos fechados. Não deve interromper gravação/tratamento. Isso não instala outro Electron.

**Binário nativo:** `desktop/updates.cjs`, `preload.cjs`, `main.cjs` e o renderer implementam consulta, download e instalação coordenados. O canal nativo permanece **desabilitado nas prévias atuais**. Não habilitar um feed sem os requisitos de assinatura. Testes usam doubles; não ocorreu uma atualização real entre dois instaladores assinados.

A numeração `0.1.0` no `package.json` da raiz não é a versão do instalador. A versão do desktop fica no seu próprio package; o deploy web é identificado por Git SHA.

## Publicação assinada futura

Use uma nova versão superior à prévia, por exemplo após planejamento de release; não reutilize silenciosamente `0.2.2`. O usuário precisará instalar a primeira distribuição assinada uma vez para migrar de uma prévia sem canal.

No GitHub Actions, os segredos necessários são:

- Mac: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
- Variável `NOSSOM_WINDOWS_PUBLISHER` correspondente ao titular do certificado.

Não enviar certificados, senhas ou chaves pelo Git/chat. Configure nos gerenciadores de segredos, com autorização do titular.

Execute `platform=all`, `publish_signed=true`, `publish_preview=false`. O workflow exige todas as plataformas, verifica assinatura/notarização no Mac e Authenticode no Windows. Publica feeds `latest-mac.yml` e `latest.yml`, hashes e arquivos reais numa release estável versionada, sem habilitar Latest antes do upload completo.

O feed padrão assinado usa `https://github.com/victorbarrosoc-hub/AbsoluteZRO/releases/download/nossom-atualizacoes/` (release fixa do NOSSOM no monorepo; as versões ficam em `nossom-v<versão>`). Builds próprios podem configurar `NOSSOM_UPDATE_BASE_URL` e `NOSSOM_UPDATE_FLAT_FEED`, mantendo verificação, ausência de downgrade e rejeição de prerelease. Não contornar essas garantias para evitar a exigência de certificados.
