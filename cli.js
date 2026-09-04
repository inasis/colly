#!/usr/bin/env node

const path = require("path");

const [, , command, ...args] = process.argv;

if (command === "drop") {
  require("./drop")(args).catch(error => {
    console.error(`colly drop: error: ${error.message || String(error)}`);
    process.exit(1);
  });
} else {
  require(path.join(__dirname, "colly.js"));
}
