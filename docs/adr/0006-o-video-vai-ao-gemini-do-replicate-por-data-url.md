# O vídeo vai ao Gemini do Replicate por data URL, em partes de 10 min

Sem a `GEMINI_API_KEY`, o `assistir` subia cada parte do vídeo pelo Files API do Replicate e passava a
URL ao `google/gemini-3.1-pro`. Em 17/11/2026 esse caminho deu 500 na criação da predição, e o mesmo
Gemini respondeu com o vídeo dentro da predição, como data URL. O `assistir` passa a mandar assim.
Muda uma consequência da [ADR 0001](0001-ia-pelo-replicate-com-token-e-enquadramento-na-maquina.md):
as partes do Gemini deixam de ter 20 min, nos dois caminhos.

O teto do data URL no Gemini não é conhecido. A documentação do Replicate só recomenda data URL até
1 MB. O maior vídeo que o Gemini já tinha lido assim era uma parte de 20 min com 9,5 MB de arquivo e
12,7 MB de data URL: o base64 soma um terço. A cópia leve da skill (360p, 2 quadros/s, áudio a
48 kbps) dá 16,2 MB de arquivo em 20 min de um podcast, e quase metade disso é áudio. Em partes de
10 min, com 1 min de sobra, as três partes de um podcast de 26 min deram de 7,3 a 8,3 MB de arquivo
(até 11,1 MB de data URL). No mesmo dia, as três passaram no Gemini do Replicate, de 42 a 59 s cada,
e saíram 15 momentos.

## Status

accepted

## Considered Options

- **A URL do Files API, como antes**: rejeitada. Deu 500 na criação da predição em 17/11/2026.
- **Baixar a taxa de quadros e manter as partes de 20 min**: rejeitada. A 0,5 quadro/s, o mesmo
  podcast ainda daria 12 MB de arquivo, acima dos 9,5 MB que o Gemini já tinha lido, porque o áudio não
  diminui. E um quadro a cada 2 s perde gesto e reação, justamente o que a skill pede ao Gemini.
- **Partes de 20 min a 2 quadros/s**: rejeitada. São 21,6 MB de data URL, e nada mostra que o Gemini
  aceita isso.
- **Partes de 20 min só na Gemini API, que sobe o vídeo pelo Files API do Google**: rejeitada. O prompt
  é o mesmo nos dois caminhos e pede até 8 momentos por parte; com partes de tamanhos diferentes, a
  densidade de momentos mudaria com o caminho.

## Consequences

- Um vídeo de uma hora vira 7 chamadas ao Gemini em paralelo, e não 4. O preço por minuto de vídeo não
  muda, mas a sobra de 1 min a cada 10 cobra uns 10% a mais, e antes eram 5%.
- O prompt pede até 8 momentos por parte, e não 15. A densidade fica perto da de antes, que era de
  15 momentos a cada 20 min.
- A consulta de andamento do Replicate devolve a predição inteira, com o vídeo dentro. Por isso o Gemini
  e a Topaz do realce passam a ser consultados a cada 10 s, e não a cada 3. Mesmo assim, o `assistir`
  de um vídeo de uma hora baixa algumas centenas de MB.
- A lib do Replicate passou a trocar por espaço o caractere de controle cru que torna o JSON da
  resposta inválido. Também repete a consulta de andamento que chega cortada ou cai no meio da leitura.
  A criação cuja resposta não se lê não é repetida, porque a predição pode já existir e seria cobrada
  duas vezes. A criação que recebe 429 ou 5xx continua sendo repetida, como antes.
- Se uma parte passar do que o Gemini aceita, só ela falha, e o `assistir` segue com as outras.
