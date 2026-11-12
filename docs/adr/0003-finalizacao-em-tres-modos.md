# A finalização do corte tem três modos: nenhuma, o cartão e o vídeo de assinatura

O fim de cada corte segue o `finalizacao.modo` do canal: `nenhuma` (o padrão), `cartao` (um template
genérico desenhado no Chrome: a cena do fim do corte desfocada ao fundo, o logo, o título, o botão e o
apoio do canal, com um áudio opcional) ou `video` (o vídeo de assinatura que o canal já tem, encaixado
no 9:16). O cartão e o vídeo entram com uma fusão de 0,25 s sobre os últimos quadros do corte, e a fala
do corte esmaece no mesmo intervalo.

## Status

accepted

## Considered Options

- **Uma animação de marca elaborada, com o logo virando parte da cena**: rejeitado. Uma animação desse
  tipo só fica boa com o logo para o qual foi desenhada; generalizada, vira um efeito que não combina
  com a marca de ninguém.
- **Só `nenhuma` e `video`**: rejeitado. A maioria dos canais pequenos não tem um vídeo de assinatura;
  sem o cartão, eles ficariam sem chamada no fim.
- **Corte seco do vídeo para a finalização**: rejeitado. Um corte seco para uma tela parada aparece como
  uma piscada no story do Instagram; a fusão evita.
- **Áudio do cartão sempre de duração fixa**: rejeitado. Uma vinheta ou uma narração curta tem a duração
  dela; o cartão passa a durar o áudio, de 1,5 a 8 s.

## Consequences

- A finalização conta na duração do vídeo publicado (`duração do corte − 0,25 s + finalização`), e quem
  desliza nela conta como quem não assistiu até o fim. Por isso o padrão é `nenhuma` e o cartão sem
  áudio dura 2,5 s.
- O cartão se desenha uma vez por corte, porque mostra a cena do fim dele (uns 20 s); o vídeo de
  assinatura se converte uma vez por vídeo de origem.
- Vídeo de assinatura que não é vertical entra inteiro na largura, sobre ele mesmo desfocado, como o
  layout de tela inteira.
- O som da finalização sai em -14 LUFS, medido em duas passadas, como a fala do corte.
- `--sem-finalizacao` tira a finalização de um vídeo, sem mexer no canal.
