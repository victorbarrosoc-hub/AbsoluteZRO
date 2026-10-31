# SOBEDESCE: teste de `drive.file` + Picker (10 minutos)

Objetivo: descobrir se o escopo restrito `https://www.googleapis.com/auth/drive` pode ser trocado pelo não sensível `drive.file` + Google Picker no SOBEDESCE, evitando o escopo restrito (e a avaliação CASA anual). Hoje o SOBEDESCE pede `drive` inteiro (`products/sobedesce/src/config.js` e `products/sobedesce/web/src/lib/google/config.ts`). **Nenhum código foi mudado.**

## Teste automático: absolutezro.com/admin/teste-drive

Só o papel admin da plataforma (para os outros, 404); fora do menu e `noindex`. A tela pede só `drive.file` (Google
Identity Services, sem somar escopos antigos), abre o Picker para escolher a pasta (`DocsView` com pastas selecionáveis)
e roda sozinha, com a API REST v3 do Drive no navegador: (1) ler a pasta, (2) listar o que já existe nela, (3) baixar o
começo de um arquivo que já existia, (4) listar uma subpasta que já existia, (5) enviar `teste-absolutezro.txt`, (6) criar
`teste-absolutezro/` com um arquivo dentro, (7) ler de volta o que criou. O botão "Escolher arquivos" (multisseleção)
faz a (8): metadados e primeiros bytes (`Range`) de cada arquivo escolhido. Cada checagem mostra Passou/Falhou, o HTTP e
uma linha; o veredito aplica a tabela de decisão abaixo e mostra cada fluxo do SOBEDESCE como funciona/quebra. Falha de
configuração (API desligada, token, rede) ou token com escopo amplo dão "inconclusivo", nunca um veredito. "Limpar o que
o teste criou" apaga só os ids criados; "Copiar resultado" leva o texto (sem token nem ids); "Terminar e revogar" revoga o
token (sair da página também revoga). Os scripts e as origens do Google só valem nesta rota (CSP própria em
`apps/hub-web/lib/teste-drive/config.ts`).

Configurar uma vez (valores públicos, nenhum segredo; nunca colar no repositório):

