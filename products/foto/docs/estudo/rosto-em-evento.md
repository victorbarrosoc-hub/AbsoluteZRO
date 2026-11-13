# Achar minhas fotos pelo rosto: mercado, LGPD e prova técnica

Pesquisa de 13/11/2026. Marcas: **[V]** verificado nesta pesquisa (página lida, prova rodada ou arquivo conferido); **(de memória)** sem conferência nesta sessão; **(suposição)** inferência minha. Provas e saídas em `` (scripts na raiz, números em `saidas/`). Fotos do titular usadas só localmente; abaixo há só números agregados.

---

## A. Mercado

### A.1 Banlek: o que está confirmado

Fontes: página "vender fotos" [V] https://banlek.com/vender-fotos; serviços [V] https://ajuda.banlek.com/services; sobre [V] https://banlek.com/about; política de privacidade [V] https://banlek.com/politica-de-privacidade; textos da interface extraídos do pacote JS público de https://banlek.com/ em 13/11/2026 [V] (cópia das chaves de consentimento em `saidas/banlek-textos.txt`); Brazil Journal, 24/04/2025 [V] https://braziljournal.com/a-banlek-ja-vendeu-r-260-milhoes-em-fotos-foi-tudo-parar-no-instagram; Reclame Aqui, jun/2026 [V, pelo resumo da busca; a página devolveu 403] https://www.reclameaqui.com.br/banlek-servicos-audiovisuais-s-a/exploracao-de-imagem-sem-consentimento-em-evento-e-venda-indevida-de-fotos_vESFiwSaanOUkl3p/.

**Fotógrafo**
- Eventos, álbuns e fotos ilimitados; álbum público, não listado ou privado.
- **Banlek Uploader**: app de computador que vigia pastas e sobe fotos e vídeos em segundo plano; "Upload Turbo" (até 10× nos planos compatíveis). Se sobe original ou prévia: **não declarado**. A entrega ao comprador é "alta resolução, sem marca d'água", então o servidor guarda arquivo grande (suposição: o original ou perto dele).
- Preço por foto definido pelo fotógrafo (simulador de R$ 10 a R$ 200; média de R$ 20 segundo o Brazil Journal).
- Comissão: até 10% no plano grátis, 9% no Infinity (R$ 97/mês, Brazil Journal); opção de repassar a taxa ao comprador (0% para o fotógrafo). Impressos com comissão de até 70%.
- Marca d'água personalizada; link e QR do álbum; painel com eventos, equipe, clientes, pedidos, propostas, saldo e saques; saque por Pix ilimitado; venda no cartão liberada em 24 h.
- Vendas: cupons, desconto progressivo por quantidade ("Adicione mais 3 fotos e ganhe R$ 20 de desconto", "ganhe até X% off"), pacotes, créditos pré-pagos (compra por Pix), propostas e contrapropostas do fotógrafo, recuperação de carrinho abandonado, notificação de venda, cashback, impressos e quadros, vídeos (com busca facial e pacotes próprios).
- Sites personalizados e seleção/entrega (herança da fusão com a Epics).
- Serviço de evento: cobertura contratada, fotos em tempo real, impressão e retrato no local, rede de "mais de 100 mil" (serviços) ou "mais de 250 mil" (vender fotos) fotógrafos; 12 milhões de visitas/mês e 30+ países (alegações da própria empresa).

**Visitante**
- Busca por **selfie** ("Tire uma selfie ou envie uma foto do seu rosto"; câmera ou galeria).
- **Selfie só ao vivo por álbum**: "Por segurança e privacidade, este álbum só permite o uso de selfie tirada na hora".
- **Selfie expira**: "Por segurança a selfie expira. Tire outra para fazer uma nova busca".
- **Álbum restrito**: "As fotos do evento estão ocultas. Desbloqueie usando a busca facial acima"; sem permissão "você não poderá ver as fotos".
- **Busca em todos os álbuns de uma vez**: "Tire uma selfie e a gente procura você em todos os álbuns".
- **Pré-venda com selfie**: "Antes de pagar, envie uma selfie para vincular o reconhecimento facial à sua compra"; "Quando o fotógrafo liberar o evento, suas fotos serão encontradas e entregues automaticamente". Ou seja, a assinatura fica guardada até a publicação (suposição forte, pela redação).
- Busca por texto: "número, placa, marca ou patrocinador"; "Número na camiseta"; busca manual.
- Consentimento em tela própria ("Termo de Consentimento"): "Podemos usar uma selfie para encontrar suas fotos?", "Com a sua permissão, usaremos sua biometria facial…", botões "Permitir busca" / "Não autorizo", link para a política.
- Favoritos ("Seus favoritos"), carrinho (login exigido para salvar), Pix copia-e-cola ou QR (código expira em 10 min), cartão, download em .zip.
- Antiprint no app ("bloqueia 100% a captura de telas"); captura de tela "viola os termos" e bloqueia o acesso; desbloqueio é pedido ao fotógrafo.
- Contato por WhatsApp; opção "Ocultar telefone".

**Biometria (política e caso)**
- Política: selfie usada "strictly to allow the location of photographs", "immediately and automatically discarded"; **base legal citada: prevenção à fraude e segurança do titular em identificação e autenticação** (LGPD art. 11, II, "g"), não consentimento [V]. Banlek se declara controladora independente das fotos [V]. Menores: consentimento de um dos pais "quando exigido" [V].
- Reclame Aqui (jun/2026): a pessoa fotografada sem saber pediu a remoção e **teve de enviar nova selfie para isso**; o DPO respondeu que o código facial é processado e descartado "diretamente pela AWS" e que fotos não compradas são apagadas "após o prazo legal". Reclamação marcada como não resolvida.

### A.2 Comparativo

