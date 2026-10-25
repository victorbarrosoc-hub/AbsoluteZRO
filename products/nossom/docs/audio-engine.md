> Este documento descreve o **motor local** e seus limites. O padrão `auto` remoto e a separação musical atuais estão em [architecture.md](architecture.md) e [handoff/OPERATIONS.md](handoff/OPERATIONS.md); não confundir essas cadeias.

# Motor NOSSOM e preset de transmissão

NOSSOM Voice combina processamento neural local e estágios de DSP controláveis. O núcleo de restauração padrão é o modelo aberto DeepFilterNet3, distribuído por `@lofcz/deepfilternet-web@0.1.0` (MIT/Apache-2.0). A alternativa leve usa RNNoise. NOSSOM não reivindica ter treinado esses modelos nem reproduzir o código proprietário de Adobe, Blackmagic ou iZotope.

DeepFilterNet3 processa PCM float a 48 kHz em quadros de 480 amostras. O modelo embutido foi inspecionado: FFT 960, hop 480 e look-ahead 2. O worker acrescenta zeros ao final e remove 1.440 amostras de atraso. O modelo/WASM de aproximadamente 33 MB é servido pelo próprio domínio; a licença acompanha os assets em `/audio/DEEPFILTER-LICENSE.txt`. Não há fallback silencioso para um algoritmo diferente.

## Padrão automático e preservação da voz

> Estado atual: `/studio/automatico` envia o original ao worker remoto (Resemble Enhance D, `resemble-d-v1`). A cadeia local descrita abaixo (DeepFilterNet + Transmissão) continua implementada no motor, mas não é o caminho acionado pela página automática. Ver [architecture.md](architecture.md).

## Voz de estúdio (acabamento local depois da restauração)

Preset de finalização `studio-voice` (`lib/presets.ts`, versão `nossom-studio-voice-1`), oferecido no painel de acabamento depois do D e em Preparar entrega. Roda no navegador, não consome minutos GPU e cria uma nova versão; o resultado bruto do D fica intacto.

Cadeia, escalada pela intensidade: passa-altas 75 Hz (12 dB/oit.), −2,5 dB em 250 Hz, +2,5 dB em 3,2 kHz, +1,5 dB de prateleira em 10 kHz, de-esser leve, compressor 2,5:1 (ataque 12 ms, liberação 200 ms) e normalização em duas passagens para −16 LUFS / −1 dBTP (alvo ajustável). Valores fixos e conservadores, escolhidos para voz próxima e clara; não reproduzem o algoritmo de nenhum produto. A qualidade perceptual em gravações reais ainda precisa de audição cega.

O padrão anterior aplicava a saída neural diretamente, a 100% e com supressão máxima de 60 dB. No par real enviado pelo usuário, o resultado ficou mais baixo e dois canais quase idênticos ficaram menos correlacionados. As medições de regressão iniciais em fala sintética não eram suficientes para validar a qualidade perceptual.

Natural 3 usa a estimativa neural para calcular ganhos espectrais; a reconstrução mantém a fase do sinal original. FFT 1.024, hop 512, janela de raiz de Hann e sobreposição com soma unitária. O ganho é comum aos canais. A saída é escrita em blocos já consumidos para evitar uma terceira cópia integral do áudio no worker. Ganho unitário reconstrói inclusive as bordas; há teste de impulsos no primeiro e último samples.

A análise usa percentis RMS em janelas de 20 ms, exclui silêncio digital da estimativa de fundo e mantém uma indicação de confiança. A política escolhe o limite de supressão e protege mais a fala quando a separação entre janelas fracas e fortes é maior. A relação de energia entre a estimativa neural e a entrada adapta o ganho por quadro; os ganhos são suavizados no tempo e na frequência. Isso é um controlador DSP sobre um modelo neural aberto, não um novo modelo treinado pela NOSSOM. O indicador de separação entre percentis não é uma medição certificada de SNR. Natural 3 aumenta a ação dos ganhos nos fundos audíveis: mantém a política anterior quando o fundo está abaixo de −50 dB ou a separação entre percentis chega a 24 dB. Para fundos audíveis, a ação adicional cresce suavemente entre 24 e 18 dB de separação. Nesse caso, com pausa confiável o expoente chega a 0,3 + relação RMS fundo/voz (limitado a 0,3–0,7); sem pausa confiável, a 0,55. Isso reduz a mistura excessiva de ruído da Natural 2 durante a fala. Modelo e reconstrução por fase permanecem os mesmos, sem ressíntese generativa.

