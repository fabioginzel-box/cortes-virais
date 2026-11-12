# O visual e a entrega

O que o render faz com cada corte, e por quê. As medidas estão em pixel de um vídeo 1080×1920. As
cores, a fonte e a finalização vêm do `marca.json` do canal ([marca.md](marca.md)); a posição e as
regras de bloco são fixas.

## A zona segura

A interface do YouTube Shorts, do Reels e do TikTok cobre as bordas. A skill deixa livres **210 px em
cima, 450 embaixo, 60 à esquerda e 150 à direita**, a zona que vale para as três (tabela da skill
claude-shorts, conferida em 10/11/2026). Texto, card e cartão nunca saem dela.

## O card do gancho

- Nas cores do canal (`card.fundo` e `card.texto`), na fonte do canal, com cantos de 28 px.
- No topo da zona segura (y = 250), centrado, até 870 px de largura e **2 linhas**. A letra começa em
  70 px e encolhe até 44 px para caber.
- Fica os **4 primeiros segundos** e some. Até 40 caracteres cabem bem; o `conferir` avisa acima disso.
- `card.ligado: false` tira o card; o gancho continua valendo para o título e para a nota.

## A legenda

- Palavra a palavra, em **blocos de até 3 palavras e 20 caracteres**, em caixa alta quando o canal
  pede. O bloco quebra na pontuação, numa pausa de 0,35 s e na troca de quem fala. Vírgula e ponto
  saem; interrogação e exclamação ficam.
- Na fonte e na cor do canal, com contorno e sombra na cor do `legenda.contorno` (ou só sombra, sem
  contorno). A palavra que está sendo dita ganha o fundo colorido (ou degradê), só a troca de cor, ou
  nada, pelo `legenda.ativa.estilo`.
- O tamanho P, M ou G começa em 76, 92 ou 108 px e encolhe até caber em **2 linhas**; quem deve
  quebrar a frase é o bloco.
- A base do bloco fica a 480 px do fim do quadro (uns 70% da altura), longe dos botões da plataforma e
  abaixo do rosto, que o enquadramento põe a 38% do topo.
- As palavras de `destaques` saem na cor `legenda.destaque` quando não estão sendo ditas.
- Evite texto amarelo direto sobre a imagem: ele se perde em pele e em parede clara. O amarelo do
  estilo Clássico vai como fundo da palavra ativa, com a letra preta.
- Vício ("hum", "éé") não aparece na legenda, nem no áudio: o `conferir` corta, até colado na borda do
  trecho. Com `--limpeza sem`, fica nos dois.
- O texto da legenda é o da transcrição, com as trocas do `correcoes.json`. Erro de nome próprio se
  evita no `transcrever`, com `--termos`, e se corrige no `correcoes.json`.

## O enquadramento

O `rostos` acha os rostos a 5 quadros por segundo e as trocas de câmera da fonte (o filtro de cena do
ffmpeg). O corte se divide em pedaços nas trocas de câmera, nas emendas de trecho e nas trocas de
quem fala; em cada pedaço o recorte vai no rosto presente, e, com mais de um, no de boca mais ativa.
Pedaços seguidos com o rosto no mesmo lugar viram um plano só. Assim funciona tanto o podcast de
câmera fixa quanto o programa editado com plano geral e closes, que troca de câmera a cada poucos
segundos.

| Layout | Quando | Como fica |
|---|---|---|
| `rosto` | uma pessoa, ou pedido | o recorte fica num rosto só, o de quem mais fala no corte; se a pessoa anda, acompanha suave |
| `falantes` (o `auto` com duas pessoas ou mais) | podcast, entrevista | mostra quem fala, com corte seco na troca; fala de menos de 1 s não troca o plano. Nos momentos em que os dois reagem (três falas curtas seguidas alternando, ou um riso de quase 1 s), a tela se divide só ali |
| `dividido` | pedido | as duas pessoas empilhadas o corte inteiro, 1080×960 cada, a da esquerda em cima |
| `tela` | sem rosto (gravação de tela, slide, produto), ou pedido | a imagem inteira na largura, sobre ela mesma desfocada e escurecida |

- O rosto fica com os olhos a 38% da altura do recorte.
- Na frase de `impacto`, o recorte aperta 12% de uma vez (o "punch-in"), com o mesmo centro e os olhos
  na mesma altura, e volta quando a frase acaba. Só no layout de rosto.
- Na abertura no ponto alto, o trecho que toca duas vezes usa os rostos das duas vezes.
- Rosto pequeno (plano aberto) ganha zoom, mas o recorte nunca fica tão pequeno que a entrega o amplie
  mais de 2x: num vídeo 1080p isso quase não dá zoom, num 4K dá até 2x. Por isso o arquivo original
  da gravação, quando é 4K, sai melhor que o download do YouTube.
