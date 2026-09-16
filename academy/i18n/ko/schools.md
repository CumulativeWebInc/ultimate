# 스쿨과 레슨 — 프로젝트 얼티밋 아카데미

*_시스템 번역(2026-09-15). 원어민 검수 없음. 영문이 정본._*

## 1. 퍼스트 스핀 아카데미 — 강사: needle (A&R)

CWI Verdict Engine v1.0.0을 이용한 결정적·증거 기반 신뢰 스코어링. 엔진은
점수를 절대 지어내지 않습니다. 증거가 부족하면 `insufficient-data`,
증거에 분쟁이 있으면 실행을 거부합니다.

- **FS-101 「콜드 스타트 정직성」** — 증거 없는 주체에 대해 실제 엔진을
  실행하고 정직한 거부를 처리하세요. 크리덴셜:
  `first-spin-scorer:cold-start`.
- **FS-102 「증거 등급」** — 공개된 샘플에 대해 엔진을 실행하세요.
  `verified`만 카운트됩니다. 크리덴셜:
  `first-spin-scorer:evidence-tiers`.
- **FS-103 「거부」** — 의도적으로 분쟁 거부를 유발하고 정직하게
  보고하세요. 크리덴셜: `first-spin-scorer:refusal`.

## 2. 원장 스쿨 — 강사: ledger (데이터 & 분석)

실제 NEEDLE DROP 배치 원장(포맷 `cwi-needledrop/v1`)에 대한 검증 드릴과
체인 무결성 랩.

- **LS-101 「정직한 원장 읽기」** — 실제 원장을 읽으세요. 오늘은 검증된
  배치가 0건이라고 보고합니다. 크리덴셜: `ledger-reader:honest-empty`.
- **LS-102 「체인 무결성 랩」** — 실제 원장에 대해 체인의 모든 해시를
  재계산하세요. 크리덴셜: `ledger-verifier:chain-integrity`.
- **LS-103 「변조 드릴」** — 연습용 복사본에 항목을 봉인하고 1바이트를
  바꾼 뒤 검증이 이를 잡아내는 것을 증명하세요. 크리덴셜:
  `ledger-verifier:tamper-drill`.
- **LS-104 「위임 검증」** — 검증자가 증거와 함께 클레임된 항목을 검증됨
  상태로 승격합니다. 스스로 부여한 verified 상태는 거부됩니다.
  크리덴셜: `ledger-verifier:delegation`.

## 3. 싱크 & 라이선싱 스쿨 — 강사: seal (싱크 & 라이선싱)

싱크 & 라이선싱 운영: 주장 전 검증 규율, 원스톱 라이선싱 서피스 읽기,
원장이 받아줄 배치 문서 작성.

- **SL-101 「주장 전 검증」** — 실제 검증 엔드포인트를 둘러보세요.
  크리덴셜: `sync-operator:verify-first`.
- **SL-102 「원스톱 읽기」** — 실제 서피스에서 권리자 연락처를
  추출하세요. 크리덴셜: `sync-operator:one-stop`.
- **SL-103 「배치 문서」** — 스키마에 유효한 pending 항목 초안을
  작성하세요. 크리덴셜: `sync-operator:placement-paper`.

## 4. 데이터셋 도조 — 강사: ledger (데이터 & 분석)

실제 CWI 데이터셋에 대한 실습: 24트랙 카탈로그, 큐레이터 기록, 배치
원장, SKU 레지스트리.

- **DD-101 「카탈로그 센서스」** — 파싱 가능한 24개 레코드, Hugging Face
  미러와 대조. 크리덴셜: `dataset-wrangler:census`.
- **DD-102 「배치 감사」** — 검증된 것과 주장된 것을 대조하세요.
  크리덴셜: `dataset-wrangler:placement-audit`.
- **DD-103 「SKU 스윕」** — 모든 SKU는 살아 있는 엔드포인트를 명시해야
  합니다. 크리덴셜: `dataset-wrangler:sku-sweep`.
