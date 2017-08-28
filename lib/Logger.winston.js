const winston = require('winston');

const logLevels = {
	error: 0,
	warning: 1,
	notice: 2,
	info: 3,
	debug: 4
};

const defaultLogger = new winston.Logger({
	levels: logLevels,
	transports: [
		new winston.transports.Console({
			level: 'info',
			formatter: function (options) {
				const logEntry = Object.assign(options.meta, {
					appname: 'parsoid',
					message: options.message,
					severity: options.level
				});

				return JSON.stringify(logEntry);
			}
		})
	]
});

/**
 * Map crazy Parsoid log levels to their proper equivalent
 * @param logType
 * @returns {(function(this:T))|*}
 */
function getLoggerFunctionForCrazyParsoidLogLevel(logType) {
	switch (true) {
		case logType.match(/^info($|\/)/):
			return defaultLogger.info.bind(defaultLogger);
		case logType.match(/^trace($|\/)/):
		case logType.match(/^debug($|\/)/):
			return defaultLogger.debug.bind(defaultLogger);
		case logType.match(/^fatal($|\/)/):
		case logType.match(/^error($|\/)/):
			return defaultLogger.error.bind(defaultLogger);
		case logType.match(/^warn(ing)?($|\/)/):
			return defaultLogger.warning.bind(defaultLogger);
		default:
			return defaultLogger.info.bind(defaultLogger);
	}
}

/**
 * Sane handler for Parsoid log events
 * @param logData
 */
function log(logData) {
	const loggerFunction = getLoggerFunctionForCrazyParsoidLogLevel(logData.logType);

	// Parsoid keeps log context and log message in the same object...
	const logMsg = logData.msg();
	const logObject = logData.flatLogObject();

	delete logObject.msg;
	delete logObject.longMsg;

	// Log any extra metadata if provided
	if (Object.keys(logObject).length) {
		const logContext = {
			'@context': logObject
		};

		loggerFunction(logMsg, logContext);

		return;
	}

	loggerFunction(logMsg);
}

// Expose both Winston logger and handler for crazy parsoid stuff
module.exports = {
	defaultLogger: defaultLogger,
	log: log
};
