-- ============================================================
-- Basil Nexus · migrate-002 — P4 EMR 대시보드 확장 (schema v2)
--   신규 테이블 4개: admissions / memos / bills / safety_events
--   전부 CREATE TABLE IF NOT EXISTS — 재실행 안전(멱등)
--   적용: node db/migrate.js   (basil이 스키마 CREATE 권한 보유, sudo 불필요)
--   참고: docs/PLAN-P4.md §3, docs/API-CONTRACT-P4.md
-- ============================================================

-- ── 입원 (간호사 병동/담당환자) ──────────────────────────────
CREATE TABLE IF NOT EXISTS admissions (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  room          TEXT,                                -- "1205호"
  ward          TEXT,                                -- "내과 병동"
  admitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  discharge_due DATE,                                -- 퇴원 예정일
  status        TEXT NOT NULL DEFAULT 'admitted'
                CHECK (status IN ('admitted','discharge_due','discharged'))
);
CREATE INDEX IF NOT EXISTS idx_adm_patient     ON admissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_adm_ward_status ON admissions(ward, status);
CREATE INDEX IF NOT EXISTS idx_adm_discharge   ON admissions(discharge_due);

-- ── 병동 메모/전달 사항 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS memos (
  id          SERIAL PRIMARY KEY,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_role TEXT,                                  -- 'nurse' 등 (NULL=전체)
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memos_time ON memos(created_at DESC);

-- ── 진료비 ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bills (
  id         SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  billed_at  DATE NOT NULL,
  item       TEXT NOT NULL,                          -- "외래 진료비"
  amount     INTEGER NOT NULL,                       -- 원 단위 정수
  paid       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id, billed_at);

-- ── 환자 안전 지표 이벤트 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS safety_events (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER REFERENCES patients(id) ON DELETE SET NULL,  -- NULL 허용
  event_type  TEXT NOT NULL CHECK (event_type IN ('낙상','욕창','투약오류','감염')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_time ON safety_events(occurred_at);
