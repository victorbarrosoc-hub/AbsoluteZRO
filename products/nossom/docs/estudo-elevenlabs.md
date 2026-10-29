# NOSSOM × ElevenLabs: estudo crítico e plano (29/10/2026)

Pedido do titular: estudar o ElevenLabs e fazer do NOSSOM uma ferramenta de áudio completa e eficiente, que se venda
sozinha e leve as pessoas ao ecossistema Absolute ZRO. Este documento separa o que foi **medido** do que é **plano**.

## O que o ElevenLabs entrega (out/2026)

| Produto           | O que faz                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Voice Isolator    | Tira música, ruído e multidão de qualquer gravação de fala; um clique, aceita vídeo. API. |
| Scribe (STT)      | Transcrição em 99 idiomas, diarização (até 48 falantes), marcação de tempo, tempo real.   |
| Studio 4.0        | Editor de projeto longo com vídeo, imagem, fala, música e efeitos.                        |
| TTS v4 e clonagem | Vozes sintéticas, desenho de voz, clone com ~30 s de áudio.                               |
| Voice changer     | Troca a voz preservando a interpretação.                                                  |
| Dubbing v2        | Tradução com a voz original, edição de transcrição e tradução.                            |
| Efeitos e música  | Geração por texto.                                                                        |
| Preço do Isolator | API por volta de US$ 0,12/min (página de preços; confirmar antes de citar publicamente).  |

## Onde o NOSSOM estava (antes desta entrega)

Crítica sem filtro, do ponto de vista de quem paga:

1. **A melhor ferramenta podia trocar palavras.** "Restaurar com IA" usa Resemble Enhance D, um modelo generativo; o
   próprio README admite que "ainda pode alterar fonemas". Para entrevista, aula ou depoimento isso é inaceitável
   como padrão.
2. **Não havia isolador de fala.** "Isolar voz" era HTDemucs, feito para música. Em conversa de fundo ele quase não
   faz nada (SI-SDR 2,0 dB, quase o mesmo que a entrada).
3. **O motor local (DeepFilterNet3) é bom para ruído constante e fraco para música e vozes ao fundo.**
4. **Nada disso foi homologado na GPU de produção.** A imagem do endpoint ainda precisa de confirmação.
5. **Limites de amador:** 10 min e 100 MB por arquivo; um vídeo de celular de 10 min passa de 1 GB. O ElevenLabs
   aceita arquivos muito maiores.
6. **Sem transcrição, legenda, voz sintética ou dublagem.** Para um produtor de conteúdo, legenda é o segundo uso mais
   comum depois de limpar o áudio.

O que o NOSSOM já tem de melhor que o ElevenLabs: acabamento (EQ, dinâmica, Transmissão −3 dB, entrega por destino
com medição real de LUFS/true peak), histórico de versões com A/B de volume igualado, arquivos que ficam no aparelho e
preço por minuto menor.

## O que foi feito agora: Isolar voz, no nível do Voice Isolator

Cadeia nova, **não generativa** (só atenua o que não é fala, não cria nem troca palavras):

1. **Mel-Band RoFormer** (pesos de Kimberley Jensen, MIT): separa voz de música e de ruído que não é voz.
2. **MossFormer2 SE 48K** (ClearerVoice-Studio, Apache-2.0): tira o que sobra, inclusive conversa de fundo.

Na tela, "Isolar voz" tem dois modos: **Fala** (padrão, mono 48 kHz) e **Música** (só o RoFormer, vocal estéreo
44,1 kHz; a etapa de fala estragaria o canto).

### Medição (CPU, sem GPU; não é audição)

Fala humana real em português (TTS-Portuguese Corpus, CC BY 4.0) misturada com ruído real (DEMAND: café, rua,
cozinha; CC BY 4.0), música instrumental (Kevin MacLeod, CC BY 4.0) e uma sala com RT60 de 0,7 s. Oito cenários de
10–15 s. Métricas: SI-SDR e PESQ-WB/ESTOI contra a fala limpa; DNSMOS (Microsoft) sem referência. Média dos sete
cenários com ruído:

