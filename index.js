#!/usr/bin/env node
// noinspection SpellCheckingInspection

'use strict';

const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const Getopt = require('node-getopt');
const { flock } = require('fs-ext');
const { createHash } = require('crypto');
const deasync = require('deasync');

const getopt = new Getopt([
  ['h' , 'help'                , 'display this help']
]);
getopt.setHelp(
    `\nUsage: ${path.basename(process.argv[1])} <dirname> <filename_pattern> [OPTION]\n` +
    "\n" +
    "Options:\n" +
    "\n" +
    "[[OPTIONS]]\n"
);
getopt.on('h', (_) => {
    getopt.showHelp();
    process.exit(1);
});

const requiredFields = ['year', 'month', 'day'];
const lockDirBase = '/run';

// https://stackoverflow.com/questions/3115982/how-to-check-if-two-arrays-are-equal-with-javascript
// https://stackoverflow.com/questions/1885557/simplest-code-for-array-intersection-in-javascript
const checkRequiredFields = (obj, requiresFields) => {
    const intersect = (a, b) => {
        return a.filter(Set.prototype.has, b);
    }

    const setsEqual = (a, b) => {
        return a.size === b.size && [...a.keys()].every(k => b.has(k));
    }

    const objPropNames = new Set(Object.keys(obj));
    const intersection = new Set(intersect(requiresFields, objPropNames));
    return setsEqual(intersection, new Set(requiresFields));
};

const opt = getopt.parse(process.argv.slice(2));
const argv = opt.argv;
if (argv.length !== 2) {
    getopt.showHelp();
    process.exit(1);
}
const dir = argv[0];
const pattern = new RegExp(argv[1], 'i');

(async () => {
    const dirHash = createHash('sha256').update(dir).digest('hex').substring(0, 8);
    const lockDir = `${lockDirBase}/compress_logs/${dirHash}`;
    const lockFile = `${lockDir}/process.lock`;
    if (!fs.existsSync(lockDir)) {
        console.log(`Creating directory: "${lockDir}"`);
        fs.mkdirSync(lockDir, { recursive: true });
    }

    const fd = fs.openSync(lockFile, 'r');
    flock(fd, 'exnb', (err) => {
        if (err) {
            if (err.errno === 11) {
                console.log("WARN: Process is already running");
                process.exit(10);
            }
            throw err;
        }

        // File is locked
        if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) {
            console.log(`FATAL ERROR: Directory "${dir}" does not exist\n`);
            process.exit(1);
        }

        let selectedFiles = [];
        fs.readdirSync(dir).forEach(file => {
            const capture = file.match(pattern);
            if (capture) {
                if (!capture.groups || !checkRequiredFields(capture.groups, requiredFields)) {
                    console.log(`ERROR: Pattern ${pattern} is invalid`);
                    process.exit(1);
                }

                const fileDate = (new Date(Date.parse(`${capture.groups['year']}-${capture.groups['month']}-${capture.groups['day']}`))).setHours(0,0,0,0)
                selectedFiles.push({file, fileDate});
            }
        });
        if (selectedFiles.length === 0) {
            console.log('WARN: No files found to compress');
            process.exit(0);
        }
        if (selectedFiles.length === 1) {
            process.exit(0);
        }

        let maxDate = 0;
        for (const fileInfo of selectedFiles) {
            if (maxDate < fileInfo.fileDate) {
                maxDate = fileInfo.fileDate;
            }
        }

        selectedFiles = selectedFiles.filter(
            fileInfo => fileInfo.fileDate !== (new Date()).setHours(0,0,0,0) &&
                fileInfo.fileDate !== maxDate &&
                !fs.existsSync(`${dir}/${fileInfo.file}.xz`)
        );

        for (const fileInfo of selectedFiles) {
            const cmd = `xz -9 '${dir}/${fileInfo.file}'`;
            exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    console.log(`ERROR: Failed to compress file: "${dir}/${fileInfo.file}"`);
                    console.log(`stderr: ${stderr}`);
                    // return; // Don't forget to uncomment this if you would like to add the code outside the IF block
                }
            });
        }
    });
    deasync.sleep(100);
})();
