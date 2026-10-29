# NOSSOM Restore D: GPU por fila

Este worker executa Resemble Enhance com `lambd=0.5`, `tau=0.1`, Midpoint e NFE 64. É o candidato D escolhido pelo titular do projeto em 23/10/2026; ainda pode alterar fonemas. Não é um modelo treinado pela NOSSOM, nem equivalência comprovada ao Adobe. Entradas estéreo são somadas em mono para restauração de fala. O original é preservado no navegador.

## Ativação

1. Execute `public/setup/cloud-restoration.sql` (combina as duas novas migrações) no SQL Editor do mesmo projeto Supabase. Ela depende da migração de contas/cota existente. O bucket privado guarda partes de até 20 MiB, evitando o limite por objeto de planos menores. O usuário nunca recebe service role ou chave RunPod.
2. Na RunPod, você também pode usar **Deploy from GitHub**, conectar este repositório público e selecionar o Dockerfile da raiz; o próprio serviço constrói a imagem. Isso evita depender de minutos do GitHub Actions. Alternativamente, execute o workflow **Build restoration GPU worker** no GitHub Actions. Ele publica `ghcr.io/victorbarrosoc-hub/nossom-restoration:COMMIT`. Alternativa em uma máquina com Docker: `docker build -f Dockerfile -t SEU_REGISTRO/nossom-restoration:VERSAO .` e publique a imagem. Os pesos são baixados na construção, não em cada áudio.
3. Na RunPod, crie um endpoint **Serverless / Queue** usando a imagem. Para pacote GHCR privado, cadastre credenciais de leitura do registro na RunPod, ou torne apenas o pacote da imagem público. Não publique segredos na imagem. Escolha GPU compatível (A40 funciona no teste de inferência), **min workers 0**, **max workers 1**, **idle timeout 15 segundos**, **1 trabalho simultâneo por worker** e sem retries automáticos. Use workers Flex, não Active. O preço Serverless é diferente do preço do Pod; confira no painel.
4. No endpoint, cadastre `NOSSOM_STORAGE_ORIGIN=https://SEU_PROJETO.supabase.co`. Não cadastre chaves administrativas no worker.
5. Na Vercel, configure **RUNPOD_API_KEY**, **RUNPOD_ENDPOINT_ID** e **SUPABASE_SERVICE_ROLE_KEY**, além das variáveis Supabase/conta já existentes. A chave RunPod fica somente no servidor. Faça redeploy. Cadastre também **CRON_SECRET** com valor aleatório de pelo menos 32 caracteres para limpar objetos abandonados diariamente.
6. Faça login na NOSSOM e valide um trabalho real pequeno: restauração, reprodução, finalização, cancelamento e cota. Confirme no painel RunPod que a fila ficou vazia e os workers voltaram a zero. Depois pare o Pod manual antigo: o endpoint Serverless não desliga Pods independentes.

O servidor autoriza a conta, reserva um trabalho por usuário e desconta da franquia mensal a duração do arquivo, com mínimo de um minuto por restauração, ao despachar; ADM confirmado mantém cota ilimitada. Repetir o mesmo submit não despacha outra GPU. Pedidos cancelados/falhos confirmados pelo provedor devolvem os minutos reservados. Falhas ambíguas de rede durante o despacho não são repetidas automaticamente, para evitar trabalho duplicado; ficam identificadas como `submitting` para reconciliação. O provedor limita execução a 15 minutos e permanência na fila a 30 minutos.

Após download e gravação local, o navegador pede a exclusão dos objetos temporários. O cron diário tenta remover objetos abandonados há mais de 24 horas, em lotes limitados; um acúmulo pode demorar mais. O áudio original e os projetos continuam locais; a restauração envia uma cópia temporária ao Supabase privado e à GPU RunPod. A conversa com Claude continua recebendo somente texto e medições.

## Limites e validação

