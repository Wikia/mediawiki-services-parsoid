/* Perform post-processing steps on an already-built HTML DOM. */

"use strict";
require('./core-upgrade');

var domino = require('domino'),
	events = require('events'),
	url = require('url'),
	util = require('util'),
	DOMTraverser = require('./domTraverser.js').DOMTraverser,
	DU = require('./mediawiki.DOMUtils.js').DOMUtils,
	dumpDOM = require('./dom.dumper.js').dumpDOM,
	CleanUp = require('./dom.cleanup.js'),
	cleanupAndSaveDataParsoid = CleanUp.cleanupAndSaveDataParsoid,
	computeDSR = require('./dom.computeDSR.js').computeDSR,
	processRefs = require('./dom.processRefs.js').processRefs,
	handleLinkNeighbours = require('./dom.t.handleLinkNeighbours.js').handleLinkNeighbours,
	handleLIHack = require('./dom.t.handleLIHack.js').handleLIHack,
	handlePres = require('./dom.handlePres.js').handlePres,
	handleUnbalancedTables = require('./dom.handleUnbalancedTables.js').handleUnbalancedTables,
	markFosteredContent = require('./dom.markFosteredContent.js').markFosteredContent,
	markTreeBuilderFixups = require('./dom.markTreeBuilderFixups.js').markTreeBuilderFixups,
	migrateTemplateMarkerMetas = require('./dom.migrateTemplateMarkerMetas.js').migrateTemplateMarkerMetas,
	migrateTrailingNLs = require('./dom.migrateTrailingNLs.js').migrateTrailingNLs,
	TableFixups = require('./dom.t.TableFixups.js'),
	stripMarkerMetas = CleanUp.stripMarkerMetas,
	unpackDOMFragments = require('./dom.t.unpackDOMFragments.js').unpackDOMFragments,
	wrapTemplates = require('./dom.wrapTemplates.js').wrapTemplates,
	cleanUpTemplates = require('./dom.cleanUpTemplates.js'),
	lintWikitextFixup = require('./dom.linter.js').logWikitextFixups;

// map from mediawiki metadata names to RDFa property names
var metadataMap = {
	ns: {
		property: 'mw:articleNamespace',
		content: '%d'
	},
	// the articleID is not stable across article deletion/restore, while
	// the revisionID is.  So we're going to omit the articleID from the
	// parsoid API for now; uncomment if we find a use case.
	//id: 'mw:articleId',

	// 'rev_revid' is used to set the overall subject of the document, we don't
	// need to add a specific <meta> or <link> element for it.

	rev_parentid:  {
		rel: 'dc:replaces',
		resource: 'mwr:revision/%d'
	},
	rev_timestamp: {
		property: 'dc:modified',
		content: function(m) {
			return new Date(m.get('rev_timestamp')).toISOString();
		}
	},
	// user is not stable (but userid is)
	rev_user:      {
		about: function(m) {
			return 'mwr:user/' + m.get('rev_userid');
		},
		property: 'dc:title',
		content: '%s'
	},
	rev_userid:    {
		rel: 'dc:contributor',
		resource: 'mwr:user/%d'
	},
	rev_sha1:      {
		property: 'mw:revisionSHA1',
		content: '%s'
	},
	rev_comment:   {
		property: 'dc:description',
		content: '%s'
	}
};

// Sanity check for dom behavior: we are
// relying on DOM level 4 getAttribute. In level 4, getAttribute on a
// non-existing key returns null instead of the empty string.
var testDom = domino.createWindow('<h1>Hello world</h1>').document;
if (testDom.body.getAttribute('somerandomstring') === '') {
	throw('Your DOM version appears to be out of date! \n' +
			'Please run npm update in the js directory.');
}

/**
 * Migrate data-parsoid attributes into a property on each DOM node.
 * We may migrate them back in the final DOM traversal.
 *
 * Various mw metas are converted to comments before the tree build to
 * avoid fostering. Piggy-backing the reconversion here to avoid excess
 * DOM traversals.
 */
function prepareDOM( dpp, env, node ) {
	if ( DU.isElt( node ) ) {

		// Load data-(parsoid|mw) and remove them from the DOM.
		DU.loadDataAttribs( node );

		// Set title to display when present (last one wins).
		if ( DU.hasNodeName(node, "meta") &&
			 node.getAttribute("property") === "mw:PageProp/displaytitle" ) {
			dpp.displayTitle = node.getAttribute("content");
		}

	} else if ( DU.isComment( node ) && /^\{[^]+\}$/.test( node.data ) ) {

		// Convert serialized meta tags back from comments.
		// We use this trick because comments won't be fostered,
		// providing more accurate information about where tags are expected
		// to be found.
		var data, type;
		try {
			data = JSON.parse( node.data );
			type = data["@type"];
		} catch (e) {
			// not a valid json attribute, do nothing
			return true;
		}

		if ( /^mw:/.test( type ) ) {
			var meta = node.ownerDocument.createElement( "meta" );
			data.attrs.forEach(function ( attr ) {
				try {
					meta.setAttribute( attr.nodeName, attr.nodeValue );
				} catch(e) {
					env.log("warning", "prepareDOM: Dropped invalid attribute", attr.nodeName);
				}
			});
			node.parentNode.insertBefore( meta, node );
			DU.deleteNode( node );
			return meta;
		}

	}
	return true;
}

