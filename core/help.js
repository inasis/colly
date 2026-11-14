'use strict';

const { PROG } = require('./constants');
const HELP = {
  global: `사용법: colly <command> [옵션...]

명령:
  crop     흰색 공백 기준으로 이미지를 세로 분할
  merge    이미지들을 지정한 간격으로 병합
  automerge  입력한 이미지 구분명 순서로 모델별 자동 병합
  align    분할 이미지 파일명을 랜덤 ID로 재정렬
  angle    상품 이미지의 회전·크기·캔버스를 일괄 정렬
  stack    접두·원본·접미 이미지를 지정한 순서로 겹쳐 합성
  drop     가장자리와 연결된 흰색 배경을 투명하게 제거
  match    dHash 이미지 유사도 검색 (선택적 색상 비교)

공통 옵션:
  -R, --reference <폴더>   기준 프로젝트 폴더
  -D, --direct             output/ 대신 기준 프로젝트 폴더에서 직접 읽기
  -h, --help               도움말 표시

자동 병합: colly automerge <상품명일부> <구분명1> <구분명2> [...]`,

  match: `사용법: colly match [-R <폴더>] [-D] [-P <prefix>] <번호|R번호|?파일명> <번호|R번호|?파일명> [--threshold <0~64>] [--basis <0~100>] [--color] [--color-threshold <0~255>] [--iterate|--iterate-reverse] [--result]

번호는 prefix + 3자리 번호(+ 선택적 #H높이)로 검색합니다. R002는 최대 번호에서 두 번째(최대-1)를 뜻합니다. 기본 prefix: dummy
?파일명은 접두어를 붙이지 않고 정확한 파일명으로 검색합니다. 와일드카드는 지원하지 않습니다.
각 파일은 cite/ 우선, 없으면 output/ (또는 -D 입력 폴더)에서 찾습니다.
예: colly match -P C R001 R002
예: colly match -P C 1 ?sample.png
--iterate: 두 번째 번호부터 증가하며 첫 일치까지 검색
--iterate-reverse: 두 번째 번호부터 감소하며 첫 일치까지 검색
R001 --iterate 및 001 --iterate-reverse는 경계이므로 한 번만 비교
--result: 일치하면 실제 번호만 출력 (예: 008), 불일치하면 출력 없음
--threshold 기본 10 (해밍 거리), --basis 유사도(%) 초과 기준 (--bashs 별칭, --threshold보다 우선), --color 색상 MAE 검사 (기본 허용치 20)`,

  crop: `사용법:
  colly crop [-R <폴더>] <최소공백높이>
  colly crop [-R <폴더>] -D <파일명> <최소공백높이>`,

  merge: `사용법:
  colly merge [-R <폴더>] [-D] [-P <prefix>] <gap> <번호|?파일명> [...] [-O <파일명>] [-B <픽셀>]
  colly merge [-R <폴더>] [-D] [-P <prefix>] --instant <번호|?파일명|파일명> [...] [-O <파일명>] [-B <픽셀>]
  colly merge -C <프리셋파일> <값1> [값2 ...]
  colly merge --instant <이미지...>
  colly merge --instant C?sample.png 1 2  (cite/ 참조)
  `,

  automerge: `사용법: colly automerge [-R <폴더>] [-D] <상품명일부> <구분명1> <구분명2> [...] [--gap <픽셀>] [--overwrite] [--dry-run]

output/ 폴더를 재귀 탐색해 <상품명><구분명>.png 파일을 입력한 구분명 순서대로 세로 병합합니다. 없는 구분명 파일은 생략합니다.
예: colly automerge 상품명A 상단 중단 하단
기본 저장 위치: 기준 프로젝트 폴더/<모델명>.png
기본값: 간격 0px, 기존 결과 파일 덮어쓰기 금지.`,

  align: `사용법: colly align [-R <폴더>] [-D]`,

  angle: `사용법: colly angle [-R <폴더>] [-D] [옵션...]

옵션:
  --width <픽셀>           출력 너비 (기본: 1200)
  --height <픽셀>          출력 높이 (기본: 1200)
  --occupancy <0.1~1>      상품 점유 비율 (기본: 0.86)
  --orientation <방향>     horizontal 또는 vertical
  --threshold <0~441>      배경과 상품의 색상 거리 기준 (기본: 35)
  --background <값>        white, transparent, #RRGGBB
  --padding <픽셀>         회전 전 투명 여백 (기본: 40)
  --quality <1~100>        JPG/WebP/AVIF 품질 (기본: 95)
  --format <형식>          png, jpg, webp, avif, keep
  --recursive              하위 폴더까지 처리
  --dry-run                분석만 수행`,

  stack: `사용법:
  colly stack [-R <폴더>] [-D] {-P <접두사> | -S <접미사>} [-A] [--at <파일명>] [...]

-P, -S, -A, --at이 나온 순서대로 합성합니다.
-A를 생략하면 원본은 마지막에 자동 추가됩니다.`,

  drop: `사용법: colly drop [-R <폴더>] [-D] [--threshold <0~255>]

이미지 가장자리와 연결된 흰색 영역만 투명하게 만듭니다.
상품 내부의 독립된 흰색 영역은 유지합니다.
결과는 dropped/ 폴더에 PNG로 저장됩니다.

옵션:
  --threshold <0~255>      흰색 판정 최소 RGB 값 (기본: 245)`
};
function hasHelpFlag(args) { return args.includes('-h') || args.includes('--help'); }
function printHelp(section, stream = console.log) { stream(HELP[section] || HELP.global); }

module.exports = { hasHelpFlag, printHelp };