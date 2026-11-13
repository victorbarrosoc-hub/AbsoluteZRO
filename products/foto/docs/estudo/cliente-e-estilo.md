# Cliente e estilo: galeria de seleção e estilo por referência

Duas frentes do estudo: (A) como as plataformas deixam o cliente escolher as fotos, e (B) como extrair o estilo de uma foto de referência e devolver controles editáveis. Pesquisa de 13/11/2026.

**Convenção:** **[V]** = verificado em 13/11/2026 (fonte ou arquivo citado) · **(de memória)** = não verificado agora · **[S]** = suposição ou proposta do estudo. `helpx.adobe.com` devolveu 403; o que se cita do Lightroom vem do resumo da busca.

O que o produto adotou (token, PIN, porta estreita, prévias em bucket privado só depois de autorizado) está na seção "Servidor" de [ARQUITETURA.md](../ARQUITETURA.md). A cobrança de fotos extras ficou fora deste corte.

---

## Frente A — Galerias de seleção e prova

### A1. O que cada plataforma faz

| Plataforma | Acesso do cliente | Seleção, limite, extras | Comentários e conclusão | O que o fotógrafo recebe | Proteção e prazo |
| --- | --- | --- | --- | --- | --- |
| **Pixieset** | Link; senha em Settings > Privacy; registro por e-mail opcional [V] | Coração cria lista salva sob o e-mail; limite via Settings > Favorite > Preset Favorite Lists (lista pré-criada, atribuída a um e-mail, com instruções) [V]. Extras pagos pela loja, sem vínculo com o limite (de memória) | "Favorite Notes" liga notas por foto; cliente envia a lista e confirma que terminou [V] | Activities > Favorite Activity: baixar favoritas, exportar ou copiar nomes; plugin de Lightroom importa a lista [V] | Marca d'água nas versões de exibição; Download PIN de 4 dígitos automático; Auto Expiry deixa a coleção "Hidden" (não apaga) com e-mail de lembrete [V] |
| **Pic-Time 2.0** | Cliente logado na galeria; convite por e-mail agendável [V] | "Selection Request": título, data/hora limite, "Required photos", "Allow additional photos", "Maximum total photos"; guia com mídia e instruções [V]. Cobrança de extras não consta no artigo | Comentário por foto em chat; e-mail "Pending Comments"; e-mail ao concluir; fechar e reabrir [V] | "Download CSV" ou "Copy for Lightroom"; plugin sincroniza seleção e leva comentários ao painel Comments do Lightroom [V] | Lembretes automáticos e e-mail de expiração [V]. Só planos Professional/Advanced [V] |
| **ShootProof** | Link; senha e PIN (de memória) | Estrela de favoritos sem limite; "Labels" para várias coleções [V] | Notas por favorito (de memória) | Gallery Visitor Report: copiar lista de nomes e colar na busca do Lightroom; listas longas travam o Lightroom e nomes com espaço falham [V] | Guia oficial sugere provas em baixa resolução com marca d'água e download desligado [V]; expiração (de memória) |
| **picdrop** | Link, sem conta [V]; senha (de memória) | Bandeiras vermelho/laranja/verde/preto ("FINAL"), curtidas, votação de equipe; um arquivo só tem uma bandeira [V]. Limite de seleção (de memória) | Comentário e rabisco sobre a foto, em tempo real [V] | "Export selection": texto de filtro para Lightroom (Texto > Nome do arquivo > Contém), Capture One (Select by Filename List, nomes separados por espaço, ignorar extensão), Finder (2048 caracteres ou 99 arquivos), Explorer (259 caracteres) [V] | Download liga/desliga por galeria; dados na UE (Berlim), sem uso para treino de IA [V]; marca d'água (de memória) |
| **CloudSpot** | Galeria instalável como app de marca no celular [V, resenha] | "Proofing gallery" existe [V]; limite e extras não confirmados | Não confirmado | Busca por nome no Lightroom; os nomes precisam coincidir [V] | Não confirmado |
| **Zenfolio** | Link | Listas de favoritos [V]; limite não confirmado | Não confirmado | Exporta lista de imagens; plugin "Image List Import" cria coleção no Lightroom, só no plano Advanced; recomenda nomes únicos [V] | Não confirmado |
| **Alboom Proof** (BR) | Toda seleção exige cadastro com login e senha, mesmo em galeria pública; galeria multicliente no mesmo link [V] | "Seleção e Venda" > "Seleção com venda de fotos extra": quantidade a partir da qual cobra, modo "Por foto" ou "Pacote de fotos"; desconto progressivo; pagamento por Alboom Pay (Pix, cartão, boleto), sem comissão [V] | Depois de enviar, o cliente cai na tela de pagamento; avaliações dizem que clientes não acham o botão de finalizar [V] | Lista de nomes; como o Lightroom falha com "+", parênteses, "#" e espaço, há o plugin Alboom Finder ("Proof Smart Collection") [V] | Marca d'água própria, senha, anti-cópia; prazo padrão de um mês, sem salvar preferência (avaliação); reconhecimento facial em beta [V] |
| **Fotto** (BR) | Cliente acha o evento e usa reconhecimento facial [V] | Marketplace de evento, sem fluxo de seleção contratada; 10% de comissão, Pix e cartão [V] | — | — | Sem marca d'água própria e sem galeria com senha [V] |
| **Selpics** (BR) | Link | Créditos pré-pagos sem mensalidade (R$ 17,90 por 1.000 até R$ 90,90 por 15.000); venda opcional por PagSeguro; cliente pode comprar excedentes [V] | Não informado | Não informado | Não informado |
| **PICSIZE** (BR) | Responsiva, celular ou PC [V] | "Seleção múltipla" (formaturas), venda de fotos adicionais [V] | Não informado | "Integração com Lightroom" (sem detalhe) [V] | Marca d'água e proteção contra cópia [V] |
| **Banlek / Epics Select** (BR) | Link | Banlek é marketplace (comissão de 9% ou 10%, cerca de R$ 20 por foto, segundo o Brazil Journal); fundiu com a Epics, que faz seleção e entrega [V] | Pastas ou tags por momento; estrelas de sugestão do fotógrafo [V] | Não confirmado | Prazo máximo com lembretes automáticos por e-mail [V] |
| **Lightroom (web)** | "Anyone can view" ou só convidados [V]; curtir e comentar pede Adobe ID (de memória) | Curtida e comentário; sem limite, sem extras, sem "concluir" [V] | Comentário por foto [V] | Painel Activity mostra curtidas e comentários [V] | Download liga/desliga; marca d'água só na exportação, não no link [V] |

