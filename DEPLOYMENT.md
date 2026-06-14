# NUMP / Lifoneer 배포 기록 (Deployment Runbook)

> 이 파일은 현재 호스팅 구성과, **나중에 서버룸 로컬서버 + 공유기 포트포워딩으로 이전할 때**
> Cloudflare 설정을 어떻게 정리(원상복구)하고 옮기는지 기록한 문서입니다.
> 최초 작성: 2026-06-13

---

## 1. 현재 구성 (As-Is) — Cloudflare Tunnel 방식

```
방문자 ──HTTPS──▶ Cloudflare 엣지(전세계)
                      │  (Tunnel: 내 PC가 바깥으로 아웃바운드 연결, 포트개방 불필요)
                      ▼
        내 PC: cloudflared ──▶ http://localhost:8088 ──▶ Node 정적서버 ──▶ ./public 폴더
```

- **도메인**: `nump.io` (등록업체: 후이즈 whois.co.kr)
- **DNS/네임서버**: Cloudflare로 변경됨 → `gerald.ns.cloudflare.com`, `amber.ns.cloudflare.com`
- **Cloudflare 플랜**: Free
- **HTTPS**: Cloudflare Universal SSL (엣지에서 자동, 서버는 HTTP만 담당)

### 구성 요소 상세
| 항목 | 값 / 경로 |
|------|-----------|
| Cloudflare Tunnel 이름 | `nump` |
| Tunnel UUID | `537a2258-ca79-4b45-bd35-96473cd19d13` |
| cloudflared 실행파일 | `C:\Users\HSB\cloudflared\cloudflared.exe` (v2026.6.0, 사용자 PATH 등록됨) |
| cloudflared 설정 | `C:\Users\HSB\.cloudflared\config.yml` |
| 자격증명 | `C:\Users\HSB\.cloudflared\537a2258-...json`, `C:\Users\HSB\.cloudflared\cert.pem` |
| DNS 레코드 | `nump.io`, `www.nump.io` → CNAME → `537a2258-....cfargotunnel.com` (프록시 ON) |
| 로컬 웹서버 | `C:\Users\HSB\Desktop\Basil_Nexus\server.js` (Node, 무의존성) |
| 서빙 포트 | `0.0.0.0:8088` |
| 서빙 폴더 | `C:\Users\HSB\Desktop\Basil_Nexus\public\` (배포본) |
| 소스 폴더 | `C:\Users\HSB\Desktop\Basil_Nexus\` (`index.html`, `assets\`, `lifoneer\`) |
| 실행 배치 | `start-server.bat` (Node 서버), `sync-public.bat` (소스→public 동기화) |

### config.yml 내용
```yaml
tunnel: 537a2258-ca79-4b45-bd35-96473cd19d13
credentials-file: C:\Users\HSB\.cloudflared\537a2258-ca79-4b45-bd35-96473cd19d13.json
ingress:
  - hostname: nump.io
    service: http://localhost:8088
  - hostname: www.nump.io
    service: http://localhost:8088
  - service: http_status:404
```

### 사이트가 떠 있으려면 (셋 다 ON)
1. **Node 서버** 실행 (`start-server.bat` 또는 pm2)
2. **cloudflared** 실행 (테스트: `cloudflared tunnel run nump` / 영구: 윈도우 서비스)
3. **PC 켜짐**

---

## 2. 사이트 업데이트 방법 (현재 구성에서)

소스를 고친 뒤 **반드시 public 폴더로 동기화**해야 반영됩니다.
```
1) 소스 수정:  index.html, lifoneer\*  편집
2) 동기화:     sync-public.bat 실행  (소스 → public\ 복사, 민감/불필요 파일 제외)
3) 캐시:       Cloudflare가 이미지·CSS·JS를 캐싱함.
               즉시 반영하려면 Cloudflare 대시보드 → Caching → "Purge Everything"
               (또는 개발 중엔 Caching → Development Mode ON: 3시간 캐시 우회)
