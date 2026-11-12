---
name: cortes-virais
description: 'Transforma um vídeo longo (podcast, entrevista, live, palestra) em cortes verticais 9:16 para YouTube Shorts, Reels e TikTok: transcrição com o tempo de cada palavra e quem fala (Scribe v2), o Gemini assistindo ao vídeo, a escolha dos momentos por uma régua de gancho e pelo histórico do canal, pausas e vícios cortados, enquadramento que segue quem fala, legenda palavra a palavra e card do gancho na identidade visual do canal, finalização opcional, áudio em -14 LUFS e realce opcional (Topaz). Mostra as prévias numa mesa de aprovação e só gera a versão final do que for aprovado. No primeiro uso, ensina a instalar o que falta e configura a identidade visual. Só no Claude Code. Use quando disserem "faz cortes desse vídeo", "cortes virais", "transforma o podcast em shorts", "corta o episódio pro Reels", "clipes pro TikTok", "muda a identidade dos cortes" ou mandarem um link do YouTube pedindo cortes. NÃO use para editar um vídeo inteiro nem para publicar nas plataformas, que é manual.'
---

# Cortes virais

Um vídeo longo vira de 5 a 15 cortes verticais, cada um com gancho nos primeiros segundos, legenda
palavra a palavra e o enquadramento em quem está falando, na identidade visual do canal. Quem escolhe os
momentos é você, lendo a transcrição e o que o Gemini viu no vídeo; os scripts fazem o resto: ajustam as
bordas, cortam pausa e vício, acham os rostos, desenham a legenda e montam o vídeo. Nada vai para o canal
sem a aprovação de alguém na mesa.

O desenho e o porquê estão nas ADRs de `docs/adr/` do repositório da skill; de qual skill pesquisada
veio cada regra, em [references/boas-praticas.md](references/boas-praticas.md).

Os scripts ficam em `scripts/`, com uma entrada só: `node scripts/cortes.js <comando>`. Chame pelo
caminho absoluto da pasta desta skill.

## Antes de começar

1. **O ambiente.** Rode `node scripts/cortes.js ambiente`. Precisa do Node 22, do ffmpeg, do Chrome e
   de um token do Replicate; o yt-dlp só para baixar do YouTube. Faltando algo, conduza o setup de
   [references/setup.md](references/setup.md): ofereça rodar você mesmo a instalação dos programas
   (com o OK da pessoa) e, para o token, explique como criar e dê o comando para a pessoa guardar
   **no terminal dela**. Nunca peça para colar um token na conversa. Rode o `ambiente` de novo no fim.
   No chat do claude.ai e no Cowork a skill não roda; diga isso logo.
