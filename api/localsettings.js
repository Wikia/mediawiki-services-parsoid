/**
 * I am the configuration file
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
