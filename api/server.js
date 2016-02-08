#!/usr/bin/env node
/**
 * Cluster-based Parsoid web service runner. Implements
 * https://www.mediawiki.org/wiki/Parsoid#The_Parsoid_web_API
 *
 * Local configuration:
 *
 * To configure locally, add localsettings.js to this directory and export a setup function.
 *
 * example:
 *	exports.setup = function( config, env ) {
 *		env.setInterwiki( 'localhost', 'http://localhost/wiki' );
 *	};
 *
 * Alternatively, specify a --config file explicitly. See --help for other
 * options.
 *
 * See https://www.mediawiki.org/wiki/Parsoid/Setup for more instructions.
 */
"use strict";
require('../lib/core-upgrade.js');

var cluster = require('cluster'),
	path = require('path'),
	util = require('util'),
	fs = require('fs'),
	semver = require('semver'),
	Promise = require('../lib/utils/promise.js');

// process arguments
var opts = require( "yargs" )
	.usage( "Usage: $0 [-h|-v] [--param[=val]]" )
	.default({
		// Start a few more workers than there are cpus visible to the OS,
		// so that we get some degree of parallelism even on single-core
		// systems. A single long-running request would otherwise hold up
		// all concurrent short requests.
		n: require( "os" ).cpus().length + 3,
		c: __dirname + '/localsettings.js',
		v: false,
		h: false
	})
	.boolean( [ "h", "v" ] )
	.alias( "h", "help" )
	.alias( "v", "version" )
	.alias( "c", "config" )
	.alias( "n", "num-workers" );

// Help
var argv = opts.argv;
if ( argv.h ) {
	opts.showHelp();
	process.exit( 0 );
}

// Version
var meta = require( path.join( __dirname, "../package.json" ) );
if ( argv.v ) {
	console.log( meta.name + " " + meta.version );
	process.exit( 0 );
}

var ParsoidService = require("./ParsoidService.js").ParsoidService,
	ParsoidConfig = require("../lib/mediawiki.ParsoidConfig").ParsoidConfig,
	Logger = require("../lib/Logger.js").Logger,
	PLogger = require("../lib/ParsoidLogger.js"),
	ParsoidLogger = PLogger.ParsoidLogger,
	ParsoidLogData = PLogger.ParsoidLogData;

// The global parsoid configuration object
var lsp = path.resolve( process.cwd(), argv.c ), localSettings;
try {
	localSettings = require( lsp );
} catch( e ) {
	console.error(
		"Cannot load local settings from %s. Please see: %s",
		lsp, path.join( __dirname, "localsettings.js.example" )
	);
	process.exit( 1 );
}

var parsoidConfig = new ParsoidConfig( localSettings, null );
var locationData = {
	process: {
		name: cluster.isMaster ? "master" : "worker",
		pid: process.pid
	},
	toString: function() {
		return util.format( "[%s][%s]", this.process.name, this.process.pid );
	}
};

// Setup process logger
var logger = new Logger();
logger._createLogData = function( logType, logObject ) {
	return new ParsoidLogData( logType, logObject, locationData );
};
logger._defaultBackend = ParsoidLogger.prototype._defaultBackend;
ParsoidLogger.prototype.registerLoggingBackends.call(
	logger, [ "fatal", "error", "warning", "info" ], parsoidConfig
);

// Workaround for https://github.com/nodejs/node/pull/3510
var fixClusterHandleLeak = function(worker) {
	if (semver.gte(process.version, '4.2.2')) { return; }
	var exitHandler = worker.process.listeners('exit')[0].listener;
	var disconnectHandler = worker.process.listeners('disconnect')[0].listener;
	worker.process.removeListener('exit', exitHandler);
	worker.process.once('exit', function() {
		if (worker.state !== 'disconnected') {
			disconnectHandler();
		}
		exitHandler.apply(this, arguments);
	});
};

var stopWorker = Promise.method(function(workerId) {
	var worker = cluster.workers[workerId];
	// ctrl-c sends SIGINT to all the workers, so make sure we haven't lost
	// the race.  In the disconnected state, `worker.disconnect()` throws
	// an error, "channel closed".
	if (worker.state === 'disconnected') { return; }
	var p = new Promise(function(resolve) {
		var timeout = setTimeout(function() {
			// https://nodejs.org/api/cluster.html#cluster_worker_kill_signal_sigterm
			// `worker.kill()` wants `worker.state === 'disconnected'`.
			// If that doesn't happen shortly, escalate!
			worker.process.kill('SIGKILL');
			resolve();
		}, 10 * 1000);
		worker.once('disconnect', function() {
			clearTimeout(timeout);
			worker.process.kill('SIGKILL');
			resolve();
		});
	});
	worker.disconnect();
	return p;
});

process.on('uncaughtException', function(err) {
	logger.log('fatal', 'uncaught exception', err);
});

if ( cluster.isMaster && argv.n > 0 ) {
	// Master

	var timeoutHandler;
	var timeouts = new Map();
	var spawn = function() {
		var worker = cluster.fork();
		fixClusterHandleLeak(worker);
		worker.on('message', timeoutHandler.bind(null, worker));
	};

	// Kill cpu hogs
	timeoutHandler = function(worker, msg) {
		if (msg.type === 'startup') {
			// relay startup messages to parent process
			if (process.send) { process.send(msg); }
		}
		if (msg.type !== "timeout") { return; }
		if (msg.done) {
			clearTimeout(timeouts.get(msg.timeoutId));
			timeouts.delete(msg.timeoutId);
		} else if (msg.timeout) {
			var pid = worker.process.pid;
			timeouts.set(msg.timeoutId, setTimeout(function() {
				timeouts.delete(msg.timeoutId);
				if (worker.id in cluster.workers) {
					logger.log("warning", util.format(
						"Cpu timeout fetching: %s; killing worker %s.",
						msg.location, pid
					));
					stopWorker(worker.id);
					spawn();
				}
			}, msg.timeout));
		}
	};

	// Fork workers
	logger.log("info", util.format("initializing %s workers", argv.n));
	for (var i = 0; i < argv.n; i++) {
		spawn();
	}

	var shuttingDown = false;

	cluster.on('exit', function(worker, code, signal) {
		if (!worker.suicide && !shuttingDown) {
			var pid = worker.process.pid;
			logger.log("warning", util.format("worker %s died (%s), restarting.", pid, signal || code));
			spawn();
		}
	});

	var shutdown_master = function() {
		shuttingDown = true;
		logger.log('info', 'shutting down, killing workers');
		Promise.map(Object.keys(cluster.workers), stopWorker).then(function() {
			logger.log('info', 'exiting');
			process.exit(0);
		}).done();
	};

	process.on('SIGINT', shutdown_master);
	process.on('SIGTERM', shutdown_master);

} else {
	// Worker

	var shutdown_worker = function () {
		logger.log( "warning", "shutting down" );
		process.exit(0);
	};

	process.on('SIGINT', shutdown_worker);
	process.on('SIGTERM', shutdown_worker);
	process.on('disconnect', shutdown_worker);

	// Enable heap dumps in /tmp on kill -USR2.
	// See https://github.com/bnoordhuis/node-heapdump/
	// For node 0.6/0.8: npm install heapdump@0.1.0
	// For 0.10: npm install heapdump
	process.on('SIGUSR2', function() {
		var heapdump = require('heapdump');
		logger.log( "warning", "SIGUSR2 received! Writing snapshot." );
		process.chdir('/tmp');
		heapdump.writeSnapshot();
	});

	var app = new ParsoidService( parsoidConfig, logger );

}
