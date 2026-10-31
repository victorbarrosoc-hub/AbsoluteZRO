# Google: kit de verificação (sem segredos)

Meta: sair do "app não verificado" e do limite de 100 usuários sem pagar a avaliação CASA (que só vale para escopos restritos). Fonte: relatório de 30/10/2026 (`lojas-e-google.md`, Parte 3). Escopos do HUB hoje: Entrar com Google = `openid email profile`; Conexões (Agenda) = `calendar.events` e `calendar.calendarlist.readonly`. Drive: ver [google-drive-sobedesce-teste.md](google-drive-sobedesce-teste.md).

## 1. Marca (Google Auth Platform > Branding)

1. Tipo de usuário Externo, em Produção (publique dentro de 7 dias após a verificação de marca).
2. Nome do app: Absolute ZRO. Logo 120x120 (PNG, do manual de marca). E-mail de suporte e de contato do desenvolvedor.
3. Página inicial: `https://absolutezro.com`. Política de privacidade: `https://absolutezro.com/privacidade`. Termos: `https://absolutezro.com/termos`. Os dois links também estão no rodapé da home.
4. Domínios autorizados: `absolutezro.com`.
5. Search Console: verifique `absolutezro.com` (registro TXT no DNS) com a mesma conta dona do projeto no Cloud.
6. Escopos (Data Access): deixe só `openid`, `email`, `profile`, `calendar.events`, `calendar.calendarlist.readonly` (e `drive.file` se algum app usar). Remova qualquer escopo `drive` amplo do Console.
7. Envie para verificação. Marca: automática em minutos ou revisão manual de 2 a 3 dias úteis.

## 2. Páginas no site

`/privacidade` e `/termos` já existem no HUB (esta entrega), com a declaração de Limited Use em inglês exigida pela Política de Dados de Usuário dos Serviços de API do Google. Conferir antes de enviar: abrem sem login, estão no mesmo domínio da home, descrevem fielmente Agenda e Drive.

## 3. Justificativa por escopo (colar no Verification Center, em inglês)

- `openid email profile` (não sensíveis): "Used for Sign in with Google. We read the user's name, email and profile picture only to create and identify their Absolute ZRO account and avoid duplicate accounts. No other Google data is requested at sign-in."
- `https://www.googleapis.com/auth/calendar.events` (sensível): "Absolute ZRO's Maestro tool schedules creative production work. With the user's explicit opt-in under Settings > Connections, we read events to find busy time slots and create, update and delete only the events the user asks Maestro to schedule. A narrower scope is not enough because we must both read existing events (to avoid conflicts) and write events. Calendar data is used only for these user-facing features, tokens are stored encrypted, not sold, not used for ads, and the user can disconnect at any time."
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (provável sensível): "We list the user's calendars so they can choose which ones count as busy when proposing times. We never modify the calendar list. calendar.events alone cannot enumerate the user's calendars."
- `https://www.googleapis.com/auth/drive.file` (não sensível, só se usado): "Files are selected by the user with the Google Picker. The app only accesses files the user chose or that the app created, to open a selected video for review or to upload exported results."

Dica: se o HUB só precisar dos eventos que ele mesmo cria, avalie `calendar.events.owned` (classificação a confirmar no Console) para reduzir o pedido.

## 4. Vídeo de demonstração (YouTube NÃO LISTADO, narração ou legenda em inglês, ~4 min)

| Tempo | Cena                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00  | Título: "Absolute ZRO OAuth verification demo". Mostre `absolutezro.com` e o link Privacy Policy no rodapé.                                                        |
| 0:20  | Clique em Sign in with Google. Mostre a barra de endereço com `accounts.google.com/...client_id=` legível (dê zoom).                                               |
| 0:40  | Tela de consentimento com o nome do app e os escopos. Aceite. Mostre o HUB logado com nome e foto.                                                                 |
| 1:10  | Settings > Connections > Google Calendar: clique em Connect. Novamente a tela de consentimento com o client ID visível e os dois escopos de Agenda. Aceite.        |
| 1:50  | `calendar.calendarlist.readonly`: mostre a lista de agendas e a escolha de quais contam como ocupadas.                                                             |
| 2:30  | `calendar.events`: mostre horários ocupados lidos, depois peça ao Maestro para marcar um evento; abra o Google Calendar e mostre o evento criado; altere e apague. |
| 3:20  | (Se usado) `drive.file`: abra o Picker, escolha um arquivo, mostre o app abrindo só esse arquivo.                                                                  |
| 3:40  | Disconnect em Connections e mostre o acesso removido (e em myaccount.google.com/permissions).                                                                      |
| 3:55  | Mostre `/privacidade` na seção Limited Use. Fim.                                                                                                                   |

Grave com uma conta de teste, sem dados pessoais reais na tela.

## 5. Prazos

- Marca: minutos a 3 dias úteis.
- Escopos sensíveis (Agenda): cerca de 10 dias úteis pela estimativa do Google; relatos falam em semanas. Responda e-mails do Google em poucos dias.
- Sem escopo restrito, não há CASA. Com `drive`/`drive.readonly` seriam cerca de 6 semanas mais o custo anual da avaliação.
- Enquanto a verificação não termina: o limite de 100 usuários e o aviso valem só para Agenda; Entrar com Google (escopos básicos) não tem cap nem aviso.

## 6. O que fazer, em ordem

1. Rodar o teste do SOBEDESCE (10 min) e decidir.
2. Cloud de produção: marca, domínio, páginas, escopos enxutos (seções 1 e 2).
3. Gravar o vídeo e enviar o pedido com as justificativas (seções 3 e 4).
4. Publicar o app em Produção.
