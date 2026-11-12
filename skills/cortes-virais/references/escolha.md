# A escolha dos momentos

É a etapa que mais pesa no resultado: um corte mal escolhido não se salva na edição. Você escolhe
lendo duas fontes. A transcrição (`falas.txt`) traz cada frase com início, fim e falante. Os
momentos do Gemini (`momentos.txt`) trazem o que só se vê ou se ouve: riso, reação, energia, gesto e
o que aparece na tela. O Claude não recebe vídeo, por isso o Gemini assiste por você.

De onde veio cada regra está em [boas-praticas.md](boas-praticas.md).

## Antes de escolher

- **Leia o aprendizado.** `node scripts/cortes.js aprendizado` mostra que tipo de gancho e que duração
  seguraram o público no canal, e se a nota da régua abaixo acerta. Quando houver dado, ele
  vale mais que a régua: puxe para o que funcionou.
- **Leia a transcrição inteira**, em partes se for longa, antes de escrever o primeiro candidato. O
  melhor momento costuma estar no meio, depois que a conversa esquentou.
- **Cruze com o Gemini.** Momento que a transcrição e o Gemini apontam juntos é o mais forte. Momento
  só do Gemini (uma reação muda, uma prova na tela) vale quando a fala em volta faz sentido sozinha.

## Quantos e de que tamanho

- **De 10 a 15 candidatos**, para a mesa ter escolha. Em vídeo curto (menos de 15 min), 5 a 8.
  Melhor menos cortes bons do que encher com corte fraco: sem momento forte, diga isso.
- **Duração de 25 a 60 s**, o ideal entre 30 e 45 s. O `conferir` avisa fora de 25 a 60 s e recusa
  menos de 15 s e mais de 90 s depois da limpeza. Acima de 45 s, só se o fim segura: as plataformas
  medem a retenção, não a duração. Corte de mais de 60 s só para uma história com começo, meio e fim.
- **Assuntos diferentes**, com pelo menos 2 min de distância na fonte entre um corte e outro. O
  `conferir` descarta o que repete mais da metade de um corte com nota maior.

## A régua

Cada candidato leva cinco notas de 0 a 100. O `conferir` calcula a nota final com estes pesos, e um
gancho abaixo de 60 segura a nota final em 59, porque sem gancho ninguém fica para ver o resto.

| Nota | Peso | O que mede |
|---|---|---|
| `gancho` | 0,30 | Os 3 primeiros segundos fazem a pessoa parar de rolar o feed? |
| `sozinho` | 0,25 | Quem nunca viu o vídeo entende sem o que veio antes? |
| `emocao` | 0,20 | Riso, surpresa, indignação, convicção, tensão |
| `valor` | 0,15 | Ensina algo, traz um número, uma opinião forte ou uma história |
| `desfecho` | 0,10 | Termina numa conclusão, na punchline ou numa frase que fica |

Quando o aprendizado do canal pede outra régua, os pesos novos vão em `regua.json`, na pasta dos
cortes, e só com o sim de quem pediu: `{ "pesos": { "gancho": 0.35, "sozinho": 0.25, "emocao": 0.15,
"valor": 0.15, "desfecho": 0.10 }, "nota_minima": 60 }`. Os pesos somam 1; o `conferir` recusa o
arquivo que não soma.

### Os tipos de gancho

Grave o tipo em `tipo_gancho`: é por ele que o aprendizado compara os cortes.

| `tipo_gancho` | Exemplo | Faixa típica do `gancho` |
|---|---|---|
| `contrario` | "Guardar dinheiro na poupança é perder dinheiro." | 80 a 100 |
| `curiosidade` | "Tem um detalhe nisso que ninguém fala." | 75 a 95 |
| `promessa` | "Em 30 segundos você vai entender por que…" | 70 a 90 |
| `quebra` | uma reação, um riso, uma frase fora do esperado | 70 a 90 |
| `resultado` | "Isso fez a gente economizar R$ 2 mil." | 65 a 85 |
| `meio_da_acao` | a história já começando no meio | 60 a 80 |
| `pergunta` | "Você sabia que…?" | 55 a 75 |
| `apresentacao` | "Então, hoje eu quero falar sobre…" | 10 a 40 |

