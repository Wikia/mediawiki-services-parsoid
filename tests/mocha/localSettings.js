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

		parsoidConfig.should.not.have.property('defaultAPIProxyURI');
	});


	var devTestCases = [ 'dev', 'DEV', 'dEV' ];
	devTestCases.forEach(function (envName) {
		it(`defines cache property if env = ${envName}`, function () {
			process.env.ENV = envName;

			setup(parsoidConfig);

			parsoidConfig.should.have.property('defaultAPIProxyURI', 'http://border.service.consul:80/');
		});
	});


	it('defines cache property if env = prod', function () {
		process.env.ENV = 'prod';

		setup(parsoidConfig);

		parsoidConfig.should.have.property('defaultAPIProxyURI', 'http://mediawiki-prod-ucp:80/');
	});

	after(function () {
		process.env.ENV = oldEnv;
	});
});
