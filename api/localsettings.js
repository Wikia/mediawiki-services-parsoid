/*
 * This is a sample configuration file.
 *
 * Copy this file to localsettings.js and edit that file to fit your needs.
 *
 * Also see the file ParserService.js for more information.
 */

const winstonLogger = require('../lib/Logger.winston');

exports.setup = function( parsoidConfig ) {
	parsoidConfig.useSelser = true;
	parsoidConfig.maxRequestsPerChild = 100;

	parsoidConfig.loggerBackend = winstonLogger.log;

	const env = process.env.ENV.toLowerCase();

	if (env !== 'dev') {
		parsoidConfig.parsoidCacheURI = `http://${env}.parsoid-cache`;
		parsoidConfig.parsoidCacheProxy = `http://${env}.icache.service.consul:80`;
		parsoidConfig.defaultAPIProxyURI = `http://${env}.icache.service.consul:80`;
	}
};
