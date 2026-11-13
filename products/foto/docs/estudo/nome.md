# Nome: família, candidatos e o que falta verificar

O estudo de nome para a plataforma de fotos (id técnico `foto`). Pesquisa de 13/11/2026. **Quem decide é o titular.** O nome em uso é provisório e mora em um lugar só no código ([`app/nome.js`](../../app/nome.js), regra do [CLAUDE.md](../../CLAUDE.md) do produto); o id `foto` não muda quando o nome mudar.

Confiança: o que cita arquivo do repositório ou URL foi verificado em 13/11/2026. **(de memória)** = sem fonte conferida. **Suposição** vem marcada.

## 1. Família de nomes e voz da marca (verificado no repositório)

| Padrão | Exemplos | Fonte |
| --- | --- | --- |
| Física / astronomia, uma palavra, internacional | **Quasar** Audio Lab (ex-NOSSOM), **AEON**, **RADION**, **Rift** Motion, **Relay**; planos **Zero / Órbita / Absoluto** | [`infra/migrations/0053_quasar_nome.sql:1-15`](../../../../infra/migrations/0053_quasar_nome.sql), [`infra/migrations/0012_aeon.sql:6`](../../../../infra/migrations/0012_aeon.sql), [`infra/migrations/0061_radion.sql:1-13`](../../../../infra/migrations/0061_radion.sql), [`docs/decisions/0035-motion-2d-3d.md:3`](../../../../docs/decisions/0035-motion-2d-3d.md), [`docs/decisions/0030-relay-conversao.md:3`](../../../../docs/decisions/0030-relay-conversao.md), [`docs/decisions/0039-planos-zero-orbita-absoluto.md:18-20`](../../../../docs/decisions/0039-planos-zero-orbita-absoluto.md) |
| Verbo ou expressão em português, com ação | **Revela**, **Synquei**, **SOBEDESCE**, Carro do Freela | [`docs/decisions/0015-finishing-resolve-powergrade-lut.md:4`](../../../../docs/decisions/0015-finishing-resolve-powergrade-lut.md), [`PRD.md:74-80`](../../../../PRD.md) |
| Assinatura curta, pode ser em inglês | "RADION — Stay connected." | [`docs/decisions/0042-radio-do-set.md:3`](../../../../docs/decisions/0042-radio-do-set.md) |
| Frase-mãe | "O futuro começa do zero." | [`CLAUDE.md`](../../../../CLAUDE.md) da raiz |

- **Território da Revela, a evitar:** película, quadro perfurado, revelação do latente ao colorido, amarelo filme e roxo ([`docs/decisions/0016-identidade-revela.md:10-20`](../../../../docs/decisions/0016-identidade-revela.md)). Ela é o laboratório de cor de vídeo (`PRD.md:79`). O nome novo não deve usar filme, revelação, emulsão, latente nem sala escura.
- **Marca flat:** anel com centelha, só as pontas horizontais aparecem, uma cor só (grafite ou branco), abaixo de 20 px só o anel ([`docs/marca/README.md:7,25-27`](../../../../docs/marca/README.md)). Produtos mantêm ícone próprio (`CLAUDE.md` da raiz) sobre "azulejo grafite da família" (`docs/decisions/0016-identidade-revela.md:13`).
- **Cores já ocupadas:** azuis (TPeasy, SOBEDESCE, Synquei, Quasar), magenta (Carro), amarelo e roxo (Revela), latão (Maestro) em [`packages/ui/src/tokens.css:31-46`](../../../../packages/ui/src/tokens.css); laranja `#EA6426` (Rift) em `docs/decisions/0035-motion-2d-3d.md:89`. Verde, ciano e branco neutro estão livres nesses arquivos. Não há token de cor para Relay nem RADION.
- **Endereço:** `<nome>.absolutezro.com` (`CLAUDE.md` da raiz), então domínio próprio não pesa.
- **Nome provisório é possível:** o catálogo tem `provisional_name` ([`infra/migrations/0001_foundation.sql:184`](../../../../infra/migrations/0001_foundation.sql)), e o id técnico não muda quando o nome muda (`radio` → RADION, `finishing` → Revela, `nossom` → Quasar). O app pôde nascer com id neutro, `foto`, e ganhar o nome depois.
- **Não havia produto de foto no repositório:** as menções a "fotografia" estavam em Maestro, perfil profissional e Carro do Freela, não em um app de tratamento.

