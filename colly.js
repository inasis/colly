#!/usr/bin/env node

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PROG = "colly";
const OUTPUT_DIR = "output";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const CROP_INPUT_EXT = [".png", ".jpg", ".jpeg"];
const WHITE_THRESHOLD = 245;
const WHITE_ROW_RATIO = 0.99;

function usageError(command, msg) {
    console.error(`${PROG} ${command}: error: ${msg}`);
    console.error(`Try '${PROG} ${command} --help' for more information.`);
    process.exit(2);
}

function runtimeError(command, msg) {
    console.error(`${PROG} ${command}: error: ${msg}`);
    process.exit(1);
}

function warn(command, msg) {
    console.error(`${PROG} ${command}: warning: ${msg}`);
}

function notice(command, msg) {
    console.log(`${PROG} ${command}: ${msg}`);
}

function pad3(n) {
    return String(n).padStart(3, "0");
}

function isImage(file) {
    return IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function hasHelpFlag(args) {
    return args.includes("-h") || args.includes("--help");
}

function parseProjectOptions(command, rawArgs) {
    const args = [];
    let reference = __dirname;
    let direct = false;

    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i];

        if (arg === "-R" || arg === "--reference") {
            const value = rawArgs[++i];
            if (!value || value.startsWith("-")) {
                usageError(command, `${arg} 뒤에 기준 프로젝트 폴더를 지정하세요.`);
            }
            reference = value;
            continue;
        }

        if (arg === "-D" || arg === "--direct") {
            direct = true;
            continue;
        }

        args.push(arg);
    }

    const referenceDir = path.resolve(reference);
    if (!fs.existsSync(referenceDir) || !fs.statSync(referenceDir).isDirectory()) {
        runtimeError(command, `기준 프로젝트 폴더가 없습니다: ${referenceDir}`);
    }

    return {
        args,
        referenceDir,
        inputDir: direct ? referenceDir : path.join(referenceDir, OUTPUT_DIR),
        outputDir: path.join(referenceDir, OUTPUT_DIR),
        direct
    };
}

const HELP_FILE = path.join(__dirname, "help.yaml");
let helpCache;

function loadHelp() {
    if (helpCache) return helpCache;

    let text;
    try {
        text = fs.readFileSync(HELP_FILE, "utf8");
    } catch (error) {
        throw new Error(`도움말 파일을 읽을 수 없습니다: ${HELP_FILE} (${error.message})`);
    }

    const help = {};
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    let key = null;
    let blockIndent = null;

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const line = lines[lineNumber];
        const header = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*\|[-+]?\s*$/);

        if (header) {
            key = header[1];
            help[key] = [];
            blockIndent = null;
            continue;
        }

        if (/^\s*(?:#.*)?$/.test(line) && key === null) continue;
        if (key === null) {
            throw new Error(`help.yaml ${lineNumber + 1}행: '이름: |' 형식이 필요합니다.`);
        }

        if (line.trim() === "") {
            help[key].push("");
            continue;
        }

        const indent = line.match(/^\s*/)[0].length;
        if (blockIndent === null) blockIndent = indent;
        if (indent < blockIndent) {
            throw new Error(`help.yaml ${lineNumber + 1}행: 블록 들여쓰기가 올바르지 않습니다.`);
        }
        help[key].push(line.slice(blockIndent));
    }

    helpCache = Object.fromEntries(
        Object.entries(help).map(([name, block]) => [
            name,
            block.join("\n").replace(/\n+$/, "").replaceAll("{prog}", PROG)
        ])
    );
    return helpCache;
}

function getHelp(section) {
    const help = loadHelp()[section];
    if (!help) throw new Error(`help.yaml에 '${section}' 도움말이 없습니다.`);
    return help;
}

function printHelp(section, stream = console.log) {
    try {
        stream(getHelp(section));
    } catch (error) {
        console.error(`${PROG}: error: ${error.message}`);
        process.exit(1);
    }
}

function detectWhiteRows(data, width, height) {
    const whiteRows = new Array(height);

    for (let y = 0; y < height; y++) {
        let whitePixels = 0;
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const isWhite =
                data[i + 3] === 0 ||
                (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD);
            if (isWhite) whitePixels++;
        }
        whiteRows[y] = whitePixels >= width * WHITE_ROW_RATIO;
    }

    return whiteRows;
}

