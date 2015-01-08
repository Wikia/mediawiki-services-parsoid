"use strict";

require('./core-upgrade.js');

// many concurrent connections to the same host
var Agent = require('./_http_agent.js').Agent,
	httpAgent = new Agent({
		connectTimeout: 5 * 1000,
		maxSockets: 50
	});
require('http').globalAgent = httpAgent;

var request = require('request'),
	qs = require('querystring'),
	events = require('events'),
	util = require('util'),
	url = require('url'),
	domino = require('domino');

// all revision properties which parsoid is interested in.
var PARSOID_RVPROP = ('content|ids|timestamp|user|userid|size|sha1|contentmodel|comment');

var userAgent = 'Parsoid/0.1';

/**
 * @class
 * @extends Error
 */
function DoesNotExistError( message ) {
	Error.captureStackTrace(this, DoesNotExistError);
	this.name = "DoesNotExistError";
	this.message = message || "Something doesn't exist";
	this.code = 404;
	this.stack = null;  // suppress stack
}
DoesNotExistError.prototype = Error.prototype;

/**
 * @class
 * @extends Error
 */
function ParserError( message ) {
	Error.captureStackTrace(this, ParserError);
	this.name = "ParserError";
	this.message = message || "Generic parser error";
	this.code = 500;
}
ParserError.prototype = Error.prototype;

/**
 * @class
 * @extends Error
 */
function AccessDeniedError( message ) {
	Error.captureStackTrace(this, AccessDeniedError);
	this.name = 'AccessDeniedError';
	this.message = message || 'Your wiki requires a logged-in account to access the API.';
	this.code = 401;
}
AccessDeniedError.prototype = Error.prototype;

/**
 *
 * Abstract API request base class
 *
 * @class
 * @extends EventEmitter
 *
 * @constructor
 * @param {MWParserEnvironment} env
 * @param {string} title The title of the page we should fetch from the API
 */
function ApiRequest( env, title ) {
	// call the EventEmitter constructor
	events.EventEmitter.call(this);

	// Increase the number of maximum listeners a bit..
	this.setMaxListeners( 50000 );

	this.retries = 8;
	this.env = env;
	this.title = title;
	this.queueKey = title;
	this.reqType = "Page Fetch";
}

// Inherit from EventEmitter
util.inherits(ApiRequest, events.EventEmitter);

ApiRequest.prototype.request = function( options, callback ) {
	var parsedUri;
	// this is a good place to put debugging statements
	// if you want to watch network requests.
	//console.log('ApiRequest', options);

	// Syncval for internal wiki
	if (
		this.env.conf.parsoid.syncval &&
		options.uri.indexOf( this.env.conf.parsoid.apiURI ) === 0
	) {
		parsedUri = url.parse( options.uri, true );
		parsedUri.query.syncval = this.env.conf.parsoid.syncval;
		// "query will only be used if search is absent." - http://nodejs.org/docs/latest/api/url.html
		delete parsedUri.search;
		options.uri = url.format( parsedUri );
		options.strictSSL = false;
	}

	return request( options, callback );
};

/**
 * @method
 * @private
 * @param {Error/null} error
 * @param {string} data wikitext / html / metadata
 */
ApiRequest.prototype._processListeners = function ( error, data ) {
	// Process only a few callbacks in each event loop iteration to
	// reduce memory usage.
	var self = this;

	var processSome = function () {
			// listeners() returns a copy (slice) of the listeners array in
			// 0.10. Get a new copy including new additions before processing
			// each batch.
		var listeners = self.listeners( 'src' ),
			// XXX: experiment a bit with the number of callbacks per
			// iteration!
			maxIters = Math.min(1, listeners.length);
		for ( var it = 0; it < maxIters; it++ ) {
			var nextListener = listeners.shift();

			// We only retrieve text/x-mediawiki source currently.
			// We expect these listeners to remove themselves when being
			// called - always add them with once().
			try {
				nextListener.call( self, error || null, data, 'text/x-mediawiki' );
			} catch(e) {
				return self.env.log("fatal", e);
			}
		}
		if ( listeners.length ) {
			setImmediate( processSome );
		}

	};

	setImmediate( processSome );
};

/**
 * @method
 * @private
 * @param {Error/null} error
 * @param {Object} response The API response object, with error code
 * @param {string} body The body of the response from the API
 */