/**
 * Create an element in the document.head with the given attrs.
 */
function appendToHead(document, tagName, attrs) {
	var elt = document.createElement( tagName );
	DU.addAttributes( elt, attrs || Object.create(null) );
	document.head.appendChild( elt );
}

function DOMPostProcessor(env, options) {
	events.EventEmitter.call(this);
	this.env = env;
	this.options = options;

	// DOM traverser that runs before the in-order DOM handlers.
	var dataParsoidLoader = new DOMTraverser(env);
	dataParsoidLoader.addHandler( null, prepareDOM.bind( null, this, env ) );

	// Common post processing
	this.processors = [
		dataParsoidLoader.traverse.bind( dataParsoidLoader ),
		markFosteredContent,
		handleUnbalancedTables,
		markTreeBuilderFixups,
		// Run this after 'markTreeBuilderFixups' because the mw:StartTag
		// and mw:EndTag metas would otherwise interfere with the
		// firstChild/lastChild check that this pass does.
		migrateTemplateMarkerMetas,
		handlePres,
		migrateTrailingNLs
	];

	if (options.wrapTemplates && !options.inTemplate) {
		// dsr computation and tpl encap are only relevant
		// for top-level content that is not wrapped in an extension
		this.processors.push(computeDSR);
		this.processors.push(wrapTemplates);
	}

	// 1. Link prefixes and suffixes
	// 2. Unpack DOM fragments (reused transclusion and extension content)
	var domVisitor1 = new DOMTraverser(env);
	domVisitor1.addHandler( 'a', handleLinkNeighbours.bind( null, env ) );
	domVisitor1.addHandler( null, unpackDOMFragments.bind(null, env) );
	this.processors.push(domVisitor1.traverse.bind(domVisitor1));

	// A pure DOM transformation
	this.processors.push(processRefs.bind(null,
				env.conf.parsoid.nativeExtensions.cite.references));

	// Strip empty elements from template content
	this.processors.push(cleanUpTemplates.stripEmptyElements);

    if (env.conf.parsoid.linting) {
        this.processors.push(lintWikitextFixup);
    }

	var domVisitor2 = new DOMTraverser(env),
		tableFixer = new TableFixups.TableFixups(env);
	// 1. Strip marker metas -- removes left over marker metas (ex: metas
	//    nested in expanded tpl/extension output).
	domVisitor2.addHandler( 'meta', stripMarkerMetas.bind(null, env.conf.parsoid.rtTestMode) );
	// 2. Fix up DOM for li-hack.
	domVisitor2.addHandler( 'li', handleLIHack.bind( null, env ) );
	// 3. Fix up issues from templated table cells and table cell attributes
	domVisitor2.addHandler( 'td', tableFixer.stripDoubleTDs.bind( tableFixer, env ) );
	domVisitor2.addHandler( 'td', tableFixer.reparseTemplatedAttributes.bind( tableFixer, env ) );
	domVisitor2.addHandler( 'th', tableFixer.reparseTemplatedAttributes.bind( tableFixer, env ) );
	// 4. Save data.parsoid into data-parsoid html attribute.
	domVisitor2.addHandler( null, cleanupAndSaveDataParsoid.bind( null, env ) );
	this.processors.push(domVisitor2.traverse.bind(domVisitor2));

	// Remove data-parsoid from transcluded content
	this.processors.push(cleanUpTemplates.removeDataParsoid);
}

// Inherit from EventEmitter
util.inherits(DOMPostProcessor, events.EventEmitter);

/**
 * Debugging aid: set pipeline id
 */
DOMPostProcessor.prototype.setPipelineId = function(id) {
	this.pipelineId = id;
};

DOMPostProcessor.prototype.setSourceOffsets = function(start, end) {
	this.options.sourceOffsets = [start, end];
};

DOMPostProcessor.prototype.resetState = function(opts) {
	this.atTopLevel = opts && opts.toplevel;
	this.displayTitle = null;
};

