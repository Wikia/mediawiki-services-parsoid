"use strict";
require( '../lib/core-upgrade.js' );

var path = require('path'),
	url = require('url'),
	child_process = require('child_process'),
	cluster = require('cluster'),
	domino = require('domino'),
	pkg = require('../package.json'),
	apiUtils = require('./utils'),
	semver = require('semver');


// relative includes
var mp = '../lib/';

var MWParserEnv = require( mp + 'mediawiki.parser.environment.js' ).MWParserEnvironment,
	WikitextSerializer = require( mp + 'mediawiki.WikitextSerializer.js' ).WikitextSerializer,
	SelectiveSerializer = require( mp + 'mediawiki.SelectiveSerializer.js' ).SelectiveSerializer,
	LogData = require( mp + 'LogData.js' ).LogData,
	DU = require( mp + 'mediawiki.DOMUtils.js' ).DOMUtils,
	ApiRequest = require( mp + 'mediawiki.ApiRequest.js' ),
	Diff = require( mp + 'mediawiki.Diff.js' ).Diff;

var ParsoidCacheRequest = ApiRequest.ParsoidCacheRequest,
	TemplateRequest = ApiRequest.TemplateRequest;

module.exports = function( parsoidConfig ) {

var routes = {};


/**
 * Timeouts
 *
 * The request timeout is a simple node timer that should fire first and catch
 * most cases where we have long running requests to optimize.
 *
 * The CPU timeout handles the case where a child process is starved in a CPU
 * bound task for too long and doesn't give node a chance to fire the above
 * timer. At the beginning of each request, the child sends a message to the
 * cluster master containing a request id. If the master doesn't get a second
 * message from the child with the corresponding id by CPU_TIMEOUT, it will
 * send the SIGKILL signal to the child process.
 *
 * The above is susceptible false positives. Node spins one event loop, so
 * multiple asynchronous requests will interfere with each others' timing.
 *
 * The CPU timeout is set to match the Varnish request timeout at 5 minutes.
 */

// Should be less than the CPU_TIMEOUT
var REQ_TIMEOUT = 4 * 60 * 1000;  // 4 minutes
function timeoutResp( env, err ) {
	if ( err instanceof Promise.TimeoutError ) {
		err = new Error("Request timed out.");
		err.stack = null;
	}
	env.log("fatal/request", err);
}

var CPU_TIMEOUT = 5 * 60 * 1000;  // 5 minutes
var makeDone = function( reqId ) {
	// Create this function in an outer scope so that we don't inadvertently
	// keep a reference to the promise here.
	return function() {
		process.send({ type: "timeout", done: true, reqId: reqId });
	};
};

// Cluster support was very experimental and missing methods in v0.8.x
var sufficientNodeVersion = semver.gte(process.version, '0.10.0');

var cpuTimeout = function( p, res ) {
	var reqId = res.locals.reqId;
	return new Promise(function( resolve, reject ) {
		if ( cluster.isMaster || !sufficientNodeVersion ) {
			return p.then( resolve, reject );
		}

		process.send({ type: "timeout", timeout: CPU_TIMEOUT, reqId: reqId });
		var done = makeDone( reqId );
		p.then( done, done );
		p.then( resolve, reject );
	});
};

// Helpers

var promiseTemplateReq = function( env, target, oldid ) {
	return new Promise(function( resolve, reject ) {
		var tpr = new TemplateRequest( env, target, oldid );
		tpr.once('src', function( err, src_and_metadata ) {
			if ( err ) {
				reject( err );
			} else {
				env.setPageSrcInfo( src_and_metadata );
				resolve();
			}
		});
	});
};

var rtResponse = function( env, req, res, data ) {
	apiUtils.setHeader( res, env, 'X-Parsoid-Performance', env.getPerformanceHeader() );
	apiUtils.renderResponse( res, env, "roundtrip", data );
	env.log( "info", "completed parsing in", env.performance.duration, "ms" );
};

var roundTripDiff = function( env, req, res, selser, doc ) {
	var out = [];

	// Re-parse the HTML to uncover foster-parenting issues
	doc = domino.createDocument( doc.outerHTML );

	var Serializer = selser ? SelectiveSerializer : WikitextSerializer,
		serializer = new Serializer({ env: env });

	return Promise.promisify( serializer.serializeDOM, false, serializer )(
		doc.body, function( chunk ) { out.push(chunk); }, false
	).then(function() {
		var i;
		out = out.join('');

		// Strip selser trigger comment
		out = out.replace(/<!--rtSelserEditTestComment-->\n*$/, '');

		// Emit base href so all relative urls resolve properly
		var hNodes = doc.body.firstChild.childNodes;
		var headNodes = "";
		for (i = 0; i < hNodes.length; i++) {
			if (hNodes[i].nodeName.toLowerCase() === 'base') {
				headNodes += DU.serializeNode(hNodes[i]);
				break;
			}
		}

		var bNodes = doc.body.childNodes;
		var bodyNodes = "";
		for (i = 0; i < bNodes.length; i++) {
			bodyNodes += DU.serializeNode(bNodes[i]);
		}

		var htmlSpeChars = apiUtils.htmlSpecialChars(out);

		var src = env.page.src.replace(/\n(?=\n)/g, '\n ');
		out = out.replace(/\n(?=\n)/g, '\n ');

		var patch = Diff.convertChangesToXML( Diff.diffLines(src, out) );

		return {
			headers: headNodes,
			bodyNodes: bodyNodes,
			htmlSpeChars: htmlSpeChars,
			patch: patch,
			reqUrl: req.url
		};
	});
};

var parse = function( env, req, res ) {
	env.log('info', 'started parsing');

	var meta = env.page.meta;
	var v2 = res.locals.v2;
	var p = Promise.resolve();

	// See if we can reuse transclusion or extension expansions.
	if ( v2 && ( v2.previous || v2.original ) ) {
		p = p.then(function() {
			var revision = v2.previous || v2.original;
			var doc = DU.parseHTML( revision.html.body );
			DU.applyDataParsoid( doc, revision["data-parsoid"].body );
			var ret = {
				expansions: DU.extractExpansions( doc )
			};
			if ( v2.update ) {
				["templates", "files"].some(function(m) {
					if ( v2.update[m] ) {
						ret.mode = m;
						return true;
					}
				});
			}
			return ret;
		});
	// And don't parse twice for recursive parsoid requests.
	} else if ( env.conf.parsoid.parsoidCacheURI && !req.headers['x-parsoid-request'] ) {
		p = p.then(function() {
			// Try to retrieve a cached copy of the content.
			var parsoidHeader = JSON.parse( req.headers['x-parsoid'] || '{}' );
			return new Promise(function( resolve, reject ) {
				// If a cacheID is passed in X-Parsoid (from our PHP extension),
				// use that explicitly. Otherwise default to the parentID.
				var cacheID = parsoidHeader.cacheID || meta.revision.parentid;
				var cacheRequest = new ParsoidCacheRequest( env, meta.title, cacheID );
				cacheRequest.once('src', function( err, src ) {
					if ( err ) {
						// No luck with the cache request.
						return resolve( null );
					}
					// Extract transclusion and extension content from the DOM
					var ret = {
						expansions: DU.extractExpansions( DU.parseHTML(src) )
					};
					if ( parsoidHeader.cacheID ) {
						ret.mode = parsoidHeader.mode;
					}
					resolve( ret );
				});
			});
		});
	}

	return p.then(function( ret ) {
		if ( ret ) {
			// Figure out what we can reuse
			switch( ret.mode ) {
			case "templates":
				// Transclusions need to be updated, so don't reuse them.
				ret.expansions.transclusions = {};
				break;
			case "files":
				// Files need to be updated, so don't reuse them.
				ret.expansions.files = {};
				break;
			}
		}
		return env.pipelineFactory.parse( env, env.page.src, ret && ret.expansions );
	});
};

var html2wt = function( req, res, html ) {
	var env = res.locals.env;
	var v2 = res.locals.v2;

	if ( req.body.oldwt ) {
		env.setPageSrcInfo( req.body.oldwt );
		env.page.id = null;
	} else {
		env.page.id = res.locals.oldid;
	}

	env.log('info', 'started serializing');

	if ( env.conf.parsoid.allowCORS ) {
		// allow cross-domain requests (CORS) so that parsoid service
		// can be used by third-party sites
		apiUtils.setHeader(res, env, 'Access-Control-Allow-Origin',
						   env.conf.parsoid.allowCORS );
	}

	var out = [];
	var p = new Promise(function( resolve, reject ) {
		if ( v2 && v2.original && v2.original.wikitext ) {
			env.setPageSrcInfo( v2.original.wikitext.body );
			return resolve();
		} else if ( !env.conf.parsoid.fetchWT ) {
			return resolve();
		}
		var target = env.resolveTitle( env.normalizeTitle(env.page.name), '' );
		var tpr = new TemplateRequest( env, target, env.page.id );
		tpr.once('src', function( err, src_and_metadata ) {
			if ( err ) {
				env.log("error", "There was an error fetching " +
						"the original wikitext for ", target, err);
			} else {
				env.setPageSrcInfo( src_and_metadata );
			}
			resolve();
		});
	}).then(function() {
		var doc = DU.parseHTML( html.replace(/\r/g, '') ),
			Serializer = parsoidConfig.useSelser ? SelectiveSerializer : WikitextSerializer,
			serializer = new Serializer({ env: env, oldid: env.page.id });
		if ( v2 && v2["data-parsoid"] ) {
			DU.applyDataParsoid( doc, v2["data-parsoid"].body );
		}
		if ( v2 && v2.original && v2.original.html ) {
			env.page.dom = DU.parseHTML( v2.original.html.body );
			DU.applyDataParsoid( env.page.dom, v2.original["data-parsoid"].body );
		}
		return Promise.promisify( serializer.serializeDOM, false, serializer )(
			doc.body, function( chunk ) { out.push( chunk ); }, false
		);
	}).timeout( REQ_TIMEOUT ).then(function() {
		apiUtils.setHeader(res, env, 'X-Parsoid-Performance', env.getPerformanceHeader());
		if ( v2 ) {
			apiUtils.jsonResponse(res, env, {
				wikitext: {
					headers: {
						// FIXME: get this from somewhere else
						'content-type': 'text/plain;profile=mediawiki.org/specs/wikitext/1.0.0'
					},
					body: out.join('')
				}
			});
		} else {
			apiUtils.setHeader(res, env, 'Content-Type', 'text/x-mediawiki; charset=UTF-8');
			apiUtils.endResponse(res, env, out.join(''));
		}
		env.log("info", "completed serializing in", env.performance.duration, "ms");
	});
	return cpuTimeout( p, res )
		.catch( timeoutResp.bind(null, env) );
};

var wt2html = function( req, res, wt ) {
	var env = res.locals.env,
		prefix = res.locals.iwp,
		oldid = res.locals.oldid,
		v2 = res.locals.v2,
		target = env.resolveTitle( env.normalizeTitle( env.page.name ), '' );

	if ( wt ) {
		wt = wt.replace(/\r/g, '');
	}

	if ( env.conf.parsoid.allowCORS ) {
		// allow cross-domain requests (CORS) so that parsoid service
		// can be used by third-party sites
		apiUtils.setHeader( res, env, 'Access-Control-Allow-Origin',
							env.conf.parsoid.allowCORS );
	}

	function sendRes(doc) {
		apiUtils.setHeader(res, env, 'X-Parsoid-Performance', env.getPerformanceHeader());
		if ( v2 && v2.format === "pagebundle" ) {
			var dp = doc.getElementById('mw-data-parsoid');
			dp.parentNode.removeChild(dp);
			apiUtils.jsonResponse(res, env, {
				// revid: 12345 (maybe?),
				html: {
					headers: {
						// FIXME: get this from somewhere else
						'content-type': 'text/html;profile=mediawiki.org/specs/html/1.0.0'
					},
					body: DU.serializeNode( res.locals.body ? doc.body : doc )
				},
				"data-parsoid": {
					headers: {
						'content-type': 'application/json;profile=mediawiki.org/specs/data-parsoid/0.0.1'
					},
					body: JSON.parse(dp.text)
				}
			});
		} else {
			apiUtils.setHeader(res, env, 'Content-Type', 'text/html; charset=UTF-8');
			apiUtils.endResponse(res, env,  DU.serializeNode( res.locals.body ? doc.body : doc ));
		}
		env.log("info", "completed parsing in", env.performance.duration, "ms");
	}

	function parseWt() {
		env.log('info', 'started parsing');
		if ( !res.locals.pageName ) {
			// clear default page name
			env.page.name = '';
		}
		return new Promise(function( resolve, reject ) {
			var parser = env.pipelineFactory.getPipeline('text/x-mediawiki/full');
			parser.once('document', function( doc ) {
				// Don't cache requests when wt is set in case somebody uses
				// GET for wikitext parsing
				apiUtils.setHeader(res, env, 'Cache-Control', 'private,no-cache,s-maxage=0');
				resolve( doc );
			});
			parser.processToplevelDoc( wt );
		});
	}

	function parsePageWithOldid() {
		return parse( env, req, res ).then(function( doc ) {
			if ( req.headers.cookie || v2 ) {
				// Don't cache requests with a session.
				// Also don't cache requests to the v2 entry point, as those
				// are stored by RESTBase & will just dilute the Varnish cache
				// in the meantime.
				apiUtils.setHeader(res, env, 'Cache-Control', 'private,no-cache,s-maxage=0');
			} else {
				apiUtils.setHeader(res, env, 'Cache-Control', 's-maxage=2592000');
			}
			// Indicate the MediaWiki revision in a header as well for
			// ease of extraction in clients.
			apiUtils.setHeader(res, env, 'content-revision-id', oldid);
			return doc;
		});
	}

	function redirectToOldid() {
		// Don't cache requests with no oldid
		apiUtils.setHeader(res, env, 'Cache-Control', 'private,no-cache,s-maxage=0');

		oldid = env.page.meta.revision.revid;
		env.log("info", "redirecting to revision", oldid);

		var path;
		if ( v2 ) {
			path = [
				"/v2",
				url.parse( env.conf.parsoid.interwikiMap.get( prefix ) ).host,
				v2.format,
				encodeURIComponent( target ),
				oldid
			].join("/");
		} else {
			// SUS-3260 Wikia change use fully relative redirect
			path = [
				"?oldid=" + oldid
			].join("/");
		}

		// Redirect to oldid
		apiUtils.relativeRedirect({ "path": path, "res": res, "env": env });
	}

	var p;
	if ( wt && (!res.locals.pageName || !oldid) ) {
		// don't fetch the page source
		env.setPageSrcInfo( wt );
		p = Promise.resolve();
	} else {
		p = promiseTemplateReq( env, target, oldid );
	}

	if ( wt ) {
		p = p.then( parseWt )
			.timeout( REQ_TIMEOUT )
			.then(sendRes);
	} else if ( oldid ) {
		p = p.then( parsePageWithOldid )
			.timeout( REQ_TIMEOUT )
			.then(sendRes);
	} else {
		p = p.then( redirectToOldid );
	}

	return cpuTimeout( p, res )
		.catch( timeoutResp.bind(null, env) );
};


// Middlewares

routes.interParams = function( req, res, next ) {
	if ( req.params[0].match(/https?:\/\//) ) {
		// Route requests from staging environments to the appropriate MediaWiki deployment
		const envMatch = /^.*\.(verify|preview|sandbox[^\.]*)\.(fandom\.com|wikia\.(com|org))/.exec(req.params[0]);
		let envSpecificProxy;
		if ( envMatch ) {
			envSpecificProxy = ['verify', 'preview'].includes(envMatch[1]) ?
				`http://mediawiki-${envMatch[1]}-ucp:80` :
				`http://mediawiki-${envMatch[1]}:80`;
		}
		parsoidConfig.setInterwiki( req.params[0], req.params[0], envSpecificProxy );
		res.locals.iwp = req.params[0] ;
	} else {
		res.locals.iwp = req.params[0] || parsoidConfig.defaultWiki || '';
	}
	res.locals.pageName = req.params[1] || '';
	res.locals.oldid = req.body.oldid || req.query.oldid || null;
	// "body" flag to return just the body (instead of the entire HTML doc)
	res.locals.body = req.query.body || req.body.body;
	next();
};

routes.parserEnvMw = function( req, res, next ) {
	function errBack( env, logData, callback ) {
		if ( !env.responseSent ) {
			return new Promise(function( resolve, reject ) {
				apiUtils.setHeader( res, env, 'Content-Type', 'text/plain; charset=UTF-8' );
				apiUtils.sendResponse( res, env, logData.fullMsg(), logData.flatLogObject().code || 500 );
				res.on( 'finish', resolve );
			}).catch(function(e) {
				console.error( e.stack || e );
				res.end( e.stack || e );
			}).nodify(callback);
		}
		return Promise.resolve().nodify(callback);
	}
	MWParserEnv.getParserEnv(parsoidConfig, null, {
		prefix: res.locals.iwp,
		pageName: res.locals.pageName,
		cookie: req.headers.cookie
	}).then(function( env ) {
		env.logger.registerBackend(/fatal(\/.*)?/, errBack.bind(this, env));
		if ( res.locals.v2 && res.locals.v2.format === "pagebundle" ) {
			env.storeDataParsoid = true;
		}
		res.locals.env = env;
		next();
	}).catch(function( err ) {
		// Workaround how logdata flatten works so that the error object is
		// recursively flattened and a stack trace generated for this.
		errBack( {}, new LogData("error", [ "error:", err, "path:", req.path ]) );
	});
};

// Routes

routes.home = function( req, res ) {
	res.render('home');
};

// robots.txt: no indexing.
routes.robots = function ( req, res ) {
	res.end("User-agent: *\nDisallow: /\n");
};

// Return Parsoid version based on package.json + git sha1 if available
var versionCache;
routes.version = function( req, res ) {
	if ( !versionCache ) {
		versionCache = Promise.resolve({
			name: pkg.name,
			version: pkg.version
		}).then(function( v ) {
			return Promise.promisify(
				child_process.execFile, ['stdout', 'stderr'], child_process
			)( 'git', ['rev-parse','HEAD'], {
				cwd: path.join(__dirname, '..')
			}).then(function( out ) {
				v.sha = out.stdout.slice(0, -1);
				return v;
			}, function( err ) {
				/* ignore the error, maybe this isn't a git checkout */
				return v;
			});
		});
	}
	return versionCache.then(function( v ) {
		res.json( v );
	});
};

// Redirects for old-style URL compatibility
routes.redirectOldStyle = function( req, res ) {
	if ( req.params[0] ) {
		apiUtils.relativeRedirect({
			"path" : '/' + req.params[0] + req.params[1] + '/' + req.params[2],
			"res" : res,
			"code" : 301
		});
	} else {
		apiUtils.relativeRedirect({
			"path" : '/' + req.params[1] + '/' + req.params[2],
			"res" : res,
			"code": 301
		});
	}
	res.end();
};

// Form-based HTML DOM -> wikitext interface for manual testing
routes.html2wtForm = function( req, res ) {
	var env = res.locals.env;
	apiUtils.renderResponse(res, env, "form", {
		title: "Your HTML DOM:",
		action: "/" + res.locals.iwp + "/" + res.locals.pageName,
		name: "html"
	});
};

// Form-based wikitext -> HTML DOM interface for manual testing
routes.wt2htmlForm = function( req, res ) {
	var env = res.locals.env;
	apiUtils.renderResponse(res, env, "form", {
		title: "Your wikitext:",
		action: "/" + res.locals.iwp + "/" + res.locals.pageName,
		name: "wt"
	});
};

// Round-trip article testing
routes.roundtripTesting = function( req, res ) {
	var env = res.locals.env;
	var target = env.resolveTitle( env.normalizeTitle( env.page.name ), '' );

	var oldid = null;
	if ( req.query.oldid ) {
		oldid = req.query.oldid;
	}

	var p = promiseTemplateReq( env, target, oldid ).then(
		parse.bind( null, env, req, res )
	).then(
		roundTripDiff.bind( null, env, req, res, false )
	).timeout( REQ_TIMEOUT ).then(
		rtResponse.bind( null, env, req, res )
	);

	cpuTimeout( p, res )
		.catch( timeoutResp.bind(null, env) );
};

// Round-trip article testing with newline stripping for editor-created HTML
// simulation
routes.roundtripTestingNL = function( req, res ) {
	var env = res.locals.env;
	var target = env.resolveTitle( env.normalizeTitle( env.page.name ), '' );

	var oldid = null;
	if ( req.query.oldid ) {
		oldid = req.query.oldid;
	}

	var p = promiseTemplateReq( env, target, oldid ).then(
		parse.bind( null, env, req, res )
	).then(function( doc ) {
		// strip newlines from the html
		var html = doc.innerHTML.replace(/[\r\n]/g, '');
		return roundTripDiff( env, req, res, false, DU.parseHTML(html) );
	}).timeout( REQ_TIMEOUT ).then(
		rtResponse.bind( null, env, req, res )
	);

	cpuTimeout( p, res )
		.catch( timeoutResp.bind(null, env) );
};

// Round-trip article testing with selser over re-parsed HTML.
routes.roundtripSelser = function( req, res ) {
	var env = res.locals.env;
	var target = env.resolveTitle( env.normalizeTitle( env.page.name ), '' );

	var oldid = null;
	if ( req.query.oldid ) {
		oldid = req.query.oldid;
	}

	var p = promiseTemplateReq( env, target, oldid ).then(
		parse.bind( null, env, req, res )
	).then(function( doc ) {
		doc = DU.parseHTML( DU.serializeNode(doc) );
		var comment = doc.createComment('rtSelserEditTestComment');
		doc.body.appendChild(comment);
		return roundTripDiff( env, req, res, true, doc );
	}).timeout( REQ_TIMEOUT ).then(
		rtResponse.bind( null, env, req, res )
	);

	cpuTimeout( p, res )
		.catch( timeoutResp.bind(null, env) );
};

// Form-based round-tripping for manual testing
routes.get_rtForm = function( req, res ) {
	var env = res.locals.env;
	apiUtils.renderResponse(res, env, "form", {
		title: "Your wikitext:",
		action: "/_rtform/" + res.locals.pageName,
		name: "content"
	});
};

// Form-based round-tripping for manual testing
routes.post_rtForm = function( req, res ) {
	var env = res.locals.env;
	// we don't care about \r, and normalize everything to \n
	env.setPageSrcInfo({
		revision: { '*': req.body.content.replace(/\r/g, '') }
	});
	parse( env, req, res ).then(
		roundTripDiff.bind( null, env, req, res, false )
	).then(
		rtResponse.bind( null, env, req, res )
	).catch(function(err) {
		env.log("fatal/request", err);
	});
};

routes.get_article = function( req, res ) {
	// Regular article parsing
	wt2html( req, res );
};

routes.post_article = function( req, res ) {
	var body = req.body;
	if ( req.body.wt ) {
		// Form-based article parsing
		wt2html( req, res, body.wt );
	} else {
		// Regular and form-based article serialization
		html2wt( req, res, body.html || body.content || '' );
	}
};


// v2 Middleware

var wt2htmlFormats = new Set([ "pagebundle", "html" ]);
var supportedFormats = new Set([ "pagebundle", "html", "wt" ]);

routes.v2Middle = function( req, res, next ) {
	function errOut( err, code ) {
		// FIXME: provide more consistent error handling.
		apiUtils.sendResponse( res, {}, err, code || 404 );
	}

	var iwp = parsoidConfig.reverseIWMap.get( req.params.domain );
	if ( !iwp ) {
		return errOut("Invalid domain.");
	}

	res.locals.iwp = iwp;
	res.locals.pageName = req.params.title || '';
	res.locals.oldid = req.params.revision || null;

	var v2 = Object.assign({ format: req.params.format }, req.body);

	if ( !supportedFormats.has( v2.format ) ||
		 ( req.method === "GET" && !wt2htmlFormats.has( v2.format ) ) ) {
		return errOut("Invalid format.");
	}

	if ( req.method === "POST" ) {
		var original = v2.original || {};
		if ( original.revid ) {
			res.locals.oldid = original.revid;
		}
		if ( original.title ) {
			res.locals.pageName = original.title;
		}
	}

	res.locals.v2 = v2;
	next();
};


// v2 Routes

// Spec'd in https://phabricator.wikimedia.org/T75955 and the API tests.

// GET requests
routes.v2_get = function( req, res ) {
	wt2html( req, res );
};

// POST requests
routes.v2_post = function( req, res ) {
	var v2 = res.locals.v2;

	function errOut( err, code ) {
		apiUtils.sendResponse( res, res.locals.env, err, code || 404 );
	}

	if ( wt2htmlFormats.has( v2.format ) ) {
		// Accept wikitext as a string or object{body,headers}
		var wikitext = (v2.wikitext && typeof v2.wikitext !== "string") ?
			v2.wikitext.body : v2.wikitext;
		if ( !wikitext ) {
			if ( !res.locals.pageName ) {
				return errOut( "No title or wikitext was provided.", 400 );
			}
			// We've been given source for this page
			if ( v2.original && v2.original.wikitext ) {
				wikitext = v2.original.wikitext.body;
			}
		}
		wt2html( req, res, wikitext );
	} else {
		// html is required for serialization
		if ( v2.html === undefined ) {
			return errOut( "No html was supplied.", 400 );
		}
		// Accept html as a string or object{body,headers}
		var html = (typeof v2.html === "string") ? v2.html : v2.html.body;
		html2wt( req, res, html );
	}
};


return routes;

};
