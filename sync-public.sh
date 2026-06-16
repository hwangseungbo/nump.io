#!/usr/bin/env bash
# 소스 → public/ 동기화 (server.js 가 서빙하는 폴더). Windows용 sync-public.ps1 의 Linux 판.
# 사용법:  ./sync-public.sh
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
pub="$root/public"

rm -rf "$pub"
mkdir -p "$pub"

cp "$root/index.html" "$pub/index.html"
cp -r "$root/assets"    "$pub/assets"
cp -r "$root/lifoneer"  "$pub/lifoneer"
cp -r "$root/visioneer" "$pub/visioneer"

# 배포본에서 비공개/불필요 항목 제거 (sync-public.ps1 과 동일 규칙)
rm -rf "$pub/lifoneer/_backup" "$pub/lifoneer/.omc" "$pub/lifoneer/v10"
rm -f  "$pub/lifoneer/files.zip" "$pub/lifoneer/README.md"

n="$(find "$pub" -type f | wc -l)"
echo "Synced source -> public/  ($n files)"
