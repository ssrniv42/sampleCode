/* global db */
/**
 * DB mechanics for feature 
 * 
 * @module
 */

var bluebird = require("bluebird");
var _ = require("lodash");

/**
 * returns all the features available on the server
 * 
 * @method getAllFeature
 * @memberof db_feature
 * @return {object} feature list of all features available on the server
 */
var getAllFeature = function(){
	return db.feature.findAll()
	.then(function(features){
		features = _.map(features, function(feature){
			return feature.get({plain: true});
		});

		features = _.keyBy(features, "id");
		return bluebird.resolve({message: "Get all features successfull", result: features});
	});
};

module.exports = {
	getAllFeature: getAllFeature	
};