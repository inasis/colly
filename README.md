# Colly

Colly는 긴 이미지를 공백 기준으로 나누고, 원하는 순서와 간격으로 다시 합치는 Node.js 기반 이미지 처리 CLI입니다.

## 기능

- `crop`: 흰색 공백을 기준으로 긴 이미지를 세로 분할
- `merge`: 분할된 이미지를 고정 간격 또는 높이 보정 간격으로 병합
- `merge magic`: 이미지를 대화식으로 선택하고 간격을 미리 확인하며 병합
- `align`: 분할 이미지에 임의의 4자리 prefix를 부여하여 파일명 정렬
- `stack`: 접두 이미지, 원본, 접미 이미지를 지정한 순서로 겹쳐 합성

## 요구 사항

- Node.js 18 이상 권장
- [`sharp`](https://www.npmjs.com/package/sharp)

## 설치

```bash
git clone https://github.com/inasis/colly.git
cd colly
npm install sharp
```

직접 실행합니다.

```bash
node colly.js --help
```

Linux와 macOS에서는 실행 권한을 준 뒤 사용할 수도 있습니다.

```bash
chmod +x colly.js
./colly.js --help
```

## 기본 폴더 구조

```text
colly/
├── colly.js
├── magic.js
├── help.yaml
├── output/
└── stacked/
```

기본 기준 프로젝트 폴더는 `colly.js`가 있는 폴더입니다. 다른 프로젝트 폴더를 사용하려면 `-R` 또는 `--reference`를 지정합니다.

```bash
node colly.js crop -R ../project 15
```

`-D` 또는 `--direct`를 사용하면 `output/` 대신 기준 프로젝트 폴더에서 이미지를 직접 읽습니다.

## 사용법

### 이미지 분할

기준 프로젝트 폴더에 있는 PNG 또는 JPG 이미지 하나를 찾아, 지정한 높이 이상의 흰색 공백을 기준으로 분할합니다.

```bash
node colly.js crop 15
node colly.js crop -R ../project 15
node colly.js crop -R ../project -D image.png 45
```

결과는 다음 형식으로 `output/`에 저장됩니다.

```text
C001#H320.png
C002#H185.png
C003#H410.png
```

`#H` 뒤의 숫자는 분할된 이미지의 높이입니다.

> `crop`을 실행하면 `output/` 안의 기존 `C*.*` 파일이 먼저 삭제됩니다.

### 이미지 병합

각 이미지 앞에 적용할 간격과 이미지 번호를 한 쌍으로 입력합니다. 번호로 이미지를 찾을 때는 `-P`로 prefix를 지정합니다.

```bash
node colly.js merge -P C 0 001 20 002 10 003
```

위 명령은 다음 순서로 이미지를 합칩니다.

1. `C001` 앞에 `0px`
2. `C002` 앞에 `20px`
3. `C003` 앞에 `10px`

파일명은 `C001.png`, `C_001.png`, `C001#H320.png`, `C_001#H320.png` 형식을 모두 인식합니다.

직접 파일명을 지정하려면 앞에 `?`를 붙입니다.

```bash
node colly.js merge 0 '?logo.png' 30 '?banner.png'
```

셸에서 `?`가 와일드카드로 해석되지 않도록 따옴표 사용을 권장합니다.

#### 높이 보정 간격

`50H25` 형식은 파일명의 실제 `#H` 값에 따라 간격을 보정합니다.

```text
최종 간격 = 기본 간격 + (기준 H - 실제 H)
```

예를 들어 간격이 `50H25`이고 파일명이 `C002#H23.png`라면 최종 간격은 `52px`입니다.

```bash
node colly.js merge -P C 0 001 50H25 002 -O result.png -B 100
```

- `-O`, `--output`: 출력 파일명 지정, 기본값은 `merge.png`
- `-B`, `--bottom`: 이미지 맨 아래에 추가할 여백
- `-I`, `--instant`: 모든 이미지 간격을 `0px`로 처리

#### Instant 모드

```bash
node colly.js merge -P C --instant 001 002 003
node colly.js merge --instant logo.png banner.png
```

#### 프리셋 파일

긴 병합 인자는 프리셋 파일로 분리할 수 있습니다.

```text
-P $1 0 001 50H25 $2 -O $3
```

```bash
node colly.js merge -C preset.txt C 002 merged.png
```

프리셋의 `$1`, `$2`, `$3`은 프리셋 파일명 뒤에 입력한 값으로 치환됩니다.

### 대화형 병합

현재 작업 폴더의 `output/` 이미지를 확인하면서 사용할 파일과 간격을 대화식으로 결정합니다.

```bash
node colly.js merge magic
```

각 단계에서 실제 병합 미리보기를 생성하며, 마지막에 하단 여백을 입력하면 현재 작업 폴더에 `merge.png`가 생성됩니다.

`merge magic`은 `-R`, `-D` 및 다른 `merge` 옵션과 함께 사용할 수 없습니다.

### 파일명 정렬

`output/`의 `C000#H숫자`부터 `C999#H숫자` 형식 이미지를 임의의 4자리 prefix와 연속 번호로 변경합니다.

```bash
node colly.js align
node colly.js align -R ../project
node colly.js align -R ../project -D
```

변경 예시는 다음과 같습니다.

```text
C001#H320.png → aB7x_001#H320.png
C002#H185.png → aB7x_002#H185.png
```

### 이미지 겹치기

`-P`, `-S`, `-A`가 명령줄에 나타난 순서대로 접두 이미지, 접미 이미지, 원본 전체 항목을 합성합니다.

```bash
node colly.js stack -P "hello " -S " colly" -A
```

합성 순서:

```text
접두사 → 접미사 → 원본
```

```bash
node colly.js stack -P "hello " -A -S " colly"
```

합성 순서:

```text
접두사 → 원본 → 접미사
```

`-A`를 생략하면 원본 전체 항목이 마지막에 자동으로 추가됩니다. 결과는 기준 프로젝트의 `stacked/` 폴더에 저장됩니다.

## 전체 도움말

```bash
node colly.js --help
node colly.js crop --help
node colly.js merge --help
node colly.js align --help
node colly.js stack --help
```

## 라이선스

[BSD 3-Clause License](LICENSE)
