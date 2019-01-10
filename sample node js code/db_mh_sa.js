/* global */
var bluebird = require("bluebird");
var _ = require("lodash");


/** 
 * Gets info for all SA Rules on the platform.
 * This data is used by MH on startup to sync SA Rules
 * @method getAllPlatformSaRules
 * @memberof db_mh_sa
 * @return {object} - A response with message and result
*/
var getAllPlatformSaRules = function(){
	return db.situational_awareness.findAll()
	.then(function(saRules){
		saRules = _.map(saRules, function(rule){
			return rule.get({plain: true});
		});
		return bluebird.resolve({message: "Get all SA rules for mh successful", result: saRules});
	});
};

module.exports = {
	getAllPlatformSaRules: getAllPlatformSaRules
};