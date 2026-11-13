# Decupagem: o que o mercado faz e o que fazemos melhor

O que cada plataforma de decupagem (culling) detecta, como apresenta, quanto custa e do que os usuários reclamam; o
fluxo ideal; os sinais e a nota explicável; os atalhos a respeitar; e as 12 melhorias. Pesquisa de 13/11/2026.

## Método e limites

- **Verificado** = a página foi lida em 13/11/2026 (URL ao lado). **Trecho de busca** = só o resumo do buscador, não a
  página. **(de memória)** = não verificado.
- **Não abriram:** helpx.adobe.com (403), g2.com (403), o review da Digital Camera World sobre o Aftershoot (veio
  truncado), reddit.com (bloqueado ao buscador). Não há opinião de Reddit aqui.
- **Viés das fontes:** boa parte dos comparativos é de concorrente (FilterPixel, Excire, Imagen falando dos outros).
  Está marcado como "(concorrente)".
- **Preços** mudam com promoção (Black Friday em curso em nov/2026). Os valores são os lidos entre 5 e 13/11/2026.

A parte técnica (algoritmos, limiares e modelos testados) está em [visao-no-aparelho.md](visao-no-aparelho.md).

## 1. Plataformas

### 1.1 Aftershoot (Select / Edit / Retouch)

**Detecta (verificado)**

- Duplicatas, olhos fechados, piscadas, desfoque e exposição estourada. Diz pontuar cada imagem em "30+ fatores".
  https://aftershoot.com/culling/
- Rostos-chave (Key Faces), nota por imagem (Image Score) e filtro por pessoa com nome. Mesma fonte.
- Gêneros mudam o comportamento. https://support.aftershoot.com/en/articles/10570203-aftershoot-culling-genres
  - Casamento: rostos-chave, olhos e emoção. A própria doc manda revisar beijos à mão.
  - Retrato: agrupa duplicatas por pose.
  - Esportes: olha nitidez do corpo, não do rosto. Olhos fechados vem desligado ("capacetes").
  - Boudoir e recém-nascido: a doc manda **desligar** o detector de olhos fechados.
  - Escolar: avisa pose estranha; QR code separa os alunos.

**Apresenta (verificado)**

- Dois modos: Automático (a IA escolhe, você revisa) e Assistido (agrupa e pontua, você decide).
  https://support.aftershoot.com/en/articles/9190187-the-difference-between-ai-assisted-culling-ai-automated-culling
- Grupos de filtro, cada um com liga/desliga: Selected, Highlights, Duplicates (slider Few↔More), Blurry (slider de
  sensibilidade), Closed Eyes (liga/desliga), Maybes.
  https://support.aftershoot.com/en/articles/6508163-setting-your-culling-preferences-in-aftershoot
- "Cull to Target": slider de 10% a 60% ou número exato. Nesse modo não há Highlights e a detecção de duplicatas não
  pode ser desligada. Mudar ajuste exige "Restart" (recalcula).
  https://support.aftershoot.com/en/articles/11533911-cull-to-target-with-aftershoot
- Revisão linear em dois blocos: "Accepted" (Selected, Highlights, Warnings) e "Needs Review" (Duplicates, Blurred,
  Closed Eyes, Unrated), mais filtros Singles/Grouped.
  https://support.aftershoot.com/en/articles/11533864-faq-flags-linear-culling-what-changed
- Grade com duplicatas empilhadas, Loupe com tira de duplicatas, Survey com até 16 lado a lado, modo "Spray Can", painel
  de Key Faces com slider de tamanho.
- Garante ao menos uma imagem por grupo de duplicatas, "embora possa não ser a mais forte".
  https://aftershoot.com/culling/
- Mapeamento padrão de estrelas e cores: a doc oficial não lista. Um blog de terceiro cita Selected = amarelo sem
  estrela e Sneak Peeks = amarelo com 5 estrelas (trecho de busca, possivelmente antigo). É editável em Preferences →
  Stars & Colors.

**Atalhos (verificado)** https://support.aftershoot.com/en/articles/5227867-keyboard-shortcuts-in-aftershoot