`/studio/automatico` é a entrada padrão. O usuário importa e usa “Analisar e tratar”. O motor restaura, escolhe presença/corte de médios graves/de-esser/compressão dentro de limites conservadores, ajusta o nível de voz para a etapa de finalização e aplica Transmissão + Limite −3 dB. Não se normaliza o LUFS depois dessa cadeia. O relatório registra a análise e todos os parâmetros usados. O controle de pico é verificado depois do render.

As ferramentas Limpeza e Voz também começam em análise automática, com “Ajustar manualmente” disponível. A limpeza isolada preserva o nível vocal com compensação limitada e limitador em oversampling 4×. O modo manual mantém intensidade e limite de supressão; esse limite agora controla o piso dos ganhos espectrais, em vez de substituir o sinal pela saída neural bruta. No modo de compatibilidade RNNoise, mantém-se a implementação anterior.

Cada execução automática parte do original e abre uma ramificação no histórico. Repetir não reaplica o modelo sobre uma voz já tratada. As operações manuais continuam encadeáveis. A exportação MP3 passa a 320 kb/s; o WAV é a referência das medições.

## Saturação de entrada e reconstrução de picos

Tratamento completo executa `adeclip` do FFmpeg antes da limpeza neural. Esse estágio identifica acúmulo de amostras em um teto local e usa predição autorregressiva para estimar picos perdidos. Janela de 20 ms, AR de 2%, limiar de histograma 10. Padding de 55 ms nas bordas seguido de corte mantém a duração e evita que a soma de janelas altere o início/fim da gravação. O áudio intermediário usa WAV float32, inclusive entre limpeza e finalização, preservando headroom; reconstruir em float e quantizar antes da finalização poderia clipar novamente. Ganho vinculado reserva pico de 0,9 quando a reconstrução excede essa margem.

O relatório registra método, contagem de detecções em quadros sobrepostos, ganho e estado: `reconstructed`, `not-detected` ou `limited`. Não se interpretam essas contagens como número único de amostras danificadas. Quando não há detecções, a saída do filtro é descartada e a fonte é mantida exatamente. Silêncio digital não é saturação. Gravações com mais de 25% de amostras em patamares constantes são sinalizadas como limitadas: a reconstrução AR densa é cara e não é confiável, então o motor continua a limpeza sem alegar reparar os picos.

O teste em WASM usa fala limpa conhecida, clipping introduzido em ±0,2 e exige ganho de SI-SDR superior a 3 dB, duração idêntica e recuperação de amplitudes acima do teto artificial. Isso verifica reconstrução efetiva, e não redução de volume. Não demonstra equivalência perceptual com Adobe Podcast v2. No bruto privado, a maior parte da distorção relatada não foi identificada como patamar de clipping digital; saturação analógica, processamento prévio e codificação com perdas podem ocultar esses patamares. O motor local não faz ressíntese generativa da fala. Nenhum modelo de reconstrução generativa foi treinado, integrado ou validado nesta alteração.

As ferramentas são páginas próprias com uma fonte de áudio compartilhada. EQ, voz, dinâmica e entrega são estágios separados; aplicar um ajuste produz um snapshot e registra sua versão de origem. Desfazer/refazer seleciona snapshots, sem renderizar novamente ou destruir o histórico. Ramificações e a trilha de refazer são preservadas ao recarregar. Projetos antigos sem identificadores de origem continuam navegáveis por ordem linear.

## Transmissão + Limite −3 dB

Valores transcritos das capturas do usuário:

