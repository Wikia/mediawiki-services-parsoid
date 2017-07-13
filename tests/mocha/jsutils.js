/*global describe, it, Promise*/
const should = require("chai").should();

const JSUtils = require('../../lib/jsutils').JSUtils;

describe( 'JSUtils', function () {
	describe( 'deepFreeze', function () {
		it( 'should freeze the passed object', function () {
			const frozenObject = { anObject: 'withProperty' };
			JSUtils.deepFreeze( frozenObject );

			frozenObject.should.be.frozen;
		} );

		it( 'should recursively freeze all properties of the passed object', function () {
			const frozenObject =  {
				anObject: {
					withMultiple: {
						nested: {}
					}
				}
			};

			JSUtils.deepFreeze( frozenObject );

			frozenObject.should.be.frozen;
			frozenObject.anObject.should.be.frozen;
			frozenObject.anObject.withMultiple.should.be.frozen;
			frozenObject.anObject.withMultiple.nested.should.be.frozen;
		} );

		it( 'should not freeze prototype properties', function () {
			const SomeProtoType = function () {};
			SomeProtoType.prototype.protoProperty = {};

			const TestObject = function () {
				SomeProtoType.call(this);
				this.testProperty = {};
			};

			TestObject.prototype = Object.create(SomeProtoType.prototype);

			const frozenTestObject = new TestObject();

			JSUtils.deepFreeze(frozenTestObject);

			frozenTestObject.should.be.frozen;
			frozenTestObject.testProperty.should.be.frozen;
			frozenTestObject.protoProperty.should.not.be.frozen;
		} );

		it( 'should not freeze properties specified in the exclusion list', function () {
			const frozenObject = {
				propertyToFreeze: {},
				propertyToExclude: {},
			};

			const exclusionList = {
				propertyToExclude: true,
			};

			JSUtils.deepFreeze(frozenObject, exclusionList);

			frozenObject.should.be.frozen;
			frozenObject.propertyToFreeze.should.be.frozen;
			frozenObject.propertyToExclude.should.not.be.frozen;
		} );
	} );
} );