## 2. Os 25 candidatos

LUXON · Albedo · Magnitude · Latitude · Candela · Vesper · Umbra · Fulgor · Nitor · Cintila · Fóvea · Halo · Íris · Zênite · Fóton · Kelvin · Áurea · Latente · Lúcida · Helios · Pulsar · Fresnel · Quanta · Reluz · Aurora

Descartados antes da tabela, por conflito direto em fotografia:

| Nome | Motivo | Fonte |
| --- | --- | --- |
| Fóvea | **Fovea** é concorrente direto: culling por IA e edição RAW 14 bits no Mac, lançado em 2026, com galeria de cliente "Fovea Folio" | https://fovea-site.pages.dev/ · https://fovea-site.pages.dev/compare/aftershoot |
| Halo | Vários "Halo AI" de foto nas lojas, além do halo.camera | https://halo.camera/ai-photo-editor · https://apps.apple.com/app/id6740445587 · https://apps.apple.com/app/id6755928187 |
| Íris | IRIS é software de processamento de imagem astronômica | https://alternativeto.net/software/iris-astronomical-images-processing-software/about |
| Zênite | Zenit é marca histórica de câmeras (KMZ), relançada com a Leica em 2018 | https://en.wikipedia.org/wiki/Zenit_(camera) · https://techcrunch.com/2018/09/26/soviet-camera-company-zenit-is-reborn/ |
| Fóton | Photon é app de câmera (photon.cam) e há o "Photon Enhance"; Foton é marca de caminhões (de memória) | https://photon.cam/help/?p=278 · https://apps.apple.com/app/id1564356526 |
| Latente | "Latent: Pro Camera Studio" existe, e "latente" é conceito da Revela (`docs/decisions/0016-identidade-revela.md:10-11`) | https://mwm.ai/apps/latent-pro-camera-studio/6768866642 |
| Kelvin | Apps de luz e temperatura de cor com o nome (Kelvin: Light Panel, KelvinCam, Kelvy) | https://apps.apple.com/us/app/id1562608316 · https://apps.apple.com/lt/app/id6772284884 |
| Áurea | Aurea Cam, Camera Aurea e AureaCam são apps de composição fotográfica | https://www.productcool.com/product/aureacam · https://iphoneaddict.fr/apps/photo-video/camera-aurea-97.html |
| Aurora | Aurora HDR e Luminar são da Skylum (de memória); a busca só confirmou a Skylum/Luminar | https://vt.skylum.com/ |
| Lúcida, Helios, Pulsar, Fresnel, Quanta, Reluz | Não pesquisados. Lucida é família de fontes, Helios é lente soviética, Pulsar é relógio e moto, Quanta é fabricante de computadores (tudo de memória). Reluz e Fresnel soam pouco "plataforma grande" | — |

## 3. Os 10 melhores, com pesquisa de conflito

Risco se refere a software ou marca de fotografia com o mesmo nome. "Nada encontrado" quer dizer que a busca não devolveu produto de foto com o nome exato; não é garantia de marca livre.