ApiRequest.prototype._requestCB = function (error, response, body) {
	var self = this;

	if (error) {
		this.env.log('warning/api', 'Failed API request,', {
				"error": error,
				"status": response && response.statusCode,
				"retries-remaining": this.retries
			}
		);
		if ( this.retries ) {
			this.retries--;
			// retry
			this.request( this.requestOptions, this._requestCB.bind(this) );
			return;
		} else {
			var dnee = new Error( this.reqType + ' failure for '
					+ JSON.stringify(this.queueKey.substr(0, 80)) + ': ' + error );
			this._handleBody( dnee, '{}' );
		}
	} else if (response.statusCode === 200) {
		this._handleBody( null, body );
	} else {
		if (response.statusCode === 412) {
			this.env.log("info", "Cache MISS:", this.uri);
		} else {
			this.env.log("warning", "non-200 response:", response.statusCode, body);
		}
		error = new Error( this.reqType + ' failure for '
					+ JSON.stringify(this.queueKey.substr(0, 20)) + ': ' + response.statusCode );
		this._handleBody( error, '{}' );
	}

	// XXX: handle other status codes

	// Remove self from request queue
	delete this.env.requestQueue[this.queueKey];
};

/**
 * Default body handler: parse to JSON and call _handleJSON.
 *
 * @method
 * @private
 * @param {Error/null} error
 * @param {string} body The body of the response from the API
 */
ApiRequest.prototype._handleBody = function (error, body) {
	if ( error ) {
		this._handleJSON( error, {} );
		return;
	}
	var data;
	try {
		//console.warn( 'body: ' + body );
		data = JSON.parse( body );
	} catch(e) {
		error = new ParserError( 'Failed to parse the JSON response for ' +
				this.reqType );
	}
	this._handleJSON( error, data );
};

/**
 * @class
 * @extends ApiRequest
 *
 * Template fetch request helper class
 *
 * @constructor
 * @param {MWParserEnvironment} env
 * @param {string} title The template (or really, page) we should fetch from the wiki
 * @param {string} oldid The revision ID you want to get, defaults to "latest revision"
 */
function TemplateRequest( env, title, oldid ) {
	ApiRequest.call(this, env, title);

	this.queueKey = title;
	this.reqType = "Template Fetch";

	var apiargs = {
		format: 'json',
		action: 'query',
		prop: 'revisions',
		rvprop: PARSOID_RVPROP
	};

	if ( oldid ) {
		this.oldid = oldid;
		apiargs.revids = oldid;
	} else {
		apiargs.titles = title;
	}

	var uri = env.conf.wiki.apiURI + '?' + qs.stringify( apiargs );

	this.requestOptions = {
		method: 'GET',
		followRedirect: true,
		uri: uri,
		timeout: 40 * 1000, // 40 seconds
		proxy: env.conf.wiki.apiProxyURI,
		strictSSL: env.conf.parsoid.strictSSL,
		headers: {
			'User-Agent': userAgent,
			'Connection': 'close'
		}
	};

	if (env.cookie) {
		// Forward the cookie if set
		this.requestOptions.headers.Cookie = env.cookie;
	}

	// Start the request
	this.request( this.requestOptions, this._requestCB.bind(this) );
}

// Inherit from ApiRequest
util.inherits(TemplateRequest, ApiRequest);

/**
 * @method _handleJSON
 * @template
 * @private
 * @param {Error} error
 * @param {Object} data The response from the server - parsed JSON object
 */
