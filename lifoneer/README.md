# Lifoneer — Medical AI Model Marketplace

의료 AI 모델을 다운로드, 업로드, 매매거래할 수 있는 플랫폼

## 프로젝트 구조

```
lifoneer/
├── index.html          # 메인 페이지
├── css/
│   └── style.css       # 전체 스타일
├── js/
│   └── main.js         # 인터랙션 (드롭다운, 애니메이션 등)
├── assets/             # 이미지, 아이콘 등
└── README.md
```

## 주요 기능

- ✅ 허깅페이스 스타일 드롭다운 내비게이션 (Models, Datasets, Spaces, Community)
- ✅ 의료 AI 모델 카드 그리드 (가격, 다운로드 수, 평점 표시)
- ✅ 카테고리 브라우저 (신경학, 심장학, 유전체학 등)
- ✅ 모델 판매(업로드) CTA 섹션
- ✅ 반응형 레이아웃
- ✅ 카드 호버 틸트 애니메이션
- ✅ 스크롤 페이드인 효과
- ✅ 키보드 단축키 (/ 검색)

## 확장 계획

- [ ] 모델 상세 페이지
- [ ] 업로드/판매 등록 폼
- [ ] 결제 시스템 연동
- [ ] 사용자 프로필 / 대시보드
- [ ] 검색 & 필터링
- [ ] API 문서 페이지

## 사용 기술

- Vanilla HTML/CSS/JS (프레임워크 없음, 빠른 로딩)
- Google Fonts: Syne (헤드라인) + DM Sans (본문)
- CSS Variables, Grid, Flexbox
- IntersectionObserver API (스크롤 애니메이션)
