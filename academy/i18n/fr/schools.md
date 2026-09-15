# Écoles et leçons — Académie Project Ultimate

*_Traduction générée par le système (2026-09-15). Sans relecture native. L'anglais est canonique._*

## 1. Académie First Spin — instructeur : needle (A&R)

Notation déterministe et fondée sur les preuves avec le moteur de verdicts
v1.0.0 de CWI. Le moteur n'invente jamais une note : preuve insuffisante →
`insufficient-data` ; preuve contestée → l'exécution est refusée.

- **FS-101 « L'honnêteté du démarrage à froid »** — Exécutez le vrai moteur
  sur un sujet sans preuve et assumez le refus honnête. Certificat :
  `first-spin-scorer:cold-start`.
- **FS-102 « Les niveaux de preuve »** — Exécutez le moteur sur les
  exemples publiés ; seul `verified` compte. Certificat :
  `first-spin-scorer:evidence-tiers`.
- **FS-103 « Le refus »** — Provoquez le refus pour litige à dessein et
  rapportez-le honnêtement. Certificat : `first-spin-scorer:refusal`.

## 2. École du registre — instructeur : ledger (Données & Analytique)

Exercices de vérification et laboratoires d'intégrité de chaîne sur le vrai
registre de placements NEEDLE DROP (format `cwi-needledrop/v1`).

- **LS-101 « Lisez le registre honnête »** — Lisez le vrai registre ; il
  déclare aujourd'hui zéro placement vérifié. Certificat :
  `ledger-reader:honest-empty`.
- **LS-102 « Laboratoire d'intégrité de chaîne »** — Recalculez chaque hash
  de la chaîne sur le vrai registre. Certificat :
  `ledger-verifier:chain-integrity`.
- **LS-103 « Exercice d'altération »** — Scellez une entrée sur une copie
  d'entraînement, modifiez un octet et prouvez que la vérification le
  détecte. Certificat : `ledger-verifier:tamper-drill`.
- **LS-104 « Vérification déléguée »** — Un vérificateur promeut une entrée
  revendiquée au statut vérifié avec preuve ; le statut vérifié
  auto-attribué est refusé. Certificat : `ledger-verifier:delegation`.

## 3. École Sync & Licences — instructeur : seal (Sync & Licences)

Opérations de synchronisation et de licences : vérifier avant d'affirmer,
lire le guichet unique de licences, rédiger des actes de placement que le
registre acceptera.

- **SL-101 « Vérifiez avant d'affirmer »** — Parcourez le vrai endpoint de
  vérification. Certificat : `sync-operator:verify-first`.
- **SL-102 « Lecture du guichet unique »** — Extrayez le contact des droits
  de la surface réelle. Certificat : `sync-operator:one-stop`.
- **SL-103 « L'acte de placement »** — Rédigez une entrée en attente valide
  selon le schéma. Certificat : `sync-operator:placement-paper`.

## 4. Dojo des datasets — instructeur : ledger (Données & Analytique)

Exercices pratiques sur les vrais datasets de CWI : le catalogue de 24
titres, les registres de curateurs, le registre de placements et le
registre des SKUs.

- **DD-101 « Recensement du catalogue »** — 24 enregistrements analysables,
  contrôlés contre le miroir Hugging Face. Certificat :
  `dataset-wrangler:census`.
- **DD-102 « Audit des placements »** — Réconciliez le vérifié et le
  revendiqué. Certificat : `dataset-wrangler:placement-audit`.
- **DD-103 « Balayage des SKUs »** — Chaque SKU doit nommer un endpoint
  vivant. Certificat : `dataset-wrangler:sku-sweep`.