Some até 10 pontos ao gancho por um número concreto, um nome conhecido ou uma experiência própria
("eu testei").

### O que derruba o `sozinho`

- Começar com "e", "mas", "então", "aí", "isso", "ele/ela" sem dizer quem, "como eu falei". O
  `conferir` avisa quando o corte começa assim.
- Precisar de um contexto que ficou de fora. Numa opinião, inclua a pergunta que a provocou. Numa
  piada, o corte vai da preparação à punchline e à reação, inteiro.
- Terminar no meio da frase, ou na preparação do próximo assunto.
- Mais de 30% de enrolação antes de chegar ao ponto.

## A edição que o corte pode pedir

O corte não precisa ser um trecho contínuo. `trechos` é a lista do que toca, na ordem em que toca:

- **Abertura no ponto alto (cold open):** o primeiro trecho é a frase mais forte do momento (2 a 6 s),
  tirada do meio ou do fim, e depois vem a história do começo. A frase pode repetir lá dentro. Use
  quando o momento demora a esquentar e tem uma frase que segura sozinha.
- **Juntar trechos:** quando a ideia está espalhada, com uma digressão no meio, pule a digressão. Cada
  trecho começa e termina em frase inteira.
- **Pausas e vícios** o `conferir` tira sozinho, pelo modo de limpeza: `dinamico` (o padrão),
  `natural` (respira mais, para conversa emocional) ou `sem`. Riso não é cortado.

Não invente edição para mostrar trabalho. Um trecho contínuo bem escolhido é o caso comum.

## O gancho na tela, o título e o texto

- **`gancho`**: o card dos primeiros 4 segundos. Até 40 caracteres e 2 linhas, e não repete
  as primeiras palavras faladas: complementa ("Ele perdeu R$ 900 no primeiro mês" sobre a fala "eu
  achei que era fácil").
- **`titulo`**: o título do Short, até 100 caracteres (o limite do YouTube). Específico e concreto,
  com conflito, virada ou número, sem cara de manchete de jornal e sem emoji. Entre 8 e 15 palavras é
  o normal.
- **`descricao`**: duas ou três frases sobre o corte e de onde ele vem (o episódio, o convidado).
- **`hashtags`**: até 3, que o YouTube mostra acima do título. `#shorts` não precisa.
- **`porque`**: uma frase sobre por que este corte prende. Vai para a mesa.
- **`layout`**: `auto` (o padrão: segue quem fala e divide a tela nos momentos em que os dois reagem,
  numa troca rápida de fala ou num riso), `dividido` (os dois rostos empilhados o corte inteiro),
  `rosto` (um rosto só) ou `tela` (gravação de tela, slide ou produto, sobre fundo desfocado).
- **`destaques`**: até três palavras ou frases curtas por corte que carregam o argumento (o número, o
  nome, a palavra forte), pintadas na legenda. Sem destaque, tudo fica igual.
- **`impacto`**: a frase de efeito, uma por corte no máximo, que ganha o zoom seco. Use na punchline ou
  na revelação, nunca na frase do gancho, que já tem o card.

## Depois do `conferir`

O `conferir` ajusta as bordas a palavra e frase, tira pausa e vício e imprime, de cada corte, o que se
ouve na versão editada e o texto em volta do fim. Releia cada um como quem nunca viu o vídeo:

1. **Faz sentido sozinho?** Se não, puxe o início para trás até o contexto, ou descarte o corte.
2. **O fim está limpo?** Olhe o "em volta do fim". Se a frase seguinte fecha a ideia, estenda o fim
   até ela; se o fim já é a preparação do próximo assunto, recue.
3. **As notas continuam valendo** depois de ver o texto editado? Corrija o `candidatos.json`.

Rode o `conferir` de novo até não sobrar `PROBLEMA` e até os avisos que restarem serem escolha sua.
