# As fontes embutidas são livres, e a fonte própria fica com o canal

A skill embute três fontes da SIL Open Font License 1.1, uma por estilo pronto: Montserrat ExtraBold
(`classico`), Poppins ExtraBold (`marca`) e Anton (`impacto`), sem recorte nem conversão, com a licença
de cada uma ao lado. A fonte própria de um canal entra por arquivo ou pelo nome no Google Fonts e é
copiada para a pasta do canal, nunca para o repositório.

## Status

accepted

## Considered Options

- **Uma fonte comercial de marca no repositório**: rejeitado. As licenças comuns de fonte comercial,
  mesmo as gratuitas para uso comercial, proíbem repassar o arquivo a terceiros, e um repositório
  público repassa.
- **Uma fonte só embutida**: rejeitado. Os três estilos prontos precisam de caras diferentes para a
  escolha valer alguma coisa.
- **Só fontes do sistema**: rejeitado. A legenda sairia diferente no Mac, no Windows e no Linux, e a
  amostra aprovada numa máquina não seria a entrega de outra.
- **Baixar as fontes do Google Fonts na hora**: rejeitado como padrão. A skill funcionaria só com
  internet e mudaria quando a versão de lá mudasse; as embutidas são fixas.

## Consequences

- O repositório pode ser público e redistribuído com as fontes dentro.
- Quem usa uma fonte própria responde pela licença dela: ela vai embutida na legenda gravada no vídeo,
  no cartão e na mesa de aprovação. O `marca` lembra disso num aviso.
- O Google Fonts serve uma família por nome, uma vez, no peso mais forte que ela tiver (800, 900, 700,
  600 ou 400), num TTF só.
