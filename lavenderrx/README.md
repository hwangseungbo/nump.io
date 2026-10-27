# LavenderRx — 약물 상호작용 솔루션 연동 (인드림헬스케어)

상태: **호출 방식·약제 키 확정, JSON 스키마·샘플·테스트 접속 정보 대기** (2026-10-26)

인드림헬스케어(김재원님)의 약물 상호작용 분석 LLM 솔루션을 환자 포털
"처방 약 / 복약 정보" 화면의 버튼으로 연동하는 작업. 벤더 샘플 파일은
`/home/nump/Basil_Nexus/전달 약제명.xlsx` (250종, 6컬럼 형식 정의).

## 완료된 것 (2026-10-22)

1. **drug_master 테이블** — 벤더 6컬럼 체계(korProdNameOrigin / korIngNameOrigin /
   korIngName / engIngName / mainDrugCode / kdCode) + code_confirmed, note.
   데모 약물 30종 적재 (기존 25종 + 상호작용용 조코·플라빅스·아마릴·씨프로바이·클래리시드).
2. **prescription_drug_map** — 처방↔마스터 연결 (prescriptions는 postgres 소유라
   컬럼 추가 대신 별도 매핑 테이블, basil 소유). 처방 74건 전부 연결됨.
3. **처방 표기 전환** — 영문 자유텍스트("Amlodipine 5mg") → 한글 제품명
   ("노바스크정5mg(암로디핀)"). 시드: `nump.io-main/db/seed-drug-master.js` (멱등).
4. **상호작용 데모 조합** (시연 포인트 — patient1~6 전원, 기전이 겹치지 않게 구성):
   - 홍길동(patient1): 아스피린프로텍트 + 부루펜 → NSAID의 항혈소판 간섭·출혈 위험
   - 김철수(patient2): 플라빅스 + 로섹 → CYP2C19 억제로 클로피도그렐 활성화 저해
   - 박영희(patient3): 아마릴 + 씨프로바이 → 설폰요소제+퀴놀론, 저혈당 위험
   - 이민수(patient4): 리피토 20mg + 클래리시드 → CYP3A4 억제, 횡문근융해 위험
   - 최지연(patient5): 씬지로이드 + 훼로바유 → 철분제가 레보티록신 흡수 저해(간격 4시간)
   - 김복순(patient6): 노바스크 + 조코 20mg → 병용 시 심바스타틴 용량 상한(20mg)
5. **코드 매핑 요청 파일** — `약제목록-코드매핑요청-20261022.xlsx` (이 폴더).
   mainDrugCode/kdCode는 공백 — **김재원님께 전달해 귀측 사전 기준으로 채움 요청**.
   회신 받으면 drug_master에 반영하고 code_confirmed=true 처리.

## 김재원님 회신 반영 (2026-10-22~26 카톡)

- [x] **호출 방식 확정**: ①버튼 클릭 → 우리 서버에서 벤더 서버로 환자·약 정보 JSON POST
  ②응답으로 결과 조회값(userId, seq) 수신 ③그 값만 붙인 결과 화면 URL을 새 창으로.
  처방 정보가 URL에 노출되지 않는 구조. **호출은 브라우저가 아닌 서버에서** (벤더 권장).
- [x] **약제 식별 키 확정**: `kdCode` 필수 — 항목명은 kdCode지만 실제로는
  **심평원 EDI 약품코드 9자리**(예: 651900750)를 넣음(약학정보원 KD코드 아님).
  `mainDrugCode`(주성분코드)는 선택, 이것만으로는 약 식별 안 함.
  → drug_master.kd_code에 EDI 9자리를 적재하기로 함(컬럼명은 벤더 항목명 유지).
- [ ] JSON 스키마(항목 정의)·샘플 — 벤더가 테스트용 연동 API 개발 중, 완료 시
  테스트 접속 정보와 함께 송부 예정 (10/26 기준)
- [ ] 우리 쪽 개발 환경 회신 → 벤더가 환경 맞춤 호출 샘플 코드 제공
  (Node.js v22, 프레임워크 없음 — 아래 "개발 환경 요약" 참조)
- [ ] 약제 사전 범위: 샘플 250종 외 일반 약제 커버 여부
- [ ] 개인정보: 환자 식별정보 없이 약제 리스트만 전송 가능한지 (주민번호 미저장 원칙)
- [ ] 인증: 토큰/키 발급 방식
- [ ] **폐쇄망/온프레미스 설치 가능 여부** — 전체 플랫폼 폐쇄망 반입 배포 원칙
  (`airgap/AIRGAP-DEPLOY.md` 의존점 표에 등록됨)
- [ ] 코드매핑요청 xlsx의 EDI 약품코드 기입 회신
  (xlsx 헤더에 "심평원 EDI 약품코드 9자리" 명시로 갱신 — 2026-10-26)

## 개발 환경 요약 (벤더 회신용)

- 서버: **Node.js v22** (내장 `http` 모듈 기반 자체 서버, Express 등 프레임워크 없음)
- 벤더 API 호출: 서버 측에서 Node 내장 `fetch`(또는 `https.request`)로 POST 예정
- 프런트: 순수 HTML/JavaScript (환자 포털 복약 화면) — 버튼 클릭 시 우리 서버 경유
- DB: PostgreSQL 14 (drug_master에 EDI 코드 적재 후 조인해 payload 구성)

## 다음 단계 (스펙 회신 후)

1. 환자 포털 복약 화면에 "약물 상호작용 분석(LavenderRx)" 버튼 추가
   — 구현은 개발 에이전트 위임, payload는 아래 쿼리 기반:
   ```sql
   SELECT dm.kor_prod_name, dm.kor_ing_name, dm.eng_ing_name,
          dm.main_drug_code, dm.kd_code, rx.dosage
     FROM prescriptions rx
     JOIN prescription_drug_map m ON m.prescription_id = rx.id
     JOIN drug_master dm ON dm.id = m.drug_master_id
    WHERE rx.patient_id = $1 AND rx.active;
   ```
2. 상호작용 분석 비대상(외용제·점안제·비의약품)은 note 컬럼으로 필터.
3. 벤더 주소는 설정값으로 분리(AI_UPSTREAM과 동일 원칙) + airgap 문서 갱신.
