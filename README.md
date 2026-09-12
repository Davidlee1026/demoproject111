# 나만의 A.T

선수의 부상 상황을 음성·텍스트로 기록하고, 위험 신호·초기 대처·병원 방문 기준·의료진 전달용 요약을 제공하는 모바일 웹앱입니다.

## 로컬 실행

```powershell
node dev-server.js
```

브라우저에서 `http://localhost:4173`을 엽니다. 음성 입력은 `localhost`에서 마이크 권한을 허용해야 합니다.

## Vercel 배포

```powershell
vercel login
vercel link
vercel --prod
```

이 저장소는 Vercel 정적 배포 설정을 사용합니다. 현재 병원·비용 정보와 공유 링크는 데모이며, 실제 서비스 전 의료진 검토·공공 병원 데이터·백엔드 저장소 연결이 필요합니다.

## 구조

- `index.html`, `styles.css`, `enhancements.css`, `photo.css`: 사용자 화면
- `app.js`: 부상 기록 흐름과 데모 상태 관리
- `architecture.html`: 프론트엔드·백엔드 확장 구조
- `dev-server.js`: 음성 권한 테스트용 로컬 서버
- `assets/`: 선수 캐릭터·부상 교육 이미지
