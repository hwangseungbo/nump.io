@echo off
cd /d "%~dp0"
echo ============================================
echo  Lifoneer / Basil Nexus  -  static site
echo  http://localhost:8088/
echo  (close this window or press Ctrl+C to stop)
echo ============================================
node server.js 8088
pause
