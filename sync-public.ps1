# Sync source files -> public\ (the folder served by server.js)
# Run this after editing index.html / lifoneer\* so changes go live.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pub  = Join-Path $root 'public'

Remove-Item -Recurse -Force $pub -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $pub | Out-Null

Copy-Item (Join-Path $root 'index.html') (Join-Path $pub 'index.html')
Copy-Item (Join-Path $root 'assets')   (Join-Path $pub 'assets')   -Recurse
Copy-Item (Join-Path $root 'lifoneer') (Join-Path $pub 'lifoneer') -Recurse

# remove non-public items from the deployed copy
Remove-Item -Recurse -Force (Join-Path $pub 'lifoneer\_backup') -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $pub 'lifoneer\.omc')    -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $pub 'lifoneer\v10')     -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $pub 'lifoneer\files.zip')  -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $pub 'lifoneer\README.md')  -ErrorAction SilentlyContinue

$n = (Get-ChildItem $pub -Recurse -File).Count
Write-Host "Synced source -> public\  ($n files)"
Write-Host "Tip: Cloudflare may cache assets. Purge cache or use Development Mode to see changes immediately."