| Banda         | Limiar   | Ganho | Proporção | Ataque | Liberação |
| ------------- | -------- | ----- | --------- | ------ | --------- |
| Graves        | −20,2 dB | +1 dB | 3:1       | 1 ms   | 100 ms    |
| Médios graves | −17,6 dB | 0 dB  | 2:1       | 1 ms   | 100 ms    |
| Médios agudos | −24,8 dB | 0 dB  | 2:1       | 1 ms   | 100 ms    |
| Agudos        | −25 dB   | +3 dB | 3:1       | 1 ms   | 100 ms    |

Crossovers: **137 / 1.147 / 6.910 Hz**.

Limitador multibanda: limiar −10 dB, margem −0,1 dB, ataque 1 ms, liberação 250 ms, saída 0 dB. O motor limita no limiar e usa compensação para a margem. Essa interpretação é explícita: curvas internas de auto-gain/knee dos plugins Adobe não podem ser deduzidas integralmente pelas imagens.

Limitador final: **modo pico amostral**, entrada +6 dB, teto −3 dBFS, look-ahead 7 ms, liberação 100 ms, canais vinculados. Não é o modo true peak, que estava desmarcado na captura. O relatório mede true peak separadamente.

A implementação usa crossover Linkwitz–Riley de 4ª ordem, compressão RMS por banda com knee duro, soma sem normalização e limitadores com compensação de latência. A via seca da intensidade passa pelo mesmo crossover para preservar a relação de fase na mistura. Os controles são ajustáveis e voltam aos valores das capturas com “Restaurar valores da referência”. Não se aplica normalização LUFS extra depois desse preset: isso alteraria a cadeia e a intenção do teto final.

## EQ e presets de voz

O EQ possui bandas em 100, 250, 1.000, 3.500 e 10.000 Hz, de −12 a +12 dB, e corte de graves ajustável. Os presets Neutro, Corpo e calor, Voz em destaque e Brilho e abertura são pontos de partida editáveis. Reserva-se margem antes dos realces para reduzir o risco de clipping. O gráfico mostra ganhos por banda, não uma medição do espectro ou resposta exata do filtro.

Os presets Diálogo limpo, Locução encorpada, Podcast equilibrado, Sibilância suave e Diálogo com hum de rede combinam a restauração neural com EQ de voz, compressor, limitador e de-esser conforme controles. Hum usa notches na fundamental 50/60 Hz e três harmônicos. A reconstrução de picos identificáveis está no Tratamento completo; esses presets de voz não recuperam conteúdo ausente nem equivalem a todas as funções RX/Ozone.

“Meus presets” guarda as configurações por ferramenta no navegador. Não inclui o áudio, não é sincronizado em nuvem e possui limite de 20 presets por ferramenta.

## Destinos de entrega

Os destinos estão em Preparar entrega e também no Tratamento completo. Neste último, a opção NOSSOM mantém a cadeia de referência anterior; escolher um destino acrescenta normalização em duas passagens depois da cadeia, com medição posterior e correção de ganho limitada pelo true peak. A meta não é certificação. Para obter a entrega final, aplique os efeitos criativos antes da normalização do destino.

Todos os renders descarregam o look-ahead dos filtros com 100 ms de padding e cortam a saída na contagem exata de amostras a 48 kHz. Isso corrige a perda de aproximadamente 8,6 ms encontrada ao combinar a cadeia automática e a normalização de destino. Efeitos preservam a duração já acrescida de sua cauda. Nas regiões, o corte usa a duração da seleção antes da concatenação.

| Destino                           | Meta integrada             | Teto de true peak | Escopo                                                                  |
| --------------------------------- | -------------------------- | ----------------- | ----------------------------------------------------------------------- |
| Podcast estéreo                   | −16 LUFS                   | −1 dBTP           | Orientação editorial                                                    |
| Redes sociais / vídeo de conteúdo | −14 LUFS                   | −1 dBTP           | Ponto de partida para Reels, TikTok e Shorts                            |
| YouTube / entrevistas             | −14 LUFS                   | −1 dBTP           | Orientação editorial, não exigência de upload                           |
| Netflix / referência de diálogo   | −27 LUFS                   | −2 dBTP           | Apenas diálogo isolado; não mede automaticamente diálogo em uma mixagem |
| TV / EBU R128                     | −23 LUFS                   | −1 dBTP           | Confirmar a especificação da emissora                                   |
| TV / ATSC A/85                    | −24 LUFS (referência LKFS) | −2 dBTP           | Confirmar medição/canais e exigências do projeto                        |

