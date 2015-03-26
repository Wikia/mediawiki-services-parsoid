"use strict";
require('es6-shim');
require('prfun');
if (!Array.prototype.last) {
	Object.defineProperty(Array.prototype, 'last', {
		value: function() { return this[this.length - 1]; }
	});
}
if (!global.setImmediate) {
	global.setImmediate = function(cb) {
		process.nextTick(cb);
	};
}