2. **A identidade visual.** Rode `node scripts/cortes.js canal`.
   - Nenhum canal: é o primeiro uso. Pergunte se a pessoa quer configurar a identidade agora (uma
     entrevista curta) ou começar com o estilo neutro, o Clássico, e ajustar depois. Siga
     [references/marca.md](references/marca.md) nos dois casos: ela cria o canal, mostra uma amostra e
     só segue com a aprovação.
   - Um canal: siga com ele.
   - Vários: pergunte de qual canal é o vídeo.
   - Canal com `PROBLEMA`: corrija o `marca.json` antes, por [references/marca.md](references/marca.md).
   Quando a pessoa pedir para mudar a identidade ("muda minha identidade", "quero outra cor na
   legenda"), faça só isso, pela mesma referência.
3. **Os direitos.** Corte vídeo da pessoa ou de quem autorizou. Se o link for de um canal de terceiro,
   pergunte antes de seguir.
4. **A pasta.** `node scripts/cortes.js pasta <nome curto> [--canal <canal>]` cria a pasta do vídeo,
   grava nela o canal e imprime o caminho (em `~/Documents/Cortes-Virais/`). Tudo deste vídeo fica nela.

## 1. A fonte

`node scripts/cortes.js fonte <pasta> <arquivo ou URL>`. Peça o **arquivo original da gravação** se
ele existir: sai mais nítido que o download do YouTube, e em 4K o enquadramento pode dar zoom no rosto
sem borrar. Com uma URL, o yt-dlp baixa na maior qualidade que houver. O comando diz a medida, a
duração e se a fonte é pequena para o 9:16.

## 2. A transcrição

`node scripts/cortes.js transcrever <pasta> --termos "<marca>,<nomes próprios>" [--falantes N] [--idioma pt]`.
Os `--termos` acertam marca, produto e nome de quem fala; pergunte quem está no vídeo se não souber.
O `--falantes` é o máximo de vozes: conte a mesa inteira (apresentador, convidados). Com um número
menor que o real, o Scribe junta vozes num falante só e o enquadramento erra quem fala; na dúvida,
deixe sem, que ele descobre sozinho. O `--idioma` é o código ISO do vídeo (`pt` é o padrão); em outro
idioma tudo funciona, mas a lista de vícios cortados é a do português. Confira a divisão por falante
que o comando imprime. Ele grava o `falas.txt` (uma frase por linha, com início, fim e falante) e diz
quantos falantes e que sons achou (risos, aplausos). Uma hora de áudio leva uns minutos.

## 3. O Gemini assiste

`node scripts/cortes.js assistir <pasta>`. O Gemini vê o vídeo em partes de 20 min, ao mesmo tempo, e
grava em `momentos.txt` o que só se vê ou se ouve: riso, reação, energia, gesto, prova na tela. Ele dá
também a visão geral (quantas pessoas, formato, tema). Com a `GEMINI_API_KEY`, ele assiste pela Gemini
API do Google; sem ela, pelo Replicate.

Se ele falhar, siga sem ele: a escolha sai da transcrição, com os risos que o Scribe marcou, e diga
isso a quem pediu. O Gemini do Replicate já recusou toda mídia com o erro genérico E001; vale tentar
de novo outro dia ou usar a Gemini API ([references/setup.md](references/setup.md#a-gemini-api-opcional)).

## 4. Os candidatos

Siga [references/escolha.md](references/escolha.md):

1. Rode `node scripts/cortes.js aprendizado --canal <canal>` e leve em conta o que funcionou no canal.
2. Leia o `falas.txt` inteiro (em partes, se for longo) e o `momentos.txt`.
3. Escreva de 10 a 15 candidatos em `<pasta>/candidatos.json`, no formato de
   [references/formato.md](references/formato.md): os trechos, as cinco notas, o tipo de gancho, o
   texto do card, o título, a descrição, as hashtags, o porquê, o layout e, quando houver, as
   palavras de destaque da legenda (`destaques`) e a frase de impacto que ganha zoom (`impacto`).

## 5. A conferência

`node scripts/cortes.js conferir <pasta>`. Ele ajusta as bordas a palavra e frase, tira pausa e vício
(`--limpeza natural` para conversa emocional, `sem` para não mexer), calcula a nota pela régua do
canal, descarta o que se repete e imprime, de cada corte, o que se ouve na versão editada e o texto em
volta do fim.

Releia cada corte como quem nunca viu o vídeo, pelos três passos do fim de
[references/escolha.md](references/escolha.md#depois-do-conferir), corrija o `candidatos.json` e rode
de novo até não sobrar `PROBLEMA`.

**A grafia.** O que se ouve é o texto que vai na legenda. Procure nome próprio, marca e número
escritos errado ("a cme", um nome sem a grafia da pessoa, "mil e quinhentos" que devia ser
"R$ 1.500") e grave as trocas em `<pasta>/correcoes.json`, como `[{ "de": "a cme", "para": "Acme" }]`.
O `conferir` já mostra o texto corrigido; rode de novo até ele sair certo.

Mostre na conversa a lista que ficou: nota, duração, gancho e título de cada corte.

## 6. As prévias

`node scripts/cortes.js previa <pasta>`. Para cada corte ele acha os rostos (5 quadros por segundo, no
Chrome), liga cada voz ao rosto que fala, monta o vídeo com a legenda e o card na identidade do canal
e grava em `<pasta>/previas/`, já com a finalização do canal, se houver. Ele diz o enquadramento de
cada um ("segue quem fala, 4 trocas", "tela dividida", "tela inteira, sem rosto"). Se um corte saiu
com o layout errado, mude o `layout` dele no `candidatos.json`, rode o `conferir` e a `previa` daquele
corte (`--cortes 3`). Uns 40 s por corte, mais o cartão final, quando houver, que se desenha para cada
corte porque mostra a cena do fim dele. `--sem-finalizacao` tira a finalização.

## 7. A mesa de aprovação

**Com a ferramenta de artefatos do Claude Code** (a mesa vira um artefato privado no claude.ai, que a
pessoa pode compartilhar):

1. `node scripts/cortes.js mesa <pasta> --saida <rascunho>/artefato-cortes` monta a pasta do artefato
   e imprime, em JSON, o que publicar: `root`, `file_path`, `files` e `capabilities`. O `--saida` vai
   para a pasta de rascunho da sessão: a ferramenta de artefatos só publica arquivos de lá.
2. Publique com a ferramenta de artefatos exatamente esses quatro campos, mais `icon: "video"` e uma
   `description` de uma linha. Se ele avisar que as prévias passam de 64 MB, publique a página com
   metade dos arquivos e depois o resto, no mesmo endereço.

**Sem a ferramenta de artefatos** (ou se a pessoa preferir): `node scripts/cortes.js mesa <pasta> --local`,
**em segundo plano**. Ele serve a mesma mesa em `http://127.0.0.1:<porta>/`, abre o navegador e grava
cada aprovação em `<pasta>/mesa/cortes/`. Dê o endereço que ele imprimir. A mesa local fica aberta
por 2 horas (`--minutos` muda) ou até você parar o comando.

Nos dois casos, explique em poucas linhas: cada corte tem a prévia, a nota e os avisos; marcar
**Aprovar** já aprova; dá para mudar o título, o gancho, a descrição e as hashtags (a prévia mostra o
gancho original; o final sai com o da mesa). De 3 a 5 cortes por vídeo costuma bastar: o resto pode
ficar para outra semana. Quando terminar, a pessoa volta e diz "gera os cortes aprovados".

**Sem mesa nenhuma:** mostre as prévias na conversa, com a lista da etapa 5, pergunte quais seguem e
rode `aprovar --cortes 1,3` com os escolhidos.

## 8. A versão final

1. Leia as aprovações:
   - **Artefato:** apague `<pasta>/mesa`, se existir; leia a coleção `cortes` do banco do artefato
     (ferramenta `ArtifactData`, ação `list`, com `out_dir` em `<pasta>/mesa`).
   - **Mesa local:** pare o comando da mesa; as aprovações já estão em `<pasta>/mesa/cortes/`.

   Depois rode `node scripts/cortes.js aprovar <pasta>`. Ele grava o `aprovado.json` e lista os
   aprovados.
2. `node scripts/cortes.js render <pasta>`, com `--realce` quando a fonte tem 1080 linhas ou menos
   (passa pela Topaz no Replicate; ver [references/estilo.md](references/estilo.md#o-realce)). Sai em
   `<pasta>/final/` um MP4 1080×1920 e um `.txt` com título, descrição e hashtags por corte, com a
   finalização do canal no fim ([references/estilo.md](references/estilo.md#a-finalização));
   `--sem-finalizacao` tira.
3. **Olhe os quadros de conferência** (`final/conferencia/`, a 10, 50 e 90% de cada corte e um da
   finalização) antes de entregar: legenda dentro da tela, rosto enquadrado, card legível. Se o `render`
   imprimir `PROBLEMA`, corrija e rode de novo só aquele corte.

## 9. A entrega

Mostre os MP4 na conversa e dê o caminho da pasta `final/`, um arquivo por linha, com o título de
cada um. A skill não publica nada: quem sobe no YouTube, no Instagram e no TikTok é a pessoa, com o
texto do `.txt`. Lembre que, uma semana depois de publicar, vale trazer os números (próxima seção).

## O aprendizado

Uma semana depois de publicado, peça os números do YouTube Studio de cada corte (visualizações,
duração média vista em %, e, se tiver, "assistiram em vez de deslizar" em %) e registre:

```bash
node scripts/cortes.js registrar <pasta> <corte> --visualizacoes 12000 --retencao 74 --continuaram 68 --url https://youtube.com/shorts/...
```

O histórico é por canal. O `aprendizado` resume por tipo de gancho e por duração, e diz se a nota da
régua acerta a retenção. É ele que a etapa 4 lê antes de escolher. Com o resumo mostrando um padrão
claro (o acerto da nota abaixo de 0,3 com 10 cortes ou mais, ou um tipo de gancho muito acima dos
outros), proponha novos pesos e, com o sim de quem pediu, grave em `regua.json`, na pasta do canal
(formato em [references/escolha.md](references/escolha.md#a-régua)). O `conferir` passa a usar os pesos
de lá.

## Erros a evitar

1. Pedir, aceitar ou repetir um token na conversa: ele é guardado pela pessoa, no terminal dela.
2. Começar a cortar sem canal, ou com o `marca.json` com `PROBLEMA`.
3. Escolher os cortes só pelo começo do vídeo, sem ler a transcrição inteira.
4. Pular a releitura depois do `conferir`: é ela que pega o corte que não faz sentido sozinho.
5. Repetir no card do gancho as primeiras palavras faladas.
6. Encher a lista com corte de nota abaixo de 60 para chegar a 10.
7. Gerar a versão final sem a aprovação de alguém, na mesa ou na conversa.
8. Entregar sem olhar os quadros de conferência.
9. Usar o download do YouTube quando a pessoa tem o arquivo original.