function findGaps(whiteRows, height, minGap) {
    const gaps = [];
    let start = null;

    const closeGap = end => {
        if (start === null) return;
        if (end - start + 1 >= minGap) gaps.push({
            start,
            end
        });
        start = null;
    };

    for (let y = 0; y < height; y++) {
        whiteRows[y] ? (start ??= y) : closeGap(y - 1);
    }
    closeGap(height - 1);

    return gaps;
}

function findSections(gaps, height) {
    const sections = [];
    let top = 0;

    for (const gap of gaps) {
        const h = gap.start - top;
        if (h > 1) sections.push({
            top,
            height: h
        });
        top = gap.end + 1;
    }
    if (top < height) sections.push({
        top,
        height: height - top
    });

    return sections;
}

async function cmdCrop(args) {
    if (hasHelpFlag(args)) return printHelp("crop");

    const options = parseProjectOptions("crop", args);
    args = options.args;

    let input;
    let minGapArg;

    if (options.direct) {
        if (args.length !== 2) {
            usageError("crop", "-D 사용 시 파일명과 최소 공백 높이가 필요합니다 (예: colly crop -D image.png 45)");
        }
        input = args[0];
        minGapArg = args[1];
        if (path.basename(input) !== input) {
            usageError("crop", "-D 파일명은 기준 프로젝트 폴더 안의 파일명만 지정할 수 있습니다.");
        }
    } else {
        if (args.length !== 1) {
            usageError("crop", "최소 흰색 공백 높이를 입력해주세요 (예: colly crop 15)");
        }
        minGapArg = args[0];
    }

    const minGap = Number.parseInt(minGapArg, 10);
    if (!Number.isInteger(minGap) || minGap < 1) {
        usageError("crop", "최소 흰색 공백 높이를 입력해주세요 (예: colly crop 15)");
    }

    const candidates = fs.readdirSync(options.referenceDir).filter(file => {
        const ext = path.extname(file).toLowerCase();
        const name = path.parse(file).name.toUpperCase();
        return CROP_INPUT_EXT.includes(ext);
    });

    if (options.direct) {
        if (!candidates.includes(input)) {
            runtimeError("crop", `원본 이미지 파일을 찾을 수 없습니다: ${path.join(options.referenceDir, input)}`);
        }
    } else if (candidates.length === 0) runtimeError("crop", "PNG 또는 JPG 원본 이미지를 찾을 수 없습니다.");
    if (!options.direct && candidates.length > 1) {
        runtimeError(
            "crop",
            "원본 이미지가 여러 개 있습니다. 처리할 원본 이미지 하나만 넣어주세요.\n" +
            candidates.map(f => `  - ${f}`).join("\n")
        );
    }
    if (!options.direct) input = candidates[0];
    const inputPath = path.join(options.referenceDir, input);

    if (!fs.existsSync(options.outputDir)) fs.mkdirSync(options.outputDir, {
        recursive: true
    });

    fs.readdirSync(options.outputDir)
        .filter(file => path.parse(file).name.toUpperCase().startsWith("C"))
        .forEach(file => fs.unlinkSync(path.join(options.outputDir, file)));

    const image = sharp(inputPath);
    const {
        width,
        height
    } = await image.metadata();
    if (!width || !height) throw new Error(`${input}의 크기를 읽을 수 없습니다.`);

    const {
        data
    } = await image.ensureAlpha().raw().toBuffer({
        resolveWithObject: true
    });
    const whiteRows = detectWhiteRows(data, width, height);
    const gaps = findGaps(whiteRows, height, minGap);
    const sections = findSections(gaps, height);

    notice("crop", `원본 ${input} (${width}x${height}), 공백 ${gaps.length}개 발견 (최소 ${minGap}px)`);

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const filename = `C${pad3(i + 1)}#H${section.height}.png`;

        await sharp(inputPath)
            .extract({
                left: 0,
                top: section.top,
                width,
                height: section.height
            })
            .png()
            .toFile(path.join(options.outputDir, filename));

        console.log(`  ${filename}  ${width}x${section.height}`);
    }

    notice("crop", `완료 - ${sections.length}개 섹션을 ${options.outputDir}/ 에 저장했습니다`);
}

