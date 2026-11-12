# Setup

A skill roda só no **Claude Code** (terminal, aba Code do app ou extensão de IDE), no Mac, no Windows ou
no Linux. No chat do claude.ai e no Cowork não há ffmpeg nem Chrome na máquina da sessão.

Confira tudo de uma vez:

```bash
node <pasta da skill>/scripts/cortes.js ambiente
```

Cada linha diz `ok` ou `FALTA`, com o comando que resolve. Ao conduzir o setup, ofereça rodar você
mesmo a instalação dos programas, uma por vez e com o OK da pessoa; o token, nunca: ela cria no site e
guarda no terminal dela.

## Na máquina

| O quê | Para quê | Mac | Windows | Linux |
|---|---|---|---|---|
| Node 22 ou mais novo | os scripts (o WebSocket do Node fala com o Chrome) | `brew install node` ou nodejs.org | `winget install --id OpenJS.NodeJS.LTS -e` | nvm ou nodejs.org (o do apt costuma ser velho) |
| ffmpeg e ffprobe | cortar, enquadrar, legendar e conferir | `brew install ffmpeg` | `winget install --id Gyan.FFmpeg -e` | `sudo apt install ffmpeg` |
| Google Chrome | a detecção de rosto, a legenda e o cartão | `brew install --cask google-chrome` | `winget install --id Google.Chrome -e`; sem ele, a skill usa o Edge | o `.deb` de google.com/chrome, ou `sudo apt install chromium` |
| yt-dlp | só para baixar do YouTube | `brew install yt-dlp` | `winget install --id yt-dlp.yt-dlp -e` | `pipx install yt-dlp` |

Em outro caminho, aponte o programa: `CORTES_VIRAIS_CHROME`, `CORTES_VIRAIS_FFMPEG`,
`CORTES_VIRAIS_FFPROBE`, `CORTES_VIRAIS_YT_DLP`. No Mac, o Chrome é o executável de dentro do app
(`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`), e não a pasta `.app`.

Prefira o **ffmpeg 6 ou mais novo**. O 4 e o 5 (o `apt` do Ubuntu 22.04 traz o 4.4) funcionam, mas
a legenda pode trocar até um quadro fora da hora; o `ambiente` avisa.

O YouTube exige que o yt-dlp resolva um desafio em JavaScript: a skill passa a ele o próprio Node, então
não é preciso instalar o Deno.

**No Windows**, use o `winget` com o `--id` exato (sem ele, o winget para quando acha mais de um pacote) e,
depois de instalar, feche e abra o Claude Code: o `PATH` novo só vale para programa aberto depois. Se
mesmo assim o `ambiente` não achar, a skill procura nos atalhos do winget (`WinGet\Links`).

**No Linux**, o caminho do Chrome que a skill procura é `/usr/bin/google-chrome`, `/usr/bin/chromium`
ou `/usr/bin/chromium-browser`. Os testes da skill rodam no Linux a cada mudança, mas um vídeo inteiro
de ponta a ponta ainda não foi rodado lá: conte o que der errado.

Na primeira detecção de rosto, a skill baixa o MediaPipe (uns 35 MB, versão fixa) para
`~/.cortes-virais/cache/mediapipe-<versão>/`. Daí em diante funciona sem internet nessa parte.

## O Replicate

A transcrição (`elevenlabs/scribe-v2`), o Gemini (`google/gemini-3.1-pro`, quando não há a chave da
Gemini API) e o realce opcional (`topazlabs/video-upscale`) rodam no Replicate, cobrados na conta de
quem é dono do token. Os scripts falam com a API direto, com o token, porque a transcrição de um vídeo
longo é grande demais para passar por um conector da conversa (ADR 0001).

1. Crie a conta em replicate.com e ponha crédito em **Account → Billing**.
2. Crie um token em **Account → API tokens** (replicate.com/account/api-tokens). Numa organização,
   crie o token dentro dela: é nela que a cobrança cai.
