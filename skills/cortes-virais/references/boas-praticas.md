# De onde veio cada escolha

Antes de escrever esta skill, em 10/11/2026, lemos o código e o `SKILL.md` de oito skills de cortes
verticais. Todas têm licença MIT. Esta página registra o que copiamos de cada uma, o que
fizemos diferente e por quê, para a próxima revisão não ter de refazer a pesquisa.

## claude-shorts (AgriciDaniel)

O melhor modelo de fluxo com o Claude escolhendo os cortes.

- **Copiado:** a régua de cinco notas com os pesos (gancho 0,30, sozinho 0,25, emoção 0,20, valor
  0,15, desfecho 0,10) e a nota mínima de 60; a tabela de tipos de gancho e as faixas de nota; o bônus
  por número, nome e experiência própria; os sinais de que o corte não fica sozinho; os 2 min de
  distância entre cortes; a tabela de zona segura das plataformas; a conferência da entrega pelo
  ffprobe; nunca renderizar a final sem a aprovação de alguém.
- **Diferente:** ela corta com `-c copy`, que cai no quadro-chave e dessincroniza a legenda; aqui o
  corte recodifica com busca exata. Ela olha 5 quadros por corte e faz um recorte parado; aqui são 5
  quadros por segundo e o recorte segue quem fala. A legenda dela é Remotion (mais um `npm install`);
  aqui é o Chrome que a skill já usa.

## claude-video (AgriciDaniel)

- **Copiado:** o volume em duas passadas (`loudnorm` medido e aplicado em modo linear), -14 LUFS e pico
  de -1,5 dB; a média móvel no recorte que acompanha o rosto; o layout de tela inteira sobre fundo
  desfocado para gravação de tela.
- **Diferente:** ela escolhe os cortes por heurística e listas de palavras em inglês, que não servem
  para português, e recodifica o vídeo de 5 a 6 vezes; aqui só a entrega tem perda visível.

## AI-Youtube-Shorts-Generator (SamurAIGPT)

- **Copiado:** a lista de critérios de viralização (gancho, pico de emoção, opinião forte, revelação,
  conflito, frase de efeito, história, valor prático); o candidato com a frase do gancho e o motivo;
  dividir o vídeo longo em partes de 20 min com 1 min de sobra entre elas, para o momento na fronteira
  não se perder; descartar o candidato que repete mais da metade de outro com nota maior; não encher a
  lista com corte fraco.
- **Diferente:** o enquadramento dele usa o detector Haar e grava em `mp4v`, sem legenda; e a divisão
  em partes tem um erro de deslocamento de tempo que faz sumir os candidatos depois da primeira parte.

## OpenClip (linzzzzzz)

O melhor no acabamento das bordas do corte.

- **Copiado:** a transcrição entregue ao modelo com início e fim de cada frase, com a hora sempre
  escrita (o aviso dele: "00:01:55" é 1 min 55 s, não 1 h 55); recuar até 5 s para começar em início
  de frase e avançar até 8 s para terminar em fim de frase, com pausa de 0,6 s valendo como fronteira;
  os critérios por tipo de conteúdo (piada inteira, da preparação à reação; opinião com a pergunta que
  a provocou); o juiz de "faz sentido sozinho" com conserto das bordas, que aqui é a releitura depois
  do `conferir`; o título específico, sem cara de manchete.
- **Diferente:** não reenquadra para 9:16 e divide o vídeo sem sobra entre as partes.

## OpusClip (opus-skills)

Camada sobre a API paga; o critério de viral fica no servidor dela.

- **Copiado:** as subnotas por corte (gancho, coerência, conexão) junto da nota geral; o card do
  gancho nos primeiros segundos; que cortar fala move a legenda junto; título, descrição e hashtags
  saindo com cada corte; confirmação antes do que é pago e antes do que vai a público.
- **Copiado da sub-skill `copy-video-style`:** o zoom seco de 100% para cerca de 115% na frase de ênfase
  (aqui, 12%); a legenda longe de olhos, boca e da interface da plataforma; e conferir o arquivo
  codificado e os quadros antes de entregar.
- **Diferente:** não depende de crédito de terceiro nem tem telemetria.

## ai-marketing-skills (Single Grain)

- **Copiado:** a segunda leitura do fim de cada corte com 10 s de contexto em volta (o "em volta do
  fim" do `conferir`); a duração ideal de 30 a 45 s; o gancho abaixo do limite segurar a nota final
  (a régua dele limita a 69 o corte com gancho fraco; aqui, a 59); nada de texto amarelo direto sobre
  a imagem; quebrar a frase em vez de encolher a letra; o card de abertura parado por 4 s; o plano de
  edição em JSON; os quadros de conferência a 10, 50 e 90%; e registrar as métricas depois de
  publicado.
- **Diferente:** o pipeline dele depende de um script de legenda que não vem no repositório e põe
  barras pretas em vez de enquadrar.

## cut-video e clipify (Tella)

O melhor material técnico sobre corte seco de pausa e enquadramento por quem fala.

- **Copiado:** a tabela de quanto sobra de cada pausa por modo; o vício sempre cortado; riso e pausa
  de suspense nunca cortados; emendar por `trim` e `concat` (nunca `select`, que dessincroniza o
  áudio); trocar de plano só depois de 1 s de fala nova; o corte seco entre falantes; a tela dividida
  em dois quadros de 1080×960.
- **Diferente:** o cut-video só conhece inglês e instala um alinhador fonético; aqui o tempo das
  palavras vem do Scribe v2. O clipify mede movimento numa região marcada à mão; aqui o MediaPipe acha
  o rosto e mede a abertura da boca.

## BlitzReels (blitzreels/agent-skills)

Uma skill curta sobre um serviço hospedado; a inteligência fica no servidor dele.

- **Copiado:** escolher sozinho só quando a pessoa delegou a escolha, e no resto mostrar as
  alternativas com título, gancho, intervalo, duração e nota (a lista do `conferir` e a mesa); conferir
  as prévias antes da versão final, que é a etapa cara; e, depois de pronta, conferir duração,
  proporção, legenda e enquadramento.
- **Diferente:** não depende de um serviço de terceiro com login próprio.

## As trocas de câmera da fonte

O primeiro teste real (uma entrevista de TV com plano geral e closes) mostrou que enquadrar por trilha
de rosto ao longo do corte inteiro quebra quando a fonte troca de câmera. A claude-video já cortava
por cena (PySceneDetect), o clipify avisava de troca de cena dentro do corte e a `copy-video-style` da
OpusClip media os cortes com o filtro de cena do ffmpeg; daqui saiu a fronteira de tomada.

## O que nenhuma fazia

- Ligar cada voz da transcrição ao rosto certo pela boca, para o recorte seguir quem fala.
- Uma segunda opinião que vê o vídeo (o Gemini), porque o Claude só lê o texto.
- Limitar o zoom pela ampliação da entrega, para não borrar fonte de 1080p.
- A mesa de aprovação com a prévia de verdade, no claude.ai ou no navegador da máquina.
- O resumo do que funcionou no canal, lido antes de escolher os próximos cortes.
- A identidade visual por canal, configurada numa entrevista no primeiro uso, com uma amostra para aprovar.