| Plataforma | Busca do visitante | Selfie ao vivo / cadastro | Cobrança | Biometria: base legal, retenção | Precisão anunciada |
|---|---|---|---|---|---|
| **Banlek** (BR) | selfie; número/texto; manual; todos os álbuns | opcional por álbum / login para carrinho | 9–10% ou repasse; Pix, cartão, créditos | fraude/segurança (11 II g); descarte imediato; pré-venda guarda até publicar [V] | não declarada |
| **Fotop** (BR) | foto do rosto; evento por nome/data | não dito / login para comprar [V] | não encontrada | "consente" ao enviar; descarte imediato; na compra antecipada guarda até a entrega; "hash irreversível"; recurso tem de ser ligado **antes** do upload [V] https://faq.fotop.com/portal/en/kb/articles/facial-recognition-search · https://fotop.com.br/fotos/index/termos-privacidade-en/ | não |
| **Foco Radical** (BR) | reconhecimento facial também em vídeo (alegação) [V fraco] https://force.fotosby.com.br/site/empresa | — | — | não encontrada | — |
| **Fotto** (Alboom Inc., app de 24/07/2026) | selfie | — | Pix ou cartão; foto sem marca na hora; entrega por WhatsApp [V] https://mwm.ai/apps/fotto/6784430684; 10% de comissão [V no estudo anterior, `docs/estudo/cliente-e-estilo.md`] | não encontrada | — |
| **Alboom Proof** | reconhecimento facial "em beta" [V no estudo anterior] | cadastro obrigatório para seleção | Alboom Pay (Pix, cartão, boleto) | — | — |
| **Epics** (fundida à Banlek) | seleção e entrega; busca facial **não confirmada** | — | — | — | — |
| **Pic-Time** (galeria) | Selfie Search | refaz a selfie a cada sessão [V] | assinatura do fotógrafo (de memória) | FAQ diz "não guardamos" e a política diz que guarda "pelo período do contrato com o fotógrafo": **contradição** [V] https://help.pic-time.com/en/articles/9655398-does-pic-time-store-biometric-data · https://www.pic-time.com/legal/biometric-data-retention-policy | não |
| **GeoSnapShot** (esporte) | selfie e número de peito (organizador desliga) | — | 70% para quem vende, 30% plataforma; cadastro grátis ou taxa por foto enviada [V] https://help.geosnapshot.com/en/articles/16831191-faqs-for-event-organisers | não lida | não |
| **SpotMyPhotos** | "consent-based facial and pattern recognition"; cadastro antes do evento; modo sem reconhecimento [V] https://help.spotmyphotos.com/en/articles/15831042-how-spotmyphotos-matches-guests-to-their-photos | pré-cadastro | US$ 195–295/mês (terceiros) | opt-in prévio | não |
| **Waldo** | rosto, foco em acampamento infantil (críticas em 2018) [V] https://www.biometricupdate.com/201807/facial-recognition-is-at-summer-camp-and-being-offered-free-to-schools | "100% opt-in" (alegação) | US$ 7,99 premium; pacote de evento US$ 99,99 (App Store) | não lida | — |
| **Kwikpic** | selfie | cadastro do convidado | sob consulta | — | "até 99,9%" (G2) [V] https://www.g2.com/products/kwikpic/reviews |
| **FotoOwl** | selfie | — | por plano | consentimento; selfie guardada "só pelo tempo da busca"; não fala de crianças [V] https://fotoowl.ai/consent | "99,8%" [V] https://fotoowl.ai/ai-gallery |
| **ZNO** | reconhecimento facial na galeria; **desligado acima de 3.000 fotos** [V pelo resumo] https://help.zno.com/hc/en-us/articles/40254393194647-Reconocimiento-Facial-Mediante-IA | — | — | — | — |

Reclamações recorrentes: remoção exige nova biometria (Banlek); fotos de terceiros à venda sem saber (Banlek); França, mar/2025: fornecedor de fotos de corrida (PhotoRunning) aplicou reconhecimento facial em 48 eventos e cerca de 320 mil pessoas, inclusive menores e espectadores; queixa à CNIL sobre a meia-maratona de Montpellier, CNIL mandou carta ao organizador, sem sanção conhecida [V] https://next.ink/176161/courses-a-pied-participants-et-public-illegalement-soumis-a-la-reconnaissance-faciale/. Nenhuma plataforma publica precisão medida em foto de evento; os "99,8–99,9%" são de marketing.

### A.3 Fluxo ideal mínimo de "achar minhas fotos"

