'use strict';

const { PROG } = require('./constants');
function usageError(command, msg) {
  console.error(`${PROG} ${command}: error: ${msg}`);
  console.error(`Try '${PROG} ${command} --help' for more information.`);
  process.exit(2);
}
function runtimeError(command, msg) {
  console.error(`${PROG} ${command}: error: ${msg}`);
  process.exit(1);
}
function warn(command, msg) { console.error(`${PROG} ${command}: warning: ${msg}`); }
function notice(command, msg) { console.log(`${PROG} ${command}: ${msg}`); }
function pad3(n) { return String(n).padStart(3, '0'); }

module.exports = { usageError, runtimeError, warn, notice, pad3 };