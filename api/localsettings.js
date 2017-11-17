/*
 * This is a sample configuration file.
 *
 * Copy this file to localsettings.js and edit that file to fit your needs.
 *
 * Also see the file ParserService.js for more information.
 */

exports.setup = function( parsoidConfig ) {
	parsoidConfig.useSelser = true;
	parsoidConfig.maxRequestsPerChild = 100;

	if ( process.env.ENV ) {
		const envName = (process.env.ENV + '').toLowerCase();

		if ( envName !== '' && envName !== 'dev' ) {
			parsoidConfig.parsoidCacheURI = `http://${envName}.parsoid-cache/`;
			parsoidConfig.parsoidCacheProxy = `http://${envName}.icache.service.consul:80/`;
			parsoidConfig.defaultAPIProxyURI = `http://${envName}.icache.service.consul:80/`;
		}
	}
};
