/**
 * I am the configuration file
 */
exports.setup = function( parsoidConfig ) {
	parsoidConfig.useSelser = true;
	parsoidConfig.maxRequestsPerChild = 100;

	if ( process.env.ENV ) {
		const envName = (process.env.ENV + '').toLowerCase();

		if ( envName !== '' && envName !== 'dev' ) {
			parsoidConfig.defaultAPIProxyURI = 'http://mediawiki-prod:80/';
		} else {
			// PLATFORM-3727: make sure not to send API calls through Fastly in dev as well
			parsoidConfig.defaultAPIProxyURI = 'http://border.service.consul:80/';
		}
	}
};
