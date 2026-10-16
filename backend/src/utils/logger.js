const winston = require('winston');
const fs = require('fs');
const path = require('path');
const config = require('../config');
require('winston-daily-rotate-file');

const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'silly' : config.logging.level,
    format: logFormat,
    transports: [
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'app-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: config.logging.rotation.maxSize,
            maxFiles: config.logging.rotation.maxFiles,
            zippedArchive: config.logging.rotation.zippedArchive,
            format: logFormat
        }),
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: config.logging.rotation.maxSize,
            maxFiles: config.logging.rotation.errorMaxFiles,
            zippedArchive: config.logging.rotation.zippedArchive,
            level: 'error',
            format: logFormat
        })
    ]
});

/**
 * 控制台格式：只留「时刻 级别 正文」，元数据压成 k=v，堆栈换行缩进。
 * 旧格式（format.simple）会把 timestamp 和整段堆栈 JSON 转义拼在同一行，
 * 排查依赖故障时几乎读不出重点。
 */
const CONSOLE_SKIP_KEYS = new Set(['level', 'message', 'timestamp', 'splat', 'suppressConsole']);

function formatConsoleValue(value) {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.printf((info) => {
        const time = String(info.timestamp || '').slice(11, 19);
        const extras = [];
        for (const [key, value] of Object.entries(info)) {
            if (CONSOLE_SKIP_KEYS.has(key) || key === 'stack') continue;
            if (value === undefined || value === null || value === '') continue;
            extras.push(`${key}=${formatConsoleValue(value)}`);
        }
        let text = `${time ? `${time} ` : ''}${info.level}: ${info.message}`;
        if (extras.length) text += `  ${extras.join(' ')}`;
        if (info.stack && String(info.level).includes('error')) {
            text += `\n${String(info.stack).split('\n').map((ln) => `    ${ln}`).join('\n')}`;
        }
        return text;
    })
);

/**
 * 带 suppressConsole 的日志只进文件：依赖不可用期间的重复报错走这条路，
 * 控制台安静，logs/error-*.log 里的堆栈仍然完整。
 */
class FileOnlyConsoleTransport extends winston.transports.Console {
    log(info, callback) {
        if (info && info.suppressConsole) {
            this.emit('logged', info);
            callback();
            return;
        }
        super.log(info, callback);
    }
}

if (process.env.NODE_ENV !== 'production') {
    logger.add(new FileOnlyConsoleTransport({ format: consoleFormat }));
}

logger.exceptions.handle(
    new winston.transports.DailyRotateFile({
        filename: path.join(logDir, 'exceptions-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: config.logging.rotation.maxSize,
        maxFiles: config.logging.rotation.exceptionsMaxFiles,
        zippedArchive: config.logging.rotation.zippedArchive
    })
);

logger.rejections.handle(
    new winston.transports.DailyRotateFile({
        filename: path.join(logDir, 'rejections-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: config.logging.rotation.maxSize,
        maxFiles: config.logging.rotation.rejectionsMaxFiles,
        zippedArchive: config.logging.rotation.zippedArchive
    })
);

module.exports = logger;
