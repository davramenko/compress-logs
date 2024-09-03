// import {logConfig} from "./configs/appConfig";
const winston = require("winston");
require('winston-daily-rotate-file');

function createLogger (logConfig) {
    const transports = [];
    const format = {
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf((i) => {
                return `${i.timestamp} [${i.level}] ${i.message}`;
            })
        )
    };
    transports.push(new winston.transports.DailyRotateFile({
        ...logConfig, ...format
    }));
    //console.log('Logger filename: ' + logConfig.filename);

    return winston.createLogger({
        levels: winston.config.npm.levels,
        transports,
        exceptionHandlers: [
            new winston.transports.File({filename: 'exceptions.log'})
        ],
        exitOnError: false
    });
}

export default createLogger;
