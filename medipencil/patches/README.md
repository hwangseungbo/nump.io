# MediPencil 로컬 패치

## medipencil-patched.war — 실시간 받아쓰기 조각 단축 (2026-10-15) — **적용 해제됨**

> 2026-10-15 당일 원복: 5~20초 조각은 문장이 중간에 잘리며 인식률이 떨어져
> 사용자 판단으로 원래(30~45초)로 되돌림. 파일은 기록용으로 보관.
> 재적용하려면 아래 compose.override.yml을 다시 만들면 됨.

- 원본: 컨테이너 이미지 내 /opt/medipencil/medipencil.war (md5 2de3776ba1b5ad51c1584ad37440a132)
- 변경: WEB-INF/jsp/front/app.jsp 인라인 JS 상수 2개만 수정
  - `SPLIT_AFTER` 30 → **5** (5초 경과 후 0.6초 무음이 오면 조각 분할)
  - `FORCE_AFTER` 45 → **20** (연속 발화 시 강제 분할 상한)
- 효과: 받아쓰기가 30~45초 묶음 대신 **한두 문장(5~20초) 단위**로 올라옴
- 적용 방식: MediPencil_Independent_20261013/compose.override.yml 이
  이 WAR를 /opt/medipencil/medipencil.war 로 read-only 마운트
- 부작용: 조각 수 증가(작업 행·음성 파일 수 증가, 총 용량은 동일),
  긴 연속 발화는 20초에서 강제 분할되어 경계 단어가 드물게 끊길 수 있음

## 원복

```bash
cd /home/nump/Basil_Nexus/medipencil/MediPencil_Independent_20261013
rm compose.override.yml && docker compose up -d app
```

## 주의

- 상대측이 새 패키지/이미지를 주면 이 패치는 새 WAR 기준으로 다시 만들어야 함
  (혹은 원복 후 사용). 패치 중인 사실은 상대측 문의 시 밝힐 것.
- 근본 해법: 상대측에 "조각 분할 시간(SPLIT_AFTER/FORCE_AFTER) 설정화" 기능 요청 권장.