| # | Nome | Significado | Por que combina com a família | Risco | Fonte |
| --- | --- | --- | --- | --- | --- |
| 1 | **LUXON** | Em física, partícula sem massa que anda sempre à velocidade da luz (o fóton é o exemplo); "lux" é luz em latim e a unidade de iluminância | Irmão direto do RADION (mesma terminação, caixa alta) e parente de Quasar e AEON; igual em português e inglês | **Baixo a médio.** Nenhum app de foto encontrado. Existem a biblioteca JavaScript Luxon (datas, só para devs), a Luxon LED (iluminação, Polônia) e os parecidos LUXEON (LEDs da Lumileds) e Luxion (ex-dona do KeyShot, hoje a empresa se chama KeyShot). Em foto há "Lux" (Halide) e "Leica LUX", que são outra palavra | https://en.wikipedia.org/wiki/Massive_particle · https://bestofjs.org/projects/luxon · https://www.crunchbase.com/organization/luxon-led · https://wiki.riteme.site/wiki/Luxeon · https://keyshot.com/keyshot-journey · https://leica-camera.com/en-AE/photography/leica-apps/leica-lux |
| 2 | **Albedo** | Fração da luz que uma superfície devolve, de 0 a 1; vem de _albus_, branco | Termo de astronomia como Quasar e Órbita; a escala começa no zero ("O futuro começa do zero."); é uma medida, o que casa com motor matemático; igual nas duas línguas | **Baixo a médio.** Nenhum editor de foto encontrado. Albedo (Albedo Space) é empresa de satélites que saiu de imagem para plataformas de satélite em 2025; "Albedo: A Reflectance App" é utilitário de nicho no iOS. "Albedo map" é termo genérico de 3D (de memória) | https://techcrunch.com/2024/06/14/albedo-takes-earth-observation-up-close-and-personal-from-very-low-earth-orbit · https://wikipedia.com/wiki/Albedo_Space · https://appadvice.com/app/albedo-a-reflectance-app/989649641 |
| 3 | **Magnitude** | Escala de brilho das estrelas; também "grandeza" | Astronomia; fala de classificar as melhores fotos, como se classificam estrelas; igual nas duas línguas. Contra: 4 sílabas | **Baixo a médio.** Nenhum produto de foto encontrado. Magnitude Software era empresa de dados corporativos, absorvida pela insightsoftware em 2021 | https://solutionsreview.com/enterprise-resource-planning/insightsoftware-announces-its-intent-to-acquire-magnitude · https://pitchbook.com/profiles/company/62586-37 |
| 4 | **Latitude** | "Latitude de exposição": quanto de erro de exposição a imagem aguenta, que é a margem de dynamic range pedida; também coordenada | Termo técnico exato do motor; igual nas duas línguas. Contra: a primeira leitura é geografia | **Médio.** "Latitude Camera" é app de carimbo de GPS em foto; Dell Latitude é linha de notebooks muito conhecida no Brasil (de memória) | https://spark.mwm.ai/en/apps/id/6736851725 |
| 5 | **Fulgor** | Brilho intenso, clarão (português e latim) | Palavra portuguesa forte e curta, como Revela, sem tocar em película | **Baixo.** Só Fulgor Milano (eletrodomésticos) e Fulgor Service (som, Itália). Contra: pouco reconhecível em inglês | https://apps.apple.com/it/app/fulgor-service/id1567262298?l=en-GB · https://www.appsruntheworld.com/customers-database/customers/view/fulgor-milano-italy |
| 6 | **Cintila** | Verbo "cintilar": a estrela que pisca; mesma raiz de centelha | Liga direto à centelha da marca (`docs/marca/README.md:7`); verbo em português como Revela, com som bem diferente | **Baixo.** Nada encontrado com o nome exato. Contra: não funciona em inglês e é mais delicado que "plataforma grande" | https://www.zoominfo.com/c/cintech-brasil/372469886 (só nomes parecidos apareceram) |
| 7 | **Nitor** | Latim: brilho, esplendor; raiz de "nítido" | Curto, com som de marca de tecnologia; fala de nitidez (foco, borrado) | **Baixo a médio.** Nitor Infotech (serviços de software, grupo Ascendion) e Nitor (consultoria de Helsinque); nenhum app de consumo. Soa perto de "Nitro" | https://www.nitorinfotech.com/datasheet/nitor-infotech-building-a-connected-engaged-world/ · https://www.cbinsights.com/company/nitor/alternatives-competitors |
| 8 | **Candela** | Unidade SI de intensidade luminosa; "vela" em latim | Unidade de medida de luz; igual nas duas línguas | **Médio.** Rollei Candela é linha de LED para foto com app próprio; Candela Medical (lasers); Candela (barcos elétricos); "Candela Fotógrafa de vida" é app de foto | https://apps.apple.com/us/app/id6459833083 · https://candelamedical.com/about-candela/ · https://candela.com · https://apps.apple.com/us/app/id6747926102 |
| 9 | **Vesper** | A estrela da tarde (Vênus); a hora dourada | Astronomia e a luz preferida de quem fotografa | **Médio.** Vários registros VESPER em software nos EUA (Garmin com registro vivo na classe 9, Vesper B.V. pendente desde 2026); Vaonis **Vespera** é telescópio de astrofotografia com app | https://trademark.justia.com/owners/vesper-technologies-l-l-c-5495510 · https://markinton.com/trademark/vesper-79452351 · https://support.vaonis.com/portal/en/kb/articles/will-it-be-possible-to-change-vespera-s-camera-settings-exposure-time-iso |
| 10 | **Umbra** | A sombra total de um eclipse | A marca já usou o eclipse ([`docs/decisions/0011-linguagem-da-familia.md`](../../../../docs/decisions/0011-linguagem-da-familia.md), tema claro do login); fala de sombras e dynamic range | **Médio.** Umbra é empresa de imagem de satélite por radar; há também marca de objetos de casa e empresa de 3D (de memória). Contra: sentido de sombra, não de luz | https://umbra.space/blog/the-future-of-radar-is-black-and-white/ · https://www.eoportal.org/satellite-missions/umbra-sar |

