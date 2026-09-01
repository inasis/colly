const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

function normalizeDialogue(text) {
    return String(text ?? "")
        .normalize("NFC")
        .trim()
        .toLowerCase()
        .replace(/[~!?.。！？]+$/g, "")
        .replace(/\s+/g, " ");
}

const YES_PATTERNS = [
    /^(y|yes|yeah|yep|ye|ok|okay)$/i,
    /^(ㅇ|ㅇㅇ|ㅇㅋ|오케이|오키)$/i,
    /^(응|어|엉|웅|넵|넹|네|예|예스)$/i,
    /^(그래|그럼|좋아|좋지|좋네|괜찮아|괜찮네)$/i,
    /^(맞아|맞음|맞습니다|맞아요|맞다)$/i,
    /^(진행|진행해|진행하자|계속|계속해|가자)$/i,
    /^(해|해줘|해봐|그렇게 해|그걸로 해)$/i,
    /^(확인|확정|확정해|이걸로|이대로)$/i,
];

const NO_PATTERNS = [
    /^(n|no|nope)$/i,
    /^(ㄴ|ㄴㄴ)$/i,
    /^(아니|아니오|아니요|아님)$/i,
    /^(싫어|싫음|별로|안돼|안 돼)$/i,
    /^(틀려|틀림|잘못됐어|잘못됨)$/i,
    /^(다시|다시해|재시도)$/i,
    /^(그만|끝|완료)$/i,
];

function classifyYesNo(text) {
    const normalized = normalizeDialogue(text);

    if (!normalized) {
        return null;
    }

    if (YES_PATTERNS.some(pattern => pattern.test(normalized))) {
        return true;
    }

    if (NO_PATTERNS.some(pattern => pattern.test(normalized))) {
        return false;
    }

    const yesWords = [
        "좋아", "괜찮", "맞아", "맞네", "진행", "계속",
        "그대로", "이대로", "확정", "오케이", "해줘"
    ];

    const noWords = [
        "아니", "싫", "틀", "다시", "별로", "안 맞",
        "잘못", "취소", "그만"
    ];

    let yesScore = 0;
    let noScore = 0;

    for (const word of yesWords) {
        if (normalized.includes(word)) {
            yesScore++;
        }
    }

    for (const word of noWords) {
        if (normalized.includes(word)) {
            noScore++;
        }
    }

    if (yesScore > noScore && yesScore > 0) {
        return true;
    }

    if (noScore > yesScore && noScore > 0) {
        return false;
    }

    return null;
}

const DIALOGUE_RESPONSES = {
    accepted: [
        "좋아요. 이 설정으로 확정할게요.",
        "네, 이 결과는 괜찮은 걸로 볼게요.",
        "확인했습니다. 이 설정을 유지하겠습니다.",
        "좋습니다. 이 상태로 다음 단계로 넘어갈게요.",
    ],

    retry: [
        "알겠습니다. 이 결과는 버리고 다시 맞춰볼게요.",
        "좋아요, 그럼 설정을 다시 조정하겠습니다.",
        "확인했습니다. 공백 설정부터 다시 잡아볼게요.",
        "이건 아닌 걸로 보고 다시 만들어볼게요.",
    ],

    next: [
        "좋습니다. 다음 파일을 볼게요.",
        "확정됐습니다. 다음 이미지로 넘어가겠습니다.",
        "좋아요. 그럼 다음 조각을 이어볼게요.",
    ],

    finish: [
        "좋습니다. 이미지 선택은 여기서 마무리할게요.",
        "알겠습니다. 지금까지 선택한 이미지로 완결하겠습니다.",
        "좋아요. 이제 마지막 하단 여백 설정으로 넘어갈게요.",
    ],
};

function randomResponse(type) {
    const list = DIALOGUE_RESPONSES[type] ?? [];

    if (list.length === 0) {
        return "";
    }

    return list[
        Math.floor(Math.random() * list.length)
    ];
}

async function askYesNo(question, defaultValue = null) {
    while (true) {
        const suffix =
            defaultValue === true
                ? " [네/아니오, 기본=네] "
                : defaultValue === false
                    ? " [네/아니오, 기본=아니오] "
                    : " [네/아니오] ";

        const answer = await ask(question + suffix);

        if (!answer && defaultValue !== null) {
            return defaultValue;
        }

        const decision = classifyYesNo(answer);

        if (decision !== null) {
            return decision;
        }

        console.log(
            '긍정 또는 부정으로 답해주세요. ' +
            '예: "응", "네", "좋아", "아니", "아니오", "다시"'
        );
    }
}

async function askNonNegativeNumber(question, defaultValue = 0) {
    while (true) {
        const answer = await ask(`${question} [기본값: ${defaultValue}]: `);
        if (!answer) {
            return defaultValue;
        }
        const num = Number(answer);
        if (!isNaN(num) && num >= 0) {
            return num;
        }
        console.log("0 이상의 숫자를 입력해주세요.");
    }
}

function cleanupFile(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error(`임시 파일 삭제 실패: ${filePath}`, err.message);
    }
}