DOMPostProcessor.prototype.doPostProcess = function ( document ) {
	var env = this.env,
		psd = env.conf.parsoid;

	if (psd.dumpFlags && (psd.dumpFlags.indexOf("dom:post-builder") !== -1)) {
		console.warn("---- DOM: after tree builder ----");
		dumpDOM( {}, document.body );
		console.warn("--------------------------------");
	}

	// holder for data-parsoid
	if ( env.storeDataParsoid ) {
		DU.setNodeData(document, {
			parsoid: {
				counter: -1,
				ids: {}
			}
		});
	}

	for (var i = 0; i < this.processors.length; i++) {
		try {
			this.processors[i](document.body, this.env, this.options, this.atTopLevel);
		} catch ( e ) {
			env.log("fatal", e);
			return;
		}
	}

	// add <head> element if it was missing
	if (!document.head) {
		document.documentElement.
			insertBefore(document.createElement('head'), document.body);
	}

	// add mw: and mwr: RDFa prefixes
	var prefixes = [ 'dc: http://purl.org/dc/terms/',
	                 'mw: http://mediawiki.org/rdf/' ];
	// add 'http://' to baseURI if it was missing
	var mwrPrefix = url.resolve('http://',
	                            env.conf.wiki.baseURI + 'Special:Redirect/' );
	document.documentElement.setAttribute('prefix', prefixes.join(' '));
	document.head.setAttribute('prefix', 'mwr: '+mwrPrefix);

	// add <head> content based on page meta data:

	// collect all the page meta data (including revision metadata) in 1 object
	var m = new Map();
	Object.keys( env.page.meta || {} ).forEach(function( k ) {
		m.set( k, env.page.meta[k] );
	});
	// include some other page properties
	["ns", "id"].forEach(function(p) {
		m.set(p, env.page[p]);
	});
	var rev = m.get( 'revision' );
	Object.keys( rev || {} ).forEach(function( k ) {
		m.set( 'rev_' + k, rev[k] );
	});
	// use the metadataMap to turn collected data into <meta> and <link> tags.
	m.forEach(function( g, f ) {
		var mdm = metadataMap[f];
		if ( !m.has(f) || m.get(f) === null || m.get(f) === undefined || !mdm ) {
			return;
		}
		// generate proper attributes for the <meta> or <link> tag
		var attrs = Object.create( null );
		Object.keys( mdm ).forEach(function( k ) {
			// evaluate a function, or perform sprintf-style formatting, or
			// use string directly, depending on value in metadataMap
			var v = ( typeof(mdm[k])==='function' ) ? mdm[k]( m ) :
				mdm[k].indexOf('%') >= 0 ? util.format( mdm[k], m.get(f) ) :
				mdm[k];
			attrs[k] = v;
		});
		// <link> is used if there's a resource or href attribute.
		appendToHead( document,
		              ( attrs.resource || attrs.href ) ? 'link' : 'meta',
		              attrs );
	});
	if ( m.has('rev_revid') ) {
		document.documentElement.setAttribute(
			'about', mwrPrefix + 'revision/' + m.get('rev_revid') );
	}
	// Set the parsoid version
	appendToHead(document, 'meta', {
		'property': 'mw:parsoidVersion',
		'content': env.conf.parsoid.version.toString()
	});
	var wikiPageUrl = env.conf.wiki.baseURI +
		env.page.name.split('/').map(encodeURIComponent).join('/');
	appendToHead(document, 'link',
		{ rel: 'dc:isVersionOf', href: wikiPageUrl });

	document.title = this.displayTitle || env.page.meta.title || '';

	// Add base href pointing to the wiki root
	appendToHead( document, 'base', { href: env.conf.wiki.baseURI } );

	// Hack: link styles
	// We assume that load.php is available at the same location as api.php
	if (env.conf.wiki.apiURI) {
		var modules = [
				'mediawiki.legacy.commonPrint,shared',
				'mediawiki.skinning.elements',
				'mediawiki.skinning.content',
				'mediawiki.skinning.interface',
				'skins.vector.styles',
				'site',
				'mediawiki.skinning.content.parsoid'
			];
		if (env.page.extensionModuleStyles) {
			env.page.extensionModuleStyles.forEach(function (module) {
				modules.push(module);
			});
		}
		var styleURI = env.conf.wiki.apiURI
				.replace(/^http:\/\//, '//') // proto-relative
				.replace(/\/api.php$/, '/load.php')
			+ '?modules=' + modules.join('|') + '&only=styles&debug=true&skin=vector';
		appendToHead( document, 'link', { rel: 'stylesheet', href: styleURI } );
	}

	// stick data-parsoid in the head
	if ( env.storeDataParsoid ) {
		var dp = JSON.stringify( DU.getDataParsoid( document ) );
		var script = document.createElement("script");
		DU.addAttributes(script, {
			id: "mw-data-parsoid",
			type: "application/json; spec=mediawiki.org/specs/parsoid/data/1.0"
		});
		script.appendChild( document.createTextNode(dp) );
		document.head.appendChild( script );
	}

	// Indicate language & directionality on body
	var dir = env.conf.wiki.rtl ? "rtl" : "ltr";
	document.body.setAttribute('lang', env.conf.wiki.lang);
	document.body.classList.add('mw-content-' + dir);
	document.body.classList.add('sitedir-' + dir);
	document.body.classList.add(dir);
	document.body.setAttribute('dir', dir);

	// Set mw-body and mw-body-content directly on the body. These are the
	// designated successors for #content (mw-body) and #bodyContent
	// (mw-body-content) in core skins.
	document.body.classList.add('mw-body');
	document.body.classList.add('mw-body-content');
	// Also add 'mediawiki' class
	document.body.classList.add('mediawiki');

	this.emit( 'document', document );
};

/**
 * Register for the 'document' event, normally emitted from the HTML5 tree
 * builder.
 */
DOMPostProcessor.prototype.addListenersOn = function ( emitter ) {
	emitter.addListener( 'document', this.doPostProcess.bind( this ) );
};

if (typeof module === "object") {
	module.exports.DOMPostProcessor = DOMPostProcessor;
}