## 4. Top 3 recomendado

### 1º — LUXON

- **Por quê:** é o único que entra na família sem esforço: RADION e LUXON são o par rádio e luz, ambos com nome de partícula ("radion" como partícula é de memória). Carrega a promessa do motor, usar toda a luz que o RAW guardou, e tem porte de plataforma grande. Nenhum produto de foto com esse nome apareceu.
- **Assinatura:** "Toda a luz do arquivo." Alternativas: "Luz, do zero." e, em inglês como o RADION, "Every photon counts."
- **Símbolo (sugestão):** o anel do O atravessado por um único raio horizontal fino, que sai um pouco para dentro e para fora do traço, ecoando as pontas horizontais da centelha. Uma cor, sobre o azulejo grafite. Em movimento, o raio cruza o anel da esquerda para a direita e o anel fecha como diafragma até a forma parada; com "reduzir movimento", já aparece parado. Abaixo de 20 px, só o anel.
- **Cuidados:** conferir LUXEON (Lumileds) e Luxion na busca de marca; a biblioteca `luxon` do npm pode confundir em código (não era dependência do monorepo em 13/11/2026: não aparecia no `package-lock.json`).

### 2º — Albedo

- **Por quê:** palavra real de astronomia, bonita e igual nas duas línguas, com a escala de 0 a 1 que conversa com "do zero". Dá um tom mais calmo e editorial que LUXON, no espírito de Quasar.
- **Assinatura:** "Cada fóton conta." Alternativa: "A luz, medida."
- **Símbolo (sugestão):** o anel com metade preenchida, como a fase de um planeta: lado aceso chapado, lado escuro só no traço. Uma cor, sem degradê. Em movimento, o terminador (a linha entre luz e sombra) varre o disco e para na metade.
- **Cuidados:** a Albedo Space ainda existe e trabalhou com imagem; "albedo" é termo comum em 3D, o que pode disputar busca.

### 3º — Magnitude

- **Por quê:** é o nome que melhor fala da decupagem e da classificação, o lado Aftershoot do produto. Tem peso de plataforma e nenhum conflito em foto apareceu. Perde para os dois primeiros por ter 4 sílabas e não falar do motor RAW.
- **Assinatura:** "As melhores, primeiro." Alternativa: "Brilha quem merece."
- **Símbolo (sugestão):** o anel com três pontos de tamanhos decrescentes sobre o traço, como estrelas de magnitudes diferentes; o maior fica onde a centelha fica na marca-mãe. Uma cor. Em movimento, os pontos acendem do menor para o maior.

**Arquitetura de nomes (suposição do estudo):** usar os três juntos, como já acontece com "Quasar Presence" ([`docs/roadmap.md:898`](../../../../docs/roadmap.md)): **LUXON** como produto, **Latitude** como nome do motor de revelação e das margens de dynamic range, e **Magnitude** como nome da nota que classifica as fotos. Foi o que a [ARQUITETURA.md](../ARQUITETURA.md) adotou, como provisório.

**Cor do produto (suposição do estudo):** a tela de tratamento deve ser neutra perto da imagem, como a regra da Revela (`docs/decisions/0016-identidade-revela.md`, item "Fundo"). Para ícone e brilho, um ciano-esverdeado está livre na família e não repete azul nem laranja.

## 5. O que não foi verificado

- **INPI não foi consultado**, nem a base viva do USPTO. Antes de fechar o nome, falta a busca de marca nas classes 9 e 42; o ADR do Relay já prevê esse tipo de ajuste (`docs/decisions/0030-relay-conversao.md:3`).
- A busca usada cobre resultados dos EUA; marcas brasileiras homônimas podem não ter aparecido.
- App Store e Google Play não foram consultados diretamente, só via resultados de busca.
- Itens marcados "(de memória)" não têm fonte conferida.