function extractFlag(args, flags) {
    const idx = args.findIndex(a => flags.includes(a));
    if (idx === -1) return {
        value: undefined,
        rest: args
    };
    const value = args[idx + 1];
    const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
    return {
        value,
        rest
    };
}

function normalizeMergePrefixArgs(rawArgs) {
    const args = [...rawArgs];
    const prefixFlags = ["-P", "--prefix"];

    if (prefixFlags.includes(args[0])) {
        if (!args[1] || args[1].startsWith("-")) {
            usageError("merge", "-P / --prefix 뒤에 prefix를 지정하세요.");
        }
        return args;
    }

    if (args.some(arg => prefixFlags.includes(arg))) {
        usageError("merge", "-P / --prefix는 merge의 최초 인자로 사용해야 합니다.");
    }

    return ["--prefix", "dummy", ...args];
}

function parseMergeArgs(rawArgs) {
    const normalizedArgs = normalizeMergePrefixArgs(rawArgs);
    const prefix = normalizedArgs[1];
    const args = normalizedArgs.slice(2);

    const instantFlags = ["--instant", "-I"];

    const instant = args.some(arg => instantFlags.includes(arg));
    const parseArgs = args.filter(arg => !instantFlags.includes(arg));

    let outputFile = "merge.png";
    let bottomExtra = 0;
    const items = [];

    const pushImage = imageArg => {
        if (imageArg.startsWith("?")) {
            const literal = imageArg.slice(1);
            if (!literal) usageError("merge", "?파일명 형식에서 파일명이 비어 있습니다.");
            items.push({
                number: null,
                literal,
                gap: 0,
                referenceHeight: null
            });
            return;
        }

        if (/^\d+$/.test(imageArg)) {
            const number = Number.parseInt(imageArg, 10);
            if (number < 0 || number > 999) {
                usageError("merge", `이미지 번호는 000 ~ 999 범위여야 합니다: ${imageArg}`);
            }
            items.push({
                number,
                literal: null,
                gap: 0,
                referenceHeight: null
            });
            return;
        }

        if (instant && isImage(imageArg)) {
            items.push({
                number: null,
                literal: imageArg,
                gap: 0,
                referenceHeight: null
            });
            return;
        }

        if (instant) {
            usageError(
                "merge",
                `잘못된 이미지 지정: ${imageArg} (번호, ?파일명, 또는 이미지 파일명을 사용하세요.)`
            );
        }

        usageError("merge", `잘못된 이미지 번호: ${imageArg}`);
    };

    for (let i = 0; i < parseArgs.length; i++) {
        const arg = parseArgs[i];

        if (arg === "-O" || arg === "--output") {
            outputFile = parseArgs[++i];
            if (!outputFile) usageError("merge", "-O / --output 뒤에 파일명을 지정하세요.");
            if (!path.extname(outputFile)) outputFile += ".png";
            continue;
        }

        if (arg === "-B" || arg === "--bottom") {
            bottomExtra = Number(parseArgs[++i]);
            if (!Number.isFinite(bottomExtra) || bottomExtra < 0) {
                usageError("merge", "-B 값은 0 이상의 숫자여야 합니다.");
            }
            continue;
        }

        if (instant) {
            if (arg.startsWith("-")) {
                usageError("merge", `알 수 없는 옵션: ${arg}`);
            }
            pushImage(arg);
            continue;
        }

        const gapArg = arg;
        const numberArg = parseArgs[++i];
        if (numberArg === undefined || numberArg.startsWith("-")) {
            usageError("merge", `${gapArg} 뒤에 이미지 번호 또는 ?파일명이 필요합니다.`);
        }

        const gapMatch = gapArg.match(/^(\d+(?:\.\d+)?)(?:H(\d+))?$/i);
        if (!gapMatch) usageError("merge", `잘못된 공백 값: ${gapArg}`);

        const gap = Number(gapMatch[1]);
        const referenceHeight = gapMatch[2] !== undefined ? Number(gapMatch[2]) : null;
        if (!Number.isFinite(gap) || gap < 0) usageError("merge", `잘못된 공백 값: ${gapArg}`);

        if (numberArg.startsWith("?")) {
            const literal = numberArg.slice(1);
            if (!literal) usageError("merge", "?파일명 형식에서 파일명이 비어 있습니다.");
            items.push({
                number: null,
                literal,
                gap,
                referenceHeight
            });
        } else {
            if (!/^\d+$/.test(numberArg)) usageError("merge", `잘못된 이미지 번호: ${numberArg}`);
            const number = Number.parseInt(numberArg, 10);
            if (number < 0 || number > 999) usageError("merge", `이미지 번호는 000 ~ 999 범위여야 합니다: ${numberArg}`);
            items.push({
                number,
                literal: null,
                gap,
                referenceHeight
            });
        }
    }

    if (items.length === 0) usageError("merge", "합칠 이미지를 하나 이상 입력해주세요.");

    return {
        prefix,
        outputFile,
        bottomExtra,
        items,
        instant
    };
}