```
> HTML은 서버에서 `no-cache`로 보내 바로 반영되지만, 이미지/CSS/JS는 캐시될 수 있음.

업데이트 자체는 **언제든 자유롭게 가능**하며 Cloudflare/터널 구성과 무관합니다.

---

## 3. 나중에: 서버룸 로컬서버 + 포트포워딩으로 이전

### 3-1. 새 서버(서버룸) 준비
1. `public\` 폴더 + `server.js` 복사 (또는 nginx/Caddy 사용)
2. 서버 실행: `node server.js 80` 또는 nginx/Caddy로 80/443 서빙
3. 서버 내부 IP 고정, 방화벽에서 해당 포트 인바운드 허용
4. 공유기: 외부 80(및 443) → 서버 내부 IP 포트포워딩
5. 서버룸 **공인 IP** 확인 (고정 공인 IP 권장)

### 3-2. DNS 전환 (둘 중 택1)

**(A) Cloudflare 유지 — 권장, 가장 간단 + HTTPS 그대로 유지**
- Cloudflare 대시보드 → DNS → `nump.io`, `www` 의 **CNAME(터널) 레코드 삭제**
- **A 레코드 추가**: `nump.io` → 서버룸 공인 IP, `www` → 동일
- **프록시 ON(주황 구름)** 유지 → Cloudflare가 계속 HTTPS 제공 (서버는 HTTP 80만 해도 됨, SSL/TLS 모드 Full)
- 장점: 서버에서 인증서 작업 불필요, CDN·DDoS 보호 유지. **터널만 걷어내면 끝.**

**(B) Cloudflare 떠나기 — 후이즈 DNS로 복귀**
- 후이즈 → `nump.io` 네임서버를 **후이즈 기본 네임서버로 원복**
- 후이즈 DNS에서 A 레코드 → 서버룸 공인 IP
- 이 경우 **HTTPS는 서버가 직접 처리** → Caddy(Let's Encrypt 자동) 권장, 443 포워딩 필요

### 3-3. 기존 PC의 Cloudflare Tunnel 정리 (원상복구)
```powershell
# 1) 윈도우 서비스로 등록했다면 제거 (관리자 PowerShell)
cloudflared service uninstall

# 2) 실행 중인 터널 중지 후 삭제 (활성 연결 없어야 삭제됨)
cloudflared tunnel delete nump

# 3) DNS의 터널 CNAME 레코드 삭제  → 위 3-2에서 A레코드로 교체하며 처리됨

# 4) (선택) 흔적 정리
#   - C:\Users\HSB\.cloudflared\  (config.yml, *.json, cert.pem) 폴더 삭제
#   - C:\Users\HSB\cloudflared\   (cloudflared.exe) 폴더 삭제
#   - 사용자 PATH 에서 C:\Users\HSB\cloudflared 항목 제거
```

> **가장 깔끔한 이전 시나리오**: (A) 방식 = Cloudflare는 그대로 두고,
> DNS의 터널 CNAME → 서버룸 공인 IP A레코드로 **한 줄만 교체** + 기존 PC에서 `cloudflared service uninstall` + `tunnel delete nump`.
> 이러면 HTTPS·도메인 그대로 유지되고 트래픽만 새 서버로 넘어감.

---

## 4. 빠른 명령어 모음
```powershell
# 로컬 서버 실행
C:\Users\HSB\Desktop\Basil_Nexus\start-server.bat

# 소스 → public 동기화 (업데이트 반영)
C:\Users\HSB\Desktop\Basil_Nexus\sync-public.bat

# 터널 상태/연결 확인
cloudflared tunnel info nump
cloudflared tunnel list

# 터널 테스트 실행 (포그라운드)
cloudflared tunnel run nump

# 터널 영구 서비스 등록 / 해제 (관리자)
cloudflared service install
cloudflared service uninstall

# 설정 검증
cloudflared tunnel ingress validate
```

---

## 5. 메모
- HTTPS는 현재 Cloudflare Universal SSL에 의존 (서버 자체는 HTTP 전용 `server.js`).
- 서버룸 이전 시 (B)로 가면 서버가 HTTPS를 직접 해야 하므로 `server.js` 대신 **Caddy** 사용 권장.
- 콘텐츠가 로컬에 있으므로 PC/서버가 꺼지면 사이트도 내려감.