TemplateRequest.prototype._handleJSON = function ( error, data ) {
	var regex, title, location, iwstr, interwiki, src = '';
	var metadata = { title: this.title };

	if ( !error && !data.query ) {
		error = new Error( "API response is missing query for: " + this.title );
	}

	if ( error ) {
		this._processListeners( error, null );
		return;
	}

	if ( data.query.normalized && data.query.normalized.length ) {
		// update title (ie, "foo_Bar" -> "Foo Bar")
		metadata.title = data.query.normalized[0].to;
	}

	if ( !data.query.pages ) {
		if ( data.query.interwiki ) {
			// Essentially redirect, but don't actually redirect.
			interwiki = data.query.interwiki[0];
			title = interwiki.title;
			regex = new RegExp( '^' + interwiki.iw + ':' );
			title = title.replace( regex, '' );
			iwstr = this.env.conf.wiki.interwikiMap.get(interwiki.iw).url ||
				this.env.conf.parsoid.interwikiMap.get(interwiki.iw).url ||
				'/' + interwiki.iw + '/' + '$1';
			location = iwstr.replace( '$1', title );
			error = new DoesNotExistError( 'The page at ' + this.title +
				' can be found at a different location: ' + location );
		} else {
			error = new DoesNotExistError(
				'No pages were returned from the API request for ' +
				this.title );
		}
	} else {
		// we've only requested one title (or oldid)
		// but we get a hash of pageids
		if ( !Object.keys(data.query.pages).some(function(pageid) {
			var page = data.query.pages[pageid];
			if ( !page || !page.revisions || !page.revisions.length ) {
				return false;
			}
			metadata.id = page.pageid;
			metadata.ns = page.ns;
			metadata.revision = page.revisions[0];
			// for redirect handling & cache
			src = metadata.revision['*'];
			return true;
		}) ) {
			error = new DoesNotExistError( 'Did not find page revisions for '
				+ this.title );
		}
	}

	if ( error ) {
		this._processListeners( error, null );
		return;
	}

	this.env.tp( 'Retrieved ' + this.title, metadata );

	// Add the source to the cache
	// (both original title as well as possible redirected title)
	this.env.pageCache[this.queueKey] = this.env.pageCache[this.title] = src;

	this._processListeners( null, metadata );
};

/**
 * @class
 * @extends ApiRequest
 *
 * Passes the source of a single preprocessor construct including its
 * parameters to action=expandtemplates
 *
 * @constructor
 * @param {MWParserEnvironment} env
 * @param {string} title The title of the page to use as the context
 * @param {string} text
 */
function PreprocessorRequest( env, title, text ) {
	ApiRequest.call(this, env, title);

	this.queueKey = text;
	this.text = text;
	this.reqType = "Template Expansion";

	var apiargs = {
		format: 'json',
		action: 'expandtemplates',
		prop: 'wikitext|categories',
		text: text
	};

	// the empty string is an invalid title
	// default value is: API
	if ( title ) {
		apiargs.title = title;
	}

	if ( env.page.meta.revision.revid ) {
		apiargs.revid = env.page.meta.revision.revid;
	}

	var uri = env.conf.wiki.apiURI;

	this.requestOptions = {
		// Use POST since we are passing a bit of source, and GET has a very
		// limited length. You'll be greeted by "HTTP Error 414 Request URI
		// too long" otherwise ;)
		method: 'POST',
		form: apiargs, // The API arguments
		followRedirect: true,
		uri: uri,
		timeout: 30 * 1000, // 30 seconds
		proxy: env.conf.wiki.apiProxyURI,
		strictSSL: env.conf.parsoid.strictSSL,
		headers: {
			'User-Agent': userAgent,
			'Connection': 'close'
		}
	};

	if (env.cookie) {
		// Forward the cookie if set
		this.requestOptions.headers.Cookie = env.cookie;
	}

	// Start the request
	this.request( this.requestOptions, this._requestCB.bind(this) );
}


// Inherit from ApiRequest
util.inherits( PreprocessorRequest, ApiRequest );

PreprocessorRequest.prototype._handleJSON = function ( error, data ) {
	if ( !error && !(data && data.expandtemplates) ) {
		error = new Error( util.format('Expanding template for %s: %s',
			this.title, this.text) );
	}

	if ( error ) {
		this.env.log( "error", error );
		this._processListeners( error, '' );
		return;
	}

	var src = '';
	if ( data.expandtemplates.wikitext !== undefined ) {
		src = data.expandtemplates.wikitext;
	} else if ( data.expandtemplates["*"] !== undefined ) {
		// For backwards compatibility. Older wikis still put the data here.
		src = data.expandtemplates["*"];
	}

	this.env.tp( 'Expanded ', this.text, src );

	// Add the categories which were added by parser functions directly
	// into the page and not as in-text links.
	if (data.expandtemplates.categories) {
		for (var i in data.expandtemplates.categories) {
			var category = data.expandtemplates.categories[i];
			src += '\n[[Category:' + category['*'];
			if (category.sortkey) {
				src += "|" + category.sortkey;
			}
			src += ']]';
		}
	}

	// Add the source to the cache
	this.env.pageCache[this.text] = src;

	this._processListeners( error, src );
};