O medidor usa loudnorm/EBU R128 sobre o arquivo inteiro, não um classificador de diálogo. O preset Netflix identifica explicitamente essa limitação. WAV permanece PCM16 a 48 kHz: entregas que exigem PCM24, stems, multicanal, metadados ou testes específicos precisam de uma etapa externa.

Fontes para conferência: [FFmpeg adeclip](https://ffmpeg.org/ffmpeg-filters.html#adeclip), [implementação oficial](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/af_adeclick.c), [EBU R128](https://tech.ebu.ch/docs/r/r128.pdf), [YouTube — codificação](https://support.google.com/youtube/answer/1722171?hl=pt-BR) e especificação de entrega do projeto no Netflix Partner Help. Nesta execução foi possível ler o código oficial do FFmpeg no GitHub e consultar o filtro WASM real; o proxy bloqueou com HTTP 403 os sites Adobe, EBU, Google Help e Netflix Partner Help. As revisões atuais dessas páginas e a arquitetura proprietária do Enhance Speech v2 não foram verificadas. Não se atribui à Adobe um algoritmo interno específico.

## Efeitos criativos

`/studio/efeitos` oferece Sem efeito, Sala de estúdio, Capela, Igreja, Auditório, Rádio vintage, Rádio FM e Telefone. O único controle de intensidade mistura sinal seco e processado de 0 a 100%. Em 0%, o render de efeito é um bypass sem cauda. O original não é alterado; a exportação PCM16 pode introduzir arredondamento de quantização.

Ambientes usam uma rede Schroeder: seis combs paralelos com realimentação amortecida, três difusores all-pass, predelay e pequenas diferenças entre canais. RT60 nominal: sala 0,35 s, capela 1,3 s, igreja 4,2 s, auditório 2,2 s; amortecimento por frequência altera a cauda efetiva. A cauda é acrescentada ao arquivo, não cortada no fim. Não são respostas impulsivas medidas em igrejas reais nem emulações licenciadas.

Telefone soma o sinal molhado em mono e filtra 300–3.400 Hz. Rádio vintage filtra 180–4.500 Hz; FM, 70–12.000 Hz. Ambos usam compressão de envelope (ataque 3 ms, release 120 ms, ratio 3:1) e ganho de compensação. O sinal é transportado em float e passa por limitador com oversampling 4× antes da exportação. São texturas criativas aproximadas, não padrões técnicos de transmissão.

Trocar um efeito sobre a versão ativa de Efeitos parte da mesma versão pai. Isso evita acumular caudas; Remover efeito seleciona o pai sem apagar snapshots. A biblioteca pessoal salva efeito e intensidade e pode recarregá-los. Seleção regional é recusada nessa ferramenta para preservar a cauda completa.

## Qualidade e comparação

O fixture permanente é fala sintetizada com ruído branco adicionado; ele verifica também melhoria de SI-SDR, preservação de estéreo e ausência de alterações no original. O teste opcional com `NOSSOM_REGRESSION_MP3` usa o bruto privado do usuário e `NOSSOM_REFERENCE_MP3` usa sua referência Adobe Podcast v2 + Premiere. Esses áudios não são versionados nem publicados. O teste verifica duração, relação entre canais, preservação do sinal, repetição a partir do original e níveis finais em relação à referência. Os previews ficam em `artifacts/`, ignorado pelo Git.

Proximidade de LUFS/pico/dinâmica não comprova equivalência perceptual, inteligibilidade nem ausência de artefatos. Não se afirma que o modelo local supera ou iguala Adobe, Resolve ou iZotope. A aprovação do padrão perceptual requer comparação auditiva com volume igualado; a referência fornecida passa a ser o benchmark dessa avaliação.
