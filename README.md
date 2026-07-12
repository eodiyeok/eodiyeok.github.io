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

철도산업정보센터가 변경 때마다 공개하는 운영기관·노선·역 코드정보 엑셀을 내려받아 수도권 역 목록을 다시 만듭니다. 별도 API 키는 필요하지 않습니다.

```sh
npm run data:update
```

GitHub Actions의 `update-stations.yml`이 매일 공식 자료를 확인합니다. 새 파일이 있으면 역 목록을 갱신하고 검사한 뒤 자동 커밋하며, `deploy.yml`이 변경된 `main` 브랜치를 GitHub Pages에 배포합니다.

## 검사

```sh
npm run check
npm test
npm run lint
npm run build
```
