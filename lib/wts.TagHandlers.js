"use strict";
require('./core-upgrade.js');

var Util = require('./mediawiki.Util.js').Util,
	DU = require('./mediawiki.DOMUtils.js').DOMUtils,
	WTSUtils = require('./wts.utils.js').WTSUtils,
	wtConsts = require('./mediawiki.wikitext.constants.js'),
	Consts = wtConsts.WikitextConstants;

function id(v) {
	return function() {
		return v;
	};
}

var genContentSpanTypes = {
	'mw:Nowiki':1,
	'mw:Image': 1,
	'mw:Image/Frameless': 1,
	'mw:Image/Frame': 1,
	'mw:Image/Thumb': 1,
	'mw:Video': 1,
	'mw:Video/Frameless': 1,
	'mw:Video/Frame': 1,
	'mw:Video/Thumb': 1,
	'mw:Entity': 1,
	'mw:DiffMarker': 1
};

function isRecognizedSpanWrapper(type) {
	return type &&
		type.split(/\s/).find(function(t) { return genContentSpanTypes[t] === 1; }) !== undefined;
}

function buildHeadingHandler(headingWT) {
	return {
		handle: function(node, state, cb) {
			// For new elements, for prettier wikitext serialization,
			// emit a space after the last '=' char.
			var space = '';
			if (DU.isNewElt(node)) {
				var fc = node.firstChild;
				if (fc && (!DU.isText(fc) || !fc.nodeValue.match(/^\s/))) {
					space = ' ';
				}
			}

			cb(headingWT + space, node);
			if (node.childNodes.length) {
				var headingHandler = state.serializer
					.wteHandlers.headingHandler.bind(state.serializer.wteHandlers, node);
				state.serializeChildren(node, cb, headingHandler);
			} else {
				// Deal with empty headings
				cb('<nowiki/>', node);
			}

			// For new elements, for prettier wikitext serialization,
			// emit a space before the first '=' char.
			space = '';
			if (DU.isNewElt(node)) {
				var lc = node.lastChild;
				if (lc && (!DU.isText(lc) || !lc.nodeValue.match(/\s$/))) {
					space = ' ';
				}
			}
			cb(space + headingWT, node);
		},
		sepnls: {
			before: function (node, otherNode) {
				if (DU.isNewElt(node) && DU.previousNonSepSibling(node)) {
					// Default to two preceding newlines for new content
					return {min:2, max:2};
				} else if (DU.isNewElt(otherNode) &&
					DU.previousNonSepSibling(node) === otherNode) {
					// T72791: The previous node was newly inserted, separate
					// them for readability
					return {min:2, max:2};
				} else {
					return {min:1, max:2};
				}
			},
			after: id({min:1, max:2})
		}
	};
}

/**
 * List helper: DOM-based list bullet construction
 */
function getListBullets(node) {
	var listTypes = {
		ul: '*',
		ol: '#',
		dl: '',
		li: '',
		dt: ';',
		dd: ':'
	}, res = '';

	// For new elements, for prettier wikitext serialization,
	// emit a space after the last bullet (if required)
	var space = '';
	if (DU.isNewElt(node)) {
		var fc = node.firstChild;
		if (fc && (!DU.isText(fc) || !fc.nodeValue.match(/^\s/))) {
			space = ' ';
		}
	}

	while (node) {
		var nodeName = node.nodeName.toLowerCase(),
			dp = DU.getDataParsoid( node );

		if (dp.stx !== 'html' && nodeName in listTypes) {
			res = listTypes[nodeName] + res;
		} else if (dp.stx !== 'html' || !dp.autoInsertedStart || !dp.autoInsertedEnd) {
			break;
		}

		node = node.parentNode;
	}

	return res + space;
}

function wtEOL(node, otherNode) {
	if (DU.isElt(otherNode) &&
		(DU.getDataParsoid( otherNode ).stx === 'html' || DU.getDataParsoid( otherNode ).src))
	{
		return {min:0, max:2};
	} else {
		return {min:1, max:2};
	}
}