function isFinishIntent(text) {
    const normalized = normalizeDialogue(text);

    if (!normalized) {
        return false;
    }

    return [
        "끝",
        "종료",
        "완료",
        "그만",
        "여기까지",
        "이제 끝",
        "이제 종료",
        "마무리",
        "마무리해",
        "끝내",
        "끝내자",
    ].some(word =>
        normalized === word ||
        normalized.includes(word)
    );
}

function parseRequestedImageIndex(input, remaining) {
    const normalized = normalizeDialogue(input);

    if (!normalized) {
        return null;
    }

    const numberMatch = normalized.match(/(\d{1,3})/);

    if (!numberMatch) {
        return null;
    }

    const value = Number(numberMatch[1]);

    if (numberMatch[1].length >= 3) {
        const byImageNumber = remaining.findIndex(
            item => item.number === value
        );

        if (byImageNumber >= 0) {
            return byImageNumber;
        }
    }

    if (
        value >= 1 &&
        value <= remaining.length &&
        /번|번째|목록/.test(normalized)
    ) {
        return value - 1;
    }

    const byImageNumber = remaining.findIndex(
        item => item.number === value
    );

    if (byImageNumber >= 0) {
        return byImageNumber;
    }

    if (value >= 1 && value <= remaining.length) {
        return value - 1;
    }

    return null;
}

function printRemainingCandidates(remaining) {
    console.log("");
    console.log("남은 파일:");

    remaining.forEach((image, index) => {
        const h =
            image.taggedHeight === null
                ? ""
                : `  #H${image.taggedHeight}`;

        console.log(
            `  ${String(index + 1).padStart(2)}. ` +
            `${image.numberText}  ${image.file}${h}`
        );
    });

    console.log("");
}

async function askWhichFileOrFinish(remaining) {
    while (true) {
        if (remaining.length === 0) {
            return {
                type: "finish",
                index: null,
            };
        }

        printRemainingCandidates(remaining);

        const answer = await ask(
            '어떤 파일을 사용할까요? ' +
            '파일 번호를 입력하거나, 끝내려면 "종료"라고 해주세요: '
        );

        if (isFinishIntent(answer)) {
            return {
                type: "finish",
                index: null,
            };
        }

        const index = parseRequestedImageIndex(
            answer,
            remaining
        );

        if (index !== null) {
            return {
                type: "select",
                index,
            };
        }

        console.log(
            '남은 파일 번호를 지정하거나 ' +
            '"끝", "종료", "완료", "여기까지" 중 하나로 말해주세요.'
        );
    }
}

async function configureBottom({ selectedItems }) {
    const bottomMargin = await askNonNegativeNumber("마지막 하단 여백(px)을 입력해주세요", 20);
    const outputName = "merge.png";

    console.log(`최종 결과물을 생성하는 중... (${outputName})`);
    runActualCollyMerge(selectedItems, outputName, bottomMargin);
    console.log(`하단 여백 ${bottomMargin}px 적용 완료 - ${outputName}`);

    return { bottomMargin, output: outputName };
}

function createRandomPreviewName() {
    const chars =
        "abcdefghijklmnopqrstuvwxyz" +
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
        "0123456789";

    while (true) {
        let id = "";

        for (let i = 0; i < 4; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }

        const filename = `${id}.png`;

        if (!fs.existsSync(filename)) {
            return filename;
        }
    }
}
function runActualCollyMerge(items, previewName, bottomMargin = 0) {
    const mergeArgs = [
        "merge",
        "-P",
        "dummy",
    ];

    for (const item of items) {
        const spacing =
            item.spacing === undefined ||
            item.spacing === null ||
            item.spacing === ""
                ? "0"
                : String(item.spacing);

        const filename = path.basename(
            String(item.file)
        );

        mergeArgs.push(
            spacing,
            `?${filename}`
        );
    }

    mergeArgs.push(
        "-B",
        String(bottomMargin),
        "-O",
        previewName
    );

    const currentEntry = process.argv[1]
        ? path.resolve(process.argv[1])
        : null;

    const candidates = [
        process.env.COLLY_SCRIPT
            ? path.resolve(
                process.env.COLLY_SCRIPT
            )
            : null,

        currentEntry &&
        currentEntry !== path.resolve(__filename)
            ? currentEntry
            : null,

        path.resolve(
            process.cwd(),
            "colly.js"
        ),
    ].filter(Boolean);

    const script = candidates.find(candidate =>
        fs.existsSync(candidate)
    );

    let result;

    if (script) {
        result = spawnSync(
            process.execPath,
            [
                script,
                ...mergeArgs,
            ],
            {
                cwd: process.cwd(),
                stdio: "inherit",
            }
        );
    } else {
        result = spawnSync(
            "colly",
            mergeArgs,
            {
                cwd: process.cwd(),
                stdio: "inherit",
            }
        );
    }

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            `실제 colly merge 실행 실패 (exit=${result.status})`
        );
    }

    if (!fs.existsSync(previewName)) {
        throw new Error(
            "colly merge가 성공했지만 " +
            `미리보기 파일이 생성되지 않았습니다: ${previewName}`
        );
    }
}