- `1–5` estrelas; `6` vermelho, `7` amarelo, `8` verde, `9` azul, `-` roxo; `0` ou `=` limpa.
- `P` flag/desflag; `A` marca como Selected; `X` **limpa** estrela e cor (não é rejeitar).
- `Z` rejeita o conjunto inteiro de duplicatas; `S` troca a escolhida do grupo; `,` e `.` navegam dentro do grupo.
- `Enter`/`E` Loupe; `G` grade; `N` Survey; `Espaço` zoom; `Alt+←/→` rosto anterior/próximo; `I` mostra a nota; `/`
  esconde o painel; `Cmd/Ctrl+Z` desfaz.
- Há presets de teclado "Lightroom" e "Photo Mechanic".

**Integração**

- Exporta para Lightroom Classic e Capture One mantendo estrelas, cores e flags; para RAW grava em XMP ao lado.
  https://aftershoot.com/culling/
- Problema conhecido: Lightroom e Capture One esperam o nome da cor no idioma local, e o Aftershoot não traduz (trecho
  de busca da doc de suporte).

**Velocidade**

- Oficial: "4.000 fotos para as 500 finais em minutos"; 20–30 min por ensaio contra 3–5 h à mão; 90%+ de acerto com o
  gosto do usuário no 3º ou 4º ensaio. Roda local e offline.
- Testes de terceiros: cerca de 17 min para 1.000 fotos de casamento (Excire, concorrente:
  https://excire.com/en/best-culling-software/); 18 min 19 s para 1.232 fotos de show (FilterPixel, concorrente:
  https://filterpixel.com/filterpixel-vs-aftershoot); 11 min 50 s na Digital Camera World (trecho de busca, sem tamanho
  do lote).

