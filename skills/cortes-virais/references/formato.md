# Os arquivos da pasta

Tudo de um vídeo fica na pasta que o `pasta` criou, em
`~/Documents/Cortes-Virais/<data>-<nome>/` (ou na pasta de `CORTES_VIRAIS_DIR`).

| Arquivo | Quem grava | O que é |
|---|---|---|
| `fonte.json` | `fonte` | caminho do vídeo, URL de origem, identidade do arquivo (caminho, tamanho e data), medida de exibição, duração e quadros por segundo |
| `audio.m4a` | `transcrever` | o áudio que sobe para a transcrição |
| `transcricao-bruta.json` | `transcrever` | a saída do Scribe v2, como veio |
| `palavras.json` | `transcrever` | cada palavra com início, fim e falante (`S1`, `S2`…), e os sons (`ev: true`) |
| `falas.txt` | `transcrever` | uma frase por linha, `[h:mm:ss.d–h:mm:ss.d] S1: texto`, para você ler |
| `gemini.json` e `momentos.txt` | `assistir` | o que o Gemini viu, com a visão geral do vídeo |
| `candidatos.json` | **você** | os cortes propostos (formato abaixo) |
| `correcoes.json` | **você**, opcional | as trocas de grafia da legenda, `[{ "de": "a cme", "para": "Acme" }]` |
| `plano.json` | `conferir` | os cortes com bordas ajustadas, pedaços mantidos, nota e avisos |
| `enquadramento/<id>.json` | `rostos` (ou `previa`) | os planos 9:16 de cada corte |
| `previas/<id>.mp4` | `previa` | a prévia em 360×640, que vai para a mesa |
| `canal.json` | `pasta` | o canal do vídeo, que dá a identidade visual, a régua e o histórico |
| `mesa/cortes/<id>.json` | você, pelo `ArtifactData`, ou a mesa local | o que a mesa guardou de cada corte |
| `mesa-local/` | `mesa --local` | a página e as prévias da mesa local |
| `aprovado.json` | `aprovar` | os cortes aprovados, com as edições da mesa |
| `final/` | `render` | o MP4 1080×1920 e o `.txt` com título, descrição e hashtags de cada corte; em `conferencia/`, quadros a 10, 50 e 90% do corte e um da tela final |
| `replicate.jsonl` | todos | uma linha por predição no Replicate, para saber o que foi gasto |
| `gemini-api.jsonl` | `assistir`, com a `GEMINI_API_KEY` | uma linha por chamada à Gemini API, com os tokens |
| `trabalho/` | `previa` e `render` | intermediários; pode apagar depois da entrega |

## O `candidatos.json`

```json
{
  "cortes": [
    {
      "id": 1,
      "titulo": "Por que ele largou o emprego fixo para empreender aos 40",
      "gancho": "Ele perdeu R$ 900 no primeiro mês",
      "descricao": "Trecho do episódio 12, com a Ana.",
      "hashtags": ["#empreender", "#carreira"],
      "tipo_gancho": "resultado",
      "porque": "Número concreto no começo e a virada no fim, com riso.",
      "layout": "auto",
      "destaques": ["R$ 900", "primeiro mês"],
      "impacto": ["achei que era fácil"],
      "trechos": [
        { "inicio": "0:42:10.2", "fim": "0:42:14.0" },
        { "inicio": "0:41:31.5", "fim": "0:42:18.9" }
      ],
      "notas": { "gancho": 85, "sozinho": 80, "emocao": 70, "valor": 75, "desfecho": 70 }
    }
  ]
}
```

- `id` é um número que não se repete no arquivo. É ele que aparece na mesa e no nome dos arquivos; o
  `conferir` dá `PROBLEMA` para o id repetido.
- `trechos` vão na ordem em que tocam. Os tempos podem ser `h:mm:ss.d` (como no `falas.txt`) ou
  segundos. Não precisam cair na palavra exata: o `conferir` ajusta. No exemplo, o primeiro trecho é a
  abertura no ponto alto, e o segundo é a história desde o começo. Trechos pedidos em sequência que o
  ajuste das bordas faz se encontrar viram um só, e o `conferir` avisa.
- `destaques` (opcional) são palavras ou frases ditas no corte que a legenda pinta na cor de destaque
  do canal; `impacto`
  (opcional) são frases ditas no corte que ganham um zoom seco de 12% enquanto são faladas. As duas
  se acham sem ligar para caixa, acento e pontuação; o `conferir` avisa a que não está no corte.
- `limpeza` (opcional) troca, só neste corte, o modo de limpeza do `conferir` (`dinamico`, `natural`
  ou `sem`): para o momento que vive de um silêncio.
- `notas`, `tipo_gancho` e o resto seguem [escolha.md](escolha.md).

Na pasta de cada canal, em `canais/<canal>/`, ficam o `marca.json` da identidade
([marca.md](marca.md)), o `historico.jsonl` do aprendizado e, quando a régua foi ajustada, o
`regua.json` (formato em [escolha.md](escolha.md#a-régua)).

## O `aprovado.json`

É o `plano.json` só com os cortes aprovados. Em cada um, o título, o gancho, a descrição e as
hashtags são os da mesa, e `aprovado` diz quem aprovou e quando (`por` é o id da pessoa no claude.ai,
`local` na mesa local, ou `conversa` quando a aprovação foi pelo chat).
