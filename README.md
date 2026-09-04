# Colly

Colly는 이미지 분할, 병합, 파일명 정렬, 상품 이미지 각도·크기 정규화, 레이어 합성, 흰색 배경 제거를 한 번에 처리하는 Node.js 기반 이미지 CLI입니다.

## 기능

- `crop`: 흰색 공백을 기준으로 긴 이미지를 세로 분할
- `merge`: 분할된 이미지를 고정 간격 또는 높이 보정 간격으로 병합
- `merge magic`: 이미지를 대화식으로 선택하고 간격을 미리 확인하며 병합
- `align`: 분할 이미지에 임의의 4자리 prefix를 부여하여 파일명 정렬
- `angle`: 상품 이미지의 기울기, 크기, 캔버스를 자동 통일
- `stack`: 접두 이미지, 원본, 접미 이미지, 고정 PNG를 지정한 순서로 겹쳐 합성
- `drop`: 이미지 가장자리와 연결된 흰색 배경만 제거해 투명 PNG로 변환

## 요구 사항

- Node.js 18 이상
- [`sharp`](https://www.npmjs.com/package/sharp)

## 설치

```bash
git clone https://github.com/inasis/colly.git
cd colly
npm install
npm link
```

이후 전역 명령처럼 사용할 수 있습니다.

```bash
colly --help
```

`npm link` 없이 직접 실행하려면 다음처럼 `cli.js`를 사용합니다.

```bash
node cli.js --help
```

## 기본 폴더 구조

```text
colly/
├── cli.js
├── colly.js
├── drop.js
├── angle.js
├── magic.js
├── help.yaml
├── output/
├── angled/
├── stacked/
└── dropped/
```

기본 기준 프로젝트 폴더는 Colly가 설치된 폴더입니다. 다른 프로젝트 폴더를 사용하려면 `-R` 또는 `--reference`를 지정합니다.

```bash
colly crop -R ../project 15
```

`-D` 또는 `--direct`를 지원하는 명령은 `output/` 대신 기준 프로젝트 폴더에서 이미지를 직접 읽습니다.

## 공통 사용법

```bash
colly <command> [옵션...]
```

공통 옵션:

```text
-R, --reference <폴더>   기준 프로젝트 폴더 지정
-D, --direct             output/ 대신 기준 프로젝트 폴더에서 직접 읽기
-h, --help               도움말 표시
```

각 명령이 지원하는 세부 옵션은 `colly <command> --help`로 확인할 수 있습니다.

## crop — 이미지 분할

기준 프로젝트 폴더에 있는 PNG 또는 JPG 이미지 하나를 찾아, 지정한 높이 이상의 흰색 공백을 기준으로 세로 분할합니다.

```bash
colly crop 15
colly crop -R ../project 15
colly crop -R ../project -D image.png 45
```

결과는 `output/`에 다음 형식으로 저장됩니다.

```text
C001#H320.png
C002#H185.png
C003#H410.png
```

`#H` 뒤의 숫자는 분할된 이미지의 높이입니다.

> `crop`을 실행하면 `output/` 안의 기존 `C*.*` 파일이 먼저 삭제됩니다.

## merge — 이미지 병합

각 이미지 앞에 적용할 간격과 이미지 번호를 한 쌍으로 입력합니다. 번호로 이미지를 찾을 때는 `-P`로 prefix를 지정합니다.

```bash
colly merge -P C 0 001 20 002 10 003
```

위 명령은 다음 순서로 이미지를 합칩니다.

```text
C001 앞 0px
C002 앞 20px
C003 앞 10px
```

파일명은 아래 형식을 모두 인식합니다.

```text
C001.png
C_001.png
C001#H320.png
C_001#H320.png
```

직접 파일명을 지정하려면 앞에 `?`를 붙입니다.

```bash
colly merge 0 '?logo.png' 30 '?banner.png'
```

셸에서 `?`가 와일드카드로 해석되지 않도록 따옴표 사용을 권장합니다.

### 높이 보정 간격

`50H25` 형식은 파일명의 실제 `#H` 값에 따라 간격을 보정합니다.

```text
최종 간격 = 기본 간격 + (기준 H - 실제 H)
```

예를 들어 간격이 `50H25`이고 파일명이 `C002#H23.png`라면 최종 간격은 `52px`입니다.

```bash
colly merge -P C 0 001 50H25 002 -O result.png -B 100
```

주요 옵션:

```text
-O, --output <파일명>     출력 파일명 지정, 기본값 merge.png
-B, --bottom <픽셀>       이미지 맨 아래에 추가할 여백
-I, --instant             모든 이미지 간격을 0px로 처리
-C, --command-file <파일> 긴 merge 인자를 프리셋 파일에서 읽기
```

### Instant 모드

```bash
colly merge -P C --instant 001 002 003
colly merge --instant logo.png banner.png
```

### 프리셋 파일

긴 병합 인자는 프리셋 파일로 분리할 수 있습니다.

```text
-P $1 0 001 50H25 $2 -O $3
```

```bash
colly merge -C preset.txt C 002 merged.png
```

프리셋의 `$1`, `$2`, `$3`은 프리셋 파일명 뒤에 입력한 값으로 치환됩니다.

## merge magic — 대화형 병합

현재 작업 폴더의 `output/` 이미지를 확인하면서 사용할 파일과 간격을 대화식으로 결정합니다.

```bash
colly merge magic
```

각 단계에서 실제 병합 미리보기를 생성하며, 마지막에 하단 여백을 입력하면 현재 작업 폴더에 `merge.png`가 생성됩니다.

`merge magic`은 `-R`, `-D` 및 다른 `merge` 옵션과 함께 사용할 수 없습니다.

## align — 파일명 정렬

`output/`의 `C000#H숫자`부터 `C999#H숫자` 형식 이미지를 임의의 4자리 prefix와 연속 번호로 변경합니다.

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

## angle — 상품 이미지 각도·크기 통일

`output/`의 상품 윤곽을 분석해 긴 축의 기울기를 자동 보정하고, 이미지 비율을 유지하면서 동일한 크기의 캔버스 중앙에 배치합니다.

결과는 `angled/`에 저장됩니다.

```bash
colly angle
colly angle --width 1000 --height 1000
colly angle --occupancy 0.82 --background transparent
colly angle -R ../project -D --format keep
```

주요 옵션:

```text
--width <픽셀>           출력 너비, 기본 1200
--height <픽셀>          출력 높이, 기본 1200
--occupancy <0.1~1>      상품이 차지할 최대 비율, 기본 0.86
--orientation <방향>     horizontal 또는 vertical
--threshold <0~441>      배경과 상품의 색상 거리 기준, 기본 35
--background <값>        white, transparent, #RRGGBB
--padding <픽셀>         회전 전 투명 여백
--quality <1~100>        JPG/WebP/AVIF 품질
--format <형식>          png, jpg, webp, avif, keep
--recursive              하위 폴더까지 처리
--dry-run                분석만 하고 파일은 저장하지 않음
```

배경과 상품 색이 비슷해 윤곽 감지가 부정확하면 `--threshold` 값을 조정합니다.

```bash
colly angle --threshold 20
```

## stack — 이미지 겹치기

`-P`, `-S`, `-A`, `--at`이 명령줄에 나타난 순서대로 접두 이미지, 접미 이미지, 원본, 고정 PNG를 합성합니다.

```bash
colly stack -P "hello " -S " colly" -A
```

합성 순서:

```text
접두사 → 접미사 → 원본
```

```bash
colly stack -P "hello " -A -S " colly"
```

합성 순서:

```text
접두사 → 원본 → 접미사
```

`-A`를 생략하면 원본 전체 항목이 마지막에 자동으로 추가됩니다. 결과는 `stacked/`에 저장됩니다.

고정된 이름의 PNG를 특정 위치에 넣으려면 `--at`을 사용합니다. `--at`은 여러 번 사용할 수 있습니다.

```bash
colly stack -P "Pre " --at Background.png -A --at Frame.png -S " copy"
```

합성 순서:

```text
접두사 → Background.png → 원본 → Frame.png → 접미사
```

## drop — 흰색 배경 제거

`drop`은 흰색 또는 흰색에 가까운 배경을 투명하게 만듭니다.

단순히 이미지 전체의 흰색 픽셀을 제거하지 않고, **이미지 가장자리에서 시작해 연결된 흰색 영역만 flood-fill 방식으로 제거**합니다. 따라서 상품 내부에 고립된 흰색 영역은 그대로 유지됩니다.

기본 실행:

```bash
colly drop
```

기본적으로 `output/`의 PNG, JPG, JPEG, WebP 이미지를 처리하고 결과를 `dropped/`에 PNG로 저장합니다.

예:

```text
output/product01.jpg  → dropped/product01.png
output/product02.png  → dropped/product02.png
```

### 흰색 판정 민감도

기본 임계값은 `245`입니다.

```bash
colly drop --threshold 240
```

RGB 세 채널이 모두 threshold 이상인 픽셀을 흰색 후보로 판단합니다.

값을 높이면 거의 순백색에 가까운 영역만 제거하고, 값을 낮추면 회백색이나 약간 어두운 배경까지 더 넓게 제거합니다.

```text
255  매우 엄격
245  기본값
230  더 넓은 흰색 계열 제거
```

너무 낮은 값을 사용하면 상품 가장자리의 밝은 부분이 배경과 연결되어 함께 제거될 수 있으므로 주의해야 합니다.

### 다른 프로젝트 폴더 처리

```bash
colly drop -R ../project
```

`../project/output/`을 읽어 `../project/dropped/`에 결과를 저장합니다.

### 기준 폴더 직접 처리

```bash
colly drop -R ../project -D
```

`-D`를 사용하면 `output/` 대신 기준 프로젝트 폴더의 이미지 파일을 직접 읽습니다.

### drop 옵션

```text
-R, --reference <폴더>   기준 프로젝트 폴더
-D, --direct             output/ 대신 기준 프로젝트 폴더에서 직접 읽기
--threshold <0~255>      흰색 판정 최소 RGB 값, 기본 245
-h, --help               도움말 표시
```

## 처리 폴더 요약

```text
crop    → output/
merge   → 지정한 출력 파일 또는 merge.png
align   → 입력 폴더에서 파일명 변경
angle   → angled/
stack   → stacked/
drop    → dropped/
```

## 전체 도움말

```bash
colly --help
colly crop --help
colly merge --help
colly align --help
colly angle --help
colly stack --help
colly drop --help
```

직접 실행 시에는 `colly` 대신 `node cli.js`를 사용하면 됩니다.

```bash
node cli.js drop --help
```

## 라이선스

[BSD 3-Clause License](LICENSE)
