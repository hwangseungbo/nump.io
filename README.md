# Basil Nexus / nump.io

의료 AI 통합 플랫폼. **Basil Nexus 대시보드**(루트)와 모델 공유 사이트 **Lifoneer**(`/lifoneer/`)로 구성된 정적 웹사이트로, 로컬 PC에서 직접 호스팅하여 [nump.io](https://nump.io) 도메인으로 서비스됩니다.

## 구성

| 경로 | 설명 |
| --- | --- |
| `index.html` | Basil Nexus 의료 AI 대시보드 (라이트 그린 테마, 아바타 선택, 서비스 카드) |
| `lifoneer/index.html` | Lifoneer — 의료 파운데이션 모델 공유 사이트 (HuggingFace 스타일) |
| `lifoneer/open-market.html` | 사용자 제작 모델 오픈마켓 (배너 캐러셀 · 병변별 카테고리 · 인기 모델) |
| `assets/` | 대시보드용 가공 이미지(누끼/아이콘/파비콘) |
| `리소스/` | 원본 소스 이미지 |
| `server.js` | 의존성 없는 Node 정적 서버 (`public/`을 `0.0.0.0:8088`로 서빙) |
| `sync-public.ps1` / `.bat` | 소스 → `public/` 배포 폴더 동기화 스크립트 |
| `DEPLOYMENT.md` | Cloudflare Tunnel 호스팅 런북 + 서버실 이전/teardown 가이드 |

## 기술 스택

- 순수 **HTML / CSS / JavaScript** (백엔드·프레임워크 없음)
- **Pretendard** 한글 웹폰트 (jsDelivr CDN)
- CSS: flexbox / grid, `backdrop-filter`(프로스트 글래스), CSS 변수, 반응형 미디어쿼리
- 정적 서빙: Node 내장 `http`/`fs`/`path` 모듈

## 로컬 실행

```powershell
# 소스 → public/ 동기화 후 서버 실행
./sync-public.ps1
node server.js          # http://localhost:8088
```

`start-server.bat` 으로도 실행할 수 있습니다.

## 배포 (nump.io)

홈 라우터의 WAN 80/443 포트포워딩이 불가하여 **Cloudflare Tunnel**(`cloudflared`)을 통해 로컬 서버를 인터넷에 노출합니다. HTTPS는 Cloudflare Universal SSL로 자동 처리됩니다.

```
브라우저 → Cloudflare (HTTPS) → Tunnel → localhost:8088 (server.js → public/)
```

배포·DNS·이전/teardown 절차는 **[`DEPLOYMENT.md`](DEPLOYMENT.md)** 를 참고하세요.

### 콘텐츠 업데이트 흐름

1. 소스 수정 (`index.html`, `lifoneer/**`)
2. `./sync-public.ps1` 실행 → `public/` 갱신 (HTML은 no-cache 서빙이라 새로고침 시 즉시 반영)
3. 필요 시 GitHub 반영: `git add -A && git commit && git push`

## 라이선스

비공개 프로젝트용 코드입니다. 별도 라이선스 명시 전까지 모든 권리는 소유자에게 있습니다.