### A2. Dores que se repetem

- **Casar seleção com arquivo por nome é o ponto fraco de todos.** Caracteres especiais (Alboom), espaços e listas longas (ShootProof), limite de caracteres (picdrop), renomear depois do envio e nomes repetidos entre câmeras (PhotoBiz, Zenfolio) [V].
- **O botão de concluir some** (avaliações do Alboom) [V].
- **O limite contratado e a venda de extras ficam separados** no Pixieset, Pic-Time e ShootProof; só os brasileiros juntam os dois com Pix [V] e (de memória).
- **Nenhuma liga a seleção ao tratamento.** Todas param na lista; o tratamento é manual em outro programa [S, coerente com tudo que foi lido].

### A3. Fluxo ideal mínimo

1. **Fotógrafo:** escolhe as fotos (já decupadas), define quantidade contratada, preço da extra, prazo e marca d'água; gera o link.
2. **Preparo:** o app gera prévias reduzidas (lado maior de cerca de 2048 px, mais miniatura), com marca d'água gravada nos pixels e sem EXIF/GPS, e envia só isso.
3. **Cliente abre o link** no celular, sem cadastro; PIN opcional de 4 a 6 dígitos, enviado separado.
4. **Seleciona:** toque no coração; contador fixo "32 de 40"; ao passar, "+3 extras · R$ 45".
5. **Comenta** por foto (texto curto, opcional).
6. **Conclui:** botão fixo no rodapé, tela de revisão e confirmação; a seleção trava (o fotógrafo pode reabrir).
7. **Fotógrafo é avisado** (e-mail e notificação no app); a seleção vira filtro no catálogo, com comentários ao lado; exporta TXT/CSV para Lightroom e Capture One.
8. **Expira:** o link morre no prazo e as prévias são apagadas depois de N dias.

### A4. Dez melhorias

