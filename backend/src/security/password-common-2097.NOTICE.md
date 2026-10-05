# Blocklist local de senhas comuns

Esta lista é material derivado de **Probable Wordlists v2**, de berzerk0,
`Real-Passwords/Top304Thousand-probable-v2.txt`. A fonte declara a licenca
[Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).
Esta blocklist derivada é distribuída sob a mesma licença, com atribuição ao
projeto de origem; o requisito ShareAlike aplica-se a este material derivado.
A licença do restante do código não é alterada.

- Fonte oficial: https://github.com/berzerk0/Probable-Wordlists/blob/8ed574a02cbf37a9205344d4e31468a05989ca37/Real-Passwords/Top304Thousand-probable-v2.txt
- Revisão fixa: `8ed574a02cbf37a9205344d4e31468a05989ca37`
- Data da revisão da fonte: 2018-02-19
- SHA-256 da fonte: `0c6d3eec0406f02a47f3b32ded1548db9d02440d6243b216bd952724bbec6af7`
- SHA-256 desta blocklist: `48712b36836b4869643b8fa6c5f5358a81b05b01bd0a3655b46aa2d169bc28e9`
- Geração: 2026-10-02, por `backend/scripts/generate-password-blocklist.js`

O gerador percorre as 303.872 linhas na ordem original, remove apenas o
terminador de linha, rejeita Unicode inválido, aplica NFKC, exige 15 a 128
code points e no máximo 512 bytes UTF-8, usa lowercase para a chave de
comparação e preserva a primeira ocorrência de cada chave. Pontuação não é
removida. Foram descartadas 301.775 linhas por menos de 15 code points;
nenhuma por mais de 128 code points, mais de 512 bytes, Unicode inválido ou
duplicidade. O resultado contém **2.097 entradas**. Uma revisão deve ocorrer
a cada seis meses ou antes por motivo de segurança.

## Dicionários do medidor

Os pacotes `@zxcvbn-ts/core` e `@zxcvbn-ts/language-common` declaram MIT;
as dependências instaladas `@zxcvbn-ts/dictionary-compression` e
`fastest-levenshtein` também declaram MIT.
O pacote `@zxcvbn-ts/language-pt-br` também declara MIT para o código, mas
inclui dados derivados de **OpenSubtitles 2024 via OPUS**, disponibilizados
sob **ODC-BY** (Open Data Commons Attribution License). Atribuição:
Helsinki-NLP / OPUS, https://opus.nlpl.eu/, contribuidores e titulares dos
direitos das legendas. O derivado foi processado por tokenização, agregação
de frequências, normalização e filtragem. O pacote inclui `NOTICE.md` e
`THIRD_PARTY_LICENSES.md`; esses avisos devem acompanhar qualquer
redistribuição do pacote. Esta seção registra a atribuição junto da lista
para facilitar a revisão da distribuição do backend.