function wtListEOL(node, otherNode) {
	if (otherNode.nodeName === 'BODY' ||
		!DU.isElt(otherNode) ||
		DU.isFirstEncapsulationWrapperNode(otherNode))
	{
		return {min:0, max:2};
	}

	var nextSibling = DU.nextNonSepSibling(node);
	var dp = DU.getDataParsoid( otherNode );
	if ( nextSibling === otherNode && dp.stx === 'html' || dp.src ) {
		return {min:0, max:2};
	} else if (nextSibling === otherNode && DU.isListOrListItem(otherNode)) {
		if (DU.isList(node) && otherNode.nodeName === node.nodeName) {
			// Adjacent lists of same type need extra newline
			return {min: 2, max:2};
		} else if (DU.isListItem(node) || node.parentNode.nodeName in {LI:1, DD:1}) {
			// Top-level list
			return {min:1, max:1};
		} else {
			return {min:1, max:2};
		}
	} else if (DU.isList(otherNode) ||
			(DU.isElt(otherNode) && dp.stx === 'html'))
	{
		// last child in ul/ol (the list element is our parent), defer
		// separator constraints to the list.
		return {};
	} else {
		return {min:1, max:2};
	}
}
function buildListHandler(firstChildNames) {
	function isBuilderInsertedElt(node) {
		var dp = DU.getDataParsoid( node );
		return dp && dp.autoInsertedStart && dp.autoInsertedEnd;
	}

	return {
		handle: function (node, state, cb) {
			var firstChildElt = DU.firstNonSepChildNode(node);

			// Skip builder-inserted wrappers
			// Ex: <ul><s auto-inserted-start-and-end-><li>..</li><li>..</li></s>...</ul>
			// output from: <s>\n*a\n*b\n*c</s>
			while (firstChildElt && isBuilderInsertedElt(firstChildElt)) {
				firstChildElt = DU.firstNonSepChildNode(firstChildElt);
			}

			if (!firstChildElt || ! (firstChildElt.nodeName in firstChildNames)) {
				cb(getListBullets(node), node);
			}
			var liHandler = state.serializer.wteHandlers.liHandler.bind(state.serializer.wteHandlers, node);
			state.serializeChildren(node, cb, liHandler);
		},
		sepnls: {
			before: function (node, otherNode) {
				// SSS FIXME: Thoughts about a fix (abandoned in this patch)
				//
				// Checking for otherNode.nodeName === 'BODY' and returning
				// {min:0, max:0} should eliminate the annoying leading newline
				// bug in parser tests, but it seems to cause other niggling issues
				// <ul> <li>foo</li></ul> serializes to " *foo" which is buggy.
				// So, we may need another constraint/flag/test in makeSeparator
				// about the node and its context so that leading pre-inducing WS
				// can be stripped

				if (otherNode.nodeName === 'BODY') {
					return {min:0, max:0};
				} else if (DU.isText(otherNode) && DU.isListItem(node.parentNode)) {
					// A list nested inside a list item
					// <li> foo <dl> .. </dl></li>
					return {min:1, max:1};
				} else {
					return {min:1, max:2};
				}
			},
			after: wtListEOL //id({min:1, max:2})
		}
	};
}

// IMPORTANT: Do not start walking from line.firstNode forward. Always
// walk backward from node. This is because in selser mode, it looks like
// line.firstNode doesn't always correspond to the wikitext line that is
// being processed since the previous emitted node might have been an unmodified
// DOM node that generated multiple wikitext lines.
function currWikitextLineHasBlockNode(line, node, skipNode) {
	var parentNode = node.parentNode;
	if (!skipNode) {
		// If this node could break this wikitext line and emit
		// non-ws content on a new line, the P-tag will be on that new line
		// with text content that needs P-wrapping.
		if (/\n[^\s]/.test(node.textContent)) {
			return false;
		}
	}
	node = DU.previousNonDeletedSibling(node);
	while (!node || node.nodeName !== 'BODY') {
		while (node) {
			// If we hit a block node that will render on the same line, we are done!
			if (DU.isBlockNodeWithVisibleWT(node)) {
				return true;
			}

			// If this node could break this wikitext line, we are done.
			// This is conservative because textContent could be looking at descendents
			// of 'node' that may not have been serialized yet. But this is safe.
			if (/\n/.test(node.textContent)) {
				return false;
			}

			node = DU.previousNonDeletedSibling(node);

			// Don't go past the current line in any case.
			if (line.firstNode && DU.isAncestorOf(node, line.firstNode)) {
				return false;
			}
		}
		node = parentNode;
		parentNode = node.parentNode;
	}

	return false;
}

function newWikitextLineMightHaveBlockNode(node) {
	node = DU.nextNonDeletedSibling(node);
	while (node) {
		if (DU.isText(node)) {
			// If this node will break this wikitext line, we are done!
			if (node.nodeValue.match(/\n/)) {
				return false;
			}
		} else if (DU.isElt(node)) {
			// These tags will always serialize onto a new line
			if (Consts.HTMLTagsRequiringSOLContext.has(node.nodeName) && !DU.isLiteralHTMLNode(node)) {
				return false;
			}

			// We hit a block node that will render on the same line
			if (DU.isBlockNodeWithVisibleWT(node)) {
				return true;
			}

			// Go conservative
			return false;
		}

		node = DU.nextNonDeletedSibling(node);
	}
	return false;
}