- O detector acha rosto de lado e a meia distância (o FaceDetector de longo alcance do MediaPipe).
  Rosto muito pequeno ou de costas não é achado; sem rosto, o corte cai no layout `tela`.

## O realce

`render --realce` monta o recorte na resolução nativa do rosto (num 1080p, 608×1080), passa pelo
`topazlabs/video-upscale` (até 4K) e só então põe a legenda e volta a 1080×1920. Vale quando a fonte
tem 1080 linhas ou menos: o 9:16 tirado de um 1080p tem só 608 px de largura, e a Topaz recupera
nitidez que a ampliação comum não recupera. É cobrado no Replicate, por segundo de vídeo (uns US$ 0,08
em novembro de 2026), e leva uns 3 a 4 min por corte.

O vídeo vai à Topaz dentro da própria predição, como data URL: ela lê o arquivo de fora do Replicate,
e o link do Files API exige o token. O maior que já passou assim foi um corte de 54 s em 608×1080
(22 MB); o `render` mostra o tamanho de cada um ao mandar.

## A finalização

O fim de cada corte segue o `finalizacao.modo` do canal (ADR 0003):

| Modo | O que entra no fim |
|---|---|
| `nenhuma` (o padrão) | nada: o corte termina na última frase |
| `cartao` | o cartão do canal, desenhado no Chrome: a cena do fim do corte desfocada ao fundo, o logo, o título, o botão e o apoio, que entram em sequência; o botão pulsa uma vez a 1,1 s |
| `video` | o vídeo de assinatura do canal, encaixado no 9:16 sobre ele mesmo desfocado, quando não é vertical |

Nos dois últimos, a finalização entra com uma **fusão de 0,25 s** sobre os últimos quadros do corte, e
a fala do corte esmaece no mesmo quarto de segundo. Corte seco do vídeo para uma tela parada aparece
como uma piscada no story do Instagram; a fusão evita.

- **O cartão** dura o áudio dele (de 1,5 a 8 s) ou, sem áudio, o `finalizacao.cartao.duracao` (2,5 s
  por padrão). A cena é o quadro do vídeo de origem no fim do último trecho, e não o quadro vertical do
  corte: horizontal, ela cobre o fundo inteiro sem perder rosto, e vem sem a legenda. Por causa da
  cena, o cartão se desenha uma vez por corte (`trabalho/<corte>/cartao-<hash>/`): uns 20 s.
- **O vídeo de assinatura** é convertido uma vez por vídeo de origem (`trabalho/assinatura-<hash>/`),
  na cadência do corte, e dura o que ele dura.
- O som da finalização sai em **-14 LUFS**, medido e aplicado em duas passadas, como a fala do corte.
- A finalização aparece também nas prévias, para a mesa mostrar o que vai ser entregue.
  `--sem-finalizacao`, no `previa` e no `render`, tira.

A finalização conta na duração do vídeo publicado, e quem desliza nela conta como quem não assistiu
até o fim. Por isso ela é curta, e o `aprendizado` mede a retenção do vídeo inteiro.

## A entrega

| | |
|---|---|
| Vídeo | H.264 High 4.2, 1080×1920, CRF 17, `preset slow`, yuv420p, `+faststart`, sem quadros B e sem metadados |
| Quadros | os da fonte (24, 25, 30, 50 ou 60); quadro variável sai a 30 |
| Áudio | AAC 192 kbps, 48 kHz, em **-14 LUFS** e pico de -1,5 dB, medido em duas passadas |
| Emendas | cada pedaço tem um número inteiro de quadros, com o áudio no mesmo intervalo exato, e 12 ms de fade em cada corte de pausa, para não estalar |
| Prévia | 360×640, CRF 28, sem a segunda passada do volume |

Com pedaço que não cai no quadro, o vídeo e o áudio de cada emenda saem com durações diferentes e a
fala atrasa um pouco a cada emenda: num corte de 50 emendas, 0,27 s no fim, com a legenda adiantada e
a última palavra cortada. Por isso o recorte se monta em quadros inteiros, e o `render` acusa
`PROBLEMA` quando o recorte não dura o que o plano dava.

O vídeo passa por uma codificação quase sem perda (o recorte, CRF 12) e só a entrega tem perda
visível. O `render` confere cada arquivo pelo ffprobe (medida, codec, pixel e duração contra o plano)
e tira três quadros de conferência, mais um da finalização; olhe todos antes de entregar.

Todo intermediário que o cache reaproveita (trechos, recorte, legenda, realce, finalização) nasce num
nome temporário e só ganha o nome final quando termina: um comando interrompido não deixa arquivo
pela metade. E toda chave de cache leva a identidade do arquivo da fonte: trocar o vídeo refaz tudo.
