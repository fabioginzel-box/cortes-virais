# Glossário

As palavras que a skill, os scripts e a documentação usam com um sentido só. Quando duas palavras
parecem servir, vale a daqui.

**Vídeo de origem**:
O vídeo longo de onde saem os cortes, no arquivo original da gravação ou baixado do YouTube. No código
e nos comandos é a "fonte" (`fonte.json`, `node cortes.js fonte`).
_Avoid_: "vídeo original" quando pode ser o download.

**Fonte (da letra)**:
O arquivo de tipografia da identidade visual (`marca.json`, campo `fonte`). Nunca é o vídeo de origem;
na dúvida, escreva "fonte da letra" ou "tipografia".

**Corte**:
Um vídeo vertical 9:16, de 25 a 60 s em geral, feito de um ou mais trechos do vídeo de origem, com
legenda e, quando o canal quer, finalização.
_Avoid_: "clipe", "short" para o corte pronto.

**Candidato**:
Um corte proposto pelo Claude no `candidatos.json`, antes do `conferir` e da mesa. Vira corte quando é
aprovado.

**Trecho**:
Um pedaço contínuo do vídeo de origem que toca no corte. Um corte tem um ou mais trechos, na ordem em
que tocam.

**Abertura no ponto alto**:
O primeiro trecho de um corte quando ele é a frase mais forte, tirada do meio ou do fim do momento,
antes da história desde o começo.

**Gancho**:
O que faz a pessoa parar de rolar o feed nos primeiros segundos: a nota `gancho` da régua, o
`tipo_gancho` e o texto do card.

**Card do gancho**:
O texto curto nos primeiros 4 s do corte, num cartão nas cores do canal. Complementa a fala, não a repete.

**Limpeza**:
O corte das pausas longas e dos vícios ("hum", "éé") dentro dos trechos, feito pelo `conferir` no modo
`dinamico`, `natural` ou `sem`.

**Mantido**:
Um pedaço do vídeo de origem que sobrou depois da limpeza. A linha do tempo do corte é a soma dos
mantidos, na ordem em que tocam.

**Plano**:
Um intervalo do corte com o mesmo enquadramento: um rosto, a tela dividida ou a tela inteira sobre ela
mesma desfocada. O `plano.json` é outra coisa: o resultado do `conferir`, com todos os cortes.

**Canal**:
Um perfil em `canais/<canal>/`, com a identidade visual, a régua e o histórico. Cada pasta de vídeo
pertence a um canal. Um editor que corta para três podcasts tem três canais.

**Identidade visual**:
O que o `marca.json` de um canal define: a fonte da letra, as cores da legenda e do card, o estilo da
palavra ativa, a caixa alta, o tamanho e a finalização. No código, a "marca".

**Estilo pronto**:
Um dos três pontos de partida da identidade (`classico`, `marca`, `impacto`). O `marca.json` guarda o
estilo e só o que mudou nele.

**Palavra ativa**:
A palavra da legenda que está sendo dita naquele quadro, com fundo colorido, só troca de cor ou nada.

**Destaque**:
As palavras de `destaques` de um corte, pintadas na cor de destaque do canal quando não estão sendo
ditas. Não confundir com a palavra ativa.

**Finalização**:
O que entra no fim de cada corte, pelo canal: nenhuma, o cartão ou o vídeo de assinatura. Entra com
uma fusão de 0,25 s.
_Avoid_: "tela final", "encerramento", "outro".

**Cartão**:
A finalização desenhada pela skill: a cena do fim do corte desfocada, o logo, o título, o botão e o
apoio do canal.

**Vídeo de assinatura**:
A finalização que o canal já tem pronta, num arquivo de vídeo, colada no fim de cada corte.

**Prévia**:
O corte em 360×640, sem a segunda passada do volume, feito para a mesa.

**Mesa (de aprovação)**:
A página onde alguém assiste às prévias, ajusta título, gancho, descrição e hashtags e aprova. É um
artefato do claude.ai ou a mesa local, servida pela skill no navegador da máquina.

**Régua**:
Os pesos das cinco notas (gancho, sozinho, emoção, valor, desfecho) que dão a nota do corte, e a nota
mínima. A padrão está no código; a do canal, no `regua.json`.

**Histórico (do canal)**:
Os números do YouTube Studio de cada corte publicado, registrados uma semana depois no
`historico.jsonl` do canal. O `aprendizado` resume o histórico.

**Realce**:
A ampliação pela Topaz, no Replicate, para fonte de 1080 linhas ou menos. Opcional e cobrada à parte.