async function configureAndApproveItem({ runner, prefix, image, selectedItems, previousApprovedPreview }) {
    while (true) {
        console.log(`\n'${image.file}' 설정 중...`);

        const spacing = await askNonNegativeNumber("간격(px)을 입력해주세요", 10);
        const previewName = createRandomPreviewName();
        const pendingItem = {...image, spacing};
        const previewItems = [ ...selectedItems, pendingItem ];

        console.log(`실제 colly merge로 미리보기 생성 중... (${previewName})`);

        try {
            runActualCollyMerge(previewItems, previewName);
        } catch (error) {
            cleanupFile(previewName);
            throw error;
        }

        const ok = await askYesNo("이 미리보기 결과가 마음에 드시나요?", true);

        if (ok) {
            console.log(randomResponse("accepted"));

            if (previousApprovedPreview && previousApprovedPreview !== previewName) {
                cleanupFile(previousApprovedPreview);
            }

            return {
                item: pendingItem,
                preview: previewName,
            };
        }

        console.log(randomResponse("retry"));
        cleanupFile(previewName);
        console.log("간격 설정부터 다시 진행합니다.");
    }
}

async function runMagic() {
    console.log("출력 폴더를 살펴보고 병합 순서를 같이 맞춰볼게요.");

    try {
        const outputDir = path.resolve("./output");

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const rawFiles = fs.readdirSync(outputDir)
            .filter(f => /\.(png|jpe?g|webp)$/i.test(f));

        const ordered = rawFiles.map((file, idx) => {
            const numMatch = file.match(/(\d+)/);

            const number = numMatch
                ? parseInt(numMatch[1], 10)
                : idx + 1;

            const hMatch = file.match(/#H(\d+)/i);

            const taggedHeight = hMatch
                ? parseInt(hMatch[1], 10)
                : null;

            return {
                file,
                number,
                numberText: String(number).padStart(3, "0"),
                taggedHeight,
                path: path.join(outputDir, file)
            };
        });

        if (ordered.length === 0) {
            console.log("작업할 이미지 파일이 없습니다.");
            return;
        }

        const selectedItems = [];
        let approvedPreview = null;

        // 1. 첫 번째 파일
        const firstResult = await configureAndApproveItem({
            runner: null,
            prefix: "first",
            image: ordered[0],
            selectedItems,
            previousApprovedPreview: approvedPreview,
        });

        if (firstResult) {
            selectedItems.push(firstResult.item);
            approvedPreview = firstResult.preview;
        }

        // 2. 다음 파일들
        const remaining = ordered.slice(1);

        while (remaining.length > 0) {
            let candidate = remaining[0];

            console.log("");
            console.log(`다음 파일: ${candidate.file}`);

            const useNext = await askYesNo(
                "이 파일을 이어서 사용할까요?",
                true
            );

            if (!useNext) {
                if (remaining.length > 1) {
                    remaining.push(remaining.shift());
                }

                const choice = await askWhichFileOrFinish(
                    remaining
                );

                if (choice.type === "finish") {
                    console.log(
                        randomResponse("finish")
                    );

                    break;
                }

                candidate =
                    remaining[choice.index];

            } else {
                console.log(
                    randomResponse("next")
                );
            }

            const result =
                await configureAndApproveItem({
                    runner: null,
                    prefix: "item",
                    image: candidate,
                    selectedItems,
                    previousApprovedPreview:
                        approvedPreview,
                });

            if (result) {
                selectedItems.push(
                    result.item
                );

                approvedPreview =
                    result.preview;

                const usedIndex =
                    remaining.findIndex(
                        image =>
                            image.file ===
                            candidate.file
                    );

                if (usedIndex >= 0) {
                    remaining.splice(
                        usedIndex,
                        1
                    );
                }
            }
        }

        // 3. -B
        let finalOutput = null;

        if (selectedItems.length > 0) {
            const bottomResult =
                await configureBottom({
                    selectedItems
                });

            finalOutput = bottomResult.output;
        }

        if (approvedPreview) {
            cleanupFile(
                approvedPreview
            );
        }

        if (finalOutput) {
            console.log(
                `최종 결과: ${path.resolve(finalOutput)}`
            );
        }

        console.log(
            "모든 작업이 완료되었습니다."
        );

    } finally {
        rl.close();
    }
}

if (require.main === module) {
    runMagic().catch(error => {
        console.error("");
        console.error(
            "❌",
            error.message
        );

        process.exitCode = 1;
    });
}

module.exports = {
    runMagic,
    normalizeDialogue,
    classifyYesNo,
    randomResponse,
    askYesNo,
    askNonNegativeNumber,
    cleanupFile,
    isFinishIntent,
    parseRequestedImageIndex,
    printRemainingCandidates,
    askWhichFileOrFinish,
    configureBottom,
    configureAndApproveItem
};
