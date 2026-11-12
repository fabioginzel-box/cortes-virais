# A identidade visual mora num perfil por canal, configurado numa entrevista no primeiro uso

Cada canal é uma pasta em `canais/<canal>/` com o `marca.json` (a identidade visual), o `regua.json` (a
régua do aprendizado) e o `historico.jsonl` (os números dos cortes publicados). O `marca.json` guarda um
de três estilos prontos (`classico`, `marca`, `impacto`) e só o que a pessoa trocou nele. Cada pasta de
vídeo grava o canal dela no `canal.json`. No primeiro uso, sem canal, a skill pergunta se a pessoa quer
configurar agora, numa entrevista curta, ou começar com o estilo neutro; nos dois casos mostra uma
amostra antes de cortar.

## Status

accepted

## Considered Options

- **Uma identidade só por máquina**: rejeitado. Quem corta para mais de um canal (o editor freelancer,
  a agência) teria de reescrever o arquivo a cada vídeo, e o histórico e a régua misturariam a
  retenção de públicos diferentes.
- **Perfis só de identidade, com aprendizado único**: rejeitado pelo mesmo motivo: o que segura a
  audiência de um canal não diz nada sobre o de outro.
- **Só documentar o arquivo no README, sem entrevista**: rejeitado. A maior parte de quem instala não
  vai abrir o README antes do primeiro vídeo; a entrevista, com o estilo neutro para quem tem pressa,
  chega a uma identidade aprovada sem ler nada.
- **Entrevista obrigatória**: rejeitado. Quem quer só testar a skill desiste; o estilo neutro deixa
  começar e ajustar depois.
- **Tudo configurável (posição, palavras por bloco, duração do card)**: rejeitado. A posição pela zona
  segura e os blocos de até 3 palavras são a parte pesquisada que segura a retenção; abrir isso
  convida a quebrar o que funciona.

## Consequences

- A identidade é a fonte da letra, as cores da legenda e do card, o estilo da palavra ativa, a caixa
  alta, o tamanho (P, M, G), o card ligado ou não e a finalização (ADR 0003). O resto é fixo.
- O `marca` valida o arquivo e acusa problema (campo inválido) e aviso (pouco contraste, licença da
  fonte); a `previa` e o `render` param num `marca.json` com problema.
- A impressão da marca (cores, fonte e o arquivo da fonte) entra na chave de cache da legenda: mudar a
  identidade refaz a legenda na próxima prévia, sem refazer o recorte.
- Com um canal só, a skill usa ele sem perguntar; com vários, pergunta qual no começo.
- As fontes embutidas são livres (ADR 0005); a fonte própria fica na pasta do canal.
