/* jscs:disable disallowMultipleVarDecl, validateIndentation, requireCamelCaseOrUpperCaseIdentifiers */
'use strict';
var options, location, input, text, peg$cache, peg$currPos;


    var pegIncludes = options.pegIncludes;
    var DU = pegIncludes.DOMUtils;
    var Util = pegIncludes.Util;
    var PegTokenizer = pegIncludes.PegTokenizer;
    var defines = pegIncludes.defines;
    var constants = pegIncludes.constants;
    var tu = pegIncludes.tu;

    // define some constructor shortcuts
    var KV = defines.KV;
    var TagTk = defines.TagTk;
    var SelfclosingTagTk = defines.SelfclosingTagTk;
    var EndTagTk = defines.EndTagTk;
    var NlTk = defines.NlTk;
    var CommentTk = defines.CommentTk;
    var EOFTk = defines.EOFTk;

    var inlineBreaks = tu.inlineBreaks;
    var stops = new tu.SyntaxStops();

    var prevOffset = 0;

    // Some shorthands for legibility
    var startOffset = function() {
      return location().start.offset;
    };
    var endOffset = function() {
      return location().end.offset;
    };
    var tsrOffsets = function(flag) {
      return tu.tsrOffsets(location(), flag);
    };

    /*
     * Emit a chunk of tokens to our consumers.  Once this has been done, the
     * current expression can return an empty list (true).
     */
    var emitChunk = function(tokens) {
        // Shift tsr of all tokens by the pipeline offset
        Util.shiftTokenTSR(tokens, options.pipelineOffset);
        options.env.log("trace/peg", options.pegTokenizer.pipelineId, "---->  ", tokens);
        // limit the size of individual chunks
        var chunkLimit = 100000;
        if (tokens.length > chunkLimit) {
            var i = 0;
            var l = tokens.length;
            while (i < l) {
                options.cb(tokens.slice(i, i + chunkLimit));
                i += chunkLimit;
            }
        } else {
            options.cb(tokens);
        }
    };


