# Colly

Colly는 `sharp` 기반의 Node.js 이미지 처리 CLI입니다. 이미지 분할, 번호 정렬, 병합, 자동 병합, 이미지 유사도 검색, 각도 보정, 레이어 합성, 배경 제거 기능을 제공합니다.

## 설치

Node.js 18 이상이 필요합니다.

```bash
git clone https://github.com/inasis/colly.git
cd colly
npm install
npm link
colly --help
```

직접 실행: `node colly.js --help`.

## 명령어

| 명령 | 기능 |
| --- | --- |
| `crop` | 흰색 가로 공백을 기준으로 세로 분할 |
| `align` | `C001#H71.png` 등을 랜덤 prefix의 번호 파일로 정렬 |
| `merge` | 간격, 높이 보정, 프리셋 기반 이미지 병합 |
| `automerge` | 상품명 접두사 및 지정한 접미사 순서대로 자동 병합 |
| `match` | dHash 및 선택적 RGB 색상 차이 비교 |
| `angle` | 상품 각도·크기·캔버스 자동 정규화 |
| `stack` | 지정 순서대로 PNG 레이어 합성 |
| `drop` | 가장자리와 연결된 흰색 배경만 투명하게 제거 |

공통 옵션: `-R, --reference <폴더>`, `-D, --direct`, `-h, --help`.

## 폴더와 파일명 규칙

`match`와 `merge`는 `cite/`에서 먼저 이미지를 찾고, 없으면 `output/` 또는 `-D` 입력 폴더에서 찾습니다.

`-P C 001`은 `C001.png` 또는 `C001#H320.png`와 같은 번호 파일을 의미합니다. `?sample.png`는 prefix를 붙이지 않고 파일명을 그대로 사용합니다. `?`는 `match`에서 와일드카드가 아닙니다.

`R001`은 같은 prefix의 최대 번호, `R002`는 최대 번호보다 하나 작은 번호입니다. 예를 들어 최대 번호가 009라면 `R002`는 008입니다. 최대 번호는 `cite/`와 입력 폴더를 함께 조사합니다.

## crop / align

```bash
colly crop 38
colly align
```

예: `C001#H71.png` → `Ab12_001#H71.png`. `align`은 결과 메시지에 `prefix=Ab12`를 출력합니다.

## merge

```bash
colly merge -P Ab12 0 001 20 002 10 R001 -O result.png
colly merge -P Ab12 --instant 001 R002 '?logo.png' -O result.png
colly merge -C preset.txt Ab12 003 result.png
```

일반 병합은 `간격 이미지` 쌍을 순서대로 받습니다. `--instant`는 이미지 간격을 0으로 지정합니다. `50H25`처럼 입력하면 `#H` 태그를 이용해 간격을 보정합니다. `-B`는 하단 여백, `-O`는 출력 파일, `-C`는 `$1`, `$2` 등의 인자를 치환하는 프리셋 파일입니다.

## automerge

```bash
colly automerge 상품명 상단 중단 하단
colly automerge 상품명 상단 중단 하단 --gap 20 --overwrite
colly automerge 상품명 상단 중단 하단 --dry-run
```

첫 번째 인자는 상품명 전체 또는 일부이며, 뒤의 인자들은 병합할 접미사입니다. 일부 이미지가 없으면 건너뛰고 존재하는 이미지만 순서대로 병합합니다. `merge magic`은 제거되었습니다.

## match

```bash
colly match -P C 001 R001
colly match -P C '?sample.png' 001 --iterate
colly match -P C '?sample.png' R001 --iterate-reverse --result
colly match -P C '?sample.png' R001 --iterate-reverse --basis 99 --result
colly match -P C '?sample.png' 003 --color --color-threshold 12
```

두 이미지 간 1:1 비교를 수행합니다. `--iterate`는 **두 번째 이미지의 번호를 증가**시키고, `--iterate-reverse`는 감소시키며 첫 일치에서 멈춥니다. `R001 --iterate` 또는 `001 --iterate-reverse`는 한 번만 비교합니다. 없는 중간 번호는 건너뜁니다.

기본 판정은 64비트 dHash 해밍 거리 `--threshold 10` 이하입니다. `--basis 99`는 유사도가 **99%를 초과**할 때만 일치하며 `--bashs`도 별칭으로 지원합니다. `--basis`가 `--threshold`보다 우선합니다. `--color`는 RGB 색상 MAE 기준을 추가합니다.

`--result`는 일치 시 실제 번호 세 자리(예: `008`)만 stdout에 출력하고, 불일치 시 아무것도 출력하지 않습니다. 오류는 stderr에 표시됩니다.

## angle / stack / drop

```bash
colly angle --width 1200 --height 1200 --occupancy 0.86
colly angle --background transparent --recursive --dry-run
colly stack -P 'pre_' -A -S '_post'
colly stack --at Background.png -A --at Frame.png
colly drop --threshold 245
```

`angle`은 `angled/`, `stack`은 `stacked/`, `drop`은 `dropped/`에 결과를 저장합니다. `drop`은 flood-fill로 가장자리와 연결된 흰색 배경만 제거합니다.

## 모듈 구조

```text
colly.js          # CLI 진입점
commands/         # 명령 및 옵션 파싱
core/             # 도움말, 경로, cite 우선 검색, R번호
image/            # sharp 이미지 처리 알고리즘
cite/             # 참조 이미지
output/           # 기본 이미지 입력 및 crop 출력
test/             # node:test 테스트
```

```bash
npm test
```

배치 파일은 이 프로젝트 배포본에 포함하지 않습니다.

## 라이선스

[BSD 3-Clause License](LICENSE)