/**
 * @class
 * @extends ApiRequest
 *
 * Gets the PHP parser to parse content for us.
 * Used for handling extension content right now.
 * And, probably magic words later on.
 *
 * @constructor
 * @param {MWParserEnvironment} env
 * @param {string} title The title of the page to use as context
 * @param {string} text
 */
function PHPParseRequest ( env, name, text ) {
	ApiRequest.call(this, env, name);

	this.text = text;
	this.queueKey = text;
	this.reqType = "Extension Parse";

	var apiargs = {
		format: 'json',
		action: 'parse',
		text: text,
		disablepp: 'true',
		contentmodel: 'wikitext',
		prop: 'text|modules|categories'
	};
	var uri = env.conf.wiki.apiURI;

	// Pass the page title to the API
	var title = env.page && env.page.title && env.page.title.key;
	if (title) {
		apiargs.title = title;
	}

	this.requestOptions = {
		// Use POST since we are passing a bit of source, and GET has a very
		// limited length. You'll be greeted by "HTTP Error 414 Request URI
		// too long" otherwise ;)
		method: 'POST',
		form: apiargs, // The API arguments
		followRedirect: true,
		uri: uri,
		timeout: 16 * 1000, // 16 seconds
		proxy: env.conf.wiki.apiProxyURI,
		strictSSL: env.conf.parsoid.strictSSL,
		headers: {
			'User-Agent': userAgent,
			'Connection': 'close'
		}
	};

	if (env.cookie) {
		// Forward the cookie if set
		this.requestOptions.headers.Cookie = env.cookie;
	}

	// Start the request
	this.request( this.requestOptions, this._requestCB.bind(this) );
}

// Inherit from ApiRequest
util.inherits( PHPParseRequest, ApiRequest );

var dummyDoc = domino.createDocument();
PHPParseRequest.prototype._handleJSON = function ( error, data ) {
	if ( !error && !(data && data.parse) ) {
		error = new Error( util.format('Parsing extension for %s: %s',
			this.title, this.text) );
	}

	if ( error ) {
		this.env.log( "error", error );
		this._processListeners( error, '' );
		return;
	}

	var parsedHtml = '';
	if ( data.parse.text['*'] !== undefined ) {
		parsedHtml = data.parse.text['*'];
	}

	// Strip two trailing newlines that action=parse adds after any
	// extension output
	parsedHtml = parsedHtml.replace(/\n\n$/, '');

	// Also strip a paragraph wrapper, if any
	parsedHtml = parsedHtml.replace(/(^<p>)|(<\/p>$)/g, '');

	// Add the modules to the page data
	var page = this.env.page;
	var setPageProperty = function(src, property) {
		if (src) {
			// This info comes back from the MW API when extension tags are parsed.
			// Since a page can have multiple extension tags, we can hit this code
			// multiple times and run into an already initialized set.
			if (!page[property]) {
				page[property] = new Set();
			}
			for (var i in src) {
				page[property].add(src[i]);
			}
		}
	};

	setPageProperty(data.parse.modules, "extensionModules");
	setPageProperty(data.parse.modulescripts, "extensionModuleScripts");
	setPageProperty(data.parse.modulestyles, "extensionModuleStyles");
	setPageProperty(data.parse.modulemessages, "extensionModuleMessages");

	// Add the categories which were added by extensions directly into the
	// page and not as in-text links
	if (data.parse.categories) {
		for (var i in data.parse.categories) {
			var category = data.parse.categories[i];

			var link = dummyDoc.createElement("link");
			link.setAttribute("rel", "mw:PageProp/Category");

			var href = this.env.page.relativeLinkPrefix + "Category:" + encodeURIComponent(category['*']);
			if ( category.sortkey ) {
				href += "#" + encodeURIComponent(category.sortkey);
			}
			link.setAttribute("href", href);

			parsedHtml += "\n" + link.outerHTML;
		}
	}

	// Add the source to the cache
	this.env.pageCache[this.text] = parsedHtml;

	this._processListeners( error, parsedHtml );
};