function precedingQuoteEltRequiresEscape(node) {
	// * <i> and <b> siblings don't need a <nowiki/> separation
	//   as long as quote chars in text nodes are always
	//   properly escaped -- which they are right now.
	//
	// * Adjacent quote siblings need a <nowiki/> separation
	//   between them if either of them will individually
	//   generate a sequence of quotes 4 or longer. That can
	//   only happen when either prev or node is of the form:
	//   <i><b>...</b></i>
	//
	//   For new/edited DOMs, this can never happen because
	//   wts.minimizeQuoteTags.js does quote tag minimization.
	//
	//   For DOMs from existing wikitext, this can only happen
	//   because of auto-inserted end/start tags. (Ex: ''a''' b ''c''')
	var prev = DU.previousNonDeletedSibling(node);
	return prev && DU.isQuoteElt(prev) && (
		DU.isQuoteElt(DU.lastNonDeletedChildNode(prev)) ||
		DU.isQuoteElt(DU.firstNonDeletedChildNode(node)));
}

function buildQuoteHandler(quotes) {
	return {
		handle: function(node, state, cb) {
			if (precedingQuoteEltRequiresEscape(node)) {
				WTSUtils.emitStartTag('<nowiki/>', node, state, cb);
			}
			WTSUtils.emitStartTag(quotes, node, state, cb);

			if (node.childNodes.length === 0) {
				// Empty nodes like <i></i> or <b></b> need
				// a <nowiki/> in place of the empty content so that
				// they parse back identically.
				//
				// Capture the end tag src to see if it is actually going
				// to be emitted (not always true if marked as autoInsertedEnd
				// and running in rtTestMode)
				var endTagSrc = '',
					captureEndTagSrcCB = function (src, _) {
						endTagSrc = src;
					};

				WTSUtils.emitEndTag(quotes, node, state, captureEndTagSrcCB);
				if (endTagSrc) {
					WTSUtils.emitStartTag('<nowiki/>', node, state, cb);
					cb(endTagSrc, node);
				}
			} else {
				state.serializeChildren(node, cb, null);
				WTSUtils.emitEndTag(quotes, node, state, cb);
			}
		}
	};
}

// Just serialize the children, ignore the (implicit) tag
var justChildren = {
	handle: function (node, state, cb) {
		state.serializeChildren(node, cb);
	}
};

