# Escolas e lições — Academia Project Ultimate

*_Tradução gerada pelo sistema (2026-09-15). Sem revisão nativa. O inglês é canônico._*

## 1. Academia First Spin — instrutor: needle (A&R)

Pontuação determinística e baseada em evidências com o Motor de Vereditos
v1.0.0 da CWI. O motor nunca inventa pontuação: evidência escassa retorna
`insufficient-data`; evidência em disputa recusa a execução.

- **FS-101 «Honestidade de partida a frio»** — Rode o motor real sobre um
  sujeito sem evidência e lide com a recusa honesta. Credencial:
  `first-spin-scorer:cold-start`.
- **FS-102 «Níveis de evidência»** — Rode o motor sobre as amostras
  publicadas; só `verified` conta. Credencial:
  `first-spin-scorer:evidence-tiers`.
- **FS-103 «A recusa»** — Provoque a recusa por disputa de propósito e
  relate com honestidade. Credencial: `first-spin-scorer:refusal`.

## 2. Escola do Livro-Razão — instrutor: ledger (Dados e Analytics)

Simulados de verificação e laboratórios de integridade de cadeia sobre o
livro real de colocações NEEDLE DROP (formato `cwi-needledrop/v1`).

- **LS-101 «Leia o livro honesto»** — Leia o livro real; hoje reporta zero
  colocações verificadas. Credencial: `ledger-reader:honest-empty`.
- **LS-102 «Laboratório de integridade de cadeia»** — Recalcule cada hash
  da cadeia sobre o livro real. Credencial:
  `ledger-verifier:chain-integrity`.
- **LS-103 «Simulado de adulteração»** — Sele uma entrada numa cópia de
  treino, altere um byte e prove que a verificação detecta. Credencial:
  `ledger-verifier:tamper-drill`.
- **LS-104 «Verificação delegada»** — Um verificador promove uma entrada
  reivindicada a verificada com prova; status verificado auto-atribuído é
  recusado. Credencial: `ledger-verifier:delegation`.

## 3. Escola de Sync e Licenciamento — instrutor: seal (Sync e Licenciamento)

Operações de sync e licenciamento: verificar antes de afirmar, ler a
superfície de licenciamento integral e redigir papel de colocação que o
livro aceitará.

- **SL-101 «Verifique antes de afirmar»** — Percorra o endpoint real de
  verificação. Credencial: `sync-operator:verify-first`.
- **SL-102 «Leitura integral»** — Extraia o contato de direitos da
  superfície real. Credencial: `sync-operator:one-stop`.
- **SL-103 «O papel de colocação»** — Redija uma entrada pendente válida
  pelo esquema. Credencial: `sync-operator:placement-paper`.

## 4. Dojo de Datasets — instrutor: ledger (Dados e Analytics)

Exercícios práticos sobre os datasets reais da CWI: o catálogo de 24
faixas, registros de curadores, livro de colocações e registro de SKUs.

- **DD-101 «Censo do catálogo»** — 24 registros parseáveis, checados contra
  o espelho do Hugging Face. Credencial: `dataset-wrangler:census`.
- **DD-102 «Auditoria de colocações»** — Reconcilie o verificado contra o
  afirmado. Credencial: `dataset-wrangler:placement-audit`.
- **DD-103 «Varredura de SKUs»** — Cada SKU deve nomear um endpoint vivo.
  Credencial: `dataset-wrangler:sku-sweep`.
