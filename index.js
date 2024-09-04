#!/usr/bin/env node
// noinspection SpellCheckingInspection

'use strict';

const path = require('path');
const fs = require('fs');
const {spawnSync} = require('child_process');
const Getopt = require('node-getopt');
const {flock} = require('fs-ext');
const {createHash} = require('crypto');
const deasync = require('deasync');
const { createLogger, transports, format } = require('winston')
const { timestamp, combine, json, errors, printf, label } = format
require('winston-daily-rotate-file');


const getopt = new Getopt([
    ['h', 'help', 'display this help'],
    ['n', 'keep-files=', 'number of compressed files kept; default: do not remove old files'],
    ['p', 'compressed-pattern=', 'match the compresed filename; default: \\.xz$'],
    ['t', 'nothing-change', 'nothing changes just shows what to do']
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
let compressedPattern = '\\.xz$';
getopt.on('p', (value) => {
    compressedPattern = value;
});
let keepFiles = 0;
getopt.on('n', (value) => {
    keepFiles = parseInt(value);
});
let doNothing = false;
getopt.on('t', (_) => {
    doNothing = true;
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
compressedPattern = new RegExp((argv[1].endsWith('$') ? argv[1].substring(0, argv[1].length - 1) : argv[1]) + compressedPattern);
if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) {
    console.log(`FATAL ERROR: Directory "${dir}" does not exist\n`);
    process.exit(1);
}
const dirHash = createHash('sha256').update(dir).digest('hex').substring(0, 8);

const transport = new transports.DailyRotateFile({
    dirname: dir,
    filename: 'compress_logs-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    zippedArchive: 'false',
    maxsize: 2097152,
    maxFiles: '7d'
});
const myFormat = combine(
    label({label: dirHash }),
    timestamp(),
    errors({stack: true}),
    //json(),
    printf(({ level, message, label, timestamp }) => {
        return `${timestamp} [${label}] ${level}: ${message}`;
    })
);
const logger = createLogger({
    format: myFormat,
    transports: [transport],
    exitOnError: false,
    exceptionHandlers: [
        new transports.File({
            dirname: dir,
            filename: 'exceptions.log'
        })
    ],
});

logger.info('Started...');
if (doNothing) {
    logger.info('nothing-change mode activated');
}
const dateFormat = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
(async () => {
    const lockDir = `${lockDirBase}/compress_logs/${dirHash}`;
    const lockFile = `${lockDir}/process.lock`;
    if (!fs.existsSync(lockDir)) {
        logger.info(`Creating directory: "${lockDir}"`);
        fs.mkdirSync(lockDir, {recursive: true});
    }
    if (!fs.existsSync(lockFile)) {
        logger.info(`Creating lock file: "${lockFile}"`);
        const fd0 = fs.openSync(lockFile, 'w');
        fs.closeSync(fd0);
    }

    const fd = fs.openSync(lockFile, 'r');
    flock(fd, 'exnb', async (err) => {
        if (err) {
            if (err.errno === 11) {
                logger.warning("Process is already running");
                deasync.sleep(1000);
                process.exit(10);
            }
            throw err;
        }

        // File is locked
        let selectedFiles = [];
        do {
            fs.readdirSync(dir).forEach(file => {
                const capture = file.match(pattern);
                if (capture) {
                    if (!capture.groups || !checkRequiredFields(capture.groups, requiredFields)) {
                        logger.error(`Pattern ${pattern} is invalid`);
                        deasync.sleep(1000);
                        process.exit(1);
                    }

                    const fileDate = (new Date(Date.parse(`${capture.groups['year']}-${capture.groups['month']}-${capture.groups['day']}`))).setHours(0, 0, 0, 0)
                    selectedFiles.push({file, fileDate, skip: true});
                }
            });
            if (selectedFiles.length === 0) {
                logger.warning('No files found to compress');
                break;
            }
            if (selectedFiles.length === 1) {
                break;
            }

            let maxDate = 0;
            for (const fileInfo of selectedFiles) {
                if (maxDate < fileInfo.fileDate) {
                    maxDate = fileInfo.fileDate;
                }
            }
            logger.info(`Log files max date: ${(new Date(maxDate)).toLocaleDateString("ja-JP", dateFormat)}`);

            selectedFiles = selectedFiles.map(
                fileInfo => {
                    if (fileInfo.fileDate < (new Date()).setHours(0, 0, 0, 0) &&
                        fileInfo.fileDate !== maxDate &&
                        !fs.existsSync(`${dir}/${fileInfo.file}.xz`)
                    ) {
                        fileInfo.skip = false;
                        logger.info(`No skip: "${dir}/${fileInfo.file}"`);
                    } else {
                        const fexists = fs.existsSync(`${dir}/${fileInfo.file}.xz`);
                        logger.info(`Skip: "${dir}/${fileInfo.file}": fdate: ${(new Date(fileInfo.fileDate)).toLocaleDateString("ja-JP", dateFormat)}; compr. exists: ${fexists ? 'yes' : 'no'}`);
                    }
                    return fileInfo;
                }
            );

            for (const fileInfo of selectedFiles) {
                if (fileInfo.skip) {
                    continue;
                }
                logger.info(`Compressing file: "${dir}/${fileInfo.file}"`);
                if (!doNothing) {
                    const result = spawnSync(
                        'xz',
                        ['-9', `${dir}/${fileInfo.file}`],
                        {
                            stdio: ['ignore', 'ignore', 'pipe'],
                            shell: true,
                            encoding: 'utf-8'
                        }
                    );
                    if (result.status || result.signal) {
                        logger.error(`Failed to compress file: "${dir}/${fileInfo.file}"`);
                        logger.error(`stderr: ${result.stderr}`);
                        // return; // Don't forget to uncomment this if you would like to add the code outside the IF block
                    }
                }
            }
        } while (false);

        if (keepFiles > 1) {
            let compressedFiles = [];
            logger.info('Looking for compressed files')
            fs.readdirSync(dir).forEach(file => {
                const capture = file.match(compressedPattern);
                if (capture) {
                    const fileDate = (new Date(Date.parse(`${capture.groups['year']}-${capture.groups['month']}-${capture.groups['day']}`))).setHours(0, 0, 0, 0)
                    const foundInfo = selectedFiles.find(fileInfo => fileInfo.fileDate === fileDate);
                    if (!foundInfo || !foundInfo.skip) {
                        compressedFiles.push({file, fileDate});
                    }
                }
            });
            logger.info(`${compressedFiles.length} compressed files found`)
            if (compressedFiles.length > keepFiles) {
                compressedFiles.sort((a, b) => a.fileDate < b.fileDate ? -1 : (a.fileDate > b.fileDate ? 1 : 0));
                while (compressedFiles.length > keepFiles) {
                    try {
                        if (!doNothing) {
                            fs.unlinkSync(`${dir}/${compressedFiles[0].file}`);
                        }
                        logger.info(`Old file has been removed: "${dir}/${compressedFiles[0].file}"`)
                    } catch (err) {
                        logger.error('Cannot delete old file: ' + err.message);
                    }
                    compressedFiles = compressedFiles.slice(1)
                }
            }
        }
        logger.info('Finish');
        deasync.sleep(1000);
    });
    deasync.sleep(100);
})();