/**
 * @class
 * @extends ApiRequest
 *
 * Requests a cached parsed page from a Parsoid cache, but try to avoid
 * triggering re-parsing.
 *
 * @constructor
 * @param {MWParserEnvironment} env
 * @param {string} title The title of the page to use as context
 * @param {oldid} oldid The oldid to request
 */
function ParsoidCacheRequest ( env, title, oldid, options ) {
	ApiRequest.call(this, env, title);

	if (!options) {
		options = {};
	}

	this.oldid = oldid;
	this.queueKey = title + '?oldid=' + oldid;
	this.reqType = "Parsoid cache request";

	var apiargs = {
		oldid: oldid
	};
	var uri = env.conf.parsoid.parsoidCacheURI +
			encodeURIComponent(env.conf.wiki.iwp) + '/' + encodeURIComponent(title.replace(/ /g, '_')) +
			'?' + qs.stringify( apiargs );
	this.uri = uri;

	//console.warn('Cache request:', uri);


	this.retries = 0;
	this.requestOptions = {
		// Use GET so that our request is cacheable
		method: 'GET',
		followRedirect: false,
		uri: uri,
		timeout: 60 * 1000, // 60 seconds: less than 100s VE timeout so we still finish
		proxy: env.conf.parsoid.parsoidCacheProxy,
		strictSSL: env.conf.parsoid.strictSSL,
		headers: {
			'User-Agent': userAgent,
			'Connection': 'close',
			'x-parsoid-request': 'cache'
		}
	};

	if (env.cookie) {
		// Forward the cookie if set
		this.requestOptions.headers.Cookie = env.cookie;
	}

	if (options.evenIfNotCached) {
		// 60 seconds to query varnish + parse again if necessary
		// This is less than 100s VE timeout so we still finish
		this.requestOptions.timeout = 60 * 1000;
	} else {
		// Request a reply only from cache.
		// 10 second timeout is more than enough!
		this.requestOptions.timeout = 10 * 1000;
		this.requestOptions.headers['Cache-control'] = 'only-if-cached';
	}

	// Start the request
	this.request( this.requestOptions, this._requestCB.bind(this) );
}

// Inherit from ApiRequest
util.inherits( ParsoidCacheRequest, ApiRequest );

/**
 * Handle the HTML body
 */
ParsoidCacheRequest.prototype._handleBody = function ( error, body ) {
	if ( error ) {
		this._processListeners( error, '' );
		return;
	}

	//console.log( this.listeners('parsedHtml') );
	this._processListeners( error, body );
};

/**
 * @class
 * @extends ApiRequest
 *
 * A request for the wiki's configuration variables.
 *
 * @constructor
 * @param {string} apiURI The API URI to use for fetching
 * @param {MWParserEnvironment} env
 * @param {string} apiProxyURI (optional) The proxy URI to use for the
 * ConfigRequest
 */
var ConfigRequest = function ( apiURI, env, apiProxyURI ) {
	ApiRequest.call( this, env, null );
	this.queueKey = apiURI;

	var metas = [
			'siteinfo'
		],
		siprops = [
			'namespaces',
			'namespacealiases',
			'magicwords',
			'functionhooks',
			'extensiontags',
			'general',
			'interwikimap',
			'languages',
			'protocols'
		],
		apiargs = {
			format: 'json',
			action: 'query',
			meta: metas.join( '|' ),
			siprop: siprops.join( '|' )
		};

	if ( !apiURI ) {
		this._requestCB( new Error( 'There was no base URI for the API we tried to use.' ) );
		return;
	}

	this.requestOptions = {
		method: 'GET',
		followRedirect: true,
		uri: apiURI + '?' + qs.stringify( apiargs ),
		timeout: 40 * 1000,
		proxy: apiProxyURI,
		strictSSL: env.conf.parsoid.strictSSL,
		headers: {
			'User-Agent': userAgent,
			'Connection': 'close'
		}
	};

	if (env.cookie) {
		// Forward the cookie if set
		this.requestOptions.headers.Cookie = env.cookie;
	}


	this.request( this.requestOptions, this._requestCB.bind( this ) );
};

util.inherits( ConfigRequest, ApiRequest );

