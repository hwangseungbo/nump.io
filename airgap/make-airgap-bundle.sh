#!/usr/bin/env bash
# 폐쇄망(에어갭) 배포 번들 생성 — 인터넷 가능한 준비 PC(x86_64)에서 실행.
# 사용: ./make-airgap-bundle.sh [출력디렉터리]
# 설치 절차는 AIRGAP-DEPLOY.md 참조. 새 모듈 추가 시 이 스크립트에 수집 항목을 추가할 것.
set -euo pipefail
OUT=${1:-"$(cd "$(dirname "$0")" && pwd)/bundle-$(date +%Y%m%d)"}
mkdir -p "$OUT"/{docker-images,pip-wheels,hf-models,site,adapter,caddy,bin}
echo "출력: $OUT"

echo "[1/7] MediPencil 도커 이미지 저장 (app + mysql)"
docker save -o "$OUT/docker-images/medipencil-stack.tar" medipencil-app:latest mysql:8.0

echo "[2/7] 어댑터 파이썬 휠 다운로드 (flask, faster-whisper — 현 파이썬/아키텍처 기준)"
python3 -m pip download --prefer-binary -q -d "$OUT/pip-wheels" flask faster-whisper

echo "[3/7] Whisper 모델 복사 (HF 캐시, 심링크 역참조 — blobs 포함)"
cp -rL "$HOME/.cache/huggingface/hub/models--mobiuslabsgmbh--faster-whisper-large-v3-turbo" \
      "$OUT/hf-models/"

echo "[4/7] SageFM 어댑터 코드 (adapter.env 제외 — 현장에서 새 토큰 발급)"
cp /home/nump/Basil_Nexus/medipencil/sagefm-adapter/adapter.py \
   /home/nump/Basil_Nexus/medipencil/sagefm-adapter/README.md "$OUT/adapter/"
cp /home/nump/Basil_Nexus/nump.io-main/medipencil/sagefm-adapter/adapter.env.example \
   "$OUT/adapter/" 2>/dev/null || true

echo "[5/7] 웹사이트 아카이브 (node_modules 포함, .git/public 제외)"
tar -C /home/nump/Basil_Nexus -czf "$OUT/site/nump.io-main.tgz" \
    --exclude='nump.io-main/.git' --exclude='nump.io-main/public' \
    --exclude='nump.io-main/db.config.json' \
    --exclude='nump.io-main/payments.config.json' nump.io-main

echo "[6/7] 실행 바이너리·Caddy 설정 (같은 아키텍처 전제)"
cp /home/nump/Basil_Nexus/medipencil/caddy-mintnote.snippet "$OUT/caddy/"
for b in caddy node; do
  if command -v "$b" >/dev/null; then cp "$(command -v "$b")" "$OUT/bin/$b"
  else echo "  ! $b 바이너리를 찾지 못함 — 수동 포함 필요"; fi
done

echo "[7/7] 매니페스트·체크섬"
{ echo "생성: $(date -Is) / 호스트: $(hostname)"
  docker --version; python3 --version
  node --version 2>/dev/null || true; caddy version 2>/dev/null || true
  echo "미포함(수동 준비): MediPencil 원본 ZIP, DB 백업, docker 엔진 설치파일, PostgreSQL debs, adapter.env, db.config.json, payments.config.json(토스 키 — 결제 데모 시)"
} > "$OUT/MANIFEST.txt"
( cd "$OUT" && find . -type f ! -name SHA256SUMS -exec sha256sum {} + > SHA256SUMS )
du -sh "$OUT"
echo "완료. AIRGAP-DEPLOY.md 3장의 순서로 설치하십시오."
