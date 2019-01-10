/* global log, db */

/*
    This file contains all DB mechanics related to the Nearest Responder module
*/

var bluebird = require("bluebird");
var _ = require("lodash");
var dbPermission= require("./db_permission.js");
var dbGroup = require("./db_group.js");

/** 
 * Returns info of all Nearest Responder Rules belonging to the users client group
 * 
 * @method getAllNrRules
 * @memberof db_nr
 * @param {object} - user information object
 * @return {object} - object containing list of all nearest responder rules belonging to the users client group
*/
var getAllNrRules = function(user){
	return db.nearest_responder.findAll({
		where: {client_id: user.client_id},
		include: [{
			model: db.group,
			as: "NrMembers",
			attributes: ["id"],
			required: false
		}]
	})
	.then(function(nrRules){
		nrRules = _.map(nrRules, function(nrRule){
			return refineNrData(nrRule);
		});
		nrRules = _.keyBy(nrRules, "id");
		return bluebird.resolve({message: "GET All NR Rules Successful", result: nrRules});
	});
};

/** 
 * Returns info for a particular Nearest Responder Rule
 * 
 * @method getNrRuleById
 * @memberof db_nr
 * @param {integer} - nearest responder id
 * @return {object} - object containing info of a particular nearest responder rule of interest
*/
var getNrRuleById = function(id){
	return db.nearest_responder.findOne({
		where: {id: id},
		include: [{
			model: db.group,
			as: "NrMembers",
			attributes: ["id"],
			required: false
		}]
	})
	.then(function(nrRule){
		if(!nrRule){
			log.warn("Cannot find NR rule. There is no rule record for the specified id");
			throw new Error("Cannot find NR rule. There is no rule record for the specified id");
		}		
		return bluebird.resolve({message: "GET NR Rule Successful", result: refineNrData(nrRule), $raw: nrRule});
	});
};

/** 
 * Adds new NR Rule into the DB
 * 
 * @method postNrRule
 * @memberof db_nr
 * @param {object} user - user information object
 * @param {object} nrData - object containing values necessary to successfully add the NR rule
 * @return {object} - object containing info of newly created NR rule and status message
*/
var postNrRule = function(user, nrData){
	return db.sequelize.transaction(function(t){
		nrData.client_id = user.client_id;
		var options = {user: user, transaction: t};
		return processInsertNrRule(nrData, options);
	})
	.tap(function(){
		if(nrData.send_update_group_members){
			return sendGroupUpdateToMH(nrData.members.groups);
		}
		return;
	})
	.then(function(nrRule){
		return getNrRuleById(nrRule.id);
	})
	.then(function(nrRule){
		return bluebird.resolve({message: "POST New NR Rule Successful", result: nrRule.result});
	});	
};

/** 
 * Updates info for a particular NR Rule in the DB
 * 
 * @method putNrRule
 * @memberof db_nr
 * @param {object} user - user information object
 * @param {integer} id - id of the NR rule being updated
 * @param {object} nrData - object containing NR rule info that needs to be updated
 * @return {object} - object containing updated info of NR rule and status message
*/
var putNrRule = function(user, id, nrData){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		return processUpdateNrRule(id, nrData, options);
	})
	.then(function(){
		if(nrData.send_update_group_members && nrData.member_groups_array.length > 0){
			return sendGroupUpdateToMH(nrData.member_groups_array);
		}
		return;
	})
	.then(function(){
		return getNrRuleById(id);
	})
	.then(function(nrRule){
		return bluebird.resolve({message: "PUT NR Rule Successful", result: nrRule.result});
	});
};

/** 
 * Deletes record of an existing NR Rule
 * 
 * @method deleteNrRule
 * @memberof db_nr
 * @param {object} user - user information object
 * @param {integer} id - id of the NR rule being deleted
 * @return {object} - object containing info of deleted NR rule and status message 
*/
var deleteNrRule = function(user, id){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		
		return processDeleteNrRule(id, options);
	})
	.tap(function(nrRule){
		return sendGroupUpdateToMH(nrRule.members.groups);
	})
	.then(function(nrRule){
		return bluebird.resolve({message: "DELETE NR Rule Successful", result: nrRule});
	});
};

/** 
 * Refines the SA data object to match expectation on the front end.
 * @method refineNrData
 * @memberof db_nr
 * @param {object} rawNrRule - object containing data related to a NR Rule as returned by sequelize query
 * @return {object} - refined NR Rule object, with parameters matching expectation on the front end
*/
function refineNrData(rawNrRule){
	var nrRule = rawNrRule.get({plain: true});
	nrRule.members = {
		groups: _.map(nrRule.NrMembers, "id"),
		devices: []
	};

	nrRule = _.omit(nrRule, ["NrMembers"]);
	return nrRule;
}

/** 
 * Processes and inserts a particular NR Rule in the DB
 * 
 * @method processInsertNrRule
 * @memberof db_nr
 * @param {object} nrData - object containing NR rule info that needs to be updated
 * @param {object} options - object containing user and transaction info
 * @return {object} - object containing info of inserted NR Rule
*/
function processInsertNrRule(nrData, options){
	var dbNr = db.nearest_responder.build(nrData);

	return dbNr.save({user: options.user, transaction: options.transaction})
	//Add NR groups
	.tap(function(nrRule){
		if(nrData.members && nrData.members.groups != undefined) {
			nrData.send_update_group_members = true;
			return dbPermission.validateUserPermissionForGroups(options.user, nrData.members.groups)
			.then(function(){
				return nrRule.addNrMembers(nrData.members.groups, {transaction: options.transaction});
			});
		}
		else return bluebird.resolve();
	})
	.tap(function(nrRule){
		return uniqueGroupPerRuleValidation(nrRule.id, nrData.members.groups, options);
	});
}