function findMergeImage(allFiles, prefix, number) {
    const padded = pad3(number);
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escapedPrefix}_?${padded}(?:#H(\\d+))?$`, "i");

    const matches = allFiles
        .filter(isImage)
        .map(file => ({
            file,
            match: path.parse(file).name.match(pattern)
        }))
        .filter(({
            match
        }) => match)
        .map(({
            file,
            match
        }) => ({
            file,
            taggedHeight: match[1] !== undefined ? Number(match[1]) : null
        }));

    if (matches.length === 0) throw new Error(`${prefix}${padded} (또는 ${prefix}_${padded}) 이미지를 찾을 수 없습니다.`);
    if (matches.length > 1) {
        throw new Error(
            `${prefix}${padded}에 해당하는 이미지가 여러 개 있습니다:\n` +
            matches.map(m => `  - ${m.file}`).join("\n")
        );
    }
    return matches[0];
}

function findLiteralImage(allFiles, filename, inputDir) {
    if (!allFiles.includes(filename)) throw new Error(`${filename} 파일을 ${inputDir}/ 에서 찾을 수 없습니다.`);
    if (!isImage(filename)) throw new Error(`${filename}은 지원하는 이미지 형식이 아닙니다.`);

    const match = path.parse(filename).name.match(/#H(\d+)$/i);
    return {
        file: filename,
        taggedHeight: match ? Number(match[1]) : null
    }; // match → match[1]
}

function resolveGap(item) {
    if (item.referenceHeight === null) return item.gap;
    const gap = item.gap + (item.referenceHeight - item.taggedHeight);
    if (gap < 0) {
        warn("merge", `${item.file}: 계산된 공백 ${gap}px → 0px로 보정`);
        return 0;
    }
    return gap;
}

async function cmdMerge(args) {
    if (args[0] === "magic") {
        const {
            runMagic
        } = require("./magic.js");

        return await runMagic();
    }

    if (hasHelpFlag(args)) return printHelp("merge");

    const options = parseProjectOptions("merge", args);
    args = options.args;

    if (["-C", "--command-file"].includes(args[0])) {
        const [, file, ...values] = args;

        if (!file) {
            usageError("merge", "-C 뒤에 파일명을 지정하세요.");
        }

        let text;

        try {
            text = fs.readFileSync(file, "utf8").trim();
        } catch {
            runtimeError("merge", `파일을 읽을 수 없습니다: ${file}`);
        }

        if (!text) {
            usageError("merge", `${file}이 비어 있습니다.`);
        }

        args = text.split(/\s+/).map(token =>
            token.replace(/\$(\d+)/g, (_, n) => {
                if (values[n - 1] === undefined) {
                    usageError("merge", `${file}: $${n} 값이 없습니다.`);
                }

                return values[n - 1];
            })
        );
    }

    const {
        prefix,
        outputFile,
        bottomExtra,
        items,
        instant
    } =

    parseMergeArgs(args);
	
	
	const outputPath = path.isAbsolute(outputFile)
    ? outputFile
    : path.join(options.referenceDir, outputFile);

    if (!fs.existsSync(options.inputDir)) runtimeError("merge", `${options.inputDir}/ 폴더가 없습니다.`);
    const allFiles = fs.readdirSync(options.inputDir);

    const images = [];
    for (const item of items) {
        const found = item.literal ?
            findLiteralImage(allFiles, item.literal, options.inputDir) :
            findMergeImage(allFiles, prefix, item.number);

        if (item.referenceHeight !== null && found.taggedHeight === null) {
            throw new Error(`${found.file}: #H 태그가 없어 동적 간격(H보정)을 사용할 수 없습니다.`);
        }

        const filePath = path.join(options.inputDir, found.file);
        const metadata = await sharp(filePath).metadata();
        if (!metadata.width || !metadata.height) throw new Error(`${found.file}의 크기를 읽을 수 없습니다.`);

        images.push({
            file: found.file,
            path: filePath,
            baseGap: item.gap,
            referenceHeight: item.referenceHeight,
            taggedHeight: found.taggedHeight,
            gap: resolveGap({
                ...item,
                file: found.file,
                taggedHeight: found.taggedHeight
            }),
            width: metadata.width,
            height: metadata.height
        });
    }

    const imageWidth = images[0].width;
    for (const img of images) {
        if (img.width !== imageWidth) {
            throw new Error(`${img.file}의 너비가 다릅니다. 기준 ${imageWidth}px, 현재 ${img.width}px`);
        }
    }

    notice(
        "merge",
        `prefix=${prefix}, 이미지 ${images.length}개, 출력=${outputPath}, 하단여백=${bottomExtra}px${instant ? ", instant" : ""}`
	);

    const composites = [];
    let currentTop = 0;

    images.forEach((img, n) => {
        currentTop += img.gap;
        composites.push({
            input: img.path,
            left: 0,
            top: Math.round(currentTop)
        });

        const label = String(n + 1).padStart(3, " ");
        const gapInfo = img.referenceHeight !== null ?
            `${img.baseGap}H${img.referenceHeight} + (#H${img.taggedHeight}) -> ${img.gap}px` :
            `${img.gap}px`;
        console.log(`  ${label}  ${gapInfo}  ${img.file} (${img.width}x${img.height})`);

        currentTop += img.height;
    });

    const canvasHeight = Math.ceil(currentTop + bottomExtra);

    await sharp({
            create: {
                width: imageWidth,
                height: canvasHeight,
                channels: 4,
                background: {
                    r: 255,
                    g: 255,
                    b: 255,
                    alpha: 1
                }
            }
        })
        .composite(composites)
        .png()
        .toFile(outputPath);

    notice("merge", `완료 - ${imageWidth}x${canvasHeight}, ${outputPath} 에 저장했습니다`);
}

function generateRandomId(allFiles, length = 4) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id;
    do {
        id = Array.from({
            length
        }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    } while (allFiles.some(file => file.startsWith(`${id}_`)));
    return id;
}

function collectAlignImages(allFiles) {
    return allFiles
        .map(file => {
            if (!isImage(file)) return null;
            const match = path.parse(file).name.match(/^C(\d{3})#H(\d+)$/i);
            if (!match) return null;
            return {
                file,
                ext: path.extname(file).toLowerCase(),
                number: Number(match[1]),
                height: Number(match[2])
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.number - b.number);
}

function cmdAlign(args) {
    if (hasHelpFlag(args)) return printHelp("align");

    const options = parseProjectOptions("align", args);
    if (options.args.length > 0) usageError("align", `알 수 없는 인자: ${options.args[0]}`);
    if (!fs.existsSync(options.inputDir)) runtimeError("align", `${options.inputDir}/ 폴더가 없습니다.`);

    const allFiles = fs.readdirSync(options.inputDir);
    const images = collectAlignImages(allFiles);

    if (images.length === 0) {
        notice("align", "C000#H숫자 ~ C999#H숫자 형식의 이미지가 없습니다.");
        return;
    }

    const first = images[0].number;
    const last = images[images.length - 1].number;
    const existing = new Set(images.map(img => img.number));
    const missing = [];
    for (let n = first; n <= last; n++)
        if (!existing.has(n)) missing.push(n);

    const missingInfo = missing.length > 0 ?
        `빠진 번호 ${missing.length}개 (${missing.map(n => `C${pad3(n)}`).join(", ")})` :
        "빠진 번호 없음";
    notice("align", `C${pad3(first)} ~ C${pad3(last)}, ${images.length}개, ${missingInfo}`);

    const randomId = generateRandomId(allFiles);
    notice("align", `새 ID = ${randomId}`);

    const tempFiles = images.map((image, index) => {
        const tempName = `.__rename_temp_${process.pid}_${index}${image.ext}`;
        fs.renameSync(path.join(options.inputDir, image.file), path.join(options.inputDir, tempName));
        return {
            originalFile: image.file,
            height: image.height,
            tempName,
            ext: image.ext
        };
    });

    tempFiles.forEach((image, index) => {
        const newName = `${randomId}_${pad3(index + 1)}#H${image.height}${image.ext}`;
        const newPath = path.join(options.inputDir, newName);
        if (fs.existsSync(newPath)) throw new Error(`대상 파일이 이미 존재합니다: ${newName}`);
        fs.renameSync(path.join(options.inputDir, image.tempName), newPath);
        console.log(`  ${image.originalFile}  ->  ${newName}`);
    });

    notice("align", `완료 - ${images.length}개 파일 이름을 변경했습니다 (prefix: ${randomId})`);
}

const STACK_OUTPUT_DIR = "stacked";
function findCaseInsensitive(files, wanted) {
    const lower = wanted.toLocaleLowerCase();
    return files.find(file => file.toLocaleLowerCase() === lower);
}

async function overlayLayers(layerPaths, outputPath) {
    const layers = await Promise.all(layerPaths.map(async file => {
        const metadata = await sharp(file).metadata();
        return {
            file,
            width: metadata.width,
            height: metadata.height
        };
    }));

    const [first, ...rest] = layers;
    const mismatch = rest.find(item => item.width !== first.width || item.height !== first.height);
    if (mismatch) {
        throw new Error(
            `이미지 크기가 다릅니다: ${path.basename(first.file)}(${first.width}x${first.height}), ` +
            `${path.basename(mismatch.file)}(${mismatch.width}x${mismatch.height})`
        );
    }

    await sharp(layerPaths[0])
        .composite(layerPaths.slice(1).map(input => ({
            input,
            blend: "over"
        })))
        .png()
        .toFile(outputPath);
}

async function cmdStack(args) {
    if (hasHelpFlag(args)) return printHelp("stack");

    const options = parseProjectOptions("stack", args);
    args = options.args;

    let prefix, suffix;
    const order = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-A") {
            if (order.includes("dest")) usageError("stack", "-A는 한 번만 사용할 수 있습니다.");
            order.push("dest");
        } else if (arg === "--at") {
            const value = args[++i];
            if (!value) usageError("stack", "--at 뒤에 고정 PNG 파일명을 입력하세요.");
            order.push({
                type: "at",
                file: value
            });
        } else if (["-P", "--prefix", "-S", "--suffix"].includes(arg)) {
            const value = args[++i];
            if (!value) usageError("stack", `${arg} 뒤에 값을 입력하세요.`);
            if (arg === "-P" || arg === "--prefix") {
                if (prefix !== undefined) usageError("stack", "prefix는 한 번만 지정할 수 있습니다.");
                prefix = value;
                order.push("pre");
            } else {
                if (suffix !== undefined) usageError("stack", "suffix는 한 번만 지정할 수 있습니다.");
                suffix = value;
                order.push("post");
            }
        } else {
            usageError("stack", `알 수 없는 옵션: ${arg}`);
        }
    }

    if (!prefix && !suffix) usageError("stack", "stack에는 prefix 또는 suffix가 하나 이상 필요합니다.");
    if (!order.includes("dest")) order.push("dest");

    if (!fs.existsSync(options.inputDir)) {
        runtimeError("stack", `${options.inputDir}/ 폴더가 없습니다.`);
    }

    const files = fs.readdirSync(options.inputDir, {
            withFileTypes: true
        })
        .filter(entry => entry.isFile() && entry.name.toLocaleLowerCase().endsWith(".png"))
        .map(entry => entry.name);

    for (const layer of order) {
        if (typeof layer === "string") continue;
        const fixedFile = findCaseInsensitive(files, layer.file);
        if (!fixedFile) {
            runtimeError("stack", `입력 폴더에 고정 파일 "${layer.file}"이 없습니다.`);
        }
        layer.resolvedFile = fixedFile;
    }

    const candidateNames = new Set();
    if (prefix !== undefined) {
        const lowerPrefix = prefix.toLocaleLowerCase();
        for (const file of files) {
            if (file.toLocaleLowerCase().startsWith(lowerPrefix)) {
                candidateNames.add(file.slice(prefix.length));
            }
        }
    }

    if (suffix !== undefined) {
        const postfixEnding = `${suffix}.png`;
        const lowerEnding = postfixEnding.toLocaleLowerCase();
        for (const file of files) {
            if (file.toLocaleLowerCase().endsWith(lowerEnding)) {
                candidateNames.add(`${file.slice(0, -postfixEnding.length)}.png`);
            }
        }
    }

    if (candidateNames.size === 0) {
        runtimeError("stack", "옵션과 일치하는 PNG 파일 묶음을 찾지 못했습니다.");
    }

    const outputDir = path.join(options.referenceDir, STACK_OUTPUT_DIR);
    fs.mkdirSync(outputDir, {
        recursive: true
    });

    let success = 0;
    let failed = 0;
    const sortedCandidates = [...candidateNames].sort((a, b) => a.localeCompare(b));

    for (const outputName of sortedCandidates) {
        const base = findCaseInsensitive(files, outputName);
        if (!base) {
            console.error(`[건너뜀] 기준 파일 ${outputName}가 없습니다.`);
            failed++;
            continue;
        }

        try {
            const layerByRole = {
                dest: base
            };

            if (prefix !== undefined) {
                const wanted = `${prefix}${outputName}`;
                const prefixFile = findCaseInsensitive(files, wanted);
                if (!prefixFile) throw new Error(`prefix 파일 "${wanted}"이 없습니다.`);
                layerByRole.pre = prefixFile;
            }

            if (suffix !== undefined) {
                const wanted = `${outputName.slice(0, -4)}${suffix}.png`;
                const postfixFile = findCaseInsensitive(files, wanted);
                if (!postfixFile) throw new Error(`suffix 파일 "${wanted}"이 없습니다.`);
                layerByRole.post = postfixFile;
            }

            const layerNames = order.map(layer =>
                typeof layer === "string" ? layerByRole[layer] : layer.resolvedFile
            );
            await overlayLayers(
                layerNames.map(name => path.join(options.inputDir, name)),
                path.join(outputDir, outputName)
            );
            console.log(`[완료] ${outputName}`);
            success++;
        } catch (error) {
            console.error(`[실패] ${outputName}: ${error.message}`);
            failed++;
        }
    }

    notice("stack", `완료 ${success}개, 실패/건너뜀 ${failed}개 - ${outputDir}/`);
    if (failed > 0) process.exitCode = 1;
}


async function cmdAngle(args) {
    if (hasHelpFlag(args)) return printHelp("angle");

    const options = parseProjectOptions("angle", args);
    const worker = path.join(__dirname, "angle.js");
    const outputDir = path.join(options.referenceDir, "angled");

    if (!fs.existsSync(options.inputDir)) {
        runtimeError("angle", `${options.inputDir}/ 폴더가 없습니다.`);
    }

    await new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [worker, options.inputDir, outputDir, ...options.args],
            { stdio: "inherit" }
        );

        child.once("error", reject);
        child.once("exit", (code, signal) => {
            if (signal) return reject(new Error(`각도 보정 작업이 ${signal} 신호로 종료되었습니다.`));
            if (code !== 0) return reject(new Error(`각도 보정 작업이 종료 코드 ${code}로 실패했습니다.`));
            resolve();
        });
    });

    notice("angle", `완료 - 결과를 ${outputDir}/ 에 저장했습니다`);
}

const commands = {
    crop: cmdCrop,
    merge: cmdMerge,
    align: cmdAlign,
    angle: cmdAngle,
    stack: cmdStack
};
const argv = process.argv.slice(2);

if (argv.length === 0) {
    printHelp("global", console.error);
    process.exit(2);
}

if (argv[0] === "-h" || argv[0] === "--help") {
    printHelp("global");
    process.exit(0);
}

const [command, ...rest] = argv;

if (!commands[command]) {
    console.error(`${PROG}: error: '${command}'는 알 수 없는 명령입니다.`);
    console.error(`Try '${PROG} --help' for more information.`);
    process.exit(2);
}

Promise.resolve(commands[command](rest)).catch(error => {
    runtimeError(command, error.message || String(error));
});
