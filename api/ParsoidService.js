/**
 * Simple Parsoid web service.
 */
"use strict";

require('../lib/core-upgrade.js');

// global includes
var bodyParser = require('body-parser');
var busboy = require('connect-busboy');
var compression = require('compression');
var express = require('express');
var favicon = require('serve-favicon');
var hbs = require('express-handlebars');
var cluster = require('cluster');
var	path = require('path');
var	util = require('util');
var	uuid = require('uuid/v4');


function ParsoidService( parsoidConfig, processLogger ) {
	processLogger.log( "info", "loading ..." );

	// Load routes
	var routes = require('./routes')( parsoidConfig );

	var app = express();

	// view engine
	var ve = hbs.create({
		defaultLayout: 'layout',
		layoutsDir: path.join(__dirname, '/views'),
		extname: '.html',
		helpers: {
			// block helper to reference js files in page head.
			jsFiles: function(options) {
				this.javascripts = options.fn(this);
			},
		},
	});
	app.set('views', path.join(__dirname, '/views'));
	app.set('view engine', 'html');
	app.engine('html', ve.engine);

	// serve static files
	app.use("/static", express.static(path.join(__dirname, "/static")));

	// favicon
	app.use(favicon(path.join(__dirname, "favicon.ico")));

	// Increase the form field size limit from the 2M default.
	app.use(bodyParser.json({ limit: 15 * 1024 * 1024 }));

	// Support gzip / deflate transfer-encoding
	app.use(compression());

	// application/x-www-form-urlencoded
	// multipart/form-data
	app.use(busboy({
		limits: {
			fields: 10,
			fieldSize: 15 * 1024 * 102,
		},
	}));

	app.use(function(req, res, next) {
		req.body = req.body || {};
		if (!req.busboy) {
			return next();
		}
		req.busboy.on('field', function(field, val) {
			req.body[field] = val;
		});
		req.busboy.on('finish', function() {
			next();
		});
		req.pipe(req.busboy);
	});

	// request ids
	var buf = new Buffer(16);
	app.use(function(req, res, next) {
		uuid(null, buf);
		res.locals.reqId = buf.toString('hex');
		next();
	});

	// Catch errors
	app.on('error', function( err ) {
		if ( err.errno === "EADDRINUSE" ) {
			processLogger.log( "error", util.format( "Port %d is already in use. Exiting.", port ) );
			cluster.worker.disconnect();
		} else {
			processLogger.log( "error", err );
		}
	});


	// Routes

	var i = routes.interParams,
		p = routes.parserEnvMw,
		v = routes.v2Middle;

	function re(str) { return new RegExp(str); }

	// Regexp that matches to all interwikis accepted by the API.
	var iwRe = parsoidConfig.interwikiRegexp;

	// SUS-3260: Support also non-urlencoded API URL as path parameter
	var urlRegexPatterns = ['https?%3[aA]%2[fF]%2[fF].*', 'https?://.*'];
	if (iwRe && iwRe.length) {
		urlRegexPatterns.push(iwRe);
	}
	var uriRe = urlRegexPatterns.join('|');

	app.get( '/', routes.home );
	app.get( '/_version', routes.version );
	app.get( '/robots.txt', routes.robots );

	app.get(  re('^/((?:_rt|_rtve)/)?(' + iwRe + '):(.*)$'), routes.redirectOldStyle );
	app.get(  re('^/_html/(?:(' + iwRe + ')/(.*))?'), i, p, routes.html2wtForm );
	app.get(  re('^/_wikitext/(?:(' + iwRe + ')/(.*))?'), i, p, routes.wt2htmlForm );
	app.get(  re('^/_rt/(?:(' + iwRe + ')/(.*))?'), i, p, routes.roundtripTesting );
	app.get(  re('^/_rtve/(' + iwRe + ')/(.*)'), i, p, routes.roundtripTestingNL );
	app.get(  re('^/_rtselser/(' + iwRe + ')/(.*)'), i, p, routes.roundtripSelser );
	app.get(  re('^/_rtform/(?:(' + iwRe + ')/(.*))?'), i, p, routes.get_rtForm );
	app.post( re('^/_rtform/(?:(' + iwRe + ')/(.*))?'), i, p, routes.post_rtForm );
	app.get(  re('^/(' + uriRe + ')/(.*)'), i, p, routes.get_article );
	app.post( re('^/(' + uriRe + ')/(.*)'), i, p, routes.post_article );

	// v2 API routes
	app.get(  '/v2/:domain/:format/:title/:revision?', v, p, routes.v2_get );
	app.post( '/v2/:domain/:format/:title?/:revision?', v, p, routes.v2_post );


	// Get host and port from the environment, if available
	// VCAP_APP_PORT is for appfog.com support
	var port = parsoidConfig.serverPort ||
		process.env.VCAP_APP_PORT || process.env.PORT || 8000;
	// default bind all
	var host = parsoidConfig.serverInterface || process.env.INTERFACE;

	app.listen( port, host, function() {
		processLogger.log( "info", util.format( "ready on %s:%s", host || "", port ) );
		if (process.send) {
			// let cluster master know we've started & are ready to go.
			process.send({ type: 'startup', host: host, port: port });
		}
	} );
}

module.exports = {
	ParsoidService: ParsoidService
};
