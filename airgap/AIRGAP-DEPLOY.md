# 폐쇄망(에어갭) 배포 가이드 — Basil Nexus 플랫폼 전체

작성 2026-10-15. 원칙은 `/home/nump/Basil_Nexus/CLAUDE.md` 참조.
목표: 인터넷이 없는 병원망에 **반입 매체(USB 등)의 파일만으로** 전체 스택을 설치.

## 1. 인터넷 의존점 전수 점검 (2026-10-15 기준)

| 구성요소 | 인터넷 의존 | 폐쇄망 대책 | 상태 |
|---|---|---|---|
| nump.io 웹 (Node/pg) | Pretendard 폰트 CDN(@import — index.html·platform/*·lifoneer·visioneer) | 폰트 파일 셀프호스팅으로 교체 | ⚠ 작업 필요 |
| 〃 | 토스페이먼츠 API(데모 결제), 유튜브 임베드 1곳 | 폐쇄망 빌드에서 비활성/제거 (PAYMENTS_ENABLED=false 유지) | ⚠ 빌드 시 처리 |
| server.js → SageFM LLM | `AI_UPSTREAM` 165.132.220.115:5096 **하드코딩** | 환경변수화 후 병원 내 GPU 서버(vLLM)나 로컬 LLM 주소로 교체 — **최대 블로커** | ⚠ 작업 필요 |
| Node 런타임·npm | 의존성은 `pg` 뿐 | node 바이너리 + node_modules 통째 반입 | ✅ 번들 |
| PostgreSQL 14 | apt 설치 | 오프라인 debs 또는 도커 이미지 반입 + 스키마/시드 덤프 | ✅ 절차 |
| Caddy | Let's Encrypt ACME 발급/갱신 | `tls internal`(캐디 자체 CA, 루트 인증서를 병원 PC에 배포) 또는 기관 CA 인증서 지정 | ✅ 절차 |
| DNS (nump.io, mintnote.nump.io) | 공인 DNS | 병원 내부 DNS 또는 각 PC hosts 등록 | ✅ 절차 |
| MediPencil(MintNote) | 이미지 빌드/풀 (`install.sh`가 `--build`) | `docker load` 후 `docker compose up -d` (**--build 금지**). 독립 설치라 런타임 외부 호출 없음(카이랩 차단 확인) | ✅ 번들 |
| SageFM 어댑터 | pip(flask·faster-whisper), HF 모델 다운로드, 기동 시 HF 버전 체크 | 휠 번들 + 모델 캐시 번들, `HF_HUB_OFFLINE=1` 설정(미설정 시 기동마다 수십 초 대기) | ✅ 번들 |
| Whisper STT | 없음(로컬 추론) | — | ✅ |
| Docker 엔진 | apt 저장소 | docker 정적 tgz 또는 debs 사전 반입 | ✅ 절차 |
| OS 업데이트·NTP | 인터넷 | 보안패치 반입 절차 수립, 내부 NTP 서버 | 기관 협의 |

벤더 유의: MediPencil 이미지 반입·재배포는 상대측 라이선스/배포권 범위 확인 필요.

## 2. 번들 생성 (인터넷 되는 준비 PC에서)

```bash
/home/nump/Basil_Nexus/airgap/make-airgap-bundle.sh   # 기본 출력: airgap/bundle-YYYYMMDD/
```

수집물: MediPencil 도커 이미지 tar(앱+MySQL), 어댑터 pip 휠, Whisper large-v3-turbo
모델(HF 캐시, 심링크 역참조), 어댑터 코드, 웹사이트 tgz(node_modules 포함),
caddy·node 바이너리, Caddy 스니펫, MANIFEST·SHA256SUMS.

**번들에 자동 포함되지 않는 것(수동 준비)**: MediPencil 원본 ZIP(.env 생성 스크립트 포함),
DB 백업(운영 데이터 이전 시), docker 엔진 설치 파일, PostgreSQL debs, OS 패키지,
adapter.env(현장에서 새 토큰 발급: `openssl rand -hex 24`).

## 3. 폐쇄망 설치 순서 (요약)

1. docker 엔진 오프라인 설치 → `docker load -i docker-images/medipencil-stack.tar`
2. MediPencil ZIP 전개 → `scripts/init-env.sh` → compose에서 **`--build` 제거** 후 `docker compose up -d`
3. 어댑터: `pip install --no-index --find-links pip-wheels flask faster-whisper`
   → 모델 캐시를 `~/.cache/huggingface/hub/`에 복사 → adapter.env 작성(새 토큰,
   `WHISPER_MODEL=large-v3-turbo`) → 환경에 `HF_HUB_OFFLINE=1` → 기동, crontab @reboot 등록
4. 웹: node 바이너리 + nump.io-main.tgz 전개, PostgreSQL 설치·스키마/시드 적재,
   db.config.json 작성, AI_UPSTREAM을 내부 LLM 주소로 수정, systemd 등록
5. Caddy: 바이너리 복사, Caddyfile에서 각 site 블록에 `tls internal` 추가,
   생성된 루트 CA(`~/.local/share/caddy/pki/authorities/local/root.crt`)를 병원 PC 브라우저에 신뢰 등록
6. 내부 DNS/hosts에 nump.io·mintnote.nump.io → 서버 IP 등록
7. 검증: /actuator/health, nump.io 로그인, MintNote 녹음→받아쓰기→차트 생성 E2E

## 4. 남은 작업 항목 (폐쇄망 완전 대응까지)

- [ ] server.js `AI_UPSTREAM` 환경변수/설정파일화 (현재 하드코딩 2187행)
- [ ] Pretendard 폰트 셀프호스팅 전환 (CDN @import 제거 — 전 페이지)
- [ ] 폐쇄망 빌드 플래그: 유튜브 임베드·토스페이먼츠 코드 비활성 경로
- [ ] 어댑터 adapter.py에 HF_HUB_OFFLINE 자동 설정 옵션(adapter.env 키) 추가
- [ ] LLM 온프레미스안 확정: 병원 GPU 서버(vLLM+SageFM 모델 반입 — 모델 제공 협의 필요)
      vs 로컬 소형 LLM 대체 (품질 재벤치마크 필요)
- [ ] 실제 폐쇄망 모의 테스트(인터넷 차단 VM에서 번들만으로 설치 리허설)

## 5. 모듈 추가 시 규칙 (CLAUDE.md와 동일)

새 모듈을 붙일 때는 ①외부 호출 없는지(있으면 설정 분리+대체안 문서화),
②이 문서 1장의 표에 행 추가, ③make-airgap-bundle.sh에 수집 항목 추가,
④설치 순서(3장)에 단계 추가 — 네 가지를 끝내야 모듈 추가가 완료된 것이다.
