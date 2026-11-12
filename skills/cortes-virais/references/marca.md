# A identidade visual do canal

Cada canal tem uma pasta em `~/Documents/Cortes-Virais/canais/<canal>/` com o `marca.json` (a
identidade), o `regua.json` (a régua, quando o aprendizado pediu outra) e o `historico.jsonl` (os
números dos cortes publicados). Os arquivos da marca (fonte própria, logo, áudio e vídeo de
assinatura) são copiados para a mesma pasta. O porquê está na ADR 0002.

O `marca.json` guarda um **estilo pronto** e só o que a pessoa trocou nele. O resto vem do estilo.

## Os estilos prontos

| Estilo | Fonte | Legenda | Palavra que está sendo dita | Card do gancho |
|---|---|---|---|---|
| `classico` (o padrão neutro) | Montserrat ExtraBold | branca, contorno preto | fundo amarelo, texto preto | branco, texto preto |
| `marca` | Poppins ExtraBold | branca, com sombra, sem contorno | fundo na cor da marca (ou degradê de duas) | na cor da marca, texto branco |
| `impacto` | Anton, maior | branca, contorno preto | troca para verde-limão, sem fundo | verde-limão, texto preto |

Todos começam com caixa alta, tamanho M (G no `impacto`), card ligado e sem finalização.

## O primeiro uso

Quando `node scripts/cortes.js canal` não lista nenhum canal, pergunte, numa pergunta só, se a pessoa
quer configurar a identidade agora ou começar com o estilo neutro e ajustar depois.

- **Neutro:** pergunte só o nome do canal e rode `node scripts/cortes.js canal criar "<nome>"`. Gere a
  amostra (abaixo) e siga para o corte.
- **Configurar:** faça a entrevista.

## A entrevista

Uma pergunta por vez, com a sua recomendação, e com a ferramenta de perguntas quando ela existir.
Não pergunte o que a pessoa já disse. Quem tem um manual de marca pode mandar as cores e a fonte de
uma vez: use e pule as perguntas respondidas.

1. **O nome do canal.**
2. **O estilo de partida**, pela tabela acima. Rode `node scripts/cortes.js canal criar "<nome>" --estilo <estilo>`.
3. **A fonte.** Fica a do estilo; ou outra das embutidas (`montserrat`, `poppins`, `anton`); ou a da
   marca, por arquivo (`node scripts/cortes.js marca <canal> --fonte <arquivo .ttf/.otf/.woff2>`) ou
   pelo nome no Google Fonts (`--fonte-google "Bebas Neue"`, baixado uma vez no peso mais forte que
   houver). Lembre que a fonte vai embutida na mesa de aprovação: a licença dela tem de permitir.
4. **A cor principal da marca**, em hexadecimal (`#7C3AED`). Ela vai no fundo da palavra ativa e no
   card; pergunte se quer uma segunda cor para o degradê da palavra ativa.
5. **A palavra que está sendo dita:** com fundo colorido (`fundo`), só trocando de cor (`cor`) ou sem
   destaque (`sem`).
