# RADION nativo

O RADION com o celular travado no bolso (pedido do titular, 07/11/2026; caminho A do marco 1 escolhido em
08/11/2026). O site para de rodar com a tela travada; o app nativo segue no ar.

## Android (`android/`)

Projeto Gradle com dois módulos:

- **`nucleo/`**: o rádio no Android, **sem login nem banco**. Reaproveitável por outro app (o DEICHECK, depois de
  14/11, decisão do titular: o núcleo mora aqui e o checkevent consome de fora).
  - `RadioNoAr`: serviço em primeiro plano (microfone e som) com a notificação fixa (diária, canal, quem pediu a
    palavra) e **Falar/Parar** e **Desligar**, também na tela bloqueada.
  - Botão do fone (play/pause ou o de atender) fala e para (`MediaSession`).
  - O celular não dorme enquanto está no ar (wake lock parcial, até 14 h).
  - `SaidaDeSom`: o som vai para o fone Bluetooth com microfone, o fone com fio ou USB, ou o **viva-voz**. Assim não vai
    para o alto-falante de ligação, o problema do RADION no navegador do Android.
  - `EstadoDoRadio`: o estado que o app conta, conferido campo a campo (o mesmo contrato do RADION para computador).
- **`app/`**: o RADION.
  - A página de verdade (`radion.absolutezro.com`) numa WebView. Nada muda no servidor nem exige deploy: a página já fala
    com o app pelo contrato do computador (`window.radionDesktop`), posto por `assets/ponte.js` antes de qualquer script
    (só na origem do RADION; as mensagens voltam por `WebMessageListener`, também só dessa origem).
  - A ponte tira o "Android" do agente de usuário da página: no app o microfone fica aberto desde o Ligar (a saída de
    som é do app), em vez do "só durante a fala" do navegador.
  - **Login:** e-mail e senha dentro do app. O Google vai pelo navegador do celular e volta por `radion://entrar-app`
    (`LoginExterno`, igual ao app de computador; o esquema já está liberado no HUB, migração 0063). A troca do código
    põe o cookie da Absolute ZRO na WebView.
  - **Regras** de navegação iguais às do computador (`Regras`). `radion://d/ABC234` abre a diária.
  - O voltar não fecha o app (vai para trás e o rádio segue); fechar pelo multitarefa desliga o rádio.

```bash
cd products/radio/nativo/android
echo "sdk.dir=$ANDROID_HOME" > local.properties   # só local
./gradlew test assembleRelease                    # testes do núcleo e do app + APK
node scripts/icones.mjs                           # ícones a partir da marca oficial (Playwright e ffmpeg)
```

O teste de ponta a ponta da ponte com a página roda em `products/radio` (`npm test`, "Android nativo: a ponte…").

**Publicar:** `.github/workflows/radion-android.yml` testa e gera o APK em todo PR. Em push (main ou
`claude/radion-android*`), publica no Release **"RADION Android · versão de teste"** (tag `radion-android-teste`):

- `RADION-android.apk`, o link fixo;
- `RADION-android-<versão>-b<build>.apk`;
- `SHA256SUMS.txt`.

Sem loja por enquanto (sem conta Google). Sem custo.

**Assinatura:** sem os secrets `RADION_ANDROID_*` o APK sai com a chave de depuração, e cada versão nova pede
desinstalar a anterior. Com a chave fixa (o titular cria os secrets no GitHub; a chave nunca entra no repositório),
cada versão instala por cima.

**Limites do marco 1:**

- A voz segue a malha do site, que vai bem até umas 8 a 10 pessoas por diária.
- Celulares com economia de bateria agressiva podem fechar o serviço: liberar em Configurações › Apps › RADION ›
  Bateria › Sem restrições.
- Fone Bluetooth junto com uma lapela USB depende do aparelho.

## iPhone

Depois da conta Apple: framework PushToTalk (iOS 16+), servidor de voz e push. O plano está com o Painel Geral.
