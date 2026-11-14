# Colly

Colly는 `sharp` 기반의 Node.js 이미지 작업 CLI입니다. 긴 이미지 분할, 번호 정렬, 병합, 자동 병합, 이미지 유사도 비교, 상품 각도 보정, 레이어 합성, 배경 제거를 지원합니다. 각 명령은 `commands/`, 이미지 처리 알고리즘은 `image/`, 공통 파일 탐색과 옵션 처리는 `core/`로 분리되어 있습니다.

## 설치

Node.js 18 이상이 필요합니다.

```bash
git clone https://github.com/inasis/colly.git
cd colly
npm install
npm link
colly --help
```

직접 실행할 때는 `node colly.js --help`를 사용합니다.

## 명령어

| 명령 | 기능 | 주요 결과 |
| --- | --- | --- |
| `crop` | 흰색 가로 공백으로 긴 이미지 분할 | `output/C001#H320.png` |
| `align` | 분할 파일에 랜덤 prefix와 번호 부여 | `output/aB7x_001#H320.png` |
| `merge` | 이미지 순서·간격·높이 보정 병합 | `merge.png` 또는 `-O` 지정 파일 |
| `automerge` | 상품명 접두사와 사용자 지정 접미사로 자동 병합 | 상품명별 PNG |
| `match` | dHash 및 선택적 RGB 색상 차이 비교 | 유사도 또는 번호 |
| `angle` | 상품 기울기·크기·캔버스 정규화 | `angled/` |
| `stack` | PNG 레이어 순서대로 합성 | `stacked/` |
| `drop` | 테두리와 연결된 흰색 배경만 투명화 | `dropped/` |

공통 옵션: `-R, --reference <폴더>`는 프로젝트 기준 폴더를 지정하고, `-D, --direct`는 `output/` 대신 기준 폴더에서 입력 이미지를 읽습니다. `-h, --help`로 각 명령의 도움말을 확인할 수 있습니다.

## 파일 이름과 참조 순서

`merge`와 `match`는 먼저 `cite/`를 검색하고, 없으면 `output/`(또는 `-D` 입력 폴더)을 검색합니다. `-P C 1`은 `C001.png`나 `C001#H320.png`처럼 번호가 붙은 이미지를 뜻합니다. `?sample.png`는 prefix와 무관하게 **파일명 그대로** 참조합니다. `?`는 `match`에서 와일드카드가 아닙니다.

`R001`은 해당 prefix의 **최대 번호**, `R002`는 최대 번호에서 하나 작은 번호를 가리킵니다. 예를 들어 최대 번호가 `009`라면 `R002`는 `008`입니다. 최대 번호는 `cite/`와 입력 폴더를 함께 조사하며, 중간 번호가 빠져 있더라도 번호를 건너뛰어 역산하지는 않습니다.

## crop / align

```bash
colly crop 38
colly align
```

예: `C001#H71.png` → `Ab12_001#H71.png`. `align` 출력에는 `prefix=Ab12`가 포함됩니다.

## merge

```bash
colly merge -P Ab12 0 001 20 002 10 R001 -O result.png
colly merge -P Ab12 --instant 001 R002 '?logo.png' -O result.png
colly merge -C preset.txt Ab12 003 result.png
```

일반 병합은 `간격 이미지` 쌍을 순서대로 받습니다. `--instant`는 모든 이미지 간격을 0으로 처리합니다. `50H25`처럼 지정하면 파일의 `#H` 태그를 이용해 높이를 보정합니다. `-B`는 하단 여백, `-O`는 출력 파일명, `-C`는 `$1`, `$2` 등의 변수를 사용하는 프리셋 파일입니다.

## automerge

```bash
colly automerge 상품명 상단 중단 하단
colly automerge 상품명 상단 중단 하단 --gap 20 --overwrite
colly automerge 상품명 상단 중단 하단 --dry-run
```

상품명(일부) 뒤에 접미어를 원하는 순서로 지정합니다. `상품명중단.png`가 없더라도 상단과 하단이 있으면 두 이미지만 병합합니다. `merge magic`은 지원하지 않습니다.

## match

```bash
colly match -P C 001 R001
colly match -P C '?sample.png' 001 --iterate
colly match -P C '?sample.png' R001 --iterate-reverse --result
colly match -P C '?sample.png' R001 --iterate-reverse --basis 99 --result
colly match -P C '?sample.png' 003 --color --color-threshold 12
```

두 이미지를 비교합니다. `--iterate`는 **두 번째 이미지 번호를 증가**, `--iterate-reverse`는 감소시키며 첫 일치에서 멈춥니다. `R001 --iterate`나 `001 --iterate-reverse`는 경계에서 시작하므로 한 번만 검사합니다. 중간에 없는 번호는 건너뜁니다.

기본 판정은 64비트 dHash의 해밍 거리 `--threshold 10` 이하입니다. `--basis 99`는 유사도가 **99%를 초과**해야 일치합니다(`--bashs`도 별칭). `--basis`와 `--threshold`를 함께 지정하면 `--basis`가 우선합니다. `--color`는 RGB 색상 MAE 기준을 추가합니다. dHash는 색상 차이를 직접 판별하지 않으며, 유사도는 동일 상품일 확률이 아닙니다.

`--result`는 일치 시 실제 번호 세 자리(예: `008`)만 stdout에 출력하고, 불일치 시 아무것도 출력하지 않습니다. 오류는 stderr로 표시됩니다.

## angle / stack / drop

```bash
colly angle --width 1200 --height 1200 --occupancy 0.86
colly angle --background transparent --format png --recursive
colly stack -P 'pre_' -A -S '_post'
colly stack --at Background.png -A --at Frame.png -P 'pre_'
colly drop --threshold 245
```

`angle`은 상품 윤곽을 분석해 회전 및 중앙 배치하며 `--dry-run`도 지원합니다. `stack`은 인자가 나타난 순서대로 레이어를 합성합니다. `drop`은 flood-fill로 가장자리와 연결된 흰색 영역만 제거하여 내부의 독립된 흰색 영역을 유지합니다.

## 프로젝트 구조

```text
colly.js
commands/    # CLI 명령 및 옵션 파싱
core/        # 도움말, 경로, cite 우선 검색, R번호 해석
image/       # sharp 기반 이미지 처리
cite/        # 공통 참조 이미지
output/      # crop 출력 및 기본 입력 폴더 (실행 중 생성)
test/        # node:test 테스트
```

## 테스트

```bash
npm test
```

## 라이선스

[BSD 3-Clause License](LICENSE)