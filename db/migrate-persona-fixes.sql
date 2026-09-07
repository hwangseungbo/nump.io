-- Basil Nexus — 3자 페르소나 점검 마이그레이션 (관리자용 · 추가 전용 · 멱등)
-- patients/appointments/encounters/vitals는 postgres 소유라 basil로는 ALTER 불가 →
-- 관리자 PC에서 1회 실행:  sudo -u postgres psql -d basilnexus -f db/migrate-persona-fixes.sql
-- (care_orders 테이블은 node db/migrate-persona-fixes.js 가 basil 권한으로 생성)

ALTER TABLE patients     ADD COLUMN IF NOT EXISTS allergies TEXT[] DEFAULT '{}';  -- A. 알레르기
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reason TEXT;                    -- C. 방문 사유
ALTER TABLE encounters   ADD COLUMN IF NOT EXISTS patient_summary TEXT;           -- C. 환자용 요약
ALTER TABLE vitals       ADD COLUMN IF NOT EXISTS temp_c NUMERIC(4,1);            -- E. 체온
ALTER TABLE vitals       ADD COLUMN IF NOT EXISTS pulse INTEGER;                  -- E. 맥박
ALTER TABLE vitals       ADD COLUMN IF NOT EXISTS spo2 INTEGER;                   -- E. 산소포화도

-- D. 재진 제안: status CHECK 제약을 'proposed' 포함 초집합으로 교체 (기존 행 영향 없음)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled','done','cancelled','no_show','proposed'));

-- 새 컬럼도 basil이 읽고 쓸 수 있게 (기존 GRANT ALL이 컬럼 단위라 재부여 불필요하지만 안전하게)
GRANT ALL ON patients, appointments, encounters, vitals TO basil;
