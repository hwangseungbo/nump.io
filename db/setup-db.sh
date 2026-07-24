#!/usr/bin/env bash
# Basil Nexus — PostgreSQL 설치·초기화 (sudo로 1회 실행)
#   사용법:  sudo bash db/setup-db.sh
# 하는 일: postgresql 설치 → 서비스 기동 → basil 계정/basilnexus DB 생성 → 스키마 적용
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME=basilnexus
DB_USER=basil
DB_PASS=$(node -e "console.log(require('./db.config.json').password)" 2>/dev/null \
        || python3 -c "import json;print(json.load(open('db.config.json'))['password'])")

echo "── 1/4 PostgreSQL 설치"
apt-get install -y postgresql >/dev/null
systemctl enable --now postgresql
echo "   설치·기동 완료: $(sudo -u postgres psql -tAc 'SELECT version()' | cut -d, -f1)"

echo "── 2/4 DB 계정/데이터베이스 생성"
# postgres 계정은 /home/nump 접근 불가 → cwd 를 /tmp 로 옮기고, 파일은 stdin 으로 전달
PSQL="sudo -u postgres psql"
( cd /tmp
  $PSQL -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
    || $PSQL -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}'"
  $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
    || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
)
echo "   user=${DB_USER}, db=${DB_NAME} 준비 완료"

echo "── 3/4 스키마 적용"
SCHEMA="$(pwd)/db/schema.sql"
( cd /tmp && $PSQL -d "${DB_NAME}" -v ON_ERROR_STOP=1 ) < "${SCHEMA}" >/dev/null
( cd /tmp && $PSQL -d "${DB_NAME}" -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};" ) >/dev/null
echo "   스키마 적용 완료"

echo "── 4/4 안내"
echo "   다음 명령으로 초기 계정을 넣으세요(sudo 불필요):"
echo "     node db/seed.js"
echo "완료!"