function rule_start() {
    var start = null;
    (function() {

      // end is passed inline as a token, as well as a separate event for now.
      emitChunk([ new EOFTk() ]);
      return true;

    })();
}
function rule_redirect() {
    var rw = null;
    var sp = null;
    var c = null;
    var wl = null;
    (function() {

      return wl.length === 1 && wl[0] && wl[0].constructor !== String;

    })();
    (function() {

    var link = wl[0];
    if (sp) { rw += sp; }
    if (c) { rw += c; }
    // Build a redirect token
    var redirect = new SelfclosingTagTk('mw:redirect',
            // Put 'href' into attributes so it gets template-expanded
            [Util.lookupKV(link.attribs, 'href')],
            {
                src: rw,
                tsr: tsrOffsets(),
                linkTk: link,
            });
    return redirect;

    })();
}
function rule_generic_newline_attributes() {
    var generic_newline_attributes = null;
}
function rule_table_attributes() {
    var table_attributes = null;
}
function rule_redirect_word() {
    var rw = null;
    (function() {
 return options.env.conf.wiki.getMagicWordMatcher('redirect').test(rw);
    })();
}
function rule_start_async() {
    (function() {

      if (endOffset() === input.length) {
          emitChunk([ new EOFTk() ]);
      }
      // terminate the loop
      return false;

    })();
}
function rule_tlb() {
    var tlb = null;
    var b = null;
    (function() {

    // Clear the tokenizer's backtracking cache after matching each
    // toplevelblock. There won't be any backtracking as a document is just a
    // sequence of toplevelblocks, so the cache for previous toplevelblocks
    // will never be needed.
    var end = startOffset();
    for (; prevOffset < end; prevOffset++) {
        peg$cache[prevOffset] = undefined;
    }

    var tokens;
    if (Array.isArray(b) && b.length) {
        tokens = tu.flattenIfArray(b);
    } else if (b && b.constructor === String) {
        tokens = [b];
    }

    // Emit tokens for this toplevelblock. This feeds a chunk to the parser pipeline.
    if (tokens) {
        emitChunk(tokens);
    }

    // We don't return any tokens to the start rule to save memory. We
    // just emitted them already to our consumers.
    return true;

    })();
}
function rule_block() {
    var r = null;
    (function() {
return [r];
    })();
    var rs = null;
    var c = null;
    (function() {
 return c;
    })();
    var bt = null;
    (function() {
 return rs;
    })();
    var s = null;
    (function() {
 return s;
    })();
}
function rule_nested_block() {
    var b = null;
    (function() {
 return b;
    })();
}
function rule_nested_block_line() {
    var bs = null;
    var b = null;
    (function() {
 return b;
    })();
    (function() {

    return tu.flattenIfArray(bs);

    })();
}
function rule_nested_block_in_table() {
    (function() {
 return stops.push('tableDataBlock', true);
    })();
    var b = null;
    (function() {

        stops.pop('tableDataBlock');
        return b;

    })();
    (function() {
 return stops.pop('tableDataBlock');
    })();
}
function rule_block_lines() {
    var s = null;
    var s2 = null;
    var os = null;
    var so = null;
    (function() {
 return os.concat(so);
    })();
    var bl = null;
    (function() {

        return s.concat(s2 || [], bl);

    })();
}
function rule_block_line() {
    var st = null;
    var r = null;
    var tl = null;
    (function() {
 return tl;
    })();
    var bts = null;
    var bt = null;
    var stl = null;
    (function() {
 return bt.concat(stl);
    })();
    (function() {
 return bts;
    })();
    (function() {

          return st.concat(r);

    })();
    var pi = null;
    (function() {
 return pi;
    })();
    var d = null;
    var lineContent = null;
    (function() {
 return undefined;
    })();
    (function() {
 return true;
    })();
    (function() {

      var dataAttribs = {
        tsr: tsrOffsets(),
        lineContent: lineContent,
      };
      if (d.length > 0) {
        dataAttribs.extra_dashes = d.length;
      }
      return new SelfclosingTagTk('hr', [], dataAttribs);

    })();
}
function rule_paragraph() {
    var s1 = null;
    var s2 = null;
    var c = null;
    (function() {

      return s1.concat(s2, c);

    })();
}
function rule_br() {
    var s = null;
    (function() {

    return s.concat([
      new SelfclosingTagTk('br', [], { tsr: tsrOffsets() }),
    ]);

    })();
}
function rule_inline_breaks() {
    (function() {
 return inlineBreaks(input, endOffset(), stops);
    })();
}
function rule_pre_start() {
}
function rule_inlineline() {
    var c = null;
    var r = null;
    (function() {
 return r;
    })();
    (function() {

      return tu.flattenStringlist(c);

    })();
}
function rule_inline_element() {
    var r = null;
    (function() {
 return r;
    })();
    (function() {
 return r;
    })();
    (function() {
 return r;
    })();
    (function() {
 return '[[[';
    })();
    (function() {
 return r;
    })();
    (function() {
 return r;
    })();
}
function rule_h() {
    var r = null;
    var s = null;
    (function() {
 return stops.inc('h');
    })();
    var c = null;
    var e = null;
    var endTPos = null;
    (function() {
 return endOffset();
    })();
    var spc = null;
    (function() {

        stops.dec('h');
        var level = Math.min(s.length, e.length);
        level = Math.min(6, level);
        // convert surplus equals into text
        if (s.length > level) {
            var extras1 = s.substr(0, s.length - level);
            if (c[0].constructor === String) {
                c[0] = extras1 + c[0];
            } else {
                c.unshift(extras1);
            }
        }
        if (e.length > level) {
            var extras2 = e.substr(0, e.length - level);
            var lastElem = c[c.length - 1];
            if (lastElem.constructor === String) {
                c[c.length - 1] += extras2;
            } else {
                c.push(extras2);
            }
        }

        var tsr = tsrOffsets('start');
        tsr[1] += level;
        return [
          new TagTk('h' + level, [], { tsr: tsr }),
        ].concat(c, [
          new EndTagTk('h' + level, [], { tsr: [endTPos - level, endTPos] }),
          spc,
        ]);

    })();
    (function() {
 stops.dec('h'); return false;
    })();
    (function() {
 return r;
    })();
}
function rule_comment() {
    var c = null;
    (function() {

        var data = DU.encodeComment(c);
        return [new CommentTk(data, { tsr: tsrOffsets() })];

    })();
}
function rule_behavior_switch() {
    var bs = null;
    (function() {

    return [
      new SelfclosingTagTk('behavior-switch', [ new KV('word', bs) ],
        { tsr: tsrOffsets(), src: bs }),
    ];

    })();
}
function rule_behavior_text() {
}
function rule_autolink() {
    var r = null;
    var target = null;
    (function() {

        var res = [new SelfclosingTagTk('urllink', [new KV('href', target)], { tsr: tsrOffsets() })];
          return res;

    })();
    (function() {
 return r;
    })();
}
function rule_extlink() {
    var r = null;
    (function() {
 return stops.push('extlink', true);
    })();
    var addr = null;
    var target = null;
    (function() {

          // Protocol must be valid and there ought to be at least one
          // post-protocol character.  So strip last char off target
          // before testing protocol.
          var flat = tu.flattenString([addr, target]);
          if (Array.isArray(flat)) {
             // There are templates present, alas.
             return flat.length > 0;
          }
          return Util.isProtocolValid(flat.slice(0, -1), options.env);

    })();
    var sp = null;
    var targetOff = null;
    (function() {
 return endOffset();
    })();
    var content = null;
    var t1 = null;
    (function() {
 return stops.push('pipe', false);
    })();
    var t = null;
    (function() {
 stops.pop('pipe'); return t;
    })();
    (function() {
 return t1;
    })();
    (function() {

            stops.pop('extlink');
            return [
                new SelfclosingTagTk('extlink', [
                    new KV('href', tu.flattenString([addr, target])),
                    new KV('mw:content', content),
                    new KV('spaces', sp),
                ], {
                    targetOff: targetOff,
                    tsr: tsrOffsets(),
                    contentOffsets: [targetOff, endOffset() - 1],
                }),
            ];

    })();
    var br = null;
    (function() {
 return stops.pop('extlink');
    })();
    (function() {
 return br;
    })();
    (function() {
 return r;
    })();
}
function rule_autoref() {
    var ref = null;
    var sp = null;
    var identifier = null;
    (function() {

    var base_urls = {
      'RFC': '//tools.ietf.org/html/rfc%s',
      'PMID': '//www.ncbi.nlm.nih.gov/pubmed/%s?dopt=Abstract',
    };
    var url = tu.sprintf(base_urls[ref], identifier);

    return [
        new SelfclosingTagTk('extlink', [
           new KV('href', tu.sprintf(base_urls[ref], identifier)),
           new KV('mw:content', tu.flattenString([ref, sp, identifier])),
           new KV('typeof', 'mw:ExtLink/' + ref),
        ],
        { stx: "magiclink", tsr: tsrOffsets() }),
    ];

    })();
}
function rule_isbn() {
    var sp = null;
    var isbn = null;
    var s = null;
    (function() {
 return s;
    })();
    var isbncode = null;
    (function() {

        // Convert isbn token-and-entity array to stripped string.
        return tu.flattenStringlist(isbn).filter(function(e) {
          return e.constructor === String;
        }).join('').replace(/[^\dX]/ig, '').toUpperCase();

    })();
    (function() {

       // ISBNs can only be 10 or 13 digits long (with a specific format)
       return isbncode.length === 10 ||
             (isbncode.length === 13 && /^97[89]/.test(isbncode));

    })();
    (function() {

      return [
        new SelfclosingTagTk('extlink', [
           new KV('href', 'Special:BookSources/' + isbncode),
           new KV('mw:content', tu.flattenString(['ISBN', sp, isbn])),
           new KV('typeof', 'mw:WikiLink/ISBN'),
        ],
        { stx: "magiclink", tsr: tsrOffsets() }),
      ];

    })();
}
function rule_url_protocol() {
    (function() {
 return Util.isProtocolValid(input.substr(endOffset()), options.env);
    })();
    var p = null;
    (function() {
 return p;
    })();
}
function rule_no_punctuation_char() {
}
function rule_url() {
    var url = null;
    var proto = null;
    var addr = null;
    var path = null;
    var c = null;
    (function() {
 return c;
    })();
    var s = null;
    (function() {
 return s;
    })();
    var r = null;
    var he = null;
    (function() {
 return he;
    })();
    (function() {
 return r;
    })();
    (function() {
 return addr.length > 0 || path.length > 0;
    })();
    (function() {

    return tu.flattenString([proto, addr].concat(path));

    })();
}
function rule_autourl() {
    (function() {
 return stops.push('autourl', { sawLParen: false });
    })();
    var r = null;
    var proto = null;
    var addr = null;
    var path = null;
    var c = null;
    (function() {
 return c;
    })();
    (function() {
 stops.onStack('autourl').sawLParen = true; return "(";
    })();
    var s = null;
    (function() {
 return s;
    })();
    var he = null;
    (function() {
 return he;
    })();
    (function() {
 return r;
    })();
    (function() {

    // as in Parser.php::makeFreeExternalLink, we're going to
    // yank trailing punctuation out of this match.
    var url = tu.flattenStringlist([proto, addr].concat(path));
    // only need to look at last element; HTML entities are strip-proof.
    var last = url[url.length - 1];
    var trim = 0;
    if (last && last.constructor === String) {
      var strip = ',;\\.:!?';
      if (!stops.onStack('autourl').sawLParen) {
        strip += ')';
      }
      strip = new RegExp('[' + Util.escapeRegExp(strip) + ']*$');
      trim = strip.exec(last)[0].length;
      url[url.length - 1] = last.slice(0, last.length - trim);
    }
    url = tu.flattenStringlist(url);
    if (url.length === 1 && url[0].constructor === String && url[0].length <= proto.length) {
      return null; // ensure we haven't stripped everything: T106945
    }
    peg$currPos -= trim;
    stops.pop('autourl');
    return url;

    })();
    (function() {
 return r !== null;
    })();
    (function() {
return r;
    })();
    (function() {
 return stops.pop('autourl');
    })();
}
function rule_urladdr() {
}
function rule_tplarg_or_template() {
    (function() {

      // Refuse to recurse beyond 40 levels. Default in the PHP parser
      // is $wgMaxTemplateDepth = 40; This is to prevent crashing from
      // buggy wikitext with lots of unclosed template calls, as in
      // eswiki/Usuario:C%C3%A1rdenas/PRUEBAS?oldid=651094
      if (stops.onCount('templatedepth') === undefined ||
          stops.onCount('templatedepth') < 40) {
        return stops.inc('templatedepth');
      } else {
        return false;
      }

    })();
    var r = null;
    var ob = null;
    var tpl = null;
    var eb = null;
    (function() {
 return [ob, tpl, eb];
    })();
    (function() {
 return r;
    })();
    (function() {
 return r;
    })();
    (function() {

      stops.dec('templatedepth');
      return r;

    })();
    (function() {
 return stops.dec('templatedepth');
    })();
}
function rule_tplarg_or_template_or_broken() {
}
function rule_tplarg_or_template_or_bust() {
    var tplarg_or_template_or_bust = null;
}
function rule_broken_template() {
    var v = null;
    (function() {

    return [
        new TagTk('span', [ new KV('typeof', 'mw:Nowiki') ], { tsr: tsrOffsets('start'), src: text() }),
    ].concat(v, [new EndTagTk('span', [ new KV('typeof', 'mw:Nowiki') ], { tsr: tsrOffsets('end') }) ]);

    })();
}
function rule_template() {
    var target = null;
    var params = null;
    var r = null;
    var p0 = null;
    (function() {
 return endOffset();
    })();
    var v = null;
    var p = null;
    (function() {
 return endOffset();
    })();
    (function() {
 return new KV('', tu.flattenIfArray(v), [p0, p0, p0, p]);
    })();
    (function() {
 return r;
    })();
    (function() {

      // Insert target as first positional attribute, so that it can be
      // generically expanded. The TemplateHandler then needs to shift it out
      // again.
      params.unshift(new KV(tu.flattenIfArray(target.tokens), '', target.srcOffsets));
      var obj = new SelfclosingTagTk('template', params, { tsr: tsrOffsets(), src: text() });
      return obj;

    })();
}
function rule_tplarg() {
    var name = null;
    var params = null;
    var r = null;
    (function() {
 return new KV('', '');
    })();
    (function() {
 return r;
    })();
    (function() {

      if (name) {
        params.unshift(new KV(tu.flattenIfArray(name.tokens), '', name.srcOffsets));
      } else {
        params.unshift(new KV('', ''));
      }
      var obj = new SelfclosingTagTk('templatearg', params, { tsr: tsrOffsets(), src: text() });
      return obj;

    })();
}
function rule_template_param() {
    var name = null;
    var val = null;
    var kEndPos = null;
    (function() {
 return endOffset();
    })();
    var vStartPos = null;
    (function() {
 return endOffset();
    })();
    var tpv = null;
    (function() {

            return { kEndPos: kEndPos, vStartPos: vStartPos, value: (tpv && tpv.tokens) || [] };

    })();
    (function() {

      if (val !== null) {
          if (val.value !== null) {
            return new KV(name, tu.flattenIfArray(val.value), [startOffset(), val.kEndPos, val.vStartPos, endOffset()]);
          } else {
            return new KV(tu.flattenIfArray(name), '', [startOffset(), val.kEndPos, val.vStartPos, endOffset()]);
          }
      } else {
        return new KV('', tu.flattenIfArray(name), [startOffset(), startOffset(), startOffset(), endOffset()]);
      }

    })();
    (function() {

    return new KV('', '', [startOffset(), startOffset(), startOffset(), endOffset()]);

    })();
}
function rule_template_param_name() {
    (function() {
 return stops.push('equal', true);
    })();
    var tpt = null;
    (function() {
 return '';
    })();
    (function() {

        stops.pop('equal');
        return tpt;

    })();
    (function() {
 return stops.pop('equal');
    })();
}
function rule_template_param_value() {
    (function() {
 stops.inc('nopre'); return stops.push('equal', false);
    })();
    var tpt = null;
    (function() {

        stops.dec('nopre');
        stops.pop('equal');
        return { tokens: tpt, srcOffsets: tsrOffsets() };

    })();
    (function() {
 stops.dec('nopre'); return stops.pop('equal');
    })();
}
function rule_template_param_text() {
    (function() {
 // re-enable tables within template parameters
        stops.push('table', false);
        stops.push('extlink', false);
        stops.push('pipe', true);
        return stops.inc('template');

    })();
    var il = null;
    (function() {

        stops.pop('table');
        stops.pop('extlink');
        stops.pop('pipe');
        stops.dec('template');
        // il is guaranteed to be an array -- so, tu.flattenIfArray will
        // always return an array
        var r = tu.flattenIfArray(il);
        if (r.length === 1 && r[0].constructor === String) {
            r = r[0];
        }
        return r;

    })();
    (function() {
 stops.pop('table'); stops.pop('extlink'); stops.pop('pipe'); return stops.dec('template');
    })();
}
function rule_wikilink_content() {
    var lcs = null;
    var startPos = null;
    (function() {
 return endOffset();
    })();
    var lt = null;
    (function() {

        var maybeContent = new KV('mw:maybeContent', lt, [startPos, endOffset()]);
        maybeContent.vsrc = input.substring(startPos, endOffset());
        return maybeContent;

    })();
    (function() {

        if (lcs.length === 1 && lcs[0].v === null) {
            return { content: [], pipetrick: true };
        } else {
            return { content: lcs };
        }

    })();
}
function rule_wikilink() {
    var target = null;
    var tpos = null;
    (function() {
 return endOffset();
    })();
    var lcontent = null;
    (function() {

      if (lcontent === null) {
          lcontent = { content: [] };
      }

      if (target === null) {
        var src = text();
        return [src];
      }

      var obj = new SelfclosingTagTk('wikilink');
      var textTokens = [];
      var hrefKV = new KV('href', target);
      hrefKV.vsrc = input.substring(startOffset() + 2, tpos);
      // XXX: Point to object with path, revision and input information
      // obj.source = input;
      obj.attribs.push(hrefKV);
      obj.attribs = obj.attribs.concat(lcontent.content);
      obj.dataAttribs = {
          tsr: tsrOffsets(),
          src: text(),
          pipetrick: lcontent.pipetrick,
      };
      return [obj];

    })();
}
function rule_link_text_fragment() {
    var c = null;
    var r = null;
    (function() {
 return r;
    })();
    (function() {

      return tu.flattenStringlist(c);

    })();
}
function rule_link_text() {
    (function() {
 return stops.inc('linkdesc');
    })();
    var h = null;
    var hs = null;
    (function() {

        stops.dec('linkdesc');
        if (hs !== null) {
            return h.concat(hs);
        } else {
            return h;
        }

    })();
    (function() {
 return stops.dec('linkdesc');
    })();
}
function rule_quote() {
    var quotes = null;
    (function() {

    // sequences of four or more than five quotes are assumed to start
    // with some number of plain-text apostrophes.
    var plainticks = 0;
    var result = [];
    if (quotes.length === 4) {
        plainticks = 1;
    } else if (quotes.length > 5) {
        plainticks = quotes.length - 5;
    }
    if (plainticks > 0) {
        result.push(quotes.substring(0, plainticks));
    }
    // mw-quote token Will be consumed in token transforms
    var tsr = tsrOffsets();
    tsr[0] += plainticks;
    var mwq = new SelfclosingTagTk('mw-quote', [], { tsr: tsr });
    mwq.value = quotes.substring(plainticks);
    result.push(mwq);
    return result;

    })();
}
function rule_pre_indent() {
    var l = null;
    var ls = null;
    var s = null;
    var pl = null;
    (function() {

              return s.concat(pl);

    })();
    (function() {

      return l.concat(ls);

    })();
}
function rule_pre_tag_name() {
    var tag = null;
    (function() {

    return tag;

    })();
}
function rule_pre_indent_in_tags() {
    (function() {
 return stops.inc('pre');
    })();
    var s = null;
    var attribs = null;
    var l = null;
    var ls = null;
    (function() {

    stops.dec('pre');
    var ret = [ new TagTk('pre', attribs, { tsr: tsrOffsets('start') }) ];
    // ls will always be an array
    return ret.concat(l, tu.flattenIfArray(ls), [ new EndTagTk('pre') ]);

    })();
    (function() {
 return stops.dec('pre');
    })();
}
function rule_pre_indent_line() {
    var l = null;
    (function() {

    return [' '].concat(l);

    })();
}
function rule_pre() {
    (function() {
 return stops.inc('pre');
    })();
    var attribs = null;
    var endpos = null;
    (function() {
 return endOffset();
    })();
    var ts = null;
    var t2 = null;
    (function() {
 return t2;
    })();
    (function() {

        stops.dec('pre');
        // return nowiki tags as well?

        // Emit as SelfclosingTag in order to avoid the nested pre problem in
        // the PreHandler.
        attribs.push(new KV('property', 'mw:html'));
        attribs.push(new KV('content', tu.flattenStringlist(ts)));
        return [
            new SelfclosingTagTk('pre', attribs, {
                tsr: tsrOffsets(),
                endpos: endpos,
            }),
        ];


    })();
    (function() {
 stops.dec('pre'); return "</pre>";
    })();
    var p = null;
    (function() {

      stops.dec('pre');
      return tu.flattenStringlist(p);

    })();
    (function() {
 return stops.dec('pre');
    })();
}
function rule_xmlish_tag() {
    var t = null;
    (function() {

        var tagName = t.name.toLowerCase();
        var isHtmlTag = Util.isHTMLElementName(tagName);
        var isInstalledExt = options.env.conf.wiki.isExtensionTag(tagName);
        var isIncludeTag = tagName === 'includeonly' ||
                tagName === 'noinclude' || tagName === 'onlyinclude';
        return isHtmlTag || isInstalledExt || isIncludeTag;

    })();
    (function() {

        var tagName = t.name.toLowerCase();
        var isHtmlTag = Util.isHTMLElementName(tagName);
        var isInstalledExt = options.env.conf.wiki.isExtensionTag(tagName);
        var isIncludeTag = tagName === 'includeonly' ||
                tagName === 'noinclude' || tagName === 'onlyinclude';
        var dp = t.dataAttribs;
        var skipLen = 0;

        // EndTagTk
        if (t.constructor === EndTagTk || isHtmlTag) {
            return t;

        // SelfclosingTagTk
        } else if (t.constructor === SelfclosingTagTk) {

            dp.src = input.substring(dp.tsr[0], dp.tsr[1]);
            dp.tagWidths = [dp.tsr[1] - dp.tsr[0], 0];
            if (!isInstalledExt) {
                return t;
            }

        // TagTk
        } else {

            var tsr0 = dp.tsr[0];
            var endTagRE = new RegExp("^[\\s\\S]*?(</\\s*" + tagName + "\\s*>)", "mi");
            var restOfInput = input.substring(tsr0);
            var tagContent = restOfInput.match(endTagRE);

            if (!tagContent) {
                dp.src = input.substring(dp.tsr[0], dp.tsr[1]);
                dp.tagWidths = [dp.tsr[1] - dp.tsr[0], 0];

                // We accept unclosed references tags,
                // as does the PHP parser. They will normalize
                // to self-closed in a round trip.
                if (tagName !== 'references' || !isInstalledExt) {
                    return t;
                }

            } else {
                var extSrc = tagContent[0];
                var endTagWidth = tagContent[1].length;

                if (tagName === 'ref') {
                    // Support 1-level nesting of <ref> tags during tokenizing.
                    // <ref> tags are the exception to the rule (no nesting of ext tags)
                    //
                    // Expand extSrc as long as there is a <ref> tag found in the
                    // extension source body.
                    var s = extSrc.substring(endOffset() - tsr0);
                    while (s && s.match(new RegExp("<" + tagName + "[^<>]*>"))) {
                        tagContent = restOfInput.substring(extSrc.length).match(endTagRE);
                        if (tagContent) {
                            s = tagContent[0];
                            endTagWidth = tagContent[1].length;
                            extSrc += s;
                        } else {
                            s = null;
                        }
                    }
                }

                // Extension content source
                dp.src = extSrc;
                dp.tagWidths = [endOffset() - tsr0, endTagWidth];

                if (!isIncludeTag && !isInstalledExt) {
                    return t;
                }

                skipLen = extSrc.length - dp.tagWidths[0] - dp.tagWidths[1];

                // If the xml-tag is a known installed (not native) extension,
                // skip the end-tag as well.
                if (!isIncludeTag) {
                    skipLen += endTagWidth;
                }

            }

        }

        peg$currPos += skipLen;

        var ret;
        if (!isIncludeTag) {
            // update tsr[1] to span the start and end tags.
            dp.tsr[1] = endOffset();  // was just modified above
            ret = new SelfclosingTagTk('extension', [
                new KV('typeof', 'mw:Extension'),
                new KV('name', tagName),
                new KV('about', options.env.newAboutId()),
                new KV('source', dp.src),
                new KV('options', t.attribs),
            ], dp);
        } else {
            // If not a known installed extension, parse content as wikitext.
            // - include-directives: <noinclude>, <includeonly>, ...
            // - a non-html5 tag like <big>
            // Parse ext-content, strip eof, and shift tsr
            var extContent = dp.src.substring(dp.tagWidths[0], dp.src.length - dp.tagWidths[1]);
            var extContentToks = (new PegTokenizer(options.env)).tokenize(extContent);
            if (dp.tagWidths[1] > 0) {
                extContentToks = Util.stripEOFTkfromTokens(extContentToks);
            }
            Util.shiftTokenTSR(extContentToks, dp.tsr[0] + dp.tagWidths[0]);
            ret = [t].concat(extContentToks);
        }
        return ret;


    })();
}
function rule_nowiki_tag_name() {
    var tag = null;
    (function() {

    return tag;

    })();
}
function rule_nowiki() {
    var startTagEndPos = null;
    (function() {
 return endOffset();
    })();
    var nc = null;
    var endTagStartPos = null;
    (function() {
 return endOffset();
    })();
    (function() {

        return [
            new TagTk('span', [{ k: 'typeof', v: 'mw:Nowiki' }],
              { tsr: [startOffset(), startTagEndPos] }),
        ].concat(nc, [
            new EndTagTk('span', [{ k: 'typeof', v: 'mw:Nowiki' }],
              { tsr: [endTagStartPos, endOffset()] }),
        ]);

    })();
    var nw0 = null;
    (function() {
 return endOffset();
    })();
    (function() {

      return [
          new SelfclosingTagTk('meta', [new KV('typeof', 'mw:Placeholder')],
            { src: input.substring(nw0, endOffset()), tsr: [nw0, endOffset()] }),
      ];

    })();
    (function() {
 return endOffset();
    })();
    (function() {

      var nowiki = input.substring(nw0, endOffset());
      return [
            new TagTk('span', [new KV('typeof', 'mw:Placeholder')], {
                src: nowiki,
                tsr: [nw0, nw0],
            }),
            nowiki,
            new EndTagTk('span', [], { tsr: tsrOffsets('end') }),
      ];

    })();
}
function rule_pre_break() {
    (function() {
 return stops.counters.pre > 0;
    })();
}
function rule_nowiki_content() {
    var ts = null;
    var p0 = null;
    var p1 = null;
    var p2 = null;
    (function() {

                 return ["<pre"].concat(p0, p1, [">"], p2, ["</pre>"]).join('');

    })();
    var c = null;
    (function() {

               return c;

    })();
    (function() {

            // return nowiki tags as well?
            return tu.flattenStringlist(ts);

    })();
}
function rule_tag_name_chars() {
}
function rule_tag_name() {
}
function rule_generic_tag() {
    var end = null;
    var name = null;
    var attribs = null;
    var selfclose = null;
    var bad_ws = null;
    (function() {

        var lcName = name.toLowerCase();
        var isVoidElt = Util.isVoidElement(lcName) ? true : null;
        // Support </br>
        var broken = false;
        if (lcName === 'br' && end) {
            broken = true;
            end = null;
        }

        var res = tu.buildXMLTag(name, lcName, attribs, end, selfclose || isVoidElt, tsrOffsets());

        // change up data-attribs in one scenario
        // void-elts that aren't self-closed ==> useful for accurate RT-ing
        if (selfclose === null && isVoidElt) {
            res.dataAttribs.selfClose = undefined;
            res.dataAttribs.noClose = true;
        }
        if (broken || bad_ws.length > 0) {
            res.dataAttribs.brokenHTMLTag = true;
        }
        return res;

    })();
}
function rule_could_be_attribute() {
}
function rule_generic_newline_attribute() {
    var s = null;
    var namePos0 = null;
    (function() {
 return endOffset();
    })();
    var name = null;
    var namePos = null;
    (function() {
 return endOffset();
    })();
    var valueData = null;
    var v = null;
    (function() {
 return v;
    })();
    (function() {

    var res;

    // Encapsulate protected attributes.
    if (typeof name === "string") {
        name = name.replace(
            /^(about|data-mw.*|data-parsoid.*|data-x.*|property|rel|typeof)$/i,
            "data-x-$1");
    }

    if (valueData !== null) {
        var value = valueData.value;
        res = new KV(name, value);
        res.vsrc = valueData.valueSrc;
    } else {
        res = new KV(name, '');
    }
    if (Array.isArray(name)) {
        res.ksrc = input.substring(namePos0, namePos);
    }
    return res;

    })();
}
function rule_table_attribute() {
    var s = null;
    var namePos0 = null;
    (function() {
 return endOffset();
    })();
    var name = null;
    var namePos = null;
    (function() {
 return endOffset();
    })();
    var valueData = null;
    var v = null;
    (function() {
 return v;
    })();
    (function() {

    // FIXME: name might just be a template, which can expand to a key-value
    // pair later. We'll need to handle that in the AttributeTransformManager.
    var res;
    if (valueData !== null) {
        var value = valueData.value;
        res = new KV(name, value);
        res.vsrc = valueData.valueSrc;
    } else {
        res = new KV(name, '');
    }
    if (Array.isArray(name)) {
        res.ksrc = input.substring(namePos0, namePos);
    }
    return res;

    })();
}
function rule_broken_table_attribute_name_char() {
    var c = null;
    (function() {
 return new KV(c, '');
    })();
}
function rule_generic_attribute_name() {
    var r = null;
    var t = null;
    var c = null;
    (function() {
 return c;
    })();
    (function() {
 return t;
    })();
    (function() {

    return tu.flattenString(r);

    })();
}
function rule_table_attribute_name() {
    var r = null;
    var t = null;
    var nb = null;
    (function() {
 return nb;
    })();
    var c = null;
    (function() {
 return c;
    })();
    (function() {
 return t;
    })();
    (function() {

    return tu.flattenString(r);

    })();
}
function rule_generic_attribute_newline_value() {
    var v = null;
    (function() {

      return v === null ? [] : v;

    })();
}
function rule_table_attribute_value() {
    var v = null;
    (function() {

      return v === null ? [] : v;

    })();
}
function rule_generic_att_value() {
    var r = null;
    var t1 = null;
    (function() {

        return tu.getAttributeValueAndSource(input, t1, startOffset(), endOffset() - 1);

    })();
    var t2 = null;
    (function() {

        return tu.getAttributeValueAndSource(input, t2, startOffset(), endOffset());

    })();
    (function() {
 return r;
    })();
    (function() {

        return tu.getAttributeValueAndSource(input, t1, startOffset(), endOffset() - 1);

    })();
    (function() {

        return tu.getAttributeValueAndSource(input, t2, startOffset(), endOffset());

    })();
    (function() {
 return r;
    })();
    var s = null;
    var t = null;
    (function() {

      return tu.getAttributeValueAndSource(input, t, startOffset() + s.length, endOffset());

    })();
}
function rule_table_att_value() {
    var r = null;
    var t1 = null;
    (function() {

        return tu.getAttributeValueAndSource(input, t1, startOffset(), endOffset() - 1);

    })();
    var t2 = null;
    (function() {

        return tu.getAttributeValueAndSource(input, t2, startOffset(), endOffset());

    })();
    (function() {
 return r;
    })();
    (function() {

        return tu.getAttributeValueAndSource(input, t1, startOffset(), endOffset() - 1);

    })();
    (function() {

        return tu.getAttributeValueAndSource(input, t2, startOffset(), endOffset());

    })();
    (function() {
 return r;
    })();
    var s = null;
    var t = null;
    (function() {

      return tu.getAttributeValueAndSource(input, t, startOffset() + s.length, endOffset());

    })();
}
function rule_block_tag() {
    var end = null;
    var name = null;
    var tn = null;
    (function() {

      var lcTn = tn.toLowerCase();
      return lcTn !== "pre" && lcTn !== "hr" &&
        constants.HTML.BlockTags.has(tn.toUpperCase());

    })();
    var attribs = null;
    var selfclose = null;
    (function() {

      return [
        tu.buildXMLTag(name, name.toLowerCase(), attribs, end, selfclose,
          tsrOffsets()),
      ];

    })();
}
function rule_list_item() {
}
function rule_li() {
    var bullets = null;
    var c = null;
    (function() {

    if (c === null) {
        c = [];
    }
    // Leave bullets as an array -- list handler expects this
    var tsr = tsrOffsets('start');
    tsr[1] += bullets.length;
    var li = new TagTk('listItem', [], { tsr: tsr });
    li.bullets = bullets;
    return [ li, c ];

    })();
}
function rule_hacky_dl_uses() {
    var bullets = null;
    var tbl = null;
    var s = null;
    (function() {

    // Leave bullets as an array -- list handler expects this
    var tsr = tsrOffsets('start');
    tsr[1] += bullets.length;
    var li = new TagTk('listItem', [], { tsr: tsr });
    li.bullets = bullets;
    return tu.flattenIfArray([li, tbl || [], s || []]);

    })();
}
function rule_dtdd() {
    var bullets = null;
    var lc = null;
    (function() {
 return lc;
    })();
    (function() {
return stops.inc('colon');
    })();
    var c = null;
    var cpos = null;
    (function() {
 return endOffset();
    })();
    (function() {
 stops.counters.colon = 0; return true;
    })();
    var d = null;
    (function() {

        // Leave bullets as an array -- list handler expects this
        // TSR: +1 for the leading ";"
        var numBullets = bullets.length + 1;
        var tsr = tsrOffsets('start');
        tsr[1] += numBullets;
        var li1 = new TagTk('listItem', [], { tsr: tsr });
        li1.bullets = bullets.slice();
        li1.bullets.push(";");
        // TSR: -1 for the intermediate ":"
        var li2 = new TagTk('listItem', [], { tsr: [cpos - 1, cpos], stx: 'row' });
        li2.bullets = bullets.slice();
        li2.bullets.push(":");

        return [ li1 ].concat(c, [ li2 ], d || []);

    })();
    (function() {
 stops.counters.colon = 0; return false;
    })();
}
function rule_list_char() {
}
function rule_full_table_in_link_caption() {
    var r = null;
    (function() {
 return stops.push('table', true);
    })();
    var tbl = null;
    (function() {

            stops.pop('table');
            return tbl;

    })();
    (function() {
 return stops.pop('table');
    })();
    (function() {
 return r;
    })();
}
function rule_table_lines() {
    var r = null;
    (function() {
 return stops.push('table', true);
    })();
    var tl = null;
    var nls = null;
    (function() {

            stops.pop('table');
            return tl.concat(nls);

    })();
    (function() {
 return stops.pop('table');
    })();
    (function() {
 return r;
    })();
}
function rule_table_line() {
}
function rule_table_content_line() {
}
function rule_table_start_tag() {
    var table_start_tag = null;
    var sc = null;
    var startPos = null;
    (function() {
 return endOffset();
    })();
    var b = null;
    var p = null;
    (function() {
 return stops.push('table', false);
    })();
    var ta = null;
    var tsEndPos = null;
    (function() {
 stops.pop('table'); return endOffset();
    })();
    (function() {

        var coms = tu.popComments(ta);
        if (coms) {
          tsEndPos = coms.commentStartPos;
        }

        var da = { tsr: [startPos, tsEndPos] };
        if (p !== "|") {
            // Variation from default
            da.startTagSrc = b + p;
        }

        sc.push(new TagTk('table', ta, da));
        if (coms) {
          sc = sc.concat(coms.buf);
        }
        return sc;

    })();
}
function rule_table_caption_tag() {
    var p = null;
    var args = null;
    var tagEndPos = null;
    (function() {
 return endOffset();
    })();
    var c = null;
    (function() {

        return tu.buildTableTokens("caption", "|+", args, [startOffset(), tagEndPos], endOffset(), c)
            .concat([new EndTagTk('caption')]);

    })();
}
function rule_table_row_tag() {
    var p = null;
    var dashes = null;
    (function() {
 return stops.push('table', false);
    })();
    var a = null;
    var tagEndPos = null;
    (function() {
 stops.pop('table'); return endOffset();
    })();
    var td = null;
    (function() {

        var coms = tu.popComments(a);
        if (coms) {
          tagEndPos = coms.commentStartPos;
        }

        var da = {
          tsr: [ startOffset(), tagEndPos ],
          startTagSrc: p + dashes,
        };

        // We rely on our tree builder to close the row as needed. This is
        // needed to support building tables from fragment templates with
        // individual cells or rows.
        var trToken = new TagTk('tr', a, da);

        var res = [ trToken ];
        if (coms) {
          res = res.concat(coms.buf);
        }
        if (td) {
          res = res.concat(td);
        }
        return res;

    })();
}
function rule_tds() {
    var pp = null;
    var p = null;
    (function() {
 return p;
    })();
    var tdt = null;
    (function() {

        var da = tdt[0].dataAttribs;
        da.stx_v = "row";
        da.tsr[0] = da.tsr[0] - pp.length; // include "||"
        if (pp !== "||" || (da.startTagSrc && da.startTagSrc !== pp)) {
          // Variation from default
          da.startTagSrc = pp + (da.startTagSrc ? da.startTagSrc.substring(1) : '');
        }
        return tdt;

    })();
}
function rule_table_data_tags() {
    var p = null;
    var td = null;
    var tagEndPos = null;
    (function() {
 return endOffset();
    })();
    var tds = null;
    (function() {

        var da = td[0].dataAttribs;
        da.tsr[0] = da.tsr[0] - p.length; // include "|"
        if (p !== "|") {
            // Variation from default
            da.startTagSrc = p;
        }
        return td.concat(tds);

    })();
}
function rule_implicit_table_data_tag() {
    var tagEndPos = null;
    (function() {
 return endOffset();
    })();
    var b = null;
    var tds = null;
    (function() {

        b = tu.flattenIfArray(b);
        var nlTok = b.shift();
        var td = tu.buildTableTokens("td", "|", '', [nlTok.dataAttribs.tsr[1], tagEndPos], endOffset(), b);
        td[0].dataAttribs.autoInsertedStart = true;
        td[0].dataAttribs.autoInsertedEnd = true;
        return [ nlTok ].concat(td, tds);

    })();
}
function rule_table_data_tag() {
    var arg = null;
    var tagEndPos = null;
    (function() {
 return endOffset();
    })();
    var td = null;
    (function() {

        return tu.buildTableTokens("td", "|", arg, [startOffset(), tagEndPos], endOffset(), td);

    })();
}
function rule_table_heading_tags() {
    (function() {
 return stops.push('th', endOffset());
    })();
    var th = null;
    var ths = null;
    var pp = null;
    var tht = null;
    (function() {

            var da = tht[0].dataAttribs;
            da.stx_v = 'row';
            da.tsr[0] = da.tsr[0] - pp.length; // include "!!" or "||"

            if (pp !== "!!" || (da.startTagSrc && da.startTagSrc !== pp)) {
                // Variation from default
                da.startTagSrc = pp + (da.startTagSrc ? da.startTagSrc.substring(1) : '');
            }
            return tht;

    })();
    (function() {

        stops.pop('th');
        th[0].dataAttribs.tsr[0]--; // include "!"
        return th.concat(ths);

    })();
    (function() {
 return stops.onStack('th') !== false ? stops.pop('th') : false;
    })();
}
function rule_table_heading_tag() {
    var arg = null;
    var tagEndPos = null;
    (function() {
 return endOffset();
    })();
    var c = null;
    (function() {

      // This SyntaxStop is only true until we hit the end of the line.
      if (stops.onStack('th') !== false &&
              /\n/.test(input.substring(stops.onStack('th'), endOffset()))) {
          // There's been a newline. Remove the break and continue
          // tokenizing nested_block_in_tables.
          stops.pop('th');
      }
      return true;

    })();
    var d = null;
    (function() {
 return d;
    })();
    (function() {

        return tu.buildTableTokens("th", "!", arg, [startOffset(), tagEndPos], endOffset(), c);

    })();
}
function rule_table_end_tag() {
    var sc = null;
    var startPos = null;
    (function() {
 return endOffset();
    })();
    var p = null;
    var b = null;
    (function() {

      var tblEnd = new EndTagTk('table', [], { tsr: [startPos, endOffset()] });
      if (p !== "|") {
          // p+"<brace-char>" is triggering some bug in pegJS
          // I cannot even use that expression in the comment!
          tblEnd.dataAttribs.endTagSrc = p + b;
      }
      return sc.concat([tblEnd]);

    })();
}
function rule_single_cell_table_args() {
    var single_cell_table_args = null;
    (function() {
 return stops.push('pipe', true);
    })();
    var as = null;
    var s = null;
    var p = null;
    (function() {

        stops.pop('pipe');
        return [as, s, p];

    })();
    (function() {
 return stops.pop('pipe');
    })();
}
function rule_row_syntax_table_args() {
    (function() {
 return stops.inc('tableCellArg');
    })();
    var as = null;
    var s = null;
    var p = null;
    (function() {

        stops.dec('tableCellArg');
        return [as, s, p];

    })();
    (function() {
 return stops.dec('tableCellArg');
    })();
}
function rule_text_char() {
}
function rule_urltext() {
    var al = null;
    (function() {
 return al;
    })();
    var he = null;
    (function() {
 return he;
    })();
    (function() {

              return [
                  new TagTk('span', [new KV('typeof', 'mw:DisplaySpace mw:Placeholder')], { src: ' ', tsr: tsrOffsets('start'), isDisplayHack: true }),
                  "\u00a0",
                  new EndTagTk('span', [], { tsr: tsrOffsets('end'), isDisplayHack: true }),
              ];

    })();
    var bs = null;
    (function() {
 return bs;
    })();
}
function rule_htmlentity() {
    var m = null;
    (function() {

    var cc = Util.decodeEntities(m);
    // if this is an invalid entity, don't tag it with 'mw:Entity'
    if (cc.length > 2 /* decoded entity would be 1 or 2 UTF-16 characters */) {
        return cc;
    }
    return [
        new TagTk('span', [new KV('typeof', 'mw:Entity')], { src: m, srcContent: cc, tsr: tsrOffsets('start') }),
        cc,
        new EndTagTk('span', [], { tsr: tsrOffsets('end') }),
    ];

    })();
}
function rule_spaces() {
}
function rule_space() {
}
function rule_optionalSpaceToken() {
    var s = null;
    (function() {

      if (s.length) {
          return [s];
      } else {
          return [];
      }

    })();
}
function rule_space_or_newline() {
}
function rule_end_of_word() {
}
function rule_unispace() {
}
function rule_space_or_nbsp() {
    var he = null;
    (function() {
 return Array.isArray(he) && /^\u00A0$/.test(he[1]);
    })();
    (function() {
 return he;
    })();
}
function rule_space_or_nbsp_or_dash() {
}
function rule_optionalNewlines() {
    var spc = null;
    (function() {

        if (spc.length) {
            return [spc];
        } else {
            return [];
        }

    })();
}
function rule_sol() {
    (function() {
 return stops.push("sol_il", true);
    })();
    var i = null;
    (function() {
 stops.pop("sol_il"); return true;
    })();
    (function() {
 return i;
    })();
    (function() {
 return stops.pop("sol_il");
    })();
}
function rule_sol_prefix() {
    (function() {

      // Use the sol flag only at the start of the input
      // NOTE: Explicitly check for 'false' and not a falsy value
      return endOffset() === 0 && options.sol !== false;

    })();
    (function() {
 return [];
    })();
}
function rule_empty_line_with_comments() {
    var sp = null;
    var p = null;
    (function() {
 return endOffset();
    })();
    var c = null;
    (function() {

        return [
            sp,
            new SelfclosingTagTk("meta", [new KV('typeof', 'mw:EmptyLine')], {
                tokens: tu.flattenIfArray(c),
                tsr: [p, endOffset()],
            }),
        ];

    })();
}
function rule_comment_space() {
}
function rule_nl_comment_space() {
}
function rule_include_limits() {
    var il = null;
    var c = null;
    var name = null;
    var n = null;
    (function() {

    var incl = n.toLowerCase();
    return incl === "noinclude" || incl === "onlyinclude" ||
      incl === "includeonly";

    })();
    (function() {

    var incl = name.toLowerCase();
    var dp = { tsr: tsrOffsets() };

    // Record variant since tag is not in normalized lower case
    if (name !== incl) {
      dp.srcTagName = name;
    }

    // End tag only
    if (c) {
      return new EndTagTk(name, [], dp);
    }

    var restOfInput = input.substring(endOffset());
    var tagContent = restOfInput.match(new RegExp("^([\\s\\S]*?)(?:</\\s*" + incl + "\\s*>)", "m"));

    // Start tag only
    if (!tagContent || !tagContent[1]) {
      return new TagTk(name, [], dp);
    }

    // Get the content
    var inclContent = tagContent[1];

    // Preserve SOL where necessary (for onlyinclude and noinclude)
    // Note that this only works because we encounter <*include*> tags in
    // the toplevel content and we rely on the php preprocessor to expand
    // templates, so we shouldn't ever be tokenizing inInclude.
    // Last line should be empty (except for comments)
    if (incl !== "includeonly" && stops.onStack("sol_il")) {
      var last = inclContent.split("\n");
      if (!/^(<!--([^-]|-(?!->))*-->)*$/.test(last[last.length - 1])) {
        return false;
      }
    }

    // Tokenize include content in a new tokenizer
    var inclContentToks = (new PegTokenizer(options.env)).tokenize(inclContent);
    inclContentToks = Util.stripEOFTkfromTokens(inclContentToks);

    // Shift tsr
    Util.shiftTokenTSR(inclContentToks, endOffset());

    // Skip past content
    peg$currPos += inclContent.length;

    return [new TagTk(name, [], dp)].concat(inclContentToks);

    })();
    (function() {
 return !!il;
    })();
    (function() {
 return il;
    })();
}
function rule_sof() {
    (function() {
 return endOffset() === 0 && !options.pipelineOffset;
    })();
}
function rule_eof() {
    (function() {
 return endOffset() === input.length;
    })();
}
function rule_newline() {
}
function rule_newlineToken() {
    (function() {
 return [new NlTk(tsrOffsets())];
    })();
}
function rule_eolf() {
}
function rule_comment_space_eolf() {
}
function rule_directive() {
    var e = null;
    (function() {
 return e;
    })();
}
function rule_wikilink_preprocessor_text() {
    var r = null;
    var t = null;
    var wr = null;
    (function() {
 return wr;
    })();
    (function() {

      return tu.flattenStringlist(r);

    })();
}
function rule_extlink_preprocessor_text() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_attribute_preprocessor_text() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_attribute_preprocessor_text_single() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_attribute_preprocessor_text_single_broken() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_attribute_preprocessor_text_double() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_attribute_preprocessor_text_double_broken() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_table_attribute_preprocessor_text() {
    var r = null;
    var t = null;
    var c = null;
    (function() {
 return c;
    })();
    (function() {
 return t;
    })();
    (function() {
 return tu.flattenString(r);
    })();
}
function rule_table_attribute_preprocessor_text_single() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_table_attribute_preprocessor_text_single_broken() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_table_attribute_preprocessor_text_double() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_table_attribute_preprocessor_text_double_broken() {
    var r = null;
    var s = null;
    (function() {
 return s;
    })();
    (function() {

      return tu.flattenString(r);

    })();
}
function rule_pipe() {
}
function rule_pipe_pipe() {
}
