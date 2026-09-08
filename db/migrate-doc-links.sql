-- Basil Nexus — 서류-진료·담당의 연결 마이그레이션 (관리자용 · 추가 전용 · 멱등)
-- documents는 postgres 소유라 basil로는 ALTER 불가 → 관리자 PC에서 1회 실행:
--   cd /home/nump/Basil_Nexus/nump.io-main && sudo -u postgres psql -d basilnexus < db/migrate-doc-links.sql
-- (주의: -f 옵션은 postgres 계정이 /home/nump 접근 불가라 실패 — 위처럼 < 리다이렉트로 실행)
-- 적용 후 서버 재시작 시 FEAT.docLink가 자동 활성됩니다. 미적용이어도 기존 동작 100% 유지.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS encounter_id INTEGER REFERENCES encounters(id); -- 대상 진료 (null=전체 기록 서류·과거 신청)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS assignee_id  INTEGER REFERENCES users(id);      -- 담당 의료진 (null 허용)

-- 새 컬럼도 basil이 읽고 쓸 수 있게
GRANT ALL ON documents TO basil;
