# Maestro → edição e TPeasy: saídas do Roteiro (`maestro.roteiro/1`)

Estado: **v1, 30/10/2026** (Criação, fase F3). Produtor: Maestro (`products/maestro`). Consumidor automático: **nenhum
ainda**. Sem rede, sem evento, sem integração ligada: tudo sai como arquivo ou texto, por ação da pessoa.

## Regra comum

- Tudo sai de uma **versão salva** do roteiro (`maestro.roteiro_versoes`: imutável, `sha256` conferido pelo banco). Sem
  versão, ou com o rascunho mudado depois da última, a tela oferece salvar a próxima antes (ou mandar a última).
- Só administração e gestão enviam (`podeEnviarCriacao`, a capacidade `criacao` no nível `enviar` de
  `products/maestro/src/lib/acessos.ts`). Cada envio fica na auditoria do Maestro:
  `audit_log.action = 'roteiro.enviado'`, `metadata = { n, sha256, destino, formato, pessoa }`
  (`POST /api/criacao/roteiros/<id>` `{ op: "enviado" }`; destinos e formatos em `SAIDAS`,
  `products/maestro/src/lib/criacao/roteiro/saidas.ts`).
- Não entram em nenhuma saída: nota interna, dica de modelo, bloco vazio. A observação de captação só sai nos PDFs
  Literário/Técnico.

## TPeasy (texto pronto, sem mudar nada no TPeasy)

| Saída        | Forma                                                                                                                        | No TPeasy                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Compartilhar | folha do sistema (`navigator.share`), com o `.txt` quando o aparelho aceita arquivo                                          | Novo › Colar texto         |
| Copiar       | o texto na marcação do TPeasy                                                                                                | Novo › Colar texto         |
| `.txt`       | `<título>[ · <pessoa>].txt` (o nome vira o título lá)                                                                        | Novo › Importar arquivo    |
| Backup       | `tpeasy.backup/1` com um roteiro, id `maestro-<roteiro>-<pessoa\|todas>`, `updated` = hora da versão, `target` = alvo máximo | Ajustes › Restaurar backup |

Só as falas, por pessoa ("Todas" ou uma), uma seção `# Cena N · título` por cena; `**ênfase**`, `[pausa]` e a
indicação como `((…))`. O TPeasy junta o backup pelo id e fica com o mais novo: mandar a v4 atualiza o roteiro que veio
da v3, sem duplicar; a mesma versão de novo não muda nada. A tela diz "Compartilha o texto pronto" e nunca
"sincroniza" (a leitura direta pelo TPeasy é a F8a, com a ponte do HUB).

## Edição: PDF e `maestro.roteiro/1`

- **PDF para a edição** (para todos que enviam): a folha A4 `/app/criacao/roteiros/<id>/imprimir?vista=edicao&versao=n`
  com as cenas (cabeçalho e começo–fim) e as deixas em ordem de tempo (fala, lettering, áudio, plano/imagem).
- **Arquivo `maestro.roteiro/1`** (`<título> · vN.maestro.json`): schema zod em
  [`packages/media-contracts/src/roteiro.ts`](../../packages/media-contracts/src/roteiro.ts), JSON Schema em
  [schemas/maestro.roteiro.v1.schema.json](schemas/maestro.roteiro.v1.schema.json), exemplo gerado pelo código do
  Maestro em [exemplos/maestro.roteiro.v1.json](exemplos/maestro.roteiro.v1.json). Na tela, a opção **só aparece
  quando o AEON está aberto para a pessoa** (`podeMandarParaAeon`: claim `zro_release["ai-edit"]` = `released` ou
  `allowed`, `ai-edit` em `zro_products` e papel de envio). Hoje o AEON está fechado pelo gate de lançamento: ninguém
  vê. A rota recusa o registro `aeon` com o gate fechado. O AEON ainda **não importa** o arquivo (F8b).

### Forma

```
{ contract: "maestro.roteiro/1", gerado_em,
  origem: { app: "maestro", roteiro_id, titulo, versao, sha256, salva_em },
  formato: "16:9"|"9:16"|"1:1"|"4:5", wpm, alvo_seg: {min,max}|null, tempos: "estimados", duracao_seg,
  pessoas: [{ id, nome, papel }],
  cenas: [{ id, numero, titulo, cabecalho, int_ext, local, periodo, inicio_seg, fim_seg, duracao_digitada_seg, voz_seg,
            blocos: [ fala      { pessoa_id, pessoa, modo: on|off|sonora|passagem, texto, texto_falado, palavras, obs }
                    | acao      { texto }
                    | plano     { tamanho, sigla, angulo, movimento, lente, fps, texto }
                    | lettering { estilo: gc|titulo|legenda|cta|legal, texto }
                    | audio     { audio: trilha|efeito|bg|silencio, texto, entra, sai } ] }] }
```

Todo bloco tem `id` estável (o mesmo do editor, das versões e do comentário), `inicio_seg`, `fim_seg` e
`duracao_digitada_seg`. Segundos desde o começo, arredondados a 0,1; a fala é estimada por palavras ÷ `wpm` (a contagem
do TPeasy), o resto só tem o tempo que alguém digitou (`tempo.ts`). `texto` da fala guarda a marcação do TPeasy;
`texto_falado` é só o que se fala, a base para alinhar com a transcrição. Objetos estritos (campo a mais = inválido);
ids únicos entre cenas e blocos; `pessoa_id` só do elenco; sem e-mail, telefone ou dado de conta.

### Para o AEON (F8b, não implementado)

"Abrir roteiro do Maestro…" lê o arquivo (sem rede), alinha `texto_falado` com as palavras da transcrição (regra, não
IA) e propõe, no fluxo de aprovar um a um que já existe: marcador por cena (`cabecalho`), etiqueta da cena nos clipes,
lettering como sugestão no tempo da fala, trilha entra/sai como marcador e a lista de falas sem take.

Mudança incompatível = `maestro.roteiro/2`.