6. **Caixa alta** ou não, e o **tamanho**: P, M ou G.
7. **O card do gancho**, o texto curto dos primeiros 4 segundos: ligado ou desligado, e as cores.
8. **A finalização** de cada corte ([estilo.md](estilo.md#a-finalização)):
   - `nenhuma`;
   - `cartao`: título (até 28 caracteres, como "Curtiu?"), texto do botão (até 24, como "Segue o
     canal"), um apoio opcional (até 40), o logo (PNG com fundo transparente, de preferência:
     `marca <canal> --logo <arquivo>`), um áudio opcional (vinheta ou narração curta: `--audio <arquivo>`;
     com ele, o cartão dura o áudio, de 1,5 a 8 s) e a duração sem áudio (2,5 s é o padrão);
   - `video`: o vídeo de assinatura que o canal já tem (`marca <canal> --video <arquivo>`), colado no
     fim de cada corte.
   Lembre que a finalização conta na duração do vídeo publicado e na retenção: curta é melhor.

Grave as respostas no `marca.json` do canal (Edit), só os campos que mudaram do estilo, e rode
`node scripts/cortes.js marca <canal>`. Ele mostra a identidade inteira, já com o estilo aplicado,
e acusa `PROBLEMA` (campo inválido) e `aviso` (pouco contraste, licença de fonte). Corrija até não
sobrar `PROBLEMA`.

## A amostra

`node scripts/cortes.js amostra <canal> [--fundo <imagem ou vídeo>]` desenha a legenda e o card sobre um
fundo (um quadro do vídeo do canal, se a pessoa tiver um; senão, um degradê) e, com finalização, um
quadro dela. Os PNGs ficam em `<canal>/amostra/`. Mostre as imagens na conversa e ajuste até a pessoa
aprovar. Só depois siga para o corte.

## Mudar a identidade depois

"Muda minha identidade", "quero a legenda maior", "troca a cor": refaça só as perguntas do que muda,
grave no `marca.json`, rode o `marca` e a `amostra`. Os cortes já renderizados não mudam; a próxima
`previa` e o próximo `render` saem com a identidade nova.

## O `marca.json`

```json
{
  "versao": 1,
  "nome": "Meu Podcast",
  "estilo": "marca",
  "fonte": "bebas-neue-400.ttf",
  "legenda": {
    "ativa": { "estilo": "fundo", "fundo": ["#0EA5E9", "#6366F1"], "texto": "#FFFFFF" },
    "tamanho": "G"
  },
  "card": { "fundo": "#0EA5E9" },
  "finalizacao": {
    "modo": "cartao",
    "cartao": { "titulo": "Curtiu o papo?", "botao": "Segue o canal", "logo": "logo.png" }
  }
}
```

| Campo | Valores | O que muda |
|---|---|---|
| `estilo` | `classico`, `marca`, `impacto` | o ponto de partida de tudo abaixo |
| `fonte` | `montserrat`, `poppins`, `anton` ou um arquivo da pasta do canal | a letra da legenda, do card, do cartão e dos títulos da mesa |
| `legenda.texto` | cor | a cor das palavras |
| `legenda.contorno` | cor ou `null` | o contorno das letras; `null` troca o contorno por sombra |
| `legenda.ativa.estilo` | `fundo`, `cor`, `sem` | como aparece a palavra que está sendo dita |
| `legenda.ativa.fundo` | lista de 1 ou 2 cores | o fundo da palavra ativa; duas cores fazem degradê |
| `legenda.ativa.texto` | cor | a letra da palavra ativa |
| `legenda.destaque` | cor | as palavras de `destaques` do corte, quando não estão sendo ditas |
| `legenda.caixaAlta` | `true`, `false` | caixa alta na legenda |
| `legenda.tamanho` | `P`, `M`, `G` | 76, 92 ou 108 px no 1080×1920 (encolhe até caber em 2 linhas) |
| `card.ligado` | `true`, `false` | o card do gancho nos primeiros 4 s |
| `card.fundo`, `card.texto` | cor | as cores do card |
| `finalizacao.modo` | `nenhuma`, `cartao`, `video` | o fim de cada corte |
| `finalizacao.cartao.titulo`, `.botao`, `.apoio` | texto (28, 24 e 40 caracteres) | os textos do cartão; vazio some |
| `finalizacao.cartao.logo` | arquivo .png, .jpg, .webp ou .svg | o logo no alto do cartão |
| `finalizacao.cartao.audio` | arquivo .mp3, .wav, .m4a… | o som do cartão; ele passa a durar o áudio |
| `finalizacao.cartao.duracao` | de 1,5 a 8 | segundos do cartão sem áudio |
| `finalizacao.cartao.cores` | `fundo`, `titulo`, `botao`, `botaoTexto` | sem elas: fundo quase preto, título na cor da legenda, botão nas cores do card |
| `finalizacao.video.arquivo` | arquivo .mp4, .mov, .webm… | o vídeo de assinatura |

As cores vão em hexadecimal: `#RGB`, `#RRGGBB` ou `#RRGGBBAA`. Arquivo vai pelo nome, na pasta do
canal (os comandos `marca --fonte/--logo/--audio/--video` copiam para lá), ou por caminho absoluto.

Fixos, de propósito: a posição da legenda e do card pela zona segura das plataformas e a quebra em
blocos de até 3 palavras ([estilo.md](estilo.md)). São a parte pesquisada, a que segura a retenção.
