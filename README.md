# Colly

Colly는 이미지 분할, 병합, 파일명 정렬, 상품 이미지 각도·크기 정규화, 레이어 합성, 흰색 배경 제거를 하나의 CLI로 처리하는 Node.js 이미지 도구입니다.

## 기능

- `crop`: 흰색 공백 기준 세로 분할
- `merge`: 고정 간격 또는 `#H` 높이 보정 간격으로 병합
- `merge magic`: 대화형 병합 도우미
- `align`: 분할 이미지 파일명을 랜덤 4자리 prefix로 정렬
- `angle`: 상품 이미지 기울기·크기·캔버스 자동 통일
- `stack`: 접두·원본·접미·고정 PNG 레이어 합성
- `drop`: 가장자리와 연결된 흰색 배경만 투명화

## 코드 구조

실행 기능은 `colly.js` 하나에 통합되어 있습니다. `merge magic`의 대화형 UI만 `magic.js`를 사용합니다.

```text
colly/
├── colly.js
├── magic.js
├── package.json
├── README.md
└── LICENSE
```

`angle.js`, `drop.js`, `cli.js`, `help.yaml`은 사용하지 않습니다.

## 요구 사항

- Node.js 18 이상
- `sharp`

## 설치

```bash
git clone https://github.com/inasis/colly.git
cd colly
npm install
npm link
```

이후 다음처럼 실행합니다.

```bash
colly --help
```

`npm link` 없이 직접 실행할 수도 있습니다.

```bash
node colly.js --help
```

## 공통 옵션

```text
-R, --reference <폴더>   기준 프로젝트 폴더
-D, --direct             output/ 대신 기준 프로젝트 폴더에서 직접 읽기
-h, --help               도움말 표시
```

기본 입력 폴더는 `<기준 프로젝트>/output/`입니다. `-D`를 사용하면 `<기준 프로젝트>/` 자체를 입력 폴더로 사용합니다.

## crop

긴 PNG/JPG 이미지를 흰색 공백 기준으로 세로 분할합니다.

```bash
colly crop 15
colly crop -R ../project 15
colly crop -R ../project -D image.png 45
```

결과:

```text
output/C001#H320.png
output/C002#H185.png
```

`#H` 뒤 숫자는 분할된 이미지의 높이입니다.

## merge

```bash
colly merge -P C 0 001 20 002 10 003
```

직접 파일명을 지정할 때는 `?`를 붙입니다.

```bash
colly merge 0 '?logo.png' 30 '?banner.png'
```

높이 보정 간격도 지원합니다.

```text
최종 간격 = 기본 간격 + (기준 H - 실제 H)
```

```bash
colly merge -P C 0 001 50H25 002 -O result.png -B 100
```

주요 옵션:

```text
-I, --instant             모든 간격을 0px로 처리
-O, --output <파일명>     출력 파일명
-B, --bottom <픽셀>       하단 여백
-C, --command-file <파일> merge 인자 프리셋
```

Instant 예:

```bash
colly merge -P C --instant 001 002 003
colly merge --instant logo.png banner.png
```

프리셋 예:

```text
-P $1 0 001 50H25 $2 -O $3
```

```bash
colly merge -C preset.txt C 002 merged.png
```

## merge magic

대화형 병합 기능입니다.

```bash
colly merge magic
```

이 기능만 별도 `magic.js`를 사용합니다.

## align

`C000#H숫자` 형식의 파일들을 랜덤 4자리 prefix와 연속 번호로 바꿉니다.

```bash
colly align
colly align -R ../project
colly align -R ../project -D
```

예:

```text
C001#H320.png → aB7x_001#H320.png
C002#H185.png → aB7x_002#H185.png
```

## angle

상품 윤곽을 분석해 기울기를 보정하고 동일한 캔버스와 점유율로 정렬합니다. 결과는 `angled/`에 저장됩니다.

```bash
colly angle
colly angle --width 1000 --height 1000
colly angle --occupancy 0.82 --background transparent
colly angle -R ../project -D --format keep
```

옵션:

```text
--width <픽셀>           기본 1200
--height <픽셀>          기본 1200
--occupancy <0.1~1>      기본 0.86
--orientation <방향>     horizontal | vertical
--threshold <0~441>      배경/상품 색상 거리, 기본 35
--background <값>        white | transparent | #RRGGBB
--padding <픽셀>         회전 전 투명 여백
--quality <1~100>        JPG/WebP/AVIF 품질
--format <형식>          png | jpg | webp | avif | keep
--recursive              하위 폴더 포함
--dry-run                분석만 수행
```

## stack

`-P`, `-S`, `-A`, `--at`이 명령줄에 등장한 순서대로 레이어를 합성합니다.

```bash
colly stack -P "hello " -S " colly" -A
```

```text
접두사 → 접미사 → 원본
```

```bash
colly stack -P "hello " -A -S " colly"
```

```text
접두사 → 원본 → 접미사
```

`-A`를 생략하면 원본은 마지막에 자동으로 추가됩니다. 결과는 `stacked/`에 저장됩니다.

고정 PNG는 `--at`으로 원하는 위치에 여러 번 삽입할 수 있습니다.

```bash
colly stack -P "Pre " --at Background.png -A --at Frame.png -S " copy"
```

## drop

흰색 배경을 투명 PNG로 바꿉니다.

```bash
colly drop
```

`drop`은 모든 흰색 픽셀을 단순 삭제하지 않습니다. 이미지 가장자리에서 시작하여 **가장자리와 연결된 흰색 영역만 flood-fill 방식으로 제거**합니다. 따라서 상품 내부의 독립된 흰색 영역은 유지됩니다.

기본 입력/출력:

```text
output/product01.jpg → dropped/product01.png
output/product02.png → dropped/product02.png
```

흰색 판정 기본값은 `245`입니다.

```bash
colly drop --threshold 240
```

```text
255   거의 완전한 흰색만 제거
245   기본값
230   더 넓은 밝은 배경까지 제거
```

값을 지나치게 낮추면 밝은 상품 가장자리가 배경과 연결되어 함께 제거될 수 있습니다.

다른 프로젝트:

```bash
colly drop -R ../project
```

기준 폴더 직접 처리:

```bash
colly drop -R ../project -D
```

## 출력 폴더

```text
crop    → output/
merge   → merge.png 또는 지정 파일
align   → 입력 폴더에서 이름 변경
angle   → angled/
stack   → stacked/
drop    → dropped/
```

## 도움말

```bash
colly --help
colly crop --help
colly merge --help
colly align --help
colly angle --help
colly stack --help
colly drop --help
```

직접 실행 시:

```bash
node colly.js drop --help
```

## 라이선스

[BSD 3-Clause License](LICENSE)