1. **Seleção vira filtro e fila de tratamento:** ao concluir, as escolhidas entram no lote com o preset do trabalho e o fotógrafo só revisa.
2. **Casamento por ID, não por nome:** identificador do item no catálogo (hash do conteúdo mais data de captura). O TXT/CSV fica só para compatibilidade.
3. **Pilhas de parecidas para o cliente:** a decupagem já agrupa sequências; o cliente vê a melhor na frente e abre a pilha se quiser.
4. **Comparar duas a duas** no celular ("esta ou esta") dentro de cada pilha.
5. **Prévia já com o look:** a prova sai com o preset aplicado; opcionalmente o cliente escolhe cor ou P&B por foto.
6. **Pedidos estruturados:** além do texto, etiquetas ("suavizar pele", "remover objeto", "P&B") que viram tarefas no editor.
7. **Extras com preço ao vivo e Pix,** com pacote e desconto progressivo. Exige provedor de pagamento, que hoje não está decidido.
8. **Várias pessoas no mesmo link** (casal, família, agência): lista por pessoa, votos e visão do que coincide.
9. **Estados visíveis e lembretes:** enviado, aberto, em andamento (com contagem), concluído, reaberto; lembrete automático antes do prazo; comprovante da seleção com data.
10. **Entrega no mesmo link:** depois do tratamento, as escolhidas são trocadas pelas finais e o link vira galeria de entrega.

### A5. Privacidade: onde ficam as fotos

