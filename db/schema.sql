-- ============================================================
-- Basil Nexus · PostgreSQL 스키마
--   P1/P2: users, sessions
--   P3 대비: chat_messages, user_personas
--   P4 대비: EMR-lite (patients, appointments, encounters, ...)
-- ============================================================

-- ── 인증 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                    -- scrypt: salt$hash(hex)
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','doctor','nurse','patient')),
  profile       JSONB NOT NULL DEFAULT '{}',      -- 역할별 부가정보(진료과/병동/생년월일 등)
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,                    -- 랜덤 64hex
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ── LLM 대화·페르소나 (P3) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,                       -- LLM 세션 (bn-xxxx)
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_user_time ON chat_messages(user_id, created_at);

CREATE TABLE IF NOT EXISTS user_personas (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  summary     TEXT NOT NULL DEFAULT '',           -- 누적 압축 요약
  traits      JSONB NOT NULL DEFAULT '{}',        -- 관심사/말투/주의사항 등 구조화
  msg_count   INTEGER NOT NULL DEFAULT 0,         -- 마지막 요약 이후 누적 턴 수
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── EMR-lite (P4) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  birth_date  DATE,
  sex         TEXT CHECK (sex IN ('M','F')),
  phone       TEXT,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   INTEGER REFERENCES users(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  department  TEXT,
  kind        TEXT,                                -- 진료/검사/물리치료 등
  status      TEXT NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled','done','cancelled','no_show'))
);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id, scheduled_at);

CREATE TABLE IF NOT EXISTS encounters (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   INTEGER REFERENCES users(id),
  visited_at  TIMESTAMPTZ NOT NULL,
  visit_type  TEXT NOT NULL DEFAULT 'outpatient'   -- outpatient/inpatient
              CHECK (visit_type IN ('outpatient','inpatient')),
  department  TEXT,
  chief_complaint TEXT,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_enc_patient ON encounters(patient_id, visited_at);

CREATE TABLE IF NOT EXISTS diagnoses (
  id           SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  code         TEXT,                               -- KCD/ICD 코드
  diagnosed_at DATE
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id           SERIAL PRIMARY KEY,
  encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  drug_name    TEXT NOT NULL,
  dosage       TEXT,                               -- "1일 1회, 아침 식후"
  start_date   DATE,
  end_date     DATE,
  active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS vitals (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  systolic    INTEGER, diastolic INTEGER,
  glucose     INTEGER, weight_kg NUMERIC(5,1), bmi NUMERIC(4,1)
);

CREATE TABLE IF NOT EXISTS lab_results (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tested_at   DATE NOT NULL,
  test_name   TEXT NOT NULL,
  value       TEXT, ref_range TEXT, flag TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL,                       -- 진단서/소견서/...
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'requested'
              CHECK (status IN ('requested','issued','rejected'))
);

CREATE TABLE IF NOT EXISTS nursing_notes (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  nurse_id    INTEGER REFERENCES users(id),
  note_type   TEXT,                                -- 활력징후/투약/처치/간호기록
  content     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── P4 확장 ─────────────────────────────────────────────────
-- schema v2 (migrate-002.sql과 동일 정의 — 신규 설치 정본)
-- admissions / memos / bills / safety_events

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

CREATE TABLE IF NOT EXISTS memos (
  id          SERIAL PRIMARY KEY,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_role TEXT,                                  -- 'nurse' 등 (NULL=전체)
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memos_time ON memos(created_at DESC);

CREATE TABLE IF NOT EXISTS bills (
  id         SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  billed_at  DATE NOT NULL,
  item       TEXT NOT NULL,                          -- "외래 진료비"
  amount     INTEGER NOT NULL,                       -- 원 단위 정수
  paid       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id, billed_at);

CREATE TABLE IF NOT EXISTS safety_events (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER REFERENCES patients(id) ON DELETE SET NULL,  -- NULL 허용
  event_type  TEXT NOT NULL CHECK (event_type IN ('낙상','욕창','투약오류','감염')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_time ON safety_events(occurred_at);