1. **Fotógrafo** cria o evento; "Achar minhas fotos" vem **desligado**. Ao ligar: aviso curto, marca se há crianças, aceita o termo de controlador e baixa o cartaz com QR.
2. O app calcula as assinaturas **no aparelho**, na prévia limpa (antes da marca-d'água), e sobe só a prévia de 2048 px com marca (já é o que o `foto` faz) + um vetor int8 por rosto.
3. **Visitante** abre o link ou o QR → uma tela: "Achar suas fotos pelo rosto?" [Permitir] [Agora não].
4. Câmera ao vivo com moldura oval e dica em tempo real (luz, distância, nitidez). Três quadros automáticos: de frente e com leve giro.
5. No celular: detecção → qualidade → assinatura. Sobe só o vetor (ou os três). O servidor compara dentro do evento, devolve só os IDs das fotos em duas faixas e esquece o vetor.
6. Grade "Suas fotos" + "Talvez seja você" (recolhida) → favoritar / "Não sou eu" / baixar ou selecionar → "Esquecer agora" (apaga até o vetor guardado no próprio celular).
7. Saída lateral sempre visível: "Não quero aparecer na busca" (fluxo de remoção, seção B).

### A.4 Dez melhorias sobre a Banlek

1. Selfie nunca sai do celular (a Banlek manda para a AWS).
2. Remoção do próprio rosto sem entregar foto a terceiro: o vetor é calculado no celular, apaga os rostos parecidos do evento e é descartado. Responde à reclamação do Reclame Aqui.
3. Duas faixas explicadas ("É você" e "Talvez seja você"), em vez de um resultado único.
4. Três quadros automáticos com regra "2 de 3 concordam" (medido: menos falsos e mais acertos, C.9).
5. Guia de captura em tempo real com os portões medidos de nitidez e luz (C.10).
6. Sem busca entre eventos e sem pré-venda que guarda selfie no servidor. Quem volta depois tem a busca refeita sozinha com o vetor guardado **só no próprio celular** (IndexedDB, com "Esquecer").
7. Rosto colado em outro, perfil e rosto pequeno caem em "Talvez" (medido: rostos colados deram cosseno 0,86 entre pessoas diferentes).
8. Prazo visível: "As assinaturas deste evento somem em 12 dias".
9. Cartaz e texto para regulamento ou inscrição gerados prontos (aviso no local).
10. Modo privado ("cada um só vê as suas") com selfie obrigatoriamente ao vivo e prova de presença honesta. Depois: número de peito por OCR no aparelho.

### A.5 O que depende de pagamento online

Depende: carrinho, preço por foto ou pacote, Pix e cartão, comissão e split, saque, cupom, desconto progressivo, créditos, pré-venda, propostas e contrapropostas, recuperação de carrinho, cashback, impressos, nota fiscal ou intermediação, e **entrega em alta sem marca**. Esta última também colide com a regra 1 (o original não sai do aparelho): ou o fotógrafo sobe a alta só da foto vendida, ou entrega por fora. Decisão do titular.

Não depende: busca por rosto, favoritos, seleção (já existe no `foto`), download da prévia com marca, envio da lista ao fotógrafo, remoção do rosto. Há ainda o "Não fingir saldo" da raiz: nada de preço ou carrinho antes de existir pagamento de verdade.

---

## B. LGPD e segurança (tudo aqui pede revisão jurídica)

### B.1 Texto da lei

Conferido no texto consolidado da Câmara https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html (cópia local lida nesta sessão) [V]:

- **Art. 5º II**: dado "genético ou biométrico, quando vinculado a uma pessoa natural" é sensível.
- **Art. 11 I**: consentimento "de forma específica e destacada, para finalidades específicas". **11 II "g"**: sem consentimento, só se "indispensável" para "prevenção à fraude e à segurança do titular, nos processos de identificação e autenticação de cadastro em sistemas eletrônicos". É a base que a Banlek usa; achar foto à venda não é autenticar cadastro. Leitura minha: base fraca.
- **Art. 14 §1º**: dados de criança exigem "consentimento específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal". §2º: manter pública a informação sobre os tipos de dados e o exercício dos direitos.
- **Art. 18**: confirmação, acesso, correção, anonimização, bloqueio ou eliminação, portabilidade, **eliminação dos dados tratados com consentimento (VI)**, informação sobre a possibilidade de não consentir e as consequências (VIII), **revogação (IX)**. Art. 8º §5º: revogação "por procedimento gratuito e facilitado".
- Art. 16: eliminar após o fim do tratamento. Art. 37: registro das operações (controlador e operador). Art. 38: RIPD, inclusive de dados sensíveis, quando a ANPD determinar. Art. 39: o operador segue as instruções do controlador.
- **Art. 46**: medidas de segurança; §2º "desde a fase de concepção". Art. 52 II: multa de até 2% do faturamento, limitada a R$ 50 milhões por infração.
- Art. 4º I: a exceção de uso particular não vale para fotógrafo profissional (conferido no estudo anterior).

### B.2 ANPD

- Agenda regulatória 2025–2026: "Dados Pessoais Sensíveis – Dados Biométricos" é o **item 4**, "Em andamento". Tomada de subsídios de junho a agosto de 2025, nota técnica e webinário em 12/2025. **Sem minuta, sem consulta pública e sem resolução** listadas em 13/11/2026 [V] https://www.gov.br/anpd/pt-br/assuntos/regulacao/agenda-regulatoria-1. O estudo anterior chamava de item 5: está errado.
- **Nota Técnica nº 23/2025/CON1/CGN/ANPD** (SEI 00261.001953/2025-81, assinada de 21 a 26/11/2025; lida no PDF baixado em `anpd/`, URL de origem não registrada). Consolida 1.594 contribuições e não é norma. Pontos úteis:
  - guardar o **template em vez da imagem bruta**;
  - **armazenamento no dispositivo do titular** ou cifrado com chave dele ("custódia do titular");
  - política de retenção com prazos e descarte seguro;
  - RIPD prévio;
  - transparência sobre a impossibilidade de eliminar.
- Radar Tecnológico nº 2 (24/06/2024): template biométrico como dado crítico (do estudo anterior).
- Fiscalização: 23 clubes de futebol por reconhecimento facial em ingresso e entrada (fev/2025) [V] https://legismap.com.br/conteudos/artigos-e-noticias/anpd-fiscaliza-uso-de-sistema-de-reconhecimento-facial-na-venda-de-ingressos-e-na-entrada-de-estadios-por-23-clubes-de-futebol.

### B.3 Casos e multas

- **Brasil**
  - ViaQuatro (metrô de SP, ação do Idec). O TJSP elevou a condenação para R$ 500 mil em 2023 por câmeras que "só detectavam" rosto e emoção para publicidade, sem consentimento [V] https://teletime.com.br/12/05/2023/tj-sp-mantem-decisao-contra-concessionaria-de-metro-pelo-uso-indevido-de-dados-biometricos/. Lição: até a detecção com fim comercial, sem aviso, foi condenada.
  - Banlek no Reclame Aqui (acima). Nenhum caso da ANPD ou do Procon contra plataforma de fotos de evento foi achado.
- **Europa**
  - AEPD × GSMA (MWC 2021): € 200 mil por falta de DPIA; o tribunal disse que o fato de ser voluntário era "irrelevante" [V] https://www.biometricupdate.com/202305/spain-fines-mobile-world-congress-200000-euros-for-facial-recognition-use.
  - Escola sueca (2019): 200 mil SEK [V] https://hunton.com/privacy-and-information-security-law/swedish-data-protection-authority-issues-first-fine-under-gdpr.
  - Clearview: € 30,5 milhões na Holanda [V] https://www.pinsentmasons.com/en-gb/out-law/news/dutch-pa-fines-facial-recognition-company-gdpr-breach; € 20 milhões na CNIL (de memória quanto à data, 2022).
  - Corridas na França (acima): queixa sem sanção.
- **Não achei multa específica de busca por selfie em galeria de evento**, nem no Brasil nem na Europa.

### B.4 Requisitos de produto

**Quem é quem** (revisão jurídica)
- O fotógrafo ou organizador é **controlador**: decide fotografar, publicar e ligar a busca. A ZRO é **operadora** (guarda vetores e compara sob instrução, art. 39).
- Risco: a ZRO escolhe o modelo e o limiar, o que pode fazer dela co-controladora. Termo de operador no aceite do fotógrafo + registro das operações (art. 37) + RIPD-modelo pronto para o fotógrafo.

**O ponto que mais pesa**
- As pessoas fotografadas que nunca buscaram não consentiram com a criação da assinatura do rosto delas.
- A regra 5 atual (modelo A) guarda no servidor o vetor de **todos** os rostos do evento.
- Alternativa (modelo B, **muda a regra 5**, decisão do titular):
  - quem quer ser achado dá consentimento antes ou durante o evento, e o vetor dele fica guardado com consentimento até o evento acabar;
  - o aparelho do fotógrafo compara localmente e sobe só a ligação "foto X ↔ pessoa que consentiu";
  - **nenhum vetor de quem não consentiu vai ao servidor**.
- B protege melhor o terceiro e casa com a nota da ANPD. Custo: quem chega depois precisa que o fotógrafo rode de novo.
- Recomendação: lançar com A só em evento com **aviso prévio** (inscrição ou convite + cartaz) e prazo curto. Avaliar B para corridas e eventos grandes.

**Texto de consentimento do visitante** (curto; o art. 11 I pede "destacado": tela própria, sem caixa pré-marcada)
- **Achar suas fotos pelo rosto?**
- "Vamos comparar seu rosto com as fotos deste evento. A selfie fica no seu celular. Só uma assinatura do rosto, uma sequência de números, vai para a comparação, e é apagada em seguida."
- [Permitir] [Agora não] · "Como funciona e seus direitos"
- Caixa obrigatória: "Tenho 18 anos ou mais, ou sou responsável por quem aparece na selfie."

**Texto do fotógrafo ao ligar**
- "Achar minhas fotos cria uma assinatura do rosto de cada pessoa nas fotos deste evento. Avise quem participa (cartaz e inscrição). As assinaturas somem em {data} ou quando você encerrar o evento."

**Aviso no evento** (cartaz A4 com QR, gerado pelo app)
- "Neste evento você pode achar suas fotos pelo rosto. A selfie não sai do seu celular. Não quer aparecer na busca? Aponte aqui."
- Texto pronto para o regulamento ou inscrição.

**Retenção**
- Vetores das fotos: apagados quando a galeria encerra, vence ou é apagada (cascade); teto proposto de 30 dias após publicar, prorrogável pelo fotógrafo uma vez. O prazo é suposição de produto e pede jurídico.
- Vetor da busca: nunca gravado; nada em log, APM ou trace. Body da rota fora de qualquer log.
- No celular do visitante: vetor em IndexedDB só se ele marcar "Lembrar neste celular", com "Esquecer".

**Exclusão a pedido**, em três caminhos:
- **(a) Pelo visitante, sem entregar foto.** Selfie ao vivo → vetor no celular → servidor mostra as fotos ≥ 0,45 → a pessoa confirma → apaga os vetores desses rostos e marca os rostos como "não buscar". Vale também para o resto do evento: os vetores novos da mesma galeria são comparados com a lista de remoção do evento, que guarda só o vetor de quem pediu a remoção, com consentimento, até o fim do evento. O ponto pede jurídico.
- **(b) Pelo fotógrafo**, no app: marcar um rosto como "não buscar".
- **(c) Sem biometria**: pedido por e-mail ao fotógrafo, que acha as fotos à mão.

**Menores**
- Evento marcado "com crianças": busca **bloqueada**, salvo declaração do organizador de que colheu o consentimento dos pais (art. 14 §1º).
- No visitante: a caixa "18+ ou responsável".
- ECA Digital (Lei 15.211/2025): obrigações a conferir (de memória).

**Registro de consentimento sem biometria**
- Tabela `foto.consentimentos(id, galeria_id, tipo 'busca'|'remocao'|'ativacao', versao_texto, sha256_texto, criado_em, link_id, resultado 'aceitou'|'recusou')`.
- Sem IP completo (no máximo hash com sal rotativo), sem vetor, sem imagem, sem contagem de achados.
- Retenção do registro maior que a dos vetores, para provar o consentimento. Prazo pede jurídico.

**Não afirmar "hash irreversível"** (a Fotop afirma). Medido: até o vetor reduzido a **1 bit por dimensão (16 bytes)** ainda verifica pessoas com **97,47%** de acerto no LFW. Vetor binarizado continua sendo biométrico. Inversão do template para um rosto aproximado é conhecida na literatura (de memória).

### B.5 Salvaguardas contra abuso (perseguição por foto de rede social)

- Busca só dentro de **um** evento; nada de busca entre eventos ou "em todos os álbuns".
- O servidor nunca devolve vetores ao cliente. Ele devolve só IDs de fotos em duas faixas, sem nota numérica e sem caixa do rosto; limite de 200 resultados.
- Limite de taxa por link, IP e aparelho. Proposta: 5 buscas em 10 min, 30 por dia por link e IP; alerta ao fotógrafo em pico.
- Validação do vetor: 128 números finitos com norma perto de 1. Isso não prova que veio de câmera. Por isso o modo privado ("só vê as suas") exige captura ao vivo, sem `<input type=file>`, e prova de presença (C.11).
- Tabela de vetores fora do alcance do papel `foto_app`. Comparação por função `security definer` que só devolve IDs e respeita link válido, PIN e prazo. RLS e teste de isolamento como manda a raiz.
- Rosto colado em outro, perfil, ≤ 24 px ou nota < 0,75: fica fora de "É você".
- RIPD-modelo; resposta a incidente (art. 48, de memória quanto ao número).
- Modelos servidos do próprio domínio: medido 0 pedido para fora com a CSP atual.

---

## C. Prova técnica (números)

Máquina: contêiner Linux, 4 vCPU; **Chromium 153 headless** (Playwright do `products/foto`); `onnxruntime-web@1.31.1`; servidor local com os cabeçalhos do `products/foto/vercel.json` (CSP com `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self' blob: data:`, COOP same-origin, **sem COEP**). Medido: `crossOriginIsolated=false`, `SharedArrayBuffer` indefinido, `numThreads=1`, **0 pedido para fora**.

### C.1 O que o celular do visitante baixa [V]

`saidas/tamanhos.txt` e `saidas/tamanhos-mp.txt`: brotli q11 e sha256.

| Arquivo | Bruto | gzip -9 | brotli 11 | sha256 |
|---|---|---|---|---|
| `ort.wasm.min.mjs` | 53.725 | 17.191 | 15.409 | `c21d9c32…8234` |
| `ort-wasm-simd-threaded.mjs` | 24.738 | 9.216 | 8.138 | `30ed0b5c…dac3` |
| `ort-wasm-simd-threaded.wasm` (serve também com 1 thread) | 14.848.852 | 3.827.372 | **2.390.236** | `4b884c20…001d` |
| YuNet `face_detection_yunet_2023mar.onnx` | 232.589 | 202.424 | 199.222 | `8f2383e4…2fa4` |
| YuNet com entrada dinâmica (`dinamico.py`) | 229.657 | 201.970 | 198.971 | `c42f6203…2303` |
| SFace fp32 `face_recognition_sface_2021dec.onnx` | 38.696.353 | 35.880.256 | 35.491.874 | `0ba9fbfa…4e79` |
| SFace int8 (QLinear, opencv_zoo) | 9.896.933 | 6.896.746 | 6.750.758 | `2b0e941e…d78a` |
| **SFace p8** (pesos int8 por canal, conta em fp32; `comprimir.py`) | 9.943.427 | 8.168.778 | **8.025.308** | `541a3ebb…cb79` |
| *alternativa* MediaPipe `vision_bundle.mjs` | 155.990 | 45.133 | 38.251 | `fb0c02c2…a9b5` |
| *alternativa* `vision_wasm_module_internal.wasm` | 14.665.738 | 4.168.800 | 2.839.376 | `a269e84b…9e46` |
| *alternativa* BlazeFace short / full | 229.746 / 1.083.786 | — | 186.561 / 912.953 | `b4578f35…152f` / `3698b18f…181b` |

- **Total do visitante com YuNet + SFace p8: ≈ 10,6 MB brotli** (2,41 runtime + 0,20 + 8,03).
- Com fp32: ≈ 38,1 MB. Com int8: ≈ 9,4 MB, mas 6× mais lento.
- MediaPipe no lugar do YuNet soma ≈ 3,1 MB, porque o ORT continua necessário para o SFace.

### C.2 Tempos em uma thread, sem COOP+COEP [V]

`saidas/prova1-cheia.txt`, `prova1-cheia-p8.txt`, `prova1-freio4.txt`.

| Medida (mediana) | CPU cheia, worker | CPU 4× mais lenta (CDP), página |
|---|---|---|
| runtime + 1º modelo prontos | 886–911 ms | 1.929 ms |
| YuNet 640×640 | 47 ms (ponta a ponta 49 ms) | 230 ms |
| YuNet dinâmico 320×320 (selfie) | **12,7 ms** | **58–60 ms** |
| SFace fp32 | 55,3–55,8 ms | 253–268 ms |
| **SFace p8** | **54,1 ms** | **253,5 ms** |
| SFace int8 | 326–329 ms | 1.428 ms |
| BlazeFace short / full (MediaPipe, LFW 250 px) | 6,4 / 16 ms; YuNet nas mesmas fotos 59 ms | — |

- O YuNet do opencv_zoo **recusa 320×320** ("invalid dimensions"). Com a entrada tornada dinâmica (`dinamico.py`, mesmos pesos) aceita 320, 480×640 e 1088×1632.
- Selfie de ponta a ponta num celular intermediário (freio 4×), depois do download: ≈ 1,9 s para preparar + 0,06 s de detecção + 0,25 s por quadro. Três quadros: **≈ 3 s**.
- O freio 4× **não é celular de verdade**: celular real não medido.

### C.3 Pipeline conferido contra o OpenCV [V]

`prova1`: 39 imagens públicas, 66 rostos.
- Decodificação do YuNet em JS: caixas e 5 pontos idênticos ao `cv.FaceDetectorYN` (diferença máxima 0,0001 px); nota idêntica; 0 faltou, 0 sobrou.
- **Entrada do YuNet: BGR 0–255 sem normalizar, NCHW, 640×640.** Saídas `cls/obj/bbox/kps` nos passos 8, 16 e 32; nota = √(cls·obj).
- **SFace: entrada `data` [1,3,112,112] em RGB 0–255, NCHW.** A normalização mora dentro do grafo: os primeiros nós são `Sub 127,5` e `Mul 0,0078125` (lidos no ONNX). Saída `fc1` [1,128], depois normalizar L2.
  - Recorte do OpenCV em RGB: cosseno **1,0000** com o `FaceRecognizerSF`.
  - Em BGR (errado): mediana 0,939, mínimo 0,768. Errar a ordem não quebra tudo, mas degrada.
- Alinhamento: semelhança de Umeyama sem reflexão, 5 pontos → molde ArcFace 112: `[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]]`. Ordem dos pontos do YuNet: olho direito (lado esquerdo da imagem), olho esquerdo, nariz, canto direito e canto esquerdo da boca.
  - Canvas do navegador contra `alignCrop` do OpenCV: cosseno mediana **0,9947**, mínimo 0,9175.

### C.4 fp32 × int8 × p8, e misturar os lados [V]

`saidas/lfw.txt`: LFW funneled, 13.233 fotos, 5.749 pessoas, rosto mais central; protocolo de 6.000 pares em 10 dobras.

| Selfie × fotos do evento | Acerto | Limiar ótimo | No 0,363: mesma recusada / outra aceita | No 0,45 |
|---|---|---|---|---|
| fp32 × fp32 | **99,40% ± 0,38** (o README declara 0,9940) | 0,334 | 1,47% / 0,10% | 4,30% / 0,00% |
| int8 × int8 | 99,15% ± 0,45 | 0,316 | 1,73% / 0,07% | 4,87% / 0,00% |
| **int8 × fp32 (misturado)** | 99,33% ± 0,42 | 0,311 | 1,73% / 0,07% | 4,53% / 0,00% |
| p8 × fp32 | 99,33% ± 0,38 | 0,319 | 1,47% / 0,10% | 4,33% / 0,00% |
| p8 × p8 | 99,40% ± 0,36 | 0,316 | 1,50% / 0,07% | 4,27% / 0,00% |
| fp32 × vetor guardado em int8 | 99,35% | 0,331 | 1,47% / 0,10% | 4,30% / 0,00% |
| 4 bits por dimensão | 99,47% | 0,320 | — | — |
| 1 bit por dimensão (16 bytes) | 97,47% | 0,235 | 19,47% / 0,03% | — |

- Mesmo recorte, cos(fp32, int8): mediana 0,972, mínimo 0,928. cos(fp32, p8): mediana 0,9996, mínimo 0,9987.
- Fotos reais: cos(fp32, int8) mediana 0,97–0,98 e mínimo 0,87; p8 mínimo 0,9968.
- **Misturar funciona**: a perda é de 0,07 ponto no LFW. Com p8 nos dois lados não há mistura e o arquivo é ¼ do fp32, na mesma velocidade.

### C.5 Fotos reais do titular [V] (`saidas/analisa2-*.txt`, `analisa-ensaio.txt`)

- **Esporte** (21 ARW, prévia embutida 3072×4608): 56 detecções, 43 com nota ≥ 0,7.
  - 1 a 5 rostos por foto (mediana 1).
  - Largura do rosto no arquivo de 171 a 833 px (mediana 575); na prévia de 1616 seria ~314 px.
  - Agrupado (ligação média, 0,40, sem juntar dois rostos da mesma foto): pares no mesmo grupo de 0,51 a 0,95 (mediana 0,70); pares de grupos diferentes com máximo 0,44 e p99 0,36.
  - Pares na mesma foto (certeza de pessoas diferentes): máximo 0,38.
  - Pessoa principal (13 rostos) contra o próprio centroide: mínimo 0,70, mediana 0,85. Melhor outro grupo: máximo 0,35.
- **Ensaio de casal** (23 JPEG de 2536×3804 a 6000×4000): 44 detecções.
  - **Rotuladas à mão**, por folha de contato local já apagada: 32 rostos reais (duas pessoas) e 12 falsos ou inúteis.
  - 0 a 2 rostos por foto; largura de 69 a 517 px (mediana 161).
  - Nota do detector ≥ 0,75 mantém 30/32 reais e 0/12 falsos; ≥ 0,7 mantém 32/32 e 2/12.
  - Muito perfil: 6 de frente, 7 meio-perfil, 11 perfil, 8 colados.
  - Cosseno por tipo de par:

    | Par | Mesma pessoa | Pessoas diferentes |
    |---|---|---|
    | frente × frente | mediana **0,74** (mínimo 0,25) | máximo **0,19** |
    | frente × meio-perfil | mediana 0,56 | máximo 0,24 |
    | frente × perfil | mediana 0,33 (39% ≥ 0,363) | máximo 0,33 |
    | perfil × perfil | — | máximo 0,38 |

  - **Rostos colados** (caixas que se invadem, beijo ou rosto com rosto): cosseno **0,86 e 0,74 entre pessoas diferentes**. O recorte alinhado de um pega o outro, e é a origem do p99 0,74 de "outra pessoa".
- **Casamento** (5 ARW): 16 detecções, 11 ≥ 0,7, de 0 a 4 por foto. Dois rostos de 149–200 px só apareceram na varredura do arquivo cheio (127 passadas). Amostra pequena: não conclui.
- **Orientação**: a prévia embutida do ARW não vem girada. Sem aplicar o EXIF, o esporte caiu de **38 para 8** rostos (nota ≥ 0,75) e o casamento de 8 para 3. É obrigatório girar antes de detectar.

### C.6 Menor rosto que ainda casa [V]

Rostos ≥ 160 px reduzidos até t px de largura, com detector e pontos do próprio YuNet; nota = cosseno com o centroide do grupo, sem o próprio rosto.

| Largura | Esporte (n=13): detector acha / mediana / ≥ 0,363 | Ensaio agrupado (n=10) | Ensaio rotulado (n=13, muito perfil) |
|---|---|---|---|
| 48 px | 100% / 0,85 / 100% | 100% / 0,72 / 90% | 100% / 0,58 / 77% |
| 32 px | 100% / 0,79 / 100% | 100% / 0,72 / 90% | 92% / 0,56 / 83% |
| **24 px** | 100% / **0,69** / 100% | 100% / 0,65 / 100% | 100% / 0,47 / 69% |
| 20 px | 100% / 0,63 / 100% | 90% / 0,60 / 89% | 85% / 0,41 / 73% |
| 16 px | 77% / 0,48 / 90% | 90% / 0,51 / 89% | 77% / 0,39 / 50% |
| 12 px | 62% / 0,24 / 13% | 80% / 0,34 / 38% | 62% / 0,29 / 38% |

- Falso (melhor outro grupo) fica entre 0,33 e 0,51 em todas as larguras.
- **Piso: indexar a partir de 24 px de largura da caixa**; de 20 a 24 px só "Talvez"; abaixo de 20 px, descartar. O piso é suposição, apoiada em n = 36.

### C.7 Detectar em 1024 × 1616 × arquivo cheio [V]

- Achados por passada, ensaio rotulado (32 rostos):

  | Passada | Reais achados | Falsos |
  |---|---|---|
  | 640 | 28 | 1 |
  | 1024 | 31 | 6 |
  | **1616** | **32** | 2 |
  | 2560 | 32 | 3 |
  | cheio | 31 | 6 |

- Esporte, rostos de 112–200 px: 1024 achou 50%, **1616 achou 100%**.
- Tempo por foto, worker, CPU cheia, 1616 = passada global de 640 + 6 ladrilhos de 640 com sobra de 128: **mediana 383–398 ms**. Em 1024: 321 ms; no arquivo cheio: 4,7 s.
- Recortar da prévia ou do cheio dá praticamente o mesmo:
  - esporte: 0,86 recortando da prévia 1616, 0,87 do cheio;
  - ensaio rotulado: 0,53 na prévia 1616 e 0,54 do cheio.
  - Na prévia de 1024, rosto de 24–40 px perde: 0,61 contra 0,69 recortando do cheio.
- **Conclusão: detectar e recortar na prévia de 1616**, limpa, antes da marca-d'água (a galeria do `foto` sobe 2048 px com marca). Não precisa revelar o RAW.

### C.8 YuNet × BlazeFace e o alinhamento de 4 pontos [V]

`prova3.mjs` e `saidas/analisa3.txt`: 1.583 fotos do LFW, 2 dobras, 1.200 pares.
- BlazeFace dá olhos, ponta do nariz, centro da boca e orelhas, sem cantos da boca. Alinhado com 4 pontos (centro da boca = média dos cantos do molde), o vetor **muda**: cos com o YuNet de 5 pontos tem mediana 0,944 e p1 0,786. Os pontos dos olhos e do nariz diferem em mediana 0,14 da distância entre os olhos.
- Acerto de pares quase igual: YuNet × YuNet 99,58%; Blaze-curto (selfie) × YuNet (evento) 99,75%; Blaze × Blaze 99,75%. Com 1.200 pares, a resolução é de cerca de 0,1 ponto.
- **Escolha: YuNet nos dois lados.** Mesmo alinhamento, 0,2 MB contra +3,1 MB do MediaPipe, e o mesmo runtime do SFace. O Blaze é 4–9× mais rápido, mas na selfie isso não importa (12,7 ms com YuNet em 320).

### C.9 Busca, limiares e várias selfies [V]

- **Evento simulado** (`lfw.txt`): galeria com os 13.233 rostos do LFW, 9.164 sondas. Taxa de falso por comparação, selfie fp32:

  | Limiar | Acha da própria pessoa | Falsos por busca (13 mil rostos) | Taxa por comparação |
  |---|---|---|---|
  | 0,363 | 99,8% | 16,6 | 1,26e-3 |
  | 0,40 | 99,7% | 4,4 | 3,31e-4 |
  | 0,45 | 99,2% | 0,78 | 5,95e-5 |
  | **0,50** | 98,0% | 0,14 | **1,10e-5** |
  | 0,55 | 94,8% | 0,02 | 1,8e-6 |

  O LFW é rosto de frente, de ~96 px, e uma só pessoa tem 530 fotos, então o "acha" sai otimista. Em foto real com perfil (ensaio rotulado), uma selfie de frente achou **56%** dos rostos da pessoa no 0,363 (0% da outra), 50% no 0,40 e 44% no 0,45; no 0,30 achou 65%, mas aceitou 8% da outra.
- **Escala**: falsos esperados por busca ≈ rostos no evento × taxa.
  - Evento de 3.000 fotos × 2 rostos = 6 mil rostos: ≈ 0,07 falso no 0,50 e ≈ 2 no 0,40.
  - 100 mil rostos: ≈ 1,1 no 0,50 e ≈ 33 no 0,40.
- **Várias selfies** (423 pessoas com 5+ fotos; 3 fotos fazem o papel de selfie):

  | Regra | No 0,45: acha / falsos por busca | No 0,40 | No 0,50 |
  |---|---|---|---|
  | 1 selfie | 97,8% / 0,56 | 99,0% / 3,87 | 95,5% / 0,07 |
  | média das 3 | 99,6% / 1,57 | — | — |
  | **2 de 3 concordam** | **98,6% / 0,30** | 99,5% / 1,65 | 96,7% / 0,03 |

- **Busca em duas passadas** (expansão, `saidas/expansao.txt`): no ensaio, 0,45 → 0,40 sobe de 40% para 61% com 1/91 falso. No LFW, 0,50 → 0,45 multiplica os falsos por 16 (1,79 por busca). **Não usar como padrão.**
- **Limiares recomendados** (SFace, cosseno de vetores L2):
  - **"É você"**: ≥ 0,50 com uma selfie, ou ≥ 0,45 com 2 de 3 quadros concordando. Só rosto ≥ 24 px, nota do detector ≥ 0,75 e não colado.
  - **"Talvez seja você"**: de 0,40 a "É você", ou rosto de 20–24 px, colado ou de perfil (guinada ≥ 0,3) acima de 0,40. Fica recolhido e é rotulado.
  - Abaixo de 0,40: nada.
  - O 0,363 do OpenCV (de memória: limiar do demo do opencv_zoo) é frouxo demais para eventos grandes.

### C.10 Qualidade da selfie [V] (`saidas/selfie_qualidade.txt`)

Teste: 250 pares da mesma pessoa no LFW; a selfie é degradada no recorte de 112.

| Degradação da selfie | Cosseno mediano | ≥ 0,45 |
|---|---|---|
| intacta | 0,68 | 96% |
| espelhada | 0,68 | 96% |
| borrão σ1 | 0,67 | 95% |
| borrão σ2 | 0,60 | 89% |
| borrão σ3 | 0,51 | 67% |
| borrão σ5 | 0,30 | 4% |
| tremido 9 px | 0,56 | 79% |
| tremido 17 px | 0,34 | 10% |
| escura ×0,25 | 0,64 | 94% |
| escura ×0,1 | 0,57 | 79% |
| estourada ×2 | 0,52 | 75% |
| estourada ×3 | 0,33 | 27% |
| ruído σ15 | 0,59 | 86% |
| ruído σ40 | 0,24 | 5% |
| meia luz | 0,61 | 90% |
| rosto de 56 px | 0,66 | 96% |
| rosto de 28 px | 0,57 | 85% |
| JPEG q20 | 0,61 | 92% |
| P&B | 0,65 | 95% |

- **Portões no aparelho** (variância do Laplaciano da luma no centro 72×72 do recorte; nitidez da selfie intacta: p10 61, mediana 128):
  - VoL < 15 → "Segure firme" (borrão σ2 dá mediana 8);
  - luz média < 35 → "Procure mais luz";
  - luz > 200 → "Luz forte demais";
  - distância entre os olhos < 40 px no quadro → "Chegue mais perto".
- Ruído **aumenta** o VoL (2.641 com σ15). Por isso a nitidez sozinha não basta: a concordância entre os 3 quadros (cos ≥ 0,6 entre eles) é o segundo portão (suposição de valor).

### C.11 Captura [V em parte]

- O `vercel.json` do `foto` hoje manda `Permissions-Policy: camera=()` [V]. A rota do visitante precisa de `camera=(self)` só nela.
- `getUserMedia` exige contexto seguro (HTTPS ou localhost) (de memória, padrão da web). Não abrir a câmera em iframe de terceiro (`frame-ancestors 'none'` já está).
- Detecção e assinatura em worker de módulo; o quadro vai por `createImageBitmap(video)` (suposição de implementação; a prova usou imagens, não câmera).
- **Guia de enquadramento**: oval no centro. Aceitar quadro com rosto único, distância entre os olhos ≥ 40 px no quadro de 640, rolagem < 15°, guinada < 0,15 para o quadro "de frente" e de 0,15 a 0,35 para os de giro (métrica `pose()` de `rosto.js`).
- **Prova de vida barata e honesta**:
  - pedir "vire um pouco o rosto";
  - exigir 3 quadros em ≤ 4 s com guinada mudando de sinal, pontos se mexendo de forma coerente e vetores concordando entre si;
  - sem upload de arquivo no modo privado.
  - **Barra**: foto impressa parada e upload de imagem.
  - **Não barra**: vídeo na tela de outro aparelho, câmera virtual, máscara. Dizer isso na documentação; não chamar de antifraude. PAD certificado (ISO 30107-3) está fora de alcance no navegador (de memória).

### C.12 Busca com 10 mil e 100 mil vetores [V]

**JS puro** (`busca.mjs`, Node 22, um laço, 128 dimensões; mediana de 15):

| Vetores | Float32Array | Int8Array |
|---|---|---|
| 10 mil | 1,77 ms (4,9 MB) | 1,70 ms (1,3 MB) |
| 100 mil | 17,7 ms (48,8 MB) | 25,7 ms (12,6 MB) |
| 1 milhão | 174 ms (488 MB) | 161 ms (126 MB) |

Um vetor em base64: 684 caracteres (fp32) ou 172 (int8).

**pgvector**
- O Postgres 16 local é o 16.15 do Ubuntu, **sem pgvector instalado** (o pacote não está nas listas do apt).
- Para medir: instância privada na pasta da pesquisa, com o `.deb` `postgresql-16-pgvector_0.6.0-1_amd64.deb` (sha256 `38a62e89…817e`, de http://archive.ubuntu.com/ubuntu/pool/universe/p/pgvector/). Sistema intocado; servidor já parado.
- Tabela `rosto(evento int, foto int, v vector(128))` com índice em `evento`; 10 mil + 100 mil vetores aleatórios normalizados.
- Varredura exata `where evento=$1 and (v <=> $s) < 0,55`: **10 mil ≈ 2,7–3,1 ms; 100 mil ≈ 18–23 ms**. `order by v <=> $s limit 5` em 100 mil: 30 ms.
- Espaço: 50 MB por 100 mil vetores (≈ 520 B por linha com `vector`); tabela de 110 mil linhas com 63 MB. Consultas em `saidas/pgvector-consultas.sql`.
- Índice HNSW não testado: com filtro por evento, o HNSW do 0.6 pode perder resultados (de memória; o 0.8 tem varredura iterativa). Por evento, a varredura exata basta.
- `halfvec` (pgvector ≥ 0,7) não testado. Versão do pgvector no Supabase `AbsoluteZRO`: **não verificada**.

**Vetor em int8**
- Escala pelo maior componente, ×127, renormalizado no cosseno.
- cos(fp32, int8 do mesmo vetor): mínimo **0,99994**; acerto no LFW de 99,35% contra 99,40%. A busca simulada dá os mesmos números até a 2ª casa (0,45: 99,2% e 0,78 falso).
- **Perda desprezível.** Guardar 128 bytes por rosto.

---

## D. Recomendação fechada

### D.1 Pilha (servida do próprio domínio; nada de CDN em produção)

| Peça | Origem fixa | Tamanho (brotli) | sha256 | Licença do código / do modelo |
|---|---|---|---|---|
| `onnxruntime-web@1.31.1`: `ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs`, `ort-wasm-simd-threaded.wasm` | https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.31.1.tgz (integrity `sha512-5GeH+bWQ+HxM10z7erGlsWqryrwMbSvm/1tkIsKTT48g0fI19VXVVC435t4t7VsPdSQeS7NmuZPXrQ73k82URw==`) | 15,4 KB + 8,1 KB + 2,39 MB | `c21d9c32…8234`, `30ed0b5c…dac3`, `4b884c20…001d` | MIT [V] |
| YuNet 2023mar, entrada tornada dinâmica no build (`dinamico.py`, mesmos pesos) | https://huggingface.co/opencv/face_detection_yunet/resolve/3cc26e7f1014a5ee5d74a42acee58bafc9d0a310/face_detection_yunet_2023mar.onnx | 0,20 MB | original `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`; derivado `c42f6203…2303` | MIT (LICENSE do repositório no commit) [V]. Treino no WIDER FACE, cujos termos de uso comercial **não conferi** |
| SFace 2021dec → **p8** gerado no build (`comprimir.py`, `limpar` incluído) | https://huggingface.co/opencv/face_recognition_sface/resolve/3d7082438a6e4551e840c9b2bb60b71e8da4b524/face_recognition_sface_2021dec.onnx | 8,03 MB | original `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79`; p8 `541a3ebb…cb79` | Apache-2.0 (LICENSE no commit) [V]. Base de treino e licença dela **não conferidas** (de memória: datasets públicos de rosto de origem discutida) |
| Código próprio | `rosto.js` da prova: detectar, alinhar, assinar, nitidez, pose | ~9 KB | — | da casa |

Total no primeiro acesso do visitante: **≈ 10,6 MB brotli**. Cache imutável por hash. O mesmo conjunto serve o fotógrafo (p8 nos dois lados).

Fluxo técnico:
- **Fotógrafo**: worker(s) de módulo, um por núcleo até 4, 1 thread cada.
  1. Prévia embutida de 1616, **girada pelo EXIF**.
  2. YuNet 640 global + ladrilhos.
  3. Nota ≥ 0,75 e largura ≥ 20 px.
  4. Alinhar 5 pontos → SFace p8 → int8.
  - Custo: cerca de 0,4 s por foto + 0,055 s por rosto. Mil fotos ≈ 8 min em 1 worker nesta CPU, estimativa.
- **Visitante**: YuNet dinâmico em 320 → 3 quadros → p8 → `POST` só do vetor.

### D.2 Dados (schema `foto`, migration nova, RLS e teste de isolamento)

- `foto.rostos(galeria_id → galerias on delete cascade, foto_id → galeria_fotos on delete cascade, n smallint, v vector(128) ou bytea(128) int8, largura_px smallint, nota smallint (×100), colado bool, perfil bool, nao_buscar bool, criado_em)`.
- **Nada de**: caixa do rosto, imagem, nome, ligação entre fotos da mesma pessoa (grupos), vetor de quem buscou.
- `foto.rostos_remocao(galeria_id, v, criado_em)`: só no fluxo de remoção, apagada com o evento. Pede jurídico.
- `foto.consentimentos` (B.4) e contador de buscas por link e hora para o limite de taxa, sem vetor.
- Busca: função `security definer` `foto.achar(link, vetores[1..3])` que confere link, PIN e prazo, faz a varredura exata e devolve `{eu:[foto_id], talvez:[foto_id]}`. Papel `foto_app` sem `select` em `foto.rostos`.
- Se não houver pgvector no Supabase, a alternativa é `bytea` int8 + comparação em JS na função Vercel. Para 100 mil rostos são 12,6 MB lidos por busca: ruim. Para ≤ 10 mil (1,3 MB) é aceitável.

### D.3 Limiares

- **É você**: ≥ 0,50 com uma selfie, ou ≥ 0,45 com 2 de 3 quadros concordando. Rosto ≥ 24 px, nota ≥ 0,75, não colado.
- **Talvez**: 0,40 até o "É você"; mais rosto de 20–24 px, colado ou perfil ≥ 0,40.
- **Captura**: VoL ≥ 15; luz de 35 a 200; distância entre olhos ≥ 40 px; 3 quadros com cos ≥ 0,6 entre si.
- Remoção: apagar rostos ≥ 0,45, com confirmação visual.
- Recalibrar com 3 a 5 eventos reais rotulados antes de abrir (n atual: 36 rostos rotulados, 2 pessoas, mais 1 atleta agrupado).

### D.4 Não verificado

- **Celular real** (Android intermediário, iPhone com Safari/WebKit e memória do WASM no iOS). Só Chromium headless com freio de CPU 4×.
- Câmera ao vivo, `getUserMedia` no worker e a prova de vida. Nada foi rodado com câmera.
- Precisão em evento grande, com crianças, gêmeos, óculos escuros, capacete e maquiagem. O ensaio rotulado tem 2 pessoas; o esporte tem 1 atleta principal; o casamento tem 5 fotos.
- Viés por tom de pele, idade e sexo do SFace: não medido.
- Licença e origem das bases de treino do SFace e do YuNet (WIDER FACE) para uso comercial.
- Versão do pgvector e `halfvec` no Supabase `AbsoluteZRO`; HNSW com filtro.
- Fluxo real da Banlek com conta (upload original ou prévia, equipe, número de peito, retenção na pré-venda). Só os textos públicos da interface e a política.
- Fotop: preço e comissão; Foco Radical, Epics, Kwikpic e FotoOwl: preço e retenção; política da Waldo.
- Página do Reclame Aqui (403: só o resumo da busca); URL de origem da Nota Técnica 23/2025.
- Enquadramento jurídico: controlador × operador, base legal para quem é fotografado sem buscar (modelo A × B), prazos de retenção do vetor e do registro, ECA Digital, AI Act se houver evento na UE (de memória: identificação biométrica 1:N é alto risco).
