#!/usr/bin/env node
'use strict';
const { PROG } = require('./core/constants');
const { printHelp } = require('./core/help');
const { runtimeError } = require('./core/log');
const { cmdCrop } = require('./commands/crop');
const { cmdMerge } = require('./commands/merge');
const { cmdAutomerge } = require('./commands/automerge');
const { cmdAlign } = require('./commands/align');
const { cmdAngle } = require('./commands/angle');
const { cmdStack } = require('./commands/stack');
const { cmdDrop } = require('./commands/drop');
const { cmdMatch } = require('./commands/match');
const commands = { crop: cmdCrop, merge: cmdMerge, automerge: cmdAutomerge, align: cmdAlign, angle: cmdAngle, stack: cmdStack, drop: cmdDrop, match: cmdMatch };
const argv = process.argv.slice(2);
if (!argv.length) { printHelp('global', console.error); process.exit(2); }
if (argv[0] === '-h' || argv[0] === '--help') { printHelp('global'); process.exit(0); }
const [command, ...rest] = argv;
if (!commands[command]) { console.error(`${PROG}: error: '${command}'는 알 수 없는 명령입니다.`); console.error(`Try '${PROG} --help' for more information.`); process.exit(2); }
Promise.resolve(commands[command](rest)).catch(error => runtimeError(command, error.message || String(error)));