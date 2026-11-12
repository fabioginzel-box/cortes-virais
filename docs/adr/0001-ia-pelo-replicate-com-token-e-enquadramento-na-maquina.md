# A IA roda no Replicate pelo token, com a Gemini API como opção, e o enquadramento roda na máquina

A transcrição (`elevenlabs/scribe-v2`), a segunda opinião que vê o vídeo (`google/gemini-3.1-pro`) e o
realce opcional (`topazlabs/video-upscale`) rodam no Replicate, chamados pelos scripts com um token da
pessoa que usa a skill, guardado no chaveiro do sistema ou numa variável dela. Quando existe a
`GEMINI_API_KEY`, o Gemini assiste pela Gemini API do Google, e não pelo Replicate. Quem escolhe os
momentos é o Claude, lendo a transcrição e o que o Gemini viu. O enquadramento, a legenda e o vídeo
saem na máquina de quem usa: o MediaPipe acha os rostos no Chrome, o Chrome desenha a legenda e o
ffmpeg monta o corte.

## Status

accepted

## Considered Options

- **Um conector de IA da conversa (MCP) em vez do token**: rejeitado. A saída do Scribe v2 é um JSON
  com cada palavra, o tempo e o falante, e o de um vídeo de uma hora passaria inteiro pela conversa, o
  que não cabe. O conector também não sobe arquivo local, e o áudio e o vídeo do corte são locais.
- **Transcrição local (Whisper)**: rejeitado como caminho padrão. Pede um ambiente Python, tem
  qualidade menor em português e não marca risos nem separa falantes tão bem.
- **Uma ferramenta paga de cortes (OpusClip e parecidas)**: rejeitado. O critério de viral fica no
  servidor dela, não aprende com o canal, cobra crédito por vídeo e não deixa abrir o corte com uma
  frase de outro ponto nem juntar trechos.
- **Enquadramento no Replicate**: rejeitado. O `luma/reframe-video` recria as bordas com IA em vez de
  recortar, aceita 10 s por vez e sai em 720p; nenhum modelo de lá liga a voz ao rosto de quem fala.
- **MediaPipe em Python**: rejeitado. Pediria um ambiente Python na máquina; o mesmo MediaPipe roda em
  WebAssembly no Chrome que a skill já usa, servido por um servidor local.
- **Só o Gemini do Replicate**: rejeitado. No primeiro teste real ele recusou toda mídia com o erro
  genérico E001, por arquivo enviado, por data URL e por URL pública. A Gemini API direta é o plano B,
  ligado só pela presença da chave, para quem não quiser não precisar de uma segunda conta.

## Consequences

- Quem usa precisa de uma conta no Replicate com crédito e de um token. O `replicate.jsonl` de cada
  vídeo registra as predições, e o `gemini-api.jsonl`, as chamadas à Gemini API.
- O token nunca passa pela conversa: a skill ensina o comando e a pessoa guarda no terminal dela
  (Keychain no Mac, variável do usuário no Windows, `secret-tool` ou `~/.profile` no Linux).
- O Gemini 3.1 Pro não tem nível gratuito na Gemini API; um modelo mais barato serve pela variável
  `CORTES_VIRAIS_GEMINI_MODELO`.
- O Claude não recebe vídeo nem áudio. Por isso o Gemini assiste ao vídeo em partes de 20 min, com
  1 min de sobra entre elas, e aponta riso, reação e o que aparece na tela; o Claude cruza isso com a
  transcrição.
- O detector de rosto padrão do FaceLandmarker não acha rosto de lado e a meia distância, o plano de
  podcast; o FaceDetector de longo alcance acha. A detecção usa o de longo alcance para achar o rosto e
  o FaceLandmarker num recorte em volta dele para medir a boca, que liga cada voz ao rosto.
- O zoom no rosto é limitado pela ampliação da entrega (no máximo 2x sobre o recorte): num vídeo 1080p
  quase não há zoom. O arquivo original em 4K sai melhor que o download do YouTube.
