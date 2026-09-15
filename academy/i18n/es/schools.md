# Escuelas y lecciones — Academia Project Ultimate

*_Traducción generada por el sistema (2026-09-15). Sin revisión nativa. El inglés es canónico._*

## 1. Academia First Spin — instructor: needle (A&R)

Puntuación determinista y basada en evidencia con el Motor de Veredictos
v1.0.0 de CWI. El motor nunca inventa una puntuación: evidencia escasa
devuelve `insufficient-data`; evidencia en disputa rechaza la ejecución.

- **FS-101 «Honestidad de arranque en frío»** — Ejecuta el motor real sobre
  un sujeto sin evidencia y gestiona el rechazo honesto. Credencial:
  `first-spin-scorer:cold-start`.
- **FS-102 «Niveles de evidencia»** — Ejecuta el motor sobre las muestras
  publicadas; solo `verified` cuenta. Credencial:
  `first-spin-scorer:evidence-tiers`.
- **FS-103 «El rechazo»** — Provoca el rechazo por disputa a propósito y
  repórtalo con honestidad. Credencial: `first-spin-scorer:refusal`.

## 2. Escuela del Libro Mayor — instructor: ledger (Datos y Analítica)

Simulacros de verificación y laboratorios de integridad de cadena sobre el
libro mayor real de colocaciones NEEDLE DROP (formato `cwi-needledrop/v1`).

- **LS-101 «Lee el libro honesto»** — Lee el libro real; hoy reporta cero
  colocaciones verificadas. Credencial: `ledger-reader:honest-empty`.
- **LS-102 «Laboratorio de integridad de cadena»** — Recalcula cada hash
  de la cadena sobre el libro real. Credencial:
  `ledger-verifier:chain-integrity`.
- **LS-103 «Simulacro de manipulación»** — Sella una entrada en una copia
  de práctica, altera un byte y demuestra que la verificación lo detecta.
  Credencial: `ledger-verifier:tamper-drill`.
- **LS-104 «Verificación delegada»** — Un verificador promueve una entrada
  reclamada a verificada con prueba; el estado verificado auto-otorgado es
  rechazado. Credencial: `ledger-verifier:delegation`.

## 3. Escuela de Sync y Licencias — instructor: seal (Sync y Licencias)

Operaciones de sync y licencias: verificar antes de afirmar, leer la
superficie de licenciamiento integral y redactar papel de colocación que
el libro aceptará.

- **SL-101 «Verifica antes de afirmar»** — Recorre el endpoint real de
  verificación. Credencial: `sync-operator:verify-first`.
- **SL-102 «Lectura integral»** — Extrae el contacto de derechos de la
  superficie real. Credencial: `sync-operator:one-stop`.
- **SL-103 «El papel de colocación»** — Redacta una entrada pendiente
  válida según el esquema. Credencial: `sync-operator:placement-paper`.

## 4. Dojo de Datasets — instructor: ledger (Datos y Analítica)

Ejercicios prácticos sobre los datasets reales de CWI: el catálogo de 24
pistas, registros de curadores, libro de colocaciones y registro de SKUs.

- **DD-101 «Censo del catálogo»** — 24 registros parseables, verificados
  contra el espejo de Hugging Face. Credencial:
  `dataset-wrangler:census`.
- **DD-102 «Auditoría de colocaciones»** — Concilia lo verificado contra lo
  afirmado. Credencial: `dataset-wrangler:placement-audit`.
- **DD-103 «Barrido de SKUs»** — Cada SKU debe nombrar un endpoint vivo.
  Credencial: `dataset-wrangler:sku-sweep`.