Até 100 MiB/10 minutos na entrada. Saída WAV float32 mono a 44,1 kHz, com duração verificada e margem de pico amostral de pelo menos 3 dB. Cada objeto é <=20 MiB. O preset D não aplica masterização, EQ, correção de texto, TTS ou normalização posterior. A finalização é opcional no navegador. A segmentação do modelo em arquivos completos pode produzir diferenças em relação ao trecho de teste com contexto 20–75 s.

O build com pesos HTDemucs e smoke de inferência em CPU passou no GitHub Actions; a imagem realmente selecionada no endpoint e o serviço GPU ainda precisam de confirmação/homologação operacional. Testes locais de contrato e mocks não comprovam cold start, desligamento nem qualidade perceptual na RunPod. Código upstream: https://github.com/resemble-ai/resemble-enhance (MIT); conserve as licenças dos componentes e dos pesos nas distribuições.

## Isolar voz da música

O preset `htdemucs-vocals-v1` usa HTDemucs 4.0.1 e retorna apenas o stem `vocals` em estéreo WAV float32 a 44,1 kHz. Não aplica Resemble Enhance aos vocais nem promete remover backing vocals ou todos os instrumentos. Usa a mesma fila, autorização e franquia da restauração; o mínimo é um minuto por trabalho. A entrada original continua salva.

O checkpoint oficial fixo `955717e8-8726e21a.th` é baixado e tem seu hash verificado no build, sem nomes/URLs de modelos vindos do navegador. O build carrega os pesos e roda uma inferência sintética em CPU para verificar compatibilidade com PyTorch. Isso não substitui ouvir uma música real na GPU. O worker antigo aceita somente fala: para ativar a separação, o endpoint precisa concluir a construção e usar esta nova imagem. Nenhuma nova migração SQL é necessária: o tipo confirmado do pedido é guardado no `report` já existente.

Para estéreo, são assinadas até 11 partes de saída (até 20 MiB cada), sem ampliar os limites de entrada de 100 MiB e 10 minutos. A restauração D continua mono e usa até seis partes, preservando o contrato do worker anterior. Cancelamento, reserva/devolução de minutos e exclusão privada seguem o mesmo fluxo. Confira a licença MIT incluída do Demucs e a licença do checkpoint upstream.

## Isolar voz (Fala e Música)

`voice-isolator-v1` (**Fala**, padrão da ferramenta) roda duas etapas não generativas, por máscara: **Mel-Band RoFormer** separa a voz de música e ruídos que não são voz; **MossFormer2 SE 48K** tira o que sobra, inclusive conversa de fundo. Sai WAV float32 **mono a 48 kHz**. Como as duas etapas só atenuam o que não é fala, não criam nem trocam palavras, ao contrário de um modelo generativo. `roformer-vocals-v1` (**Música**) roda só o RoFormer e devolve o vocal em estéreo a 44,1 kHz, sem a etapa de fala, que estragaria o canto.

- Pesos: `KimberleyJSN/melbandroformer` (MIT) e `alibabasglab/MossFormer2_SE_48K` (Apache-2.0), com revisão do Hugging Face e SHA-256 fixos em `isolator.py`, baixados no build e carregados como `state_dict` com `weights_only=True`. Nada vem do navegador.
- Código: `bs-roformer==0.3.10` (a versão que bate exatamente com o checkpoint) e `clearvoice==0.1.2`, ambos do PyPI.
- Janelas: RoFormer em blocos de 8 s com metade de sobreposição e transição linear; MossFormer2 em uma passada até 20 s e em janelas de 4 s (passo 3 s) acima disso, com a cauda preservada. `test_isolator.py` confere, com modelos substitutos, que nenhuma emenda ou final se perde.
- O build roda `smoke_isolator.py` (inferência real em CPU com os pesos) e o CI roda `test_handler.py` e `test_isolator.py`.
- `htdemucs-vocals-v1` continua aceito para pedidos antigos; pedidos novos de Música usam o RoFormer.
- Limite conhecido: nenhuma das duas etapas tira eco/reverberação da sala. Não prometa isso.