**Preço** (PricingSaaS, 09/11/2026: https://pricingsaas.com/companies/aftershoot)

- Select US$ 10/mês no anual ou US$ 15 mensal; Retouch 20/25; Edit 30/35; Complete 45/55; pacote de perfis de IA +US$
  10/mês.
- Sem plano grátis; teste de 30 dias. Black Friday: 25% no anual.
- Os planos Pro/Max foram extintos em meados de 2026.

**Reclamações**

- O único falso positivo no teste da Shotkit foi olho fechado de propósito (pose); a reviewer estimou 98% de
  concordância em 156 RAW. Também falta "editar só as selecionadas" e "funciona melhor com pessoas".
  https://shotkit.com/aftershoot-review/
- Excire (concorrente): agrupamento sensível demais, olho fechado agressivo, Highlights inconsistentes.
- FilterPixel (concorrente, depoimentos sem verificação): "só me deu estrelas, sem explicação"; "escolheu as nítidas e
  perdeu todo quadro emocional"; depende do hardware.
- G2 (trecho de busca): erra com desfoque artístico e expressão em grupo.
- Digital Camera World (trecho de busca): escolheu retratos com olho semicerrado.

### 1.2 Imagen (Culling + perfis)

**Detecta (verificado)** https://imagen-ai.com/culling/

- Rostos e sujeitos, duplicatas, desfoque, piscada involuntária.
- Reconhece **beijo** e mantém olho fechado nesse caso.
- Categoria "Low-rated": borradas, mal expostas, "não informativas".

**Apresenta**

- Método "culling in": marca o que fica, não o que sai.
- Agrupa parecidas com grau de semelhança ajustável; nota em estrelas, cores ou flags.
- "Cull to exact number": número ou percentual, com novo cull no mesmo projeto.
- Prévia já editada com o perfil de IA aplicado, enquanto decupa.
- No teste da Shotkit com 184 RAW: 32 Keepers (verde), 150 Duplicates (amarelo), 1 Standalone (azul), 1 Low-rated
  (vermelho). https://shotkit.com/imagen-ai-culling-review/

**Atalhos:** "os mesmos do Lightroom" (página própria, sem lista).

**Integração:** Lightroom Classic, Lightroom, Photoshop e Bridge.

**Velocidade:** é nuvem (não usa CPU/GPU local).

- Shotkit: 2 min de upload + 4 min de cull para 184 RAW (MacBook M3 Pro).
- Excire (concorrente): cerca de 25 min de upload + 10 min de análise para 1.000 JPEG.

**Preço:** culling US$ 12/mês no anual (US$ 144/ano) ou US$ 18 mensal, ilimitado; 2 projetos grátis. Edição à parte, a
partir de US$ 0,05 por foto.

**Reclamações**

- Shotkit: assinatura separada para o culling; ir e voltar do Lightroom "irritante"; não substitui revisão humana.
- Excire (concorrente): rejeição conservadora demais (17 de 1.000) e motivo opaco.
- Upload e privacidade por ser nuvem (PhotoWorkout: https://www.photoworkout.com/?p=223718).

### 1.3 Narrative Select

**Detecta (verificado)** https://narrative.so/select e https://narrative.so/blog/new-features-may-2026

- Foco e olhos por rosto; a avaliação de olho considera contexto (piscada, beijo).
- "Key Element" quando não há rosto: anel, flor, animal, figura distante (Mac, macOS 14+).
- Pessoas-chave destacadas e filtro por pessoa com contagem (beta, Mac).
- Detecção automática do tipo de ensaio.

**Apresenta**

- Filosofia: a ferramenta **mostra**, o fotógrafo decide.
- Painel Close-ups: todos os rostos recortados lado a lado.
- Scenes View: agrupa o mesmo momento e ordena de "Best in scene" a "Undesirable", com gradiente azul→vermelho e o
  motivo.
- Esconder as piores reduz de 20% a 30% das imagens a olhar (número do fornecedor).
- Survey: `N` compara até 12 fotos; `Shift+N` compara rostos de até 6.

**Atalhos (verificado)** http://help.narrative.so/en/articles/7337364-narrative-keyboard-shortcuts

- `↑/↓` foto; `←/→` cena; `Cmd/Ctrl+↑/↓` dentro da cena.
- `1–5`, `0`; `X` rejeita; `6–9` cores, `P` roxo; `T` tag, `U` untag.
- `Caps Lock` avanço automático.
- `Espaço` zoom inteligente no rosto principal; `Z` zoom no centro; `←/→` troca de rosto com zoom.
- `/` ou `.` Close-ups; `S` Scenes; `N` e `Shift+N` Survey; `F` tela cheia; `Cmd/Ctrl+E` enviar para edição.
- Tudo remapeável.

**Integração:** envia para Lightroom Classic e CC (Mac e Windows); Photoshop e Capture One só no Mac. A página não fala
em XMP. Ingest com até 4 backups.

**Velocidade:** "milhares de RAW em segundos" na importação (fornecedor).

- Shotkit (parceria paga): 1.582 imagens em pouco mais de 3 min. https://shotkit.com/narrative-select-review/
- FilterPixel (concorrente) diz cerca de 18 min por 1.000. As fontes conflitam.

**Preço (verificado)** https://narrative.so/edit/pricing — mensal / no anual:

- Lite US$ 15 / 10: avaliações só ao passar o mouse.
- Standard US$ 29 / 20: Close-ups, Scenes, ranking, comparação de rostos.
- Premium US$ 59 / 40 e Ultra US$ 79 / 60: acrescentam edição, não culling.

**Reclamações**

- Shotkit: pesado mesmo em máquina forte; progresso do First Pass só aparece ao passar o mouse; marcou como ruins fotos
  subexpostas de propósito; recursos só no Mac.
- A própria ajuda admite exigência alta de memória.
  https://help.narrative.so/en/articles/7337397-narrative-is-running-slowly-or-is-unresponsive-what-can-i-do
- FilterPixel (concorrente): foco em rosto não serve para esporte; "ficou escolhendo as posadas de grupo". A mesma
  página diz "só macOS", o que **contradiz** a página oficial (Windows e macOS).

### 1.4 FilterPixel

**Detecta (verificado)** https://filterpixel.com/hubfs/llms.txt e https://filterpixel.com/filterpixel-vs-narrative-select

- Basic Cull: sliders de duplicatas, piscadas e foco.
- DeepCull (nuvem, por gênero): nota de 0 a 10 **com motivo escrito** por foto, em seis dimensões: luz no sujeito,
  limpeza do fundo, clareza narrativa, "brand safety", timing do momento, qualidade técnica.
- Contexto: o mesmo olho fechado fica nos votos e sai no grupo posado.
- Filtro por tipo de momento ("dance", "kiss").

**Apresenta** https://filterpixel.com/blog/how-to-use-filterpixel-the-complete-feature-walkthrough

- "Magic Number": meta de quantidade, ajustável depois.
- Review Mode agrupa rajadas e sempre escolhe ao menos uma por rajada.
- Survey com zoom de até 16x.

**Atalhos:** não encontrados.

**Integração:** grava XMP ao lado do RAW, com estrelas e cores; Lightroom e Capture One leem.

**Velocidade (fornecedor):** cerca de 8 min por 1.000; 1.232 fotos em 5 min 28 s. Acurácia autodeclarada de 94,7% nas
que ficam e 96,1% nas que saem, em 2.740 fotos de casamento.

**Preço:** fontes conflitam.

- PhotoWorkout (05/11/2026): US$ 14,99/mês no anual com 20 DeepCull por ano; Pro 34,99; Studio 64,99; evento extra US$
  7,99.
- llms.txt do próprio site (abr/2026): Standard US$ 19,99 mensal ou US$ 10/mês no anual.
- Plano grátis com 4 projetos.

**Reclamações:** exige internet; cota de DeepCull (5.500 fotos por evento, 20 eventos por ano no plano de entrada); quem
fotografa muito paga mais que no ilimitado do Aftershoot (PhotoWorkout).

### 1.5 Photo Mechanic (Camera Bits)

- **Detecta:** nada. É manual, sem IA; a busca não achou IA anunciada em 2026.
- **Por que é rápido:** lê o JPEG embutido no RAW em vez de revelar (trecho de busca, várias fontes). É o padrão de
  esporte e jornalismo, forte em ingest e legenda (IPTC).
- **Atalhos (verificado, macOS)** https://docs.camerabits.com/support/solutions/articles/48000317772
  - `T` alterna tag, `+` tag, `-` untag.
  - Classe de cor `1–8` (no Preview) ou `Cmd+1–8`; `0` remove. Estrelas `Ctrl+1–5`.
  - `Espaço` abre o preview; `←/→` navega; `Z` zoom; `O`/`V`/`H` 1-up e 2-up; `Cmd+G` ingest.
  - Remapeável desde out/2025.
- **Preço (verificado)**
  https://docs.camerabits.com/support/solutions/articles/48001252734-photo-mechanic-pricing-and-information — US$
  14,99/mês, US$ 149/ano ou US$ 299 perpétuo com 1 ano de atualizações. Plus a US$ 24,99/mês (trecho de busca).
- **Reclamações:** a virada para assinatura em 2023 gerou reação; a empresa reconhece e por isso manteve a licença
  perpétua. https://home.camerabits.com/changes-coming-to-photo-mechanic/

### 1.6 Excire Foto 2027 / Excire Search 2026

Fonte principal: https://excire.com/en/best-culling-software/ (blog do fornecedor).

- **Detecta:** nitidez global, do rosto e do olho; expressão; olhos abertos; sorriso; estética. Busca por texto, rosto,
  GPS. Tudo local.
- **Apresenta:** agrupa por semelhança (slider de sensibilidade), conteúdo ou pessoas; a IA pode escolher a melhor de
  cada grupo; perfis de culling salvos; focus peaking; Survey View.
- **Velocidade:** 1.000 fotos de casamento em cerca de 3 min (teste do próprio fornecedor).
- **Preço:** US$ 249 vitalício (US$ 219 no lançamento); plugin de Lightroom a US$ 229.
- **Reclamações:** curva de aprendizado íngreme e painel de rostos "meio desajeitado" (o próprio blog admite); recursos
  de culling são os mais novos do grupo (PhotoWorkout).
- **Ponto forte:** critérios que não dependem de pessoa, bom para fauna e paisagem.

### 1.7 Evoto

Fonte: https://support.evoto.ai/?p=13367 (verificado).

- **Detecta:** desfoque, olhos fechados, exposição, com sensibilidade ajustável.
- **Nota por rosto em 3 estados:** olho (aberto, semiaberto, fechado, borrado), expressão (sorriso grande, sorriso,
  neutro), foco (em foco, suave, borrado).
- **Agrupa** por intervalo de tempo, duplicatas e rostos (pessoa). "Stories" divide o casamento em capítulos. Busca por
  texto ("vestido vermelho").
- **Apresenta:** modo Quick ou Custom; tipo de evento; "Best Picks" com limite total ou mínimo/máximo por grupo;
  "Candidates" (aceitáveis, não as melhores); estrelas, flags e cores automáticas; filtros com E/OU.
- **Integração:** grava estrelas, flags e cores em XMP compatível com Lightroom.
- **Preço:** por crédito na exportação. De cerca de US$ 89/ano (800 créditos) a US$ 1.339/ano (24.000) (trecho de busca,
  terceiro). Não foi confirmado se o culling gasta crédito.
- **Reclamações:** não apareceu reclamação verificável específica do culling.

### 1.8 Optyx

Fonte: https://shotkit.com/optyx-ai-photo-selection-tool/ (verificado).

- **Detecta:** foco no sujeito, olho fechado ou semicerrado (ignora rosto virado ou coberto), expressão (sorriso
  genuíno, neutro, tenso).
- **Apresenta:** Autogroup e Autocull com limiares ajustáveis. Perfis com regras, por exemplo "4 estrelas + verde para a
  melhor do grupo, amarelo para fora de foco, rejeitada para piscada".
- **Integração:** plugin para Lightroom Classic.
- **Preço:** grátis no manual (ilimitado, sem IA); Pro US$ 9,99/mês ou US$ 6,99/mês no anual.
- **Reclamações:** a análise de IA precisa de internet; semicerrado em sol forte é inconsistente; sem contexto do
  momento; tende a cortar demais; curva de aprendizado.

### 1.9 Lightroom / Lightroom Classic — Assisted Culling

Fontes: https://www.adobe.com/au/learn/lightroom-cc/web/ai-assisted-culling-lightroom,
https://community.adobe.com/questions-675/early-access-assisted-culling-lrclassic-983825,
https://fstoppers.com/lightroom/use-lightroom-ai-find-sharp-eyes-open-keepers-seconds-719139

- **Detecta:** nitidez do sujeito (0–100, padrão 50), nitidez do olho (0–100), olhos abertos (sim, não ou "não dá para
  saber"). Rejeita documentos e recibos, disparos acidentais e problemas de exposição. Em grupo analisa cada rosto.
- **Apresenta:** Selects × Rejects com contagem; painel de informação com a nota; clicar num rosto dá zoom e mostra a
  nota dele; ✓ verde ou ✗ vermelho na miniatura, com troca manual.
- **Ações em lote:** flag, estrela ou cor em todos os Selects ou Rejects; mandar para álbum; remover rejeitadas.
- **Pilhas:** por horário de captura ou semelhança visual (Fstoppers/Phlearn). A PhotoWorkout diz que a 15.4 não tem
  agrupamento de rajada nem nota de qualidade por quadro. As fontes conflitam; as notas de versão não abriram.
- **Na importação:** pode barrar antes de entrar no catálogo.
- **Preço:** incluso na assinatura Adobe.
- **Velocidade:** cerca de 33 min por 1.000 (teste da Excire, concorrente).
- **Reclamações (fórum Adobe, verificado)**
  - "Muito lento e impreciso"; nítidas de Nikon Z8 rejeitadas.
  - Foto rejeitada porque **outra pessoa** no quadro estava desfocada, com o sujeito em 100.
  - Foca "na área em volta e não no sujeito".
  - Não dá para limitar a análise à seleção; parou em 771 de 16.000 e segurou memória; trava em catálogo de 80.000.
  - Pedem sobreposição colorida de nitidez no olho ou rosto, e **calibração em vez de adivinhar o limiar** ("qual nota
    é nítida o bastante").
  - Pedem rejeição automática de duplicadas.
    https://community.adobe.com/questions-680/assisted-culling-feedback-thread-lrd-1627465/index1.html

### 1.10 Achado transversal

Em teste independente, três quadros igualmente nítidos da mesma cena receberam nota idêntica, e a escolha entre eles foi
"efetivamente arbitrária". As ferramentas são confiáveis para tirar o inutilizável e reduzir quase-duplicatas, não para
escolher a melhor entre boas. https://www.photoworkout.com/?p=223718

## 2. Metadados e interoperabilidade

- **Portáteis:** `xmp:Rating` (estrelas) e `xmp:Label` (cor, como texto). https://www.fastrawviewer.com/node/359
- **Flags:** historicamente só no catálogo do Lightroom. A partir do Lightroom Classic 13.2 vão para o XMP como
  `xmpDM:pick` ("-1", "0", "1") e `xmpDM:good`. https://exiftool.org/forum/index.php?msg=85176 e
  https://helpx.adobe.com/lightroom-classic/help/flag-label-rate-photos.html (trecho de busca)
- **`xmp:Rating = -1`** como rejeitada é convenção do Bridge; outro leitor pode ler errado (um usuário do DxO viu virar
  5 estrelas). https://forum.dxo.com/t/like-unlike-flags-in-dxo-pl-are-they-written-to-xmp-files/35353
- **Suposição de projeto:** como `xmp:Label` é texto, o Lightroom em português espera "Vermelho", "Amarelo" etc.
  Precisamos gravar no idioma do catálogo de destino. É o mesmo defeito que o Aftershoot documenta.

## 3. Fluxo ideal de decupagem rápida

Meta: uma tecla por cena quando a pessoa concorda com a escolha.

1. **Soltar a pasta ou o cartão.** As miniaturas aparecem na hora, lidas do JPEG embutido no RAW (o truque do Photo
   Mechanic). A análise roda em segundo plano e a pessoa já pode navegar.
2. **Zero configuração.** O tipo de ensaio é detectado e aparece como uma ficha trocável com um clique. Rigor padrão
   "Equilibrado".
3. **Três baldes prontos:** Ficam, Talvez, Fora. Cada foto do Fora traz o motivo em uma linha. Um controle de meta
   ("quero cerca de N") reordena **na hora**, sem reanalisar.
4. **Revisão por cena, não por foto.** `→` vai à próxima cena; a melhor já está marcada.
   - Concorda: só `→`.
   - Discorda: `↑/↓` dentro da cena e `P` (ou `S` para trocar a escolhida).
   - `Espaço` dá zoom no rosto principal; `Alt+←/→` troca de rosto.
   - Painel de rostos sempre visível em grupo.
5. **Fila de dúvidas.** Só as decisões de baixa confiança e os "Fora com rosto de pessoa-chave" entram numa fila curta.
   O resto a pessoa não precisa ver.
6. **Comparar quando precisa.** `N` abre lado a lado com zoom sincronizado no mesmo rosto; `X` tira uma até sobrar a
   vencedora.
7. **Fechar.** Uma ação principal: "Tratar as N escolhidas" (aplica o preset) e, como secundária, "Enviar para o cliente
   escolher" ou gravar XMP. Os originais nunca são movidos nem apagados; é a regra de mídia do
   [CLAUDE.md](../../../../CLAUDE.md) da raiz.

Conta de teclas (estimativa do estudo): um casamento de 3.000 fotos em cerca de 300 cenas dá de 300 a 450 toques, contra
cerca de 3.000 na decupagem foto a foto.

## 4. Sinais e nota explicável

**Sinais** (cada um normalizado de 0 a 1 e calibrado dentro do próprio ensaio)

| Grupo | Sinais |
| --- | --- |
| Técnica | nitidez do sujeito; nitidez do olho; **tremido** separado de **fora de foco** (o borrão de movimento tem direção); ruído |
| Exposição | recorte medido **nos dados do RAW**, por canal, e classificado em "recuperável" ou "perdido" |
| Rosto, por pessoa | olho em 3 estados (aberto, semi, fechado); direção do olhar; expressão; rosto coberto ou cortado; importância (tamanho, posição, recorrência no ensaio) |
| Contexto | beijo, riso, choro, oração, recém-nascido dormindo: olho fechado vira neutro ou positivo |
| Composição | horizonte torto; membro ou cabeça cortados na borda; sujeito colado na borda; estética geral, com peso baixo |
| Semelhança | vetor visual + intervalo de tempo + rajada: define a "cena" |
| Categoria | pessoa, grupo, animal, natureza, paisagem, objeto, comida, documento, disparo acidental |
| Cobertura | única foto de uma pessoa, de um momento ou de um detalhe |

**Como combinar**

1. **Vetos** (viram "Fora" com motivo e confiança): disparo acidental, documento, borrão total, exposição perdida
   segundo o RAW. Veto nunca apaga nada.
2. **Nota da foto** de 0 a 100: soma ponderada dos sinais, com pesos por tipo de ensaio (esporte pesa corpo nítido;
   retrato pesa olho e expressão; paisagem pesa nitidez global e horizonte). Para olhos em grupo, vale a **pior
   pessoa-chave**, não a média; rosto secundário desfocado não derruba a foto.
3. **Posição na cena:** a maior nota é a escolhida. Se a diferença for menor que a margem de erro, a interface diz
   "equivalentes" e desempata por regra fixa (olho da pessoa-chave, depois expressão), sem fingir precisão.
4. **Cobertura:** pelo menos uma por cena; pelo menos uma por pessoa-chave em cada momento; a única foto de alguém nunca
   vai para Fora sozinha.
5. **Meta:** para chegar a N, ordena por nota × novidade (o que a foto acrescenta ao que já foi escolhido).
6. **Aprendizado:** cada troca manual ajusta os pesos daquele usuário naquele tipo de ensaio. O ajuste aparece em
   palavras ("você prioriza expressão sobre nitidez") e pode ser zerado.

**Explicação na tela:** a nota mais os dois motivos de maior peso, em português curto ("Olho da noiva fechado", "A mais
nítida de 7"), e a confiança. Ao passar o mouse, a barra por sinal. Isso atende duas regras do `CLAUDE.md` da raiz: não
fingir IA e pouco texto.

**Estrelas e cores sugeridas** (editável, com perfis "Lightroom" e "Aftershoot"): 5 = destaque; 4 = escolhida; 3 =
talvez; 2 = alternativa da cena; 1 = problema técnico; flag de rejeição = veto.

As fórmulas, os pesos e os tetos da nota que saíram das provas estão em
[visao-no-aparelho.md, seção 9](visao-no-aparelho.md#9-nota-de-0-a-100-explicável-e-estrelas). O contrato da nota
(`avaliar` → Magnitude) está em [ARQUITETURA.md](../ARQUITETURA.md).

## 5. Atalhos da indústria a respeitar

| Tecla | Ação | Quem usa |
| --- | --- | --- |
| `P` / `X` / `U` | escolher / rejeitar / limpar flag | Lightroom. Narrative usa `X` e `U`; Aftershoot usa `P` |
| `1–5`, `0` | estrelas, limpar | todos |
| `6` `7` `8` `9` | vermelho, amarelo, verde, azul | Lightroom, Aftershoot, Narrative |
| `←/→` (e `↑/↓`) | navegar | todos. No Narrative `←/→` troca de cena e `↑/↓` de foto |
| `Espaço` | zoom (no rosto principal) | Narrative, Aftershoot; no Photo Mechanic abre o preview |
| `Z` | zoom 100% no centro | Lightroom, Narrative, Photo Mechanic |
| `G` / `E` ou `Enter` | grade / foto única | Lightroom, Aftershoot |
| `N` / `C` | lado a lado / comparar dois | Lightroom; `N` também em Narrative e Aftershoot |
| `Caps Lock`, `Shift+tecla` | avanço automático depois de marcar | Lightroom, Narrative |
| `Cmd/Ctrl+Z` | desfazer | todos |
| `F` | tela cheia | Lightroom, Narrative, Aftershoot |
| `T` | tag | Photo Mechanic, Narrative (oferecer como perfil) |
| `S` | trocar a escolhida do grupo | Aftershoot |
| `Alt+←/→` | rosto anterior / próximo | Aftershoot |
| `,` `.` | anterior / próxima dentro do grupo | Aftershoot |

(de memória, não verificado): no Lightroom, `[` e `]` baixam e sobem a estrela, `` ` `` alterna a flag, `L` apaga as
luzes, `Tab` esconde painéis, `\` abre a barra de filtro.

**Recomendação:** o padrão de fábrica é o do Lightroom, com perfis "Photo Mechanic" e "Aftershoot" e tudo remapeável.
Aftershoot, Narrative e Photo Mechanic já fazem assim.

**Conflito a evitar:** no Aftershoot `X` limpa a nota, enquanto no Lightroom e no Narrative `X` rejeita. Seguir o
Lightroom.

## 6. As 12 melhorias sobre o que existe

1. **Motivo por foto e por rosto, com confiança.** Aftershoot dá só estrelas; só o FilterPixel escreve motivo, e na
   nuvem. Acrescentar a sobreposição de nitidez no olho que os usuários do Lightroom pedem.
2. **Exposição julgada pelo RAW.** "Estourada" só se o dado do sensor estiver perdido; se o motor recupera, a foto fica.
   Nenhuma ferramenta anuncia isso (suposição: todas avaliam a prévia).
3. **Meta ao vivo.** Mudar "quero N" ou o rigor reordena na hora. No Aftershoot é "Restart" e a faixa é 10–60%.
4. **Olho fechado com contexto e três estados.** Beijo, riso e recém-nascido são reconhecidos por cena. A doc do
   Aftershoot manda desligar o detector nesses ensaios e revisar beijos à mão.
5. **Proteção de cobertura.** A única foto de uma pessoa ou momento nunca é rejeitada sozinha, e há contagem por pessoa.
   É o medo citado no fórum da Adobe ("a única foto da tia"); o filtro por pessoa do Narrative é beta e só Mac.
6. **Sujeito certo.** Pessoa secundária desfocada não rejeita a foto. Um clique corrige o sujeito e vale para a cena
   inteira. É reclamação direta do fórum da Adobe.
7. **Empate honesto.** Quadros equivalentes aparecem como equivalentes, com regra fixa de desempate. Responde ao achado
   da PhotoWorkout.
8. **Instantâneo, progressivo e local.** Miniaturas na hora; análise em segundo plano, limitável à seleção, que retoma de
   onde parou. Sem upload (Imagen levou 25 min só para subir 1.000 no teste da Excire) e sem travar catálogo grande
   (Lightroom). Há precedente no ecossistema para IA na máquina:
   [`products/ai-edit/README.md`](../../../ai-edit/README.md).
9. **Calibração em 30 segundos.** Em vez de slider de 0 a 100, mostrar seis pares do próprio ensaio ("esta serve?") e
   acertar os limiares. É pedido literal no fórum da Adobe.
10. **Interoperabilidade limpa.** XMP com `xmp:Rating`, `xmp:Label` no idioma do catálogo e `xmpDM:pick` para Lightroom
    Classic 13.2+. Nunca usar `Rating = -1`. Ler decisões que já existem no XMP. Originais intocados.
11. **Decupar, tratar e entregar no mesmo passo.** Prévia já com o preset (o Imagen faz), "tratar só as escolhidas"
    (falta no Aftershoot, segundo a Shotkit), e o link do cliente já organizado por cena, com a melhor de cada uma na
    frente.
12. **Ensaios sem gente.** Olho do animal, nitidez global e horizonte para natureza, corpo e número para esporte, com a
    categoria detectada e filtrável. Hoje só Excire e o Key Element do Narrative (Mac) tratam bem; Aftershoot e Optyx são
    centrados em rosto.

## 7. Regras da casa que pesam na decupagem

Do [CLAUDE.md](../../../../CLAUDE.md) da raiz (verificado, só leitura):

- Arquivos de mídia não são movidos, renomeados nem apagados; prévia e confirmação explícita sempre.
- Não fingir IA nem progresso.
- Pouco texto: título curto e no máximo uma linha de apoio.
- Respeitar "reduzir movimento".
- App não lançado não aparece até a migration de lançamento.

A "cor por referência" e os "Meus looks" da Revela
([`products/finishing/README.md`](../../../finishing/README.md)) serviram de base conceitual para extrair estilo de uma
foto e para a biblioteca de predefinições; ver [o-que-ja-existia.md](o-que-ja-existia.md).
