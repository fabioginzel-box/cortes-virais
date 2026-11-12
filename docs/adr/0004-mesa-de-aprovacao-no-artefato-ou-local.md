# A mesa de aprovação é um artefato do claude.ai ou uma página local

A mesa de aprovação é uma página só (`template/mesa.html`), com as prévias, as notas, os avisos e os
campos de título, gancho, descrição e hashtags de cada corte. Com a ferramenta de artefatos do Claude
Code, ela é publicada como artefato privado no claude.ai e grava cada corte no banco do artefato
(coleção `cortes`). Sem ela, `mesa --local` serve a mesma página em `127.0.0.1` e troca o banco do
artefato por uma API local que grava em `<pasta do vídeo>/mesa/cortes/<id>.json`. O `aprovar` lê dali
nos dois casos. A aprovação pela conversa fica como último recurso.

## Status

accepted

## Considered Options

- **Só o artefato**: rejeitado. Nem toda instalação do Claude Code tem a ferramenta de artefatos; sem
  ela, ver dez prévias e editar títulos pela conversa é lento.
- **Só a mesa local**: rejeitado. O artefato deixa compartilhar a mesa com quem aprova sem estar na
  mesma máquina, o que a página local não faz.
- **Duas páginas, uma para cada caso**: rejeitado. A mesa local injeta na mesma página um
  `window.claude` que imita o banco do artefato; uma correção na mesa vale para os dois.

## Consequences

- A página só grava quando alguém mexe nela, e com o nome de quem mexeu: abrir a mesa não regrava os
  cortes, e uma leitura do banco não atropela o campo que está sendo editado.
- A mesa local escuta só em `127.0.0.1`, recusa id com caminho e documento que não é objeto, e fecha
  sozinha depois de 2 horas (`--minutos`).
- A fonte do canal vai embutida na página nos dois casos; com fonte própria, a licença dela tem de
  permitir.
- O `mesa --saida` só apaga uma pasta que ele mesmo montou (marcada com `.mesa-cortes-virais`), para um
  caminho errado não levar a pasta do vídeo junto.