ConfigRequest.prototype._handleJSON = function ( error, data ) {
	if ( error ) {
		this._processListeners( error, {} );
		return;
	}

	if ( data && data.query ) {
		this._processListeners( null, data.query );
	} else if ( data && data.error ) {
		if ( data.error.code === 'readapidenied' ) {
			error = new AccessDeniedError();
		} else {
			error = new Error( 'Something happened on the API side. Message: ' + data.error.code + ': ' + data.error.info );
		}
		this._processListeners( error, {} );
	} else {
		this._processListeners( null, {} );
	}
};

/**
 * @class
 * @extends ApiRequest
 * @constructor
 * @param {MWParserEnvironment} env
 * @param {string} filename
 * @param @optional {Object} dims
 */
function ImageInfoRequest( env, filename, dims ) {
	ApiRequest.call( this, env, null );
	this.env = env;
	this.queueKey = filename + JSON.stringify( dims );

	var ix,
		conf = env.conf.wiki,
		uri = conf.apiURI + '?',
		filenames = [ filename ],
		imgnsid = conf.canonicalNamespaces.image,
		imgns = conf.namespaceNames[imgnsid],
		props = [
			'mediatype',
			'size',
			'url',
			'user'
		];

	this.ns = imgns;

	for ( ix = 0; ix < filenames.length; ix++ ) {
		filenames[ix] = imgns + ':' + filenames[ix];
	}

	var apiArgs = {
		action: 'query',
		format: 'json',
		prop: 'imageinfo',
		titles: filenames.join( '|' ),
		iiprop: props.join( '|' )
	};

	if ( dims ) {
		if ( dims.width ) {
			apiArgs.iiurlwidth = dims.width;
		}
		if ( dims.height ) {
			apiArgs.iiurlheight = dims.height;
		}
	}

	uri += qs.stringify( apiArgs );

	this.requestOptions = {
		method: 'GET',
		followRedirect: true,
		uri: uri,
		timeout: 40 * 1000,
		proxy: env.conf.wiki.apiProxyURI,
		headers: {
			'User-Agent': userAgent,
			'Connection': 'close'
		}
	};
	if (env.cookie) {
		// Forward the cookie if set
		this.requestOptions.headers.Cookie = env.cookie;
	}

	this.request( this.requestOptions, this._requestCB.bind( this ) );
}

util.inherits( ImageInfoRequest, ApiRequest );

ImageInfoRequest.prototype._handleJSON = function ( error, data ) {
	var pagenames, names, namelist, newpages, pages, pagelist, ix;

	if ( error ) {
		this._processListeners( error, { imgns: this.ns } );
		return;
	}

	if ( data && data.query ) {
		// The API indexes its response by page ID. That's stupid.
		newpages = {};
		pagenames = {};
		pages = data.query.pages;
		names = data.query.normalized;
		pagelist = Object.keys( pages );

		if ( names ) {
			for ( ix = 0; ix < names.length; ix++ ) {
				pagenames[names[ix].to] = names[ix].from;
			}
		}

		for ( ix = 0; ix < pagelist.length; ix++ ) {
			if ( pagenames[pages[pagelist[ix]].title] ) {
				newpages[pagenames[pages[pagelist[ix]].title]] = pages[pagelist[ix]];
			}
			newpages[pages[pagelist[ix]].title] = pages[pagelist[ix]];
		}

		data.query.pages = newpages;
		data.query.imgns = this.ns;
		this.env.pageCache[ this.queueKey ] = data.query;
		this._processListeners( null, data.query );
	} else if ( data && data.error ) {
		if ( data.error.code === 'readapidenied' ) {
			error = new AccessDeniedError();
		} else {
			error = new Error( 'Something happened on the API side. Message: ' + data.error.code + ': ' + data.error.info );
		}
		this._processListeners( error, {} );
	} else {
		this._processListeners( null, {} );
	}
};

if (typeof module === "object") {
	module.exports.ConfigRequest = ConfigRequest;
	module.exports.TemplateRequest = TemplateRequest;
	module.exports.PreprocessorRequest= PreprocessorRequest;
	module.exports.PHPParseRequest = PHPParseRequest;
	module.exports.ParsoidCacheRequest = ParsoidCacheRequest;
	module.exports.ImageInfoRequest = ImageInfoRequest;
	module.exports.DoesNotExistError = DoesNotExistError;
	module.exports.ParserError = ParserError;
}
