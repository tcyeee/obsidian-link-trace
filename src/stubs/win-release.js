"use strict";
// Stub for the 'win-release' npm package.
// The real package falls back to child_process.execSync("ver.exe") on Node <3.1.0
// which can never be true in Obsidian's Electron runtime — the branch is dead code
// but triggers the submission bot's shell-execution scanner.
// This stub preserves the lookup table without the child_process branch.
var os = require("os");
var nameMap = {
	"10.0": "10", "6.3": "8.1", "6.2": "8", "6.1": "7",
	"6.0": "Vista", "5.1": "XP", "5.0": "2000",
	"4.9": "ME", "4.1": "98", "4.0": "95",
};
module.exports = function (release) {
	var version = /\d+\.\d+/.exec(release || os.release());
	return nameMap[(version || [])[0]] || "";
};
