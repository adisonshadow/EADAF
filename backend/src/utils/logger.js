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
    transports: []
});

let exceptionTransport = null;
let rejectionTransport = null;

function closeTransport(transport) {
    if (!transport || typeof transport.close !== 'function') return;
    try {
        transport.close();
    } catch {
        /* 已经关掉 */
    }
}

function dailyRotateFile(filename, rotation, extra = {}) {
    return new winston.transports.DailyRotateFile({
        filename,
        datePattern: 'YYYY-MM-DD',
        maxSize: rotation.maxSize,
        maxFiles: extra.maxFiles,
        zippedArchive: rotation.zippedArchive,
        format: logFormat,
        ...extra.level ? { level: extra.level } : {}
    });
}

/**
 * 按给定滚动参数重建文件传输。
 * winston-daily-rotate-file 在创建流时就把 maxSize / maxFiles 收进闭包，
 * 改 options 不会作用到已经打开的文件，所以要拆掉再挂上。
 * 控制台传输留着不动。
 */
function applyLogRotation(rotation) {
    const next = {
        maxSize: rotation.maxSize,
        zippedArchive: Boolean(rotation.zippedArchive)
    };
    logger.transports
        .filter((transport) => transport.name === 'dailyRotateFile')
        .forEach((transport) => {
            logger.remove(transport);
            closeTransport(transport);
        });

    logger.add(dailyRotateFile(path.join(logDir, 'app-%DATE%.log'), next, {
        maxFiles: rotation.maxFiles
    }));
    logger.add(dailyRotateFile(path.join(logDir, 'error-%DATE%.log'), next, {
        maxFiles: rotation.errorMaxFiles,
        level: 'error'
    }));

    if (exceptionTransport || rejectionTransport) {
        logger.exceptions.unhandle();
        logger.exceptions.handlers?.clear?.();
        logger.rejections.unhandle();
        logger.rejections.handlers?.clear?.();
        closeTransport(exceptionTransport);
        closeTransport(rejectionTransport);
    }

    exceptionTransport = dailyRotateFile(path.join(logDir, 'exceptions-%DATE%.log'), next, {
        maxFiles: rotation.exceptionsMaxFiles || rotation.errorMaxFiles
    });
    rejectionTransport = dailyRotateFile(path.join(logDir, 'rejections-%DATE%.log'), next, {
        maxFiles: rotation.rejectionsMaxFiles || rotation.errorMaxFiles
    });
    logger.exceptions.handle(exceptionTransport);
    logger.rejections.handle(rejectionTransport);
}

applyLogRotation(config.logging.rotation);

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

logger.applyLogRotation = applyLogRotation;

module.exports = logger;