3. Guarde o token, uma vez, **num terminal seu, fora da conversa com o Claude**:

   **Mac**, no Keychain:

   ```bash
   security add-generic-password -s cortes-virais-replicate -a cortes-virais -w
   ```

   e cole o token quando o comando pedir. Se o sandbox do Claude Code barrar o Keychain, rode o
   comando num terminal comum.

   **Windows**, na variável do seu usuário, num PowerShell:

   ```powershell
   $t = Read-Host 'Token do Replicate'; [Environment]::SetEnvironmentVariable('REPLICATE_API_TOKEN', $t, 'User')
   ```

   Feche e abra o Claude Code depois, para ele ler a variável nova. Ela fica gravada no seu usuário do
   Windows, em texto aberto: não use esse caminho num computador compartilhado.

   **Linux**, no chaveiro do sistema (pacote `libsecret-tools`):

   ```bash
   secret-tool store --label='Replicate (cortes-virais)' service cortes-virais-replicate
   ```

   ou ponha `export REPLICATE_API_TOKEN=...` no seu `~/.profile` (fica em texto aberto).

Em qualquer sistema, a variável `REPLICATE_API_TOKEN`, quando existe, vale antes do chaveiro. Para
conferir, `node scripts/cortes.js ambiente` deve dizer `ok token do Replicate`.

O `replicate.jsonl` de cada pasta registra cada predição (modelo, id, segundos de máquina), para saber
o que um vídeo custou. **402** é a conta sem crédito: compre em replicate.com/account/billing. Os
preços de cada modelo estão na página dele no Replicate; o realce é o mais caro (uns US$ 0,08 por
segundo de vídeo em novembro de 2026), e por isso é opcional.

## A Gemini API (opcional)

Com a variável `GEMINI_API_KEY`, o passo `assistir` fala direto com a Gemini API do Google, em vez do
Gemini do Replicate, que já recusou toda mídia com o erro E001. O modelo padrão é o
`gemini-3.1-pro-preview`; outro vai em `CORTES_VIRAIS_GEMINI_MODELO`.

1. Crie a chave em aistudio.google.com/apikey.
2. O Gemini 3.1 Pro **não tem nível gratuito**: ative o faturamento no projeto da chave. Sem ele, a API
   responde que a cota é zero. Um modelo com nível gratuito (um Flash) serve pela variável do modelo,
   com menos qualidade na leitura do vídeo.
3. Guarde a chave como o token do Replicate, na variável `GEMINI_API_KEY` (no Mac, no seu
   `~/.zshrc`; no Windows, com o mesmo comando do PowerShell trocando o nome da variável; no Linux, no
   `~/.profile`), e abra o Claude Code de novo.

O `ambiente` mostra qual caminho o Gemini vai usar. O `gemini-api.jsonl` de cada pasta registra os
tokens de cada chamada.

## As pastas

| Variável | Padrão | O quê |
|---|---|---|
| `CORTES_VIRAIS_DIR` | `~/Documents/Cortes-Virais` | as pastas de cada vídeo e, em `canais/`, a identidade, a régua e o histórico de cada canal |
| `CORTES_VIRAIS_CACHE_DIR` | `~/.cortes-virais/cache` | o MediaPipe baixado |
| `CORTES_VIRAIS_CHROME`, `CORTES_VIRAIS_FFMPEG`, `CORTES_VIRAIS_FFPROBE`, `CORTES_VIRAIS_YT_DLP` | o `PATH`, o Homebrew e o winget | o programa em outro caminho |
| `CORTES_VIRAIS_GEMINI_MODELO` | `gemini-3.1-pro-preview` | o modelo da Gemini API |

Se a pasta Documentos sincroniza com a nuvem (iCloud, OneDrive), os gigabytes de vídeo sobem junto:
aponte `CORTES_VIRAIS_DIR` para fora dela. O `ambiente` mostra o caminho.

A pasta `trabalho/` de cada vídeo guarda os intermediários (um minuto de corte pode passar de 500 MB
em CRF 12). Pode apagar depois da entrega.

## A mesa de aprovação

Com a ferramenta de artefatos do Claude Code, a mesa é um artefato privado no claude.ai, com as prévias
dentro, que a pessoa compartilha pelo menu Compartilhar. Sem ela, `mesa --local` serve a mesma mesa
no navegador da máquina, em `127.0.0.1`, e grava as aprovações na pasta do vídeo (ADR 0004). A fonte do
canal vai embutida nas duas: com uma fonte própria, a licença dela precisa permitir isso.