/** 
 * Processes and updates info of a particular NR Rule in the DB
 * 
 * @method  processUpdateNrRule
 * @memberof db_nr
 * @param {int} id - id of the NR Rule being updated
 * @param {object} NrData - object containing NR rule info that needs to be updated
 * @param {object} options - object containing user and transaction info
 * @return {object} - object containing info of updated NR Rule
*/
function processUpdateNrRule(id, nrData, options){
	var originalNrRule = {};
	return uniqueGroupPerRuleValidation(id, nrData.members.groups, options) 
	.then(function(){
		return getNrRuleById(id);
	})
	.then(function(nrRule){
		originalNrRule = nrRule.result;
		return nrRule.$raw;	
	})
	.tap(function(nrRule){
		nrRule = _.extend(nrRule, nrData);
		return nrRule.save({user: options.user, transaction: options.transaction});
	})
	.tap(function(nrRule){
		if(nrData.members && nrData.members.groups != undefined) {
			nrData.send_update_group_members = true;
			var groupsArray = _.concat(nrData.members.groups, originalNrRule.members.groups);
			nrData.member_groups_array = _.uniq(groupsArray);
			return updateNrMembers(nrRule, nrData.members.groups, options);
		}
		else bluebird.resolve();
	});
}

/** 
 * Processes and deletes a particular NR Rule from the DB
 * 
 * @method  processDeleteNrRule
 * @memberof db_nr
 * @param {int} id - id of the NR Rule being updated
 * @param {object} options - object containing user and transaction info
 * @return {object} - object containing info of deleted NR Rule
*/
function processDeleteNrRule(id, options){
	var originalNrRule = {};
	return getNrRuleById(id)
	.then(function(nrRule){
		originalNrRule = nrRule.result;
		return nrRule.$raw;	
	})
	.tap(function(nrRule){
		return nrRule.setNrMembers([], {transaction: options.transaction});
	})
	.tap(function(nrRule){
		return nrRule.destroy({user: options.user, transaction: options.transaction});
	})
	.then(function(){
		return bluebird.resolve(originalNrRule);
	});
}

/** 
 * Checks if groups assigned to NR rules are unique to each NR Rule.
 * Each group can only be part/member of 1 NR Rule
 * 
 * @method uniqueGroupPerRuleValidation
 * @memberof db_nr
 * @param {int} nrRuleId - id of the NR Rule being updated
 * @param {array} groupIdArray - Array of group Id's
 * @param {object} options - object containing user and transaction info
 * @return {object} - Promise indicating process is complete 
 * or throws error if groups belong to ther NR Rule
*/
function uniqueGroupPerRuleValidation(nrRuleId, groupIdArray, options){
	return db.nearest_responder.count({
		where: {id: {$ne: nrRuleId}},
		include: [{
			model: db.group,
			where: {id: groupIdArray},
			as: "NrMembers",
			attributes: ["id"],
			required: true
		}],
		transaction: options.transaction
	})
	.then(function(count){
		//console.log("uniqueGroupPerRuleValidation", count);
		if(count > 0){
			throw new Error("Groups assigned to this NR rule belong other NR Rules. Each group should be member of only one NR Rule");
		}
		return bluebird.resolve();
	});
}

/** 
 * Processes and updates member groups of the NR rule
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateNrrMembers
 * @memberof db_nr
 * @param {object} nrRule - object containing NR Rule instance that needs to be updated
 * @param {array} memberGroups - array containing id's of members who are groups
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateNrMembers(nrRule, memberGroups, options){
	return dbGroup.getPermittedGroups(options.user)
	.then(function(groups){
		return bluebird.resolve(_.map(groups, "id"));
	})
	.tap(function(permittedGroups){
		return nrRule.removeNrMembers(permittedGroups, {transaction: options.transaction});
	})
	.tap(function(permittedGroups){
		var finalNrMemberGroups = _.intersection(permittedGroups, memberGroups);
		return nrRule.addNrMembers(finalNrMemberGroups, {transaction: options.transaction});
	});
}


/** 
 * Sends group update (S2MH_UPDATE_GROUP_DATA) to mh for each group in array
 * 
 * @method sendGroupUpdateToMH
 * @memberof db_nr
 * @param {array} groupIdArray - Array of group Id's
 * @return {object} - Promise indicating process is complete
*/
function sendGroupUpdateToMH(groupIdArray){
	var dbMhGroup = require("./db_mh_group.js");
	return bluebird.each(groupIdArray, function(groupId){
		return dbMhGroup.sendGroupUpdateToMH({id: groupId}, "POST"); 
	});
}



module.exports = {
	getAllNrRules: getAllNrRules,
	getNrRuleById: getNrRuleById,
	postNrRule: postNrRule,
	putNrRule: putNrRule,
	deleteNrRule: deleteNrRule	
};