| Motor                             | SI-SDR (dB) | PESQ-WB  | ESTOI    | DNSMOS OVRL |
| --------------------------------- | ----------- | -------- | -------- | ----------- |
| Entrada (sem tratar)              | −0,17       | 1,26     | 0,68     | 1,81        |
| HTDemucs (Isolar voz antigo)      | 9,96        | 1,87     | 0,81     | 2,52        |
| DeepFilterNet3 (motor local)      | 11,13       | 2,16     | 0,83     | 3,02        |
| MossFormer2 sozinho               | 13,14       | 2,46     | 0,87     | 3,15        |
| Mel-Band RoFormer sozinho         | 14,09       | 2,36     | 0,86     | 2,90        |
| **RoFormer + MossFormer2 (novo)** | **15,46**   | **2,56** | **0,90** | **3,23**    |

Destaques por cenário (SI-SDR): música a 0 dB, 14,0 → **18,1**; música alta (−6 dB), 9,1 → **14,1**; vlog com
música e café, 7,2 → **14,7**; café, 2,0 → **10,7**. Em fala já limpa a cadeia fica transparente (39 dB).

**Limite medido:** nenhuma das opções tira reverberação da sala (4,6 dB no cenário com eco). Não prometer "tira eco".

Resemble Enhance D não entrou na tabela: é generativo, então SI-SDR não o mede de forma justa, e ele não roda em CPU
em tempo útil. A comparação com D e com o próprio ElevenLabs precisa de **audição cega** com volume igualado.

## Plano, em ordem de impacto

| Fase | Entrega                                                                                                          | Por quê                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 0    | Publicar o worker, homologar na GPU (tempo, custo por minuto, cold start) e fazer audição cega contra ElevenLabs | Nada vira promessa antes disso                           |
| 1 ✅ | **Vídeo de verdade** (feito em 29/10): só o som vai à GPU e o botão Vídeo devolve o original com o som novo      | Tira o teto de 100 MB do vídeo; é o uso do criador       |
| 1    | Arquivos de até 1 h                                                                                              | Podcast e aula passam de 10 min                          |
| 1    | Tirar eco: avaliar modelo de dereverberação (o melhor aberto é GPL-3.0; exige decisão de licença) ou treinar     | É o que falta para o "som de estúdio" em sala comum      |
| 2    | **Transcrição e legendas** (Whisper large-v3-turbo, MIT): SRT/VTT, palavras com tempo                            | Segundo uso mais comum; abre edição por texto            |
| 2    | **Editar pelo texto:** apagar a frase apaga o áudio; cortar silêncios e vícios ("é…", "tipo")                    | Diferencial que o Voice Isolator sozinho não tem         |
| 2    | Lote e API para equipes (B2B)                                                                                    | Agências e estúdios processam dezenas de arquivos        |
| 3    | Voz sintética e clone com **consentimento gravado** (Chatterbox multilíngue, MIT)                                | Correções de fala sem regravar; exige trava contra abuso |
| 4    | Dublagem: transcrição + tradução (Claude) + voz clonada + mixagem                                                | Junta tudo; só depois das fases 2 e 3                    |

Ecossistema: a voz limpa e a legenda seguem para o Synquei/Revela pelo HUB (`edit.timeline.ready` já existe), e o
login é o da Absolute ZRO.

## Riscos e decisões do titular

- **Deploy e GPU** (fase 0): build e publicação da imagem, troca no endpoint RunPod e gasto de GPU precisam de
  autorização.
- **Custo:** a cadeia nova pesa mais que o HTDemucs. Medir o custo por minuto na GPU antes de mexer nos planos.
- **Licença de dereverberação** (fase 1): GPL-3.0 nos pesos, ou treinar o próprio modelo.
- **Clone de voz** (fase 3): política de consentimento e de uso.
