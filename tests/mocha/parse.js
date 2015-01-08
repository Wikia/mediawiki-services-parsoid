/** Test cases for lib/mediawiki.Util.js */
"use strict";
require( '../../lib/core-upgrade.js' );
/*global describe, it, Promise*/

var should = require("chai").should();

var url = require('url');

var MWParserEnvironment = require('../../lib/mediawiki.parser.environment.js' ).MWParserEnvironment,
	Util = require('../../lib/mediawiki.Util.js').Util,
	ParsoidConfig = require('../../lib/mediawiki.ParsoidConfig' ).ParsoidConfig;

describe( 'ParserPipelineFactory', function() {
	var parsoidConfig = new ParsoidConfig( null, { defaultWiki: 'enwiki' } );

	describe( 'parse()', function() {

		var parse = function(src, options) {
			options = options || {};
			return MWParserEnvironment.getParserEnv(parsoidConfig, null, {
				prefix: options.prefix || 'enwiki',
				pageName: options.page_name || 'Main_Page'
			}).then(function(env) {
				if (options.tweakEnv) {
					env = options.tweakEnv(env) || env;
				}
				env.setPageSrcInfo(src);
				var pipeline = env.pipelineFactory;
				return Promise.promisify( pipeline.parse, false, pipeline )(
					env, env.page.src, options.expansions
				);
			});
		};

		it('should create a sane document from a short string', function() {
			return parse('foo').then(function(doc) {
				doc.should.have.property('nodeName', '#document');
				doc.outerHTML.startsWith('<!DOCTYPE html><html').should.equal(true);
				doc.outerHTML.endsWith('</body></html>').should.equal(true);
				// verify that body has only one <html> tag, one <body> tag, etc.
				doc.childNodes.length.should.equal(2);// <!DOCTYPE> and <html>
				doc.firstChild.nodeName.should.equal('html');
				doc.lastChild.nodeName.should.equal('HTML');
				// <html> children should be <head> and <body>
				var html = doc.documentElement;
				html.childNodes.length.should.equal(2);
				html.firstChild.nodeName.should.equal('HEAD');
				html.lastChild.nodeName.should.equal('BODY');
				// <body> should have one child, <p>
				var body = doc.body;
				body.childElementCount.should.equal(1);
				body.firstElementChild.nodeName.should.equal('P');
				var p = doc.body.firstElementChild;
				p.innerHTML.should.equal('foo');
			});
		});

		['no subpages', 'subpages'].forEach(function(desc, subpages) {
			describe('should handle page titles with embedded ? ('+desc+')', function() {
				var linktests = [{
					wikitext: '[[Foo?/Bar]]',
					href: '//en.wikipedia.org/wiki/Foo%3F/Bar',
					linktext: 'Foo?/Bar'
				},{
					wikitext: '[[File:Foo.jpg]]',
					href: '//en.wikipedia.org/wiki/File:Foo.jpg',
					resource: '//en.wikipedia.org/wiki/File:Foo.jpg'
				},{
					wikitext: '[[../]]',
					linktext: 'A/B?',
					href: '//en.wikipedia.org/wiki/A/B%3F',
					subpageOnly: true
				},{
					wikitext: '[[../../]]',
					linktext: 'A',
					href: '//en.wikipedia.org/wiki/A',
					subpageOnly: true
				},{
					// See https://gerrit.wikimedia.org/r/173431
					wikitext: '[[../..//]]',
					linktext: 'A',
					href: '//en.wikipedia.org/wiki/A',
					subpageOnly: true
				},{
					wikitext: '[[/Child]]',
					linktext: '/Child',
					href: subpages ?
						'//en.wikipedia.org/wiki/A/B%3F/C/Child' :
						'//en.wikipedia.org/wiki//Child'
				},{
					wikitext: '[[/Child/]]',
					linktext: subpages ? 'Child' : '/Child/',
					href: subpages ?
						// note: no trailing slash
						'//en.wikipedia.org/wiki/A/B%3F/C/Child' :
						// trailing slash here, when there's no subpage support
						'//en.wikipedia.org/wiki//Child/'
				},{
					// See https://gerrit.wikimedia.org/r/173431
					wikitext: '[[/Child//]]',
					linktext: subpages ? 'Child' : '/Child//',
					href: subpages ?
						// note: no trailing slash
						'//en.wikipedia.org/wiki/A/B%3F/C/Child' :
						// trailing slash here, when there's no subpage support
						'//en.wikipedia.org/wiki//Child//'
				},{
					wikitext: '[[../Sibling]]',
					linktext: 'A/B?/Sibling',
					href: '//en.wikipedia.org/wiki/A/B%3F/Sibling',
					subpageOnly: true
				},{
					wikitext: '[[../Sibling/]]',
					linktext: 'Sibling',
					// note: no trailing slash
					href: '//en.wikipedia.org/wiki/A/B%3F/Sibling',
					subpageOnly: true
				},{
					// See https://gerrit.wikimedia.org/r/173431
					wikitext: '[[../Sibling//]]',
					linktext: 'Sibling',
					// note: no trailing slash
					href: '//en.wikipedia.org/wiki/A/B%3F/Sibling',
					subpageOnly: true
				},{
					wikitext: '[[../../New/Cousin]]',
					linktext: 'A/New/Cousin',
					href: '//en.wikipedia.org/wiki/A/New/Cousin',
					subpageOnly: true
				},{
					// up too far
					wikitext: '[[../../../]]',
					notALink: true
				}];
				linktests.forEach(function(test) {
					it(test.wikitext, function() {
						return parse(test.wikitext, {
							page_name:'A/B?/C',
							tweakEnv: function(env) {
								Object.keys(env.conf.wiki.namespaceNames).forEach(function(id) {
									env.conf.wiki.namespacesWithSubpages[id] = !!subpages;
								});
							}
						}).then(function(doc) {
							var els;
							els = doc.querySelectorAll('HEAD > BASE[href]');
							els.length.should.equal(1);
							var basehref = els[0].getAttribute('href');
							// ensure base is a prototocol-relative url
							basehref = basehref.replace(/^https?:/, '');

							// some of these are links only if subpage
							// support is enabled
							if (test.notALink || (test.subpageOnly && !subpages)) {
								doc.querySelectorAll('A').length.should.equal(0);
								els = doc.querySelectorAll('P');
								els.length.should.equal(1);
								els[0].textContent.should.equal(
									test.wikitext
								);
								return;
							}

							// check wikilink
							els = doc.querySelectorAll('A[href]');
							els.length.should.equal(1);
							var ahref = els[0].getAttribute('href');
							url.resolve(basehref, ahref).should.equal(
								test.href
							);

							// check link text
							if (test.linktext) {
								els[0].textContent.should.equal(
									test.linktext
								);
							}

							// check image resource
							if (test.resource) {
								els = doc.querySelectorAll('IMG[resource]');
								els.length.should.equal(1);
								var resource = els[0].getAttribute('resource');
								url.resolve(basehref, resource).should.equal(
									test.resource
								);
							}
						});
					});
				});
			});
		});
	});
});
