# 어디역?

수도권 전철역 중 오늘 가볼 곳을 무작위로 골라주는 SvelteKit PWA입니다. 노선별 필터, 최근 결과 피하기, 지도 바로가기와 홈 화면 설치를 지원합니다.

## 실행

```sh
npm install
npm run dev
```

같은 와이파이의 휴대폰에서도 보려면 다음처럼 실행한 뒤 표시되는 Network 주소로 접속합니다.

```sh
npm run dev -- --host 0.0.0.0
```

## 역 정보 갱신

국토교통부 공공데이터의 도시철도 전체노선 CSV를 내려받아 수도권 역 목록을 다시 만듭니다.

```sh
npm run data:update
```

GitHub Actions의 `update-stations.yml`이 매일 변경 여부를 확인하고, 변경된 경우에만 커밋합니다. `deploy.yml`은 `main` 브랜치를 GitHub Pages에 배포합니다.

## 검사

```sh
npm run check
npm test
npm run lint
npm run build
```