1. Google Cloud Console (o projeto do cliente OAuth usado): ativar **Google Drive API** e **Google Picker API**.
2. Credenciais: chave de API com restrição de referenciador HTTP `https://absolutezro.com/*` e restrita à Google Picker API.
3. Cliente OAuth "Aplicativo da Web": `https://absolutezro.com` em Origens JavaScript autorizadas.
4. Data Access: só `drive.file` do Drive (nenhum escopo amplo). App em Teste: seu e-mail como usuário de teste.
5. Vercel, projeto `absolutezro` (Production): `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (sem ela, a tela usa o `GOOGLE_CLIENT_ID` do
   Entrar com Google), `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` e `NEXT_PUBLIC_GOOGLE_APP_ID` (número do projeto no Cloud).
   Redeploy. Chave, cliente e número precisam ser do mesmo projeto.

Antes de rodar: uma pasta criada pelo site do Drive (fora do app) com um `.txt`, um vídeo e `sub1/b.txt`. Opcional:
informe quantos itens ela tem no primeiro nível. Se o token já tiver `drive` deste cliente, remova o acesso em
myaccount.google.com/permissions e repita. Fora de produção, `/admin/teste-drive?exemplo=1` mostra um resultado fictício.

O roteiro manual abaixo continua valendo como conferência.

## O que o código de hoje exige do Drive

| Fluxo do SOBEDESCE                                                                                  | Capacidade necessária                                                    |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Navegar pastas existentes (aba Drive, `drive-picker.js`, "Escolher no Drive" do Maestro e do Relay) | Listar filhos de pastas que o app não criou                              |
| Backup (Drive para disco) e Comparar (disco x Drive)                                                | Listar filhos recursivamente e ler (baixar) arquivos que o app não criou |
| "Para o Drive" (enviar)                                                                             | Criar arquivo e criar subpasta dentro de pasta escolhida                 |
| Maestro/Relay "Escolher no Drive" e player (stream com Range)                                       | Ler arquivo escolhido pelo usuário                                       |

## Preparo (2 min)

1. No Drive de teste, crie `ZRO-TESTE/` com `sub1/`, um arquivo `a.txt` na raiz da pasta e `sub1/b.txt`. Suba também um vídeo de uns 50 MB em `ZRO-TESTE/`.
2. No Google Cloud, num projeto de TESTE (nunca o de produção): tela de consentimento Externa em Teste, seu e-mail como usuário de teste, só o escopo `drive.file`. Crie um cliente OAuth "Aplicativo da Web" e anote o client ID. Crie também uma chave de API com restrição de HTTP referrer para o Picker. Não cole esses valores no repositório.
3. Abra o [OAuth Playground](https://developers.google.com/oauthplayground) com o seu client ID (engrenagem, "Use your own OAuth credentials") e autorize só `drive.file`. Para o Picker use qualquer página de exemplo do Google (guia "Picker" em developers.google.com/workspace/drive/picker) com o mesmo client ID e a chave de API.

## Os 5 passos (anote PASSA/FALHA)

1. **Escolher a pasta no Picker.** Selecione `ZRO-TESTE` (visão de pastas). A pasta volta com id e nome? `[ ]`
2. **Listar filhos.** `GET /drive/v3/files?q='<id-da-pasta>' in parents` e `fields=files(id,name,mimeType),nextPageToken`. Pergunta: aparecem `a.txt`, `sub1` e o vídeo? Confira também `capabilities.canListChildren` em `files.get` da pasta. `[ ]`
3. **Ler um filho que já existia.** `GET /drive/v3/files/<id de a.txt>?alt=media` (e o vídeo com `Range: bytes=0-1023`). Baixou? `[ ]`
4. **Escrever na pasta escolhida.** (a) `POST` de um arquivo novo com `parents=[<id da pasta>]`; (b) `POST` de uma subpasta (`mimeType=application/vnd.google-apps.folder`) com o mesmo parent; (c) listar de novo e subir um arquivo dentro da subpasta nova. Os três funcionam? `[ ]`
5. **Ler arquivo irmão que o app NÃO criou.** Suba `c.txt` pelo site do Drive em `ZRO-TESTE/`, sem passar pelo app, e tente listar e baixar. E tente também `sub1/b.txt` (neto). Resultado? `[ ]`

Se o passo 2 vier vazio, repita escolhendo a pasta E marcando `a.txt` junto (multisseleção) para ver o que muda.

## Decisão

| Resultado                                                                | O que fazer                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 a 5 passam (filhos e netos legíveis, inclusive os criados fora do app) | Migrar o SOBEDESCE para `drive.file` + Picker. Remove o escopo restrito; sem CASA.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1, 3 (só do que foi escolhido) e 4 passam; 2 e 5 falham                  | Fluxos que **funcionam**: "Para o Drive" (enviar para pasta escolhida), "Escolher no Drive" para arquivo (Maestro, Relay, player). Fluxos que **quebram**: navegar pastas, Backup do Drive, Comparar com o Drive. Opções: (a) UX de multisseleção no Picker (o usuário marca os arquivos; sem pasta recursiva) para esses fluxos; (b) manter `drive` ou `drive.readonly` e aceitar a CASA anual (orçar centenas a poucos milhares de dólares/ano segundo laboratórios; preço atual NC). |
| 1 ou 4 falham                                                            | Não migrar. Só a opção (b) serve; reveja o produto antes.                                                                                                                                                                                                                                                                                                                                                                                                                               |

Resultados parciais por fluxo: navegar/Backup/Comparar dependem dos passos 2, 3 e 5; "Para o Drive" depende do passo 4; "Escolher no Drive" depende dos passos 1 e 3.

Observação importante do Google: o Picker em apps desktop/mobile só aceita `drive.file` e não pode ser combinado com outro escopo; na web aceita `drive.file` ou `drive.readonly`.

## Se for migrar o app desktop

O código do app desktop do SOBEDESCE (`products/sobedesce/src/**`, `products/sobedesce/desktop/**`) está em caminho que dispara o workflow de release de desktop. Qualquer mudança ali precisa do aval do titular e só sai junto com uma versão do desktop. O web (`products/sobedesce/web`) pode migrar à parte. Usuários já conectados precisarão reautorizar (escopo novo). Tire o escopo amplo do Console, ou a verificação continua sendo de escopo restrito.