- **Recomendação [S]: o original e o RAW nunca saem da máquina do fotógrafo.** Só sobem prévias reduzidas com marca d'água, para um bucket privado. A galeria pede o endereço ao servidor, que confere token (guardado como hash) e PIN e devolve URL assinada de vida curta (cerca de 1 hora). O link tem expiração, revogação e registro de acesso; as prévias são apagadas no prazo.
- **Onde hospedar:** Supabase Storage do projeto `AbsoluteZRO` (bucket privado, URL assinada) ou Cloudflare R2 (sem custo de saída). **Qualquer um dos dois pede autorização do titular** (regra "banco pago ou ação irreversível" do [CLAUDE.md](../../../../CLAUDE.md) da raiz).
- **Alternativa sem armazenamento novo:** prévias no Google Drive do próprio fotógrafo, pelo desenho que já existe em [`packages/drive-web/src/stream-pagina.js:1-8`](../../../../packages/drive-web/src/stream-pagina.js). Custo zero, mas mais lento, sujeito a cota do Drive e com a avaliação CASA no caminho ([`docs/decisions/0028-custos-do-ecossistema.md:32`](../../../../docs/decisions/0028-custos-do-ecossistema.md)).
- **Proteção contra download é só dissuasão.** Bloquear clique direito e toque longo não impede captura de tela. O que protege de fato é a prévia pequena com marca d'água gravada (não sobreposta em CSS).
- **Rosto é dado sensível na LGPD** (de memória, art. 5º II e art. 11): busca por rosto na galeria do cliente só com consentimento; a detecção para decupagem pode rodar local, sem enviar nada. O texto da lei foi conferido em [visao-no-aparelho.md](visao-no-aparelho.md#10-lgpd-precisa-de-revisão-jurídica).
- **Regras do repositório que já valem [V]** (do `CLAUDE.md` da raiz):
  - Schema e papel próprios no Supabase, tabela nova com RLS e teste de isolamento.
  - O app nasce fechado: o link do cliente é uma superfície pública e também precisa respeitar o gate `zro.product_release`.
  - Mídia não é movida, renomeada nem apagada sem prévia e confirmação.
  - No HUB não havia link público com token para não usuários: a busca por `signedUrl`/`share_token` não achou nada. O mais próximo ali é o papel `guest` com convite por conta ([`docs/decisions/0021-carro-hub-convidado.md`](../../../../docs/decisions/0021-carro-hub-convidado.md)) e o código com `expires_at` e uso único ([`infra/migrations/0057_login_pelo_app.sql:19-20`](../../../../infra/migrations/0057_login_pelo_app.sql)). Outra frente do estudo achou o desenho que serviu de modelo, o link do cliente do Maestro: ver [o-que-ja-existia.md](o-que-ja-existia.md#5-links-públicos-e-tokens-de-compartilhamento).

---

## Frente B — Extrair o estilo de uma referência e devolver controles

### B1. O que os produtos fazem

| Produto | Como funciona | Devolve controles editáveis? |
| --- | --- | --- |
| **Lightroom Classic, Reference View** | Duas imagens lado a lado; o ajuste é manual. Casamento automático não foi encontrado [V] | Manual |
| **Capture One, Match Look** (16.5) | Um clique; usa ferramentas existentes (balanço de branco, contraste, Color Editor); intensidade ajustável, dá para excluir ferramentas e aplicar em camada; várias referências com peso por semelhança. Resenhas: contraste em excesso, resultado varia com o assunto [V] | Sim |
| **Imagen, Personal AI Profile** | Treina com 2.000 a 3.000 fotos editadas do catálogo; aprende os controles, não máscaras nem corte; prevê valores por foto [V] | Sim, mas exige catálogo |
| **Aftershoot, Instant AI Profile** | Parte de um preset `.xmp` e calibra com 3 fotos (exposição, temperatura, tinta). O perfil Professional pede mais de 2.500 edições [V] | Sim, mas parte de preset |
| **Luminar Neo, Color Transfer** (1.21) | Copia a paleta de uma referência, com controle de quantidade; casa elementos parecidos (céu com céu). Resenha: falhou com referência de filme [V] | Não |
| **DaVinci, Shot Match** | Rede neural desde a versão 16; "divide a diferença" quando as cenas diferem; pede clipes normalizados; a correção é invisível [V] | Não |
| **Photoshop, Match Color** | Aplica estatísticas da origem; Luminance, Color Intensity, Fade, Neutralize; só RGB [V]. Parece média e desvio no estilo Reinhard [S] | Não |
| **Colourlab AI** | "Match Scene" com still de referência, modelo "perceptual" patenteado, gera variantes; sem artigo técnico [V, material do fabricante] | Parcial (LUT ou grade no Resolve) |
| **Código aberto** | ColorTransferLib (11 métodos, inclui MKL e métricas), colortrans (histograma linear, PCA, Reinhard), python-color-transfer (transferência de PDF mais Reinhard), color_transfer (Reinhard em OpenCV) [V]; color-matcher, darktable "color mapping", G'MIC "Transfer Colors" (de memória) | Não |
| **Pesquisa** | Exposure (filtros diferenciáveis "caixa branca"), Deep Preset (prevê 69 parâmetros a partir da referência), Neural Photo-Finishing (pipeline diferenciável que prevê controles no estilo Camera Raw), patente da Adobe com diferenças finitas [V]; Neural Preset, CVPR 2023 (de memória) | Sim |

### B2. Técnicas

- **Reinhard (2001):** por canal em lαβ, `x' = (x − μo)·σr/σo + μr`. Rápido e estável; ignora correlação entre canais e copia o conteúdo junto com o estilo (de memória).
- **Casamento de histograma por canal:** `T = Fr⁻¹∘Fo`. Bom para luminância; em RGB cria cor falsa; posteriza onde a inclinação é alta (de memória).
- **IDT, transferência iterativa de distribuição (2007):** gira para eixos aleatórios, casa o histograma 1D em cada eixo e repete até a distribuição 3D coincidir. Gera granulação, corrigida por um pós-processo que preserva o gradiente do original [V].
- **MKL, Monge-Kantorovich linear (2007):** mapa linear fechado entre duas gaussianas, o que menos desloca as cores [V]. `T = Σo^(-1/2)(Σo^(1/2) Σr Σo^(1/2))^(1/2) Σo^(-1/2)` (de memória). Sem banding; não segue curva de tom.
- **Transporte ótimo completo / sliced Wasserstein:** casa tudo, inclusive o que é conteúdo; precisa da versão parcial para ignorar o que não tem par (de memória).
- **LUT 3D ajustada:** grade 17³ ou 33³ com regularização. Exata, mas não editável.
- **Ajuste paramétrico:** `θ* = argmin D(estatísticas(Render(I; θ)), estatísticas(Ref)) + λ·‖θ‖`. É o único que devolve controles. Funciona bem aqui porque o motor é nosso, então a relação controle → pixel é exata.

### B3. O que o repositório já tinha [V]

A Revela (`products/finishing`, ainda fechada) já resolvia metade disso para vídeo:

- **[`products/finishing/src/cor/referencia.js:1-17`](../../../finishing/src/cor/referencia.js) e `criarLook` em `:309`:** referência → look em Oklab, com:
  - curva de tom monótona por 15 percentis (`:21`), com exposição limitada para não copiar o brilho da cena (`:26`);
  - deslocamento de cor por 7 faixas de luz, resumido numa reta (dominante mais split-tone);
  - saturação comparada dentro do mesmo matiz, em 12 setores;
  - até 3 pares de conta-gotas e intensidade de 0 a 1;
  - o `resumo` já descreve o resultado em frases (`descrever`, `:425`).
- **[`products/finishing/src/cor/clonar.js:1-16`](../../../finishing/src/cor/clonar.js) e `:152`:** o mesmo quadro antes e depois → curva, matriz afim e grade 17³ regularizada.
- **[`products/finishing/src/cor/lightroom.js:1-8`](../../../finishing/src/cor/lightroom.js) e `:86`:** look → preset `.xmp` (curvas por canal e HSL de 8 faixas). A conversão para os controles da Adobe usa constantes aproximadas (`:20-22`).
- **[`products/finishing/src/cor/qc.js:1-4`](../../../finishing/src/cor/qc.js) e `:76`:** controle de qualidade do look (neutro, monotonia, degrau, pele, gamut).

A saída ali é uma função de cor (LUT), não controles. O algoritmo abaixo é a evolução disso. Os algoritmos da Revela, passo a passo, estão em [o-que-ja-existia.md](o-que-ja-existia.md).

### B4. Algoritmo recomendado [S]

**Etapa 0 — Normalizar.** Referência: ler o perfil ICC, cortar bordas e texto, detectar P&B, reduzir para cerca de 512 px, ignorar pixels estourados. Alvo: renderizar pelo motor em estado neutro, no mesmo tamanho. Comparar em Oklab.

**Etapa 1 — Impressão digital do estilo** (estatísticas que resistem a conteúdo diferente):

- Tom: 15 percentis de luminância, ponto preto e branco, inclinação nos médios.
- Eixo neutro: cor média dos pixels pouco saturados em 7 faixas de luz.
- Cor por matiz: croma e desvio de matiz em 12 setores, com peso pela cobertura.
- Âncoras semânticas quando existirem nas duas imagens: pele (a detecção de rosto da decupagem já entrega), céu, vegetação.
- Espaciais: grão (resíduo de alta frequência em áreas lisas), vinheta (perfil radial), fade (preto levantado), contraste local.

**Etapa 2 — Partida em forma fechada, um grupo por vez:**

1. Exposição: só parcial e limitada; se houver rosto nas duas, ancorar na pele.
2. Pretos, brancos e contraste, pelos percentis; depois a curva (4 regiões ou 5 pontos), monótona e com inclinação limitada.
3. Cor do eixo neutro: a parte constante ao longo da luz vai para temperatura e tinta; a parte que varia vai para o split toning de sombras e altos.
4. Saturação e vibração: razão de croma dentro do mesmo matiz.
5. HSL de 8 faixas: matiz, saturação e luz; faixa com pouco pixel em qualquer das duas imagens fica em zero.
6. Grão, vinheta, fade e claridade, direto das estatísticas espaciais.

**Etapa 3 — Refino conjunto.** Otimizar os 35 a 45 controles juntos, renderizando a miniatura pelo motor a cada passo (Levenberg-Marquardt com diferenças finitas, ou CMA-ES). Limites por controle e penalidade L1 puxando para zero, para mexer em poucos controles. Peso por sobreposição, para que o que só existe numa imagem não puxe.

**Etapa 4 — Resíduo opcional.** Calcular o melhor mapa não paramétrico (MKL mais IDT regularizado) como teto. O que os controles não alcançam pode virar uma camada "perfil de look" em LUT 17³ com controle de quantidade, deixando claro que essa parte não é editável.

**Etapa 5 — Saída.** Preset com:

- os controles preenchidos;
- confiança por grupo;
- intensidade de 0 a 100;
- separação entre "correção por foto" (exposição e balanço automáticos, recalculados em cada imagem) e "look" (constante).

Aceitar de 3 a 10 referências e fazer a média das impressões digitais melhora muito a robustez; o Capture One já faz isso.

### B5. Métricas de erro para mostrar e testar

- **Tom:** erro médio quadrático entre os percentis de luminância, em L\*.
- **Neutros:** ΔE por faixa de luz no eixo neutro.
- **Cor:** distância sliced Wasserstein em Oklab e interseção do histograma de matiz.
- **Âncoras:** ΔE2000 da pele e do céu.
- **Aderência:** `1 − erro_depois / erro_antes`, e quanto do teto não paramétrico os controles alcançaram.
- **Segurança:** percentual de pixels estourados, pele fora da faixa de matiz, monotonia da curva (os testes do `qc.js` servem de base).
- **Estabilidade:** aplicar o preset em outras fotos da mesma sessão e medir a variação da pele e do estouro.

### B6. Limites honestos

- **O problema é mal posto.** Uma imagem não separa cena, luz e figurino do tratamento: uma referência de pôr do sol gera um preset alaranjado. Várias referências, âncoras, conta-gotas e limites atenuam, não resolvem.
- **Não é único.** Contraste e curva, ou balanço e split toning, chegam ao mesmo resultado. O preset devolvido é o mais simples que explica a imagem, não o que o autor usou.
- **Não transfere:** ajuste local e máscara, retoque de pele, luz do set, lente, profundidade de campo, direção de arte.
- **Simulação de filme e perfil de câmera** (que são LUT) não cabem em controles; só o resíduo da etapa 4 chega perto.
- **A referência costuma ser JPEG de 8 bits, comprimido e sem perfil,** às vezes vindo de rede social. Grão e vinheta estimados daí são pouco confiáveis; a vinheta se confunde com a queda natural de luz.
- **Casos degenerados:** referência em P&B não dá informação de matiz; cena quase monocromática deixa a maioria das faixas HSL sem dado (ficam em zero).
- **O mercado confirma o limite:** Capture One e Luminar têm resenhas de resultado irregular [V]. Vale prometer "ponto de partida editável", não "cópia do look".

---

## Lacunas desta pesquisa

- Não confirmados em fonte: senha, PIN e expiração do ShootProof; senha, marca d'água e limite do picdrop; limite, comentários e marca d'água do CloudSpot e do Zenfolio; prazo, comentários e formato de exportação do Selpics, PICSIZE e Epics Select.
- Lightroom: não foi confirmado se curtir exige Adobe ID nem o formato exato do filtro "Contém" com muitos nomes.
- Nenhum protótipo do algoritmo da Frente B foi rodado no estudo; as etapas são proposta, apoiada no que `referencia.js` já faz.

## Fontes

**Frente A**

- Pixieset: https://intercom.help/pixieset/en/articles/4064071-how-does-proofing-with-favorites-work · https://blog.pixieset.com/blog/online-photo-proofing/ · https://intercom.help/pixieset/en/articles/4064075-collection-download-settings · https://help.pixieset.com/hc/en-us/articles/43979216610445-What-is-my-client-s-Download-PIN
- Pic-Time: https://help.pic-time.com/en/articles/16191349-how-do-i-request-a-client-selection-in-pic-time-2-0 · https://help.pic-time.com/en/articles/7834728-how-do-i-sync-lightroom-selections-and-favorites · https://help.pic-time.com/en/articles/7834820-how-do-i-modify-a-csv-list-and-use-it-in-lightroom
- ShootProof: https://help.shootproof.com/hc/en-us/articles/115009451587-Can-I-view-client-Favorites-in-Lightroom · https://www.shootproof.com/blog/shootproof-favorites-lightroom/ · https://www.shootproof.com/blog/labels-help-clients-pick-favorite-photos-fast/ · https://s3.amazonaws.com/static.shootproof.com/asset/756/PDF_Soft_Proof_with_ShootProof.pdf
- picdrop: https://www.picdrop.com/web/docs/ai/en/product-overview/ · https://www.picdrop.com/web/faq/lightroom · https://www.picdrop.com/web/faq/how-do-i-filter-color-coded-images-in-lightroom-capture-one-finder-and-explorer
- CloudSpot: https://help.cloudspot.io/en/articles/9401702-how-to-create-a-proofing-gallery · https://aftershoot.com/blog/12-best-online-proofing-galleries
- Zenfolio: https://support.zenfolio.com/hc/en-us/articles/7432682545939-Image-List-Import-Plug-in-for-Lightroom-for-Favorites-Lists
- Alboom: https://suporte.alboom.com.br/hc/pt-br/articles/45325143963789-Como-criar-uma-galeria-de-sele%C3%A7%C3%A3o-de-fotos-com-venda-de-fotos-extras-no-Alboom-Proof-Gallery · https://suporte.alboom.com.br/hc/pt-br/articles/10571652629005-Como-exportar-as-fotos-selecionadas-com-o-aux%C3%ADlio-do-Plugin-Alboom-Proof · https://suporte.alboom.com.br/hc/pt-br/articles/45325498396557-Galeria-de-venda-de-fotos-com-desconto-progressivo-no-Alboom-Proof-Gallery · https://www.alboompro.com/proof · https://www.softwareadvice.com/cms/alboom-proof-profile/
- Fotto × Proof: https://fotografiamais.com.br/alboom-proof-ou-fotto/
- Selpics: https://selpics.com/ · PICSIZE: http://picsize.com.br/
- Banlek/Epics: https://braziljournal.com/a-banlek-ja-vendeu-r-260-milhoes-em-fotos-foi-tudo-parar-no-instagram · https://epics.com.br/blog/5-dicas-para-organizar-a-galeria-para-uma-selecao-rapida
- Lightroom: https://helpx.adobe.com/lightroom/web/share-your-work/share-and-invite/share-photos-and-albums-for-review.html (403 no fetch) · https://lightroomkillertips.com/tip-client-proofing-using-lightroom-web/
- Renomear e nomes repetidos: https://support.photobiz.com/blog-post/how-to-export-proofing-favorites-to-adobe-lightroom

**Frente B**

- Capture One: https://support.captureone.com/hc/en-us/articles/22188770298269-Match-Look-Tool · https://alexonraw.com/capture-one-match-look-and-new-features-of-capture-one-16-5/ · https://www.thephoblographer.com/2024/10/23/capture-one-16-5-0-beta-1-review-is-this-the-end-of-presets/
- Imagen: https://support.imagen-ai.com/hc/en-us/articles/4446646190097 · https://petapixel.com/2023/04/28/you-can-now-manually-adjust-how-imagen-ai-learns-your-editing-style
- Aftershoot: https://support.aftershoot.com/en/articles/11869319-how-to-build-an-instant-ai-profile · https://photofocus.com/news/aftershoot-launches-instant-ai-profiles-from-lightroom-presets-to-quick-ai-styles/
- Luminar: https://petapixel.com/2024/08/15/luminar-neos-upcoming-color-transfer-tool-uses-ai-to-match-colors · https://www.slrlounge.com/luminar-neo-fall-2024-review/
- DaVinci: https://larryjordan.com/articles/how-to-color-match-clips-in-davinci-resolve-20/ · https://www.steakunderwater.com/VFXPedia/__man/Resolve18-6/DaVinciResolve18_Manual_files/part2690.htm
- Photoshop: https://www.peachpit.com/articles/article.aspx?p=706213 · https://www.manualsdir.com/manuals/753896/adobe-photoshop-cs4.html?page=189
- Colourlab: https://colourlab.ai/ai-references/ · https://www.cined.com/colourlab-ai---color-grading-with-artificial-intelligence/
- Lightroom Reference View: https://jkost.com/blog/?p=22872
- IDT e MKL: https://mural.maynoothuniversity.ie/15125/1/RD_automated.pdf · https://www.tara.tcd.ie/items/933adee3-4442-4e8d-a623-30d7ad181b9f
- Código aberto: https://pypi.org/project/ColorTransferLib/ · https://github.com/dstein64/colortrans · https://pypi.org/project/python-color-transfer · https://github.com/AdamSpannbauer/color_transfer
- Pesquisa: https://arxiv.org/abs/1709.09602v1 (Exposure) · https://arxiv.org/pdf/2007.10701 (Deep Preset) · https://light.princeton.edu/publication/neural-photo-finishing/ · https://patents.google.com/patent/US11481619
