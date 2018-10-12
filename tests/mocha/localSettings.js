/* global require, describe, before, beforeEach, it, process, after */
require('chai').should();

const setup = require('../../api/localsettings').setup;

describe('Dynamic local settings', function () {
	var oldEnv, parsoidConfig;

	before(function () {
		oldEnv = process.env.ENV;
	});

	beforeEach(function () {
		parsoidConfig = {};
	});

	it('does not define cache properties if env is not set', function () {
		process.env.ENV = '';

		setup(parsoidConfig);

		parsoidConfig.should.not.have.property('parsoidCacheURI');
		parsoidConfig.should.not.have.property('parsoidCacheProxy');
		parsoidConfig.should.not.have.property('defaultAPIProxyURI');
	});


	var devTestCases = [ 'dev', 'DEV', 'dEV' ];
	devTestCases.forEach(function (envName) {
		it(`does not define cache properties if env = ${envName}`, function () {
			process.env.ENV = envName;

			setup(parsoidConfig);

			parsoidConfig.should.not.have.property('parsoidCacheURI');
			parsoidConfig.should.not.have.property('parsoidCacheProxy');
		});
	});

	var nonDevTestCases = [ 'prod', 'staging' ];
	nonDevTestCases.forEach(function (envName) {
		it(`defines cache properties if env = ${envName}`, function () {
			process.env.ENV = envName;

			setup(parsoidConfig);

			parsoidConfig.should.have.property('parsoidCacheURI', `http://${envName}.parsoid-cache/`);
			parsoidConfig.should.have.property('parsoidCacheProxy', `http://${envName}.icache.service.consul:80/`);
			parsoidConfig.should.have.property('defaultAPIProxyURI', `http://${envName}.icache.service.consul:80/`);
		});
	});

	after(function () {
		process.env.ENV = oldEnv;
	});
});