var TagHandlers = {
	b: buildQuoteHandler("'''"),
	i: buildQuoteHandler("''"),

	dl: buildListHandler({DT:1, DD:1}),
	ul: buildListHandler({LI:1}),
	ol: buildListHandler({LI:1}),

	li: {
		handle: function (node, state, cb) {
			var firstChildElement = DU.firstNonSepChildNode(node);
			if (!DU.isList(firstChildElement)) {
				cb(getListBullets(node), node);
			}
			var liHandler = state.serializer.wteHandlers.liHandler.bind(state.serializer.wteHandlers, node);
			state.serializeChildren(node, cb, liHandler);
		},
		sepnls: {
			before: function (node, otherNode) {
				if ((otherNode === node.parentNode && otherNode.nodeName in {UL:1, OL:1}) ||
					(DU.isElt(otherNode) && DU.getDataParsoid( otherNode ).stx === 'html'))
				{
					return {}; //{min:0, max:1};
				} else {
					return {min:1, max:2};
				}
			},
			after: wtListEOL,
			firstChild: function (node, otherNode) {
				if (!DU.isList(otherNode)) {
					return {min:0, max: 0};
				} else {
					return {};
				}
			}
		}
	},

	dt: {
		handle: function (node, state, cb) {
			var firstChildElement = DU.firstNonSepChildNode(node);
			if (!DU.isList(firstChildElement)) {
				cb(getListBullets(node), node);
			}
			var liHandler = state.serializer.wteHandlers.liHandler.bind(state.serializer.wteHandlers, node);
			state.serializeChildren(node, cb, liHandler);
		},
		sepnls: {
			before: id({min:1, max:2}),
			after: function (node, otherNode) {
				if (otherNode.nodeName === 'DD' && DU.getDataParsoid( otherNode ).stx === 'row') {
					return {min:0, max:0};
				} else {
					return wtListEOL(node, otherNode);
				}
			},
			firstChild: function (node, otherNode) {
				if (!DU.isList(otherNode)) {
					return {min:0, max: 0};
				} else {
					return {};
				}
			}
		}
	},

	dd: {
		handle: function (node, state, cb) {
			var firstChildElement = DU.firstNonSepChildNode(node);
			if (!DU.isList(firstChildElement)) {
				// XXX: handle stx: row
				if ( DU.getDataParsoid( node ).stx === 'row' ) {
					cb(':', node);
				} else {
					cb(getListBullets(node), node);
				}
			}
			var liHandler = state.serializer.wteHandlers.liHandler.bind(state.serializer.wteHandlers, node);
			state.serializeChildren(node, cb, liHandler);
		},
		sepnls: {
			before: function(node, othernode) {
				// Handle single-line dt/dd
				if ( DU.getDataParsoid( node ).stx === 'row' ) {
					return {min:0, max:0};
				} else {
					return {min:1, max:2};
				}
			},
			after: wtListEOL,
			firstChild: function (node, otherNode) {
				if (!DU.isList(otherNode)) {
					return {min:0, max: 0};
				} else {
					return {};
				}
			}
		}
	},


	// XXX: handle options
	table: {
		handle: function (node, state, cb, wrapperUnmodified) {
			var dp = DU.getDataParsoid( node );
			var wt = dp.startTagSrc || "{|";
			cb(state.serializer._serializeTableTag(wt, '', state, node, wrapperUnmodified), node);
			if (!DU.isLiteralHTMLNode(node)) {
				state.wikiTableNesting++;
			}
			state.serializeChildren(node, cb);
			if (!DU.isLiteralHTMLNode(node)) {
				state.wikiTableNesting--;
			}
			if (!state.sep.constraints) {
				// Special case hack for "{|\n|}" since state.sep is cleared
				// in emitSep after a separator is emitted. However, for {|\n|},
				// the <table> tag has no element children which means lastchild -> parent
				// constraint is never computed and set here.
				state.sep.constraints = {a:{}, b:{}, min:1, max:2};
			}
			WTSUtils.emitEndTag( dp.endTagSrc || "|}", node, state, cb );
		},
		sepnls: {
			before: function(node, otherNode) {
				// Handle special table indentation case!
				if (node.parentNode === otherNode && otherNode.nodeName === 'DD') {
					return {min:0, max:2};
				} else {
					return {min:1, max:2};
				}
			},
			after: function (node, otherNode) {
				if (DU.isNewElt(node) || DU.isNewElt(otherNode)) {
					return {min:1, max:2};
				} else {
					return {min:0, max:2};
				}
			},
			firstChild: id({min:1, max:2}),
			lastChild: id({min:1, max:2})
		}
	},
	tbody: justChildren,
	thead: justChildren,
	tfoot: justChildren,
	tr: {
		handle: function (node, state, cb, wrapperUnmodified) {
			// If the token has 'startTagSrc' set, it means that the tr was present
			// in the source wikitext and we emit it -- if not, we ignore it.
			var dp = DU.getDataParsoid( node );
			// ignore comments and ws
			if (DU.previousNonSepSibling(node) || dp.startTagSrc) {
				var res = state.serializer._serializeTableTag(dp.startTagSrc || "|-", '', state,
							node, wrapperUnmodified );
				WTSUtils.emitStartTag(res, node, state, cb);
			}
			state.serializeChildren(node, cb);
		},
		sepnls: {
			before: function(node, othernode) {
				if ( !DU.previousNonDeletedSibling(node) && !DU.getDataParsoid( node ).startTagSrc ) {
					// first line
					return {min:0, max:2};
				} else {
					return {min:1, max:2};
				}
			},
			after: function(node, othernode) {
				return {min:0, max:2};
			}
		}
	},
	th: {
		handle: function (node, state, cb, wrapperUnmodified) {
			var dp = DU.getDataParsoid( node ), res;
			if ( dp.stx_v === 'row' ) {
				res = state.serializer._serializeTableTag(dp.startTagSrc || "!!",
							dp.attrSepSrc || null, state, node, wrapperUnmodified);
			} else {
				res = state.serializer._serializeTableTag(dp.startTagSrc || "!", dp.attrSepSrc || null,
						state, node, wrapperUnmodified);
			}
			WTSUtils.emitStartTag(res, node, state, cb);
			state.serializeChildren(node, cb, state.serializer.wteHandlers.thHandler);
		},
		sepnls: {
			before: function(node, otherNode) {
				if ( DU.getDataParsoid( node ).stx_v === 'row' ) {
					// force single line
					return {min:0, max:2};
				} else {
					return {min:1, max:2};
				}
			},
			after: id({min: 0, max:2})
		}
	},
	td: {
		handle: function (node, state, cb, wrapperUnmodified) {
			var dp = DU.getDataParsoid( node ), res;
			if ( dp.stx_v === 'row' ) {
				res = state.serializer._serializeTableTag(dp.startTagSrc || "||",
						dp.attrSepSrc || null, state, node, wrapperUnmodified);
			} else {
				// If the HTML for the first td is not enclosed in a tr-tag,
				// we start a new line.  If not, tr will have taken care of it.
				res = state.serializer._serializeTableTag(dp.startTagSrc || "|",
						dp.attrSepSrc || null, state, node, wrapperUnmodified);

			}
			// FIXME: bad state hack!
			if(res.length > 1) {
				state.inWideTD = true;
			}
			WTSUtils.emitStartTag(res, node, state, cb);
			state.serializeChildren(node, cb,
				state.serializer.wteHandlers.tdHandler.bind(state.serializer.wteHandlers, node));
			// FIXME: bad state hack!
			state.inWideTD = undefined;
		},
		sepnls: {
			before: function(node, otherNode) {
				return DU.getDataParsoid( node ).stx_v === 'row' ?
					{min: 0, max:2} : {min:1, max:2};
			},
			//after: function(node, otherNode) {
			//	return otherNode.data.parsoid.stx_v === 'row' ?
			//		{min: 0, max:2} : {min:1, max:2};
			//}
			after: id({min: 0, max:2})
		}
	},
	caption: {
		handle: function (node, state, cb, wrapperUnmodified) {
			var dp = DU.getDataParsoid( node );
			// Serialize the tag itself
			var res = state.serializer._serializeTableTag(
					dp.startTagSrc || "|+", null, state, node, wrapperUnmodified);
			WTSUtils.emitStartTag(res, node, state, cb);
			state.serializeChildren(node, cb);
		},
		sepnls: {
			before: function(node, otherNode) {
				return otherNode.nodeName !== 'TABLE' ?
					{min: 1, max: 2} : {min:0, max: 2};
			},
			after: id({min: 1, max: 2})
		}
	},
	// Insert the text handler here too?
	'#text': { },
	p: {
		handle: function(node, state, cb) {
			// XXX: Handle single-line mode by switching to HTML handler!
			state.serializeChildren(node, cb, null);
		},
		sepnls: {
			before: function(node, otherNode, state) {
				var otherNodeName = otherNode.nodeName,
					tdOrBody = new Set(['TD', 'BODY']);
				if (node.parentNode === otherNode &&
					DU.isListItem(otherNode) || tdOrBody.has(otherNodeName))
				{
					if (tdOrBody.has(otherNodeName)) {
						return {min: 0, max: 1};
					} else {
						return {min: 0, max: 0};
					}
				} else if (
					otherNode === DU.previousNonDeletedSibling(node) &&
					// p-p transition
					(otherNodeName === 'P' && DU.getDataParsoid( otherNode ).stx !== 'html') ||
					// Treat text/p similar to p/p transition
					(
						DU.isText(otherNode) &&
						otherNode === DU.previousNonSepSibling(node) &&
						// A new wikitext line could start at this P-tag. We have to figure out
						// if 'node' needs a separation of 2 newlines from that P-tag. Examine
						// previous siblings of 'node' to see if we emitted a block tag
						// there => we can make do with 1 newline separator instead of 2
						// before the P-tag.
						!currWikitextLineHasBlockNode(state.currLine, otherNode)
					)
				) {
					return {min: 2, max: 2};
				} else if (DU.isText(otherNode) ||
					(DU.isBlockNode(otherNode) && node.parentNode === otherNode) ||
					// new p-node added after sol-transparent wikitext should always
					// get serialized onto a new wikitext line.
					(DU.emitsSolTransparentSingleLineWT(otherNode) && DU.isNewElt(node))
				) {
					return {min: 1, max: 2};
				} else {
					return {min: 0, max: 2};
				}
			},
			after: function(node, otherNode, state) {
				if (!(node.lastChild && node.lastChild.nodeName === 'BR') &&
					otherNode.nodeName === 'P' && DU.getDataParsoid( otherNode ).stx !== 'html' &&
						// A new wikitext line could start at this P-tag. We have to figure out
						// if 'node' needs a separation of 2 newlines from that P-tag. Examine
						// previous siblings of 'node' to see if we emitted a block tag
						// there => we can make do with 1 newline separator instead of 2
						// before the P-tag.
					(  !currWikitextLineHasBlockNode(state.currLine, node, true)
						// Since we are going to emit newlines before the other P-tag, we know it
						// is going to start a new wikitext line. We have to figure out if 'node'
						// needs a separation of 2 newlines from that P-tag. Examine following
						// siblings of 'node' to see if we might emit a block tag there => we can
						// make do with 1 newline separator instead of 2 before the P-tag.
					&& !newWikitextLineMightHaveBlockNode(otherNode))
					)
				{
					return {min: 2, max: 2};
				} else if (DU.isText(otherNode) || (DU.isBlockNode(otherNode) && node.parentNode === otherNode)) {
					return {min: 1, max: 2};
				} else {
					return {min: 0, max: 2};
				}
			}
		}
	},
	pre: {
		handle: function(node, state, cb) {
			// Handle indent pre

			// XXX: Use a pre escaper?
			state.inIndentPre = true;
			var content = state.serializeChildrenToString(node);

			// Strip (only the) trailing newline
			var trailingNL = content.match(/\n$/);
			content = content.replace(/\n$/, '');

			// Insert indentation
			content = ' ' + content.replace(/(\n(<!--(?:[^\-]|\-(?!\->))*\-\->)*)/g, '$1 ');

			// But skip "empty lines" (lines with 1+ comment and optional whitespace)
			// since empty-lines sail through all handlers without being affected.
			// See empty_line_with_comments production in pegTokenizer.pegjs.txt
			//
			// We could use 'split' to split content into lines and selectively add
			// indentation, but the code will get unnecessarily complex for questionable
			// benefits. So, going this route for now.
			content = content.replace(/(^|\n) ((?:[ \t]*<!--(?:[^\-]|\-(?!\->))*\-\->[ \t]*)+)(?=\n|$)/, '$1$2');

			cb(content, node);

			// Preserve separator source
			state.sep.src = trailingNL && trailingNL[0] || '';
			state.inIndentPre = false;
		},
		sepnls: {
			before: function(node, otherNode) {
				if ( DU.getDataParsoid( node ).stx === 'html' ) {
					return {};
				} else if (otherNode.nodeName === 'PRE' &&
					DU.getDataParsoid( otherNode ).stx !== 'html')
				{
					return {min:2};
				} else {
					return {min:1};
				}
			},
			after: function(node, otherNode) {
				if ( DU.getDataParsoid( node ).stx === 'html' ) {
					return {};
				} else if (otherNode.nodeName === 'PRE' &&
					DU.getDataParsoid( otherNode ).stx !== 'html')
				{
					return {min:2};
				} else {
					return {min:1};
				}
			},
			firstChild: function(node, otherNode) {
				if ( DU.getDataParsoid( node ).stx === 'html' ) {
					return { max: Number.MAX_VALUE };
				} else {
					return {};
				}
			},
			lastChild: function(node, otherNode) {
				if ( DU.getDataParsoid( node ).stx === 'html' ) {
					return { max: Number.MAX_VALUE };
				} else {
					return {};
				}
			}
		}
	},
	meta: {
		handle: function (node, state, cb) {
			var type = node.getAttribute('typeof'),
				content = node.getAttribute('content'),
				property = node.getAttribute('property'),
				dp = DU.getDataParsoid( node );

			// Check for property before type so that page properties with templated attrs
			// roundtrip properly.  Ex: {{DEFAULTSORT:{{echo|foo}} }}
			if ( property ) {
				var switchType = property.match( /^mw\:PageProp\/(.*)$/ );
				if ( switchType ) {
					var out = switchType[1];
					var cat = out.match(/^(?:category)?(.*)/);
					if ( cat && Util.magicMasqs.has(cat[1]) ) {
						if (dp.src) {
							// Use content so that VE modifications are preserved
							var contentInfo = state.serializer.serializedAttrVal(node, "content", {});
							out = dp.src.replace(/^([^:]+:)(.*)$/, "$1" + contentInfo.value + "}}");
						} else {
							var magicWord = cat[1].toUpperCase();
							state.env.log("error", cat[1] + ' is missing source. Rendering as ' + magicWord + ' magicword');
							out = "{{" + magicWord + ":" + content + "}}";
						}
					} else {
						out = state.env.conf.wiki.getMagicWordWT( switchType[1], dp.magicSrc ) || '';
					}
					cb(out, node);
				}
			} else if ( type ) {
				switch ( type ) {
					case 'mw:tag':
							 // we use this currently for nowiki and co
							 if ( content === 'nowiki' ) {
								 state.inNoWiki = true;
							 } else if ( content === '/nowiki' ) {
								 state.inNoWiki = false;
							 } else {
								state.env.log("error", JSON.stringify(node.outerHTML));
							 }
							 cb('<' + content + '>', node);
							 break;
					case 'mw:Includes/IncludeOnly':
							 cb(dp.src, node);
							 break;
					case 'mw:Includes/IncludeOnly/End':
							 // Just ignore.
							 break;
					case 'mw:Includes/NoInclude':
							 cb(dp.src || '<noinclude>', node);
							 break;
					case 'mw:Includes/NoInclude/End':
							 cb(dp.src || '</noinclude>', node);
							 break;
					case 'mw:Includes/OnlyInclude':
							 cb(dp.src || '<onlyinclude>', node);
							 break;
					case 'mw:Includes/OnlyInclude/End':
							 cb(dp.src || '</onlyinclude>', node);
							 break;
					case 'mw:DiffMarker':
					case 'mw:Separator':
							 // just ignore it
							 //cb('');
							 break;
					default:
							 state.serializer._htmlElementHandler(node, state, cb);
							 break;
				}
			} else {
				state.serializer._htmlElementHandler(node, state, cb);
			}
		},
		sepnls: {
			before: function(node, otherNode) {
				var type = node.getAttribute( 'typeof' ) || node.getAttribute( 'property' );
				if ( type && type.match( /mw:PageProp\/categorydefaultsort/ ) ) {
					if ( otherNode.nodeName === 'P' && DU.getDataParsoid( otherNode ).stx !== 'html' ) {
						// Since defaultsort is outside the p-tag, we need 2 newlines
						// to ensure that it go back into the p-tag when parsed.
						return { min: 2 };
					} else {
						return { min: 1 };
					}
				} else if (DU.isNewElt(node) &&
					// Placeholder metas don't need to be serialized on their own line
					(node.nodeName !== "META" ||
					!/(^|\s)mw:Placeholder(\/|$)/.test(node.getAttribute("typeof"))))
				{
					return { min: 1 };
				} else {
					return {};
				}
			},
			after: function(node, otherNode) {
				// No diffs
				if (DU.isNewElt(node) &&
					// Placeholder metas don't need to be serialized on their own line
					(node.nodeName !== "META" ||
					!/(^|\s)mw:Placeholder(\/|$)/.test(node.getAttribute("typeof"))))
				{
					return { min: 1 };
				} else {
					return {};
				}
			}
		}
	},
	span: {
		handle: function(node, state, cb) {
			var type = node.getAttribute('typeof');
			if (isRecognizedSpanWrapper(type)) {
				if (type === 'mw:Nowiki') {
					cb('<nowiki>', node);
					if (node.childNodes.length === 1 && node.firstChild.nodeName === 'PRE') {
						state.serializeChildren(node, cb);
					} else {
						var child = node.firstChild;
						while(child) {
							if (DU.isElt(child)) {
								/* jshint noempty: false */
								if (DU.isMarkerMeta(child, "mw:DiffMarker")) {
									// nothing to do
								} else if (child.nodeName === 'SPAN' &&
										child.getAttribute('typeof') === 'mw:Entity')
								{
									state.serializer._serializeNode(child, state, cb);
								} else {
									cb(child.outerHTML, node);
								}
							} else if (DU.isText(child)) {
								cb(child.nodeValue.replace(/<(\/?nowiki)>/g, '&lt;$1&gt;'), child);
							} else {
								state.serializer._serializeNode(child, state, cb);
							}
							child = child.nextSibling;
						}
					}
					WTSUtils.emitEndTag('</nowiki>', node, state, cb);
				} else if ( /(?:^|\s)mw\:(Image|Video)(\/(Frame|Frameless|Thumb))?/.test(type) ) {
					state.serializer.figureHandler( node, state, cb );
				} else if ( /(?:^|\s)mw\:Entity/.test(type) && node.childNodes.length === 1 ) {
					// handle a new mw:Entity (not handled by selser) by
					// serializing its children
					if (DU.isText(node.firstChild)) {
						cb(Util.entityEncodeAll(node.firstChild.nodeValue),
						   node.firstChild);
					} else {
						state.serializeChildren(node, cb);
					}
				}

			} else {
				// Fall back to plain HTML serialization for spans created
				// by the editor
				state.serializer._htmlElementHandler(node, state, cb);
			}
		}
	},
	figure: {
		handle: function(node, state, cb) {
			return state.serializer.figureHandler(node, state, cb);
		},
		sepnls: {
			// TODO: Avoid code duplication
			before: function (node) {
				if (
					DU.isNewElt(node) &&
					node.parentNode &&
					node.parentNode.nodeName === 'BODY'
				) {
					return { min: 1 };
				}
				return {};
			},
			after: function (node) {
				if (
					DU.isNewElt(node) &&
					node.parentNode &&
					node.parentNode.nodeName === 'BODY'
				) {
					return { min: 1 };
				}
				return {};
			}
		}
	},
	img: {
		handle: function (node, state, cb) {
			if ( node.getAttribute('rel') === 'mw:externalImage' ) {
				state.serializer.emitWikitext(node.getAttribute('src') || '', state, cb, node);
			} else {
				return state.serializer.figureHandler(node, state, cb);
			}
		}
	},
	hr: {
		handle: function (node, state, cb) {
			cb(Util.charSequence("----", "-", DU.getDataParsoid( node ).extra_dashes), node);
		},
		sepnls: {
			before: id({min: 1, max: 2}),
			// XXX: Add a newline by default if followed by new/modified content
			after: id({min: 0, max: 2})
		}
	},
	h1: buildHeadingHandler("="),
	h2: buildHeadingHandler("=="),
	h3: buildHeadingHandler("==="),
	h4: buildHeadingHandler("===="),
	h5: buildHeadingHandler("====="),
	h6: buildHeadingHandler("======"),
	br: {
		handle: function(node, state, cb) {
			if (DU.getDataParsoid( node ).stx === 'html' || node.parentNode.nodeName !== 'P') {
				cb('<br>', node);
			} else {
				// Trigger separator
				if (state.sep.constraints && state.sep.constraints.min === 2 &&
						node.parentNode.childNodes.length === 1) {
					// p/br pair
					// Hackhack ;)

					// SSS FIXME: With the change I made, the above check can be simplified
					state.sep.constraints.min = 2;
					state.sep.constraints.max = 2;
					cb('', node);
				} else {
					cb('', node);
				}
			}
		},
		sepnls: {
			before: function (node, otherNode) {
				if (otherNode === node.parentNode && otherNode.nodeName === 'P') {
					return {min: 1, max: 2};
				} else {
					return {};
				}
			},
			after: function(node, otherNode) {
				// List items in wikitext dont like linebreaks.
				//
				// This seems like the wrong place to make this fix.
				// To handle this properly and more generically / robustly,
				// * we have to buffer output of list items,
				// * on encountering list item close, post-process the buffer
				//   to eliminate any newlines.
				if (DU.isListItem(node.parentNode)) {
					return {};
				} else {
					return id({min:1})();
				}
			}
		}

				/*,
		sepnls: {
			after: function (node, otherNode) {
				if (node.data.parsoid.stx !== 'html' || node.parentNode.nodeName === 'P') {
					// Wikitext-syntax br, force newline
					return {}; //{min:1};
				} else {
					// HTML-syntax br.
					return {};
				}
			}

		}*/
	},
	a:  {
		handle: function(node, state, cb) {
			return state.serializer.linkHandler(node, state, cb);
		}
		// TODO: Implement link tail escaping with nowiki in DOM handler!
	},
	link:  {
		handle: function(node, state, cb) {
			return state.serializer.linkHandler(node, state, cb);
		},
		sepnls: {
			before: function (node, otherNode) {
				var type = node.getAttribute('rel');
				if (/(?:^|\s)mw:(PageProp|WikiLink)\/(Category|redirect)(?=$|\s)/.test(type) &&
						DU.isNewElt(node) ) {
					// Fresh category link: Serialize on its own line
					return {min: 1};
				} else {
					return {};
				}
			},
			after: function (node, otherNode) {
				var type = node.getAttribute('rel');
				if (/(?:^|\s)mw:(PageProp|WikiLink)\/Category(?=$|\s)/.test(type) &&
						DU.isNewElt(node) &&
						otherNode.nodeName !== 'BODY')
				{
					// Fresh category link: Serialize on its own line
					return {min: 1};
				} else {
					return {};
				}
			}
		}
	},
	body: {
		handle: function(node, state, cb) {
			// Just serialize the children
			state.serializeChildren(node, cb);
		},
		sepnls: {
			firstChild: id({min:0, max:1}),
			lastChild: id({min:0, max:1})
		}
	}
};

if (typeof module === "object") {
	module.exports.TagHandlers = TagHandlers;
}
