/* global log, db */

/* 
	This file contains all DB mechanics related to the SA Rules module
*/
var bluebird = require("bluebird");
var _ = require("lodash");
var dbPermission= require("./db_permission.js");
var dbGroup = require("./db_group.js");
var dbDevice = require("./db_device.js");

/** 
 * Returns list of all SA Rules belonging to the user's client group
 * 
 * @method getAllSaRules 
 * @memberof db_sa
 * @param {object} user - user information object
 * @return {object} - list of all SA rules that belong to the user's client group
*/
var getAllSaRules = function(user){
	return db.situational_awareness.findAll({
		where: {client_id: user.client_id},
		include: [{
			model: db.device,
			as: "SaMemberDevices",
			attributes: ["id"],
			required: false
		}, {
			model: db.group,
			as: "SaMemberGroups",
			attributes: ["id"],
			required: false
		}, {
			model: db.device,
			as: "SaSubscriberDevices",
			attributes: ["id"],
			required: false
		}]
	})	
	.then(function(saRules){
		saRules = _.map(saRules, function(saRule){
			return refineSaData(saRule);
		});
		saRules = _.keyBy(saRules, "id");
		return bluebird.resolve({message: "GET All SA Rules Successful", result: saRules});
	}); 
};

/** 
 * Returns SA Rule info for a particular SA Rule
 * 
 * @method getSaRuleById
 * @memberof db_sa
 * @param {integer} id - SA Rule Id
 * @return {object} - object containg info of a particular SA rule
*/
var getSaRuleById = function(id){   
	return db.situational_awareness.findOne({
		where: {id: id},
		include: [{
			model: db.device,
			as: "SaMemberDevices",
			attributes: ["id"],
			required: false
		}, {
			model: db.group,
			as: "SaMemberGroups",
			attributes: ["id"],
			required: false
		}, {
			model: db.device,
			as: "SaSubscriberDevices",
			attributes: ["id"],
			required: false
		}]
	})	
	.then(function(saRule){  
		if(!saRule){
			log.warn("Cannot find SA rule. There is no rule record for the specified id");
			throw new Error("Cannot find SA rule. There is no rule record for the specified id");
		}                    
		return bluebird.resolve({message: "GET SA Rule Successful", result: refineSaData(saRule), $raw: saRule});
	});
};

/** 
 * Adds new SA Rule into the DB
 * 
 * @method postSaRule
 * @memberof db_sa
 * @param {object} user - user information object
 * @param {object} saData - object containing values necessary to successfully add the SA rule
 * @return {object} - object containing info of newly created SA rule and status message
*/
var postSaRule = function(user, saData){
	return db.sequelize.transaction(function(t){
		saData.client_id = user.client_id;
		var options = {user: user, transaction: t};
		return processInsertSaRule(saData, options);	
	})
	.then(function(){
		if(saData.send_update_group_members){
			return sendGroupUpdateToMH(saData.members.groups);
		}
		return;
	})
	.then(function(){
		if(saData.send_update_device_members){
			return sendDeviceUpdateToMH(saData.members.devices);
		}
		return;
	})
	.then(function(){
		if(saData.send_update_device_subscribers){
			return sendDeviceUpdateToMH(saData.subscribers.devices);
		}
		return;
	})
	.then(function(){
		return getSaRuleById(saData.id);
	})
	.then(function(saRule){            
		return bluebird.resolve({message: "POST SA Rule Successful", result: saRule.result}); 
	});
};

/** 
 * Updates info for a particular SA Rule in the DB
 * 
 * @method putSaRule
 * @memberof db_sa
 * @param {object} user - user information object
 * @param {integer} id - id of the SA rule being updated
 * @param {object} saData - object containing SA rule info that needs to be updated
 * @return {object} - object containing updated info of SA rule and status message
*/
var putSaRule = function(user, id, saData){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		return processUpdateSaRule(id, saData, options);
	})
	.then(function(){
		if(saData.send_update_group_members && saData.member_groups_array.length > 0){
			return sendGroupUpdateToMH(saData.member_groups_array);
		}
		return;
	})
	.then(function(){
		if(saData.send_update_device_members && saData.member_devices_array.length > 0){
			return sendDeviceUpdateToMH(saData.member_devices_array);
		}
		return;
	})
	.then(function(){
		if(saData.send_update_device_subscribers && saData.subscriber_devices_array.length > 0){
			return sendDeviceUpdateToMH(saData.subscriber_devices_array);
		}
		return;
	})
	.then(function(){
		return getSaRuleById(id);
	})
	.then(function(saRule){
		return bluebird.resolve({message: "PUT SA Rule Successful", result: saRule.result});
	});
};

/** 
 * Deletes record of an existing SA Rule
 * 
 * @method deleteSaRule
 * @memberof db_sa
 * @param {object} user - user information object
 * @param {integer} id - id of the SA rule being deleted
 * @return {object} - object containing info of deleted SA rule and status message 
*/
var deleteSaRule = function(user, id){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		
		return processDeleteSaRule(id, options);
	})
	.tap(function(saRule){
		return sendGroupUpdateToMH(saRule.members.groups);
	})
	.tap(function(saRule){
		return sendDeviceUpdateToMH(saRule.members.devices);
	})
	.tap(function(saRule){
		return sendDeviceUpdateToMH(saRule.subscribers.devices);
	})
	.then(function(saRule){
		return bluebird.resolve({message: "DELETE SA Rule Successful", result: saRule});
	});
};

/** 
 * Refines the SA data object to match expectation on the front end.
 * @method refineSaData
 * @memberof db_sa
 * @param {object} rawSaRule - object containing data related to a SA Rule as returned by sequelize query
 * @return {object} - refined SA Rule object, with parameters matching expectation on the front end
*/
function refineSaData(rawSaRule){
	var saRule = rawSaRule.get({plain: true});
	
	saRule.members = {
		groups: _.map(saRule.SaMemberGroups, "id"),
		devices: _.map(saRule.SaMemberDevices, "id")
	};

	saRule.subscribers = {
		groups: [],
		devices: _.map(saRule.SaSubscriberDevices, "id")
	};

	saRule = _.omit(saRule, ["SaMemberDevices", "SaMemberGroups", "SaSubscriberDevices"]);
	return saRule;
}

/** 
 * Processes and inserts a particular SA Rule in the DB
 * 
 * @method processInsertSaRule
 * @memberof db_sa
 * @param {object} saData - object containing SA rule info that needs to be inserted
 * @param {object} options - object containing user and transaction info
 * @return {object} - object containing info of inserted SA Rule
*/
function processInsertSaRule(saData, options){
	var dbSa = db.situational_awareness.build(saData);
	
	//Add SA Rule
	return dbSa.save({user: options.user, transaction: options.transaction})
	.tap(function(saRule){
		saData.id = saRule.id;     
		//Add SA member groups
		if(saData.members && saData.members.groups != undefined){
			saData.send_update_group_members = true;
			return dbPermission.validateUserPermissionForGroups(options.user, saData.members.groups)
			.then(function(){
				return saRule.addSaMemberGroups(saData.members.groups, {transaction: options.transaction});
			});
		}
		else return bluebird.resolve();
	})
	.tap(function(saRule){
		//Add SA member devices
		if(saData.members && saData.members.devices != undefined){
			saData.send_update_device_members = true;
			return dbPermission.validateUserPermissionForDevices(options.user, saData.members.devices)
			.then(function(){
				return saRule.addSaMemberDevices(saData.members.devices, {transaction: options.transaction});
			});
		}
		else return bluebird.resolve();
	})
	.tap(function(saRule){
		//Add SA subscriber devices
		if(saData.subscribers && saData.subscribers.devices != undefined){
			saData.send_update_device_subscribers = true;
			return dbPermission.validateUserPermissionForDevices(options.user, saData.subscribers.device)
			.then(function(){
				return saRule.addSaSubscriberDevices(saData.subscribers.devices, {transaction: options.transaction});
			});
		}
		else return bluebird.resolve();
	})
	.tap(function(saRule){
		var dbMhDevice = require("./db_mh_device.js");
		var mhData = {
			id: saRule.id,
			client_id: saRule.client_id,
			title: saRule.title,
			distance: saRule.distance,
			interval: saRule.interval
		};

		dbMhDevice.callMHWS(mhData, "/mh/v1/sa", "POST");
		return bluebird.resolve();
	});
}

/** 
 * Processes and updates info of a particular SA Rule in the DB
 * 
 * @method  processUpdateSaRule
 * @memberof db_sa
 * @param {int} id - id of the SA Rule being updated
 * @param {object} saData - object containing SA rule info that needs to be updated
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicate end of process
*/
function processUpdateSaRule(id, saData, options){    
	var originalSaRule = {};
	return getSaRuleById(id)
	.then(function(saRule){
		originalSaRule = saRule.result;
		return saRule.$raw;
	})
	.tap(function(saRule){
		saRule = _.extend(saRule, saData);
		return saRule.save({user: options.user, transaction: options.transaction});
	})
	.tap(function(saRule){     
		//Update SA member groups
		if(saData.members && saData.members.groups != undefined){
			saData.send_update_group_members = true;
			var groupsAdded = _.difference(saData.members.groups, originalSaRule.members.groups);
			var groupsRemoved = _.difference(originalSaRule.members.groups, saData.members.groups);
			saData.member_groups_array = _.concat(groupsAdded, groupsRemoved);
			return updateSaMemberGroups(saRule, saData.members.groups, options);
		}
		else return bluebird.resolve();
	})
	.tap(function(saRule){
		//Update SA member devices
		if(saData.members && saData.members.devices != undefined){
			saData.send_update_device_members = true;
			return updateSaMemberDevices(saRule, saData.members.devices, options)
			.then(function(){
				var devicesAdded = _.difference(saData.members.devices, originalSaRule.members.devices);
				var devicesRemoved = _.difference(originalSaRule.members.devices, saData.members.devices);
				saData.member_devices_array = _.concat(devicesAdded, devicesRemoved);
				return;
			});
		}
		else return bluebird.resolve();
	})
	.tap(function(saRule){
		//Update SA subscriber devices
		if(saData.subscribers && saData.subscribers.devices != undefined){
			saData.send_update_device_subscribers = true;
			return updateSaSubscriberDevices(saRule, saData.subscribers.devices, options)
			.then(function(){
				var devicesAdded = _.difference(saData.subscribers.devices, originalSaRule.subscribers.devices);
				var devicesRemoved = _.difference(originalSaRule.subscribers.devices, saData.subscribers.devices);
				saData.subscriber_devices_array = _.concat(devicesAdded, devicesRemoved);
				return;
			});
		}
		else return;
	})
	.tap(function(saRule){
		var dbMhDevice = require("./db_mh_device.js");
		
		var mhData = {
			id: saRule.id,
			client_id: saRule.client_id,
			title: saRule.title,
			distance: saRule.distance,
			interval: saRule.interval
		};

		dbMhDevice.callMHWS(mhData, "/mh/v1/sa", "POST");
		return bluebird.resolve();
	});
}

/** 
 * Processes and deletes a particular SA Rule from the DB
 * 
 * @method  processDeleteSaRule
 * @memberof db_sa
 * @param {int} id - id of the SA Rule being updated
 * @param {object} options - object containing user and transaction info
 * @return {object} - object containing info of deleted SA Rule
*/
function processDeleteSaRule(id, options){
	var originalSaRule = {};
	return getSaRuleById(id)
	.then(function(saRule){
		originalSaRule = saRule.result;
		return saRule.$raw;
	})
	.tap(function(saRule){
		//delete SA member groups
		return saRule.setSaMemberGroups([], {transaction: options.transaction});
	})
	.tap(function(saRule){
		//delete SA member devices
		return saRule.setSaMemberDevices([], {transaction: options.transaction});
	})
	.tap(function(saRule){
		//delete SA subscriber devices
		return saRule.setSaSubscriberDevices([], {transaction: options.transaction});
	})
	.tap(function(saRule){
		//delete SA Rule
		return saRule.destroy({user: options.user, transaction: options.transaction});
	})
	.then(function(){
		var dbMhDevice = require("./db_mh_device.js");
		
		var mhUrl = "/mh/v1/sa/" + originalSaRule.id;
		dbMhDevice.callMHWS({}, mhUrl, "DELETE");
		return bluebird.resolve();
	})
	.then(function(){
		return bluebird.resolve(originalSaRule);
	});
}


/** 
 * Processes and updates member groups of the SA rule
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateSaMemberGroups
 * @memberof db_sa
 * @param {object} saRule - object containing SA Rule instance that needs to be updated
 * @param {array} memberGroups - array containing id's of members who are groups
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateSaMemberGroups(saRule, memberGroups, options){
	return dbGroup.getPermittedGroups(options.user)
	.then(function(groups){
		return bluebird.resolve(_.map(groups, "id"));
	})
	.tap(function(permittedGroups){
		return saRule.removeSaMemberGroups(permittedGroups, {transaction: options.transaction});
	})
	.tap(function(permittedGroups){
		var finalSaMemberGroups = _.intersection(permittedGroups, memberGroups);
		return saRule.addSaMemberGroups(finalSaMemberGroups, {transaction: options.transaction});
	});
}


/** 
 * Processes and updates member devices of the SA rule
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateSaMemberDevices
 * @memberof db_sa
 * @param {object} saRule - object containing SA Rule instance that needs to be updated
 * @param {array} memberDevices - array containing id's of members who are devices
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateSaMemberDevices(saRule, memberDevices, options){
	return dbDevice.getPermittedDevices(options.user)
	.then(function(devices){
		return bluebird.resolve(_.map(devices, "id"));
	})
	.tap(function(permittedDevices){
		return saRule.removeSaMemberDevices(permittedDevices, {transaction: options.transaction});
	})
	.tap(function(permittedDevices){
		var finalSaMemberDevices = _.intersection(permittedDevices, memberDevices);
		return saRule.addSaMemberDevices(finalSaMemberDevices, {transaction: options.transaction});
	});
}


/** 
 * Processes and updates subscriber devices of the SA rule
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateSaSubscriberDevices
 * @memberof db_sa
 * @param {object} saRule - object containing SA Rule instance that needs to be updated
 * @param {array} subscriberDevices - array containing id's of subscribers who are devices
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateSaSubscriberDevices(saRule, subscriberDevices, options){
	return dbDevice.getPermittedDevices(options.user)
	.then(function(devices){
		return bluebird.resolve(_.map(devices, "id"));
	})
	.tap(function(permittedDevices){
		return saRule.removeSaSubscriberDevices(permittedDevices, {transaction: options.transaction});
	})
	.tap(function(permittedDevices){
		var finalSaSubscriberDevices = _.intersection(permittedDevices, subscriberDevices);
		return saRule.addSaSubscriberDevices(finalSaSubscriberDevices, {transaction: options.transaction});
	});
}


/** 
 * Sends group update (S2MH_UPDATE_GROUP_DATA) to mh for each group in array
 * 
 * @method sendGroupUpdateToMH
 * @memberof db_sa
 * @param {int} saRuleId - id of the SA Rule being updated
 * @param {array} groupIdArray - Array of group Id's
 * @return {object} - Promise indicating process is complete
*/
function sendGroupUpdateToMH(groupIdArray){
	var dbMhGroup = require("./db_mh_group.js");
	return bluebird.map(groupIdArray, function(groupId){
		return dbMhGroup.sendGroupUpdateToMH({id: groupId}, "POST"); 
	});
}


/** 
 * Iterates and sends device update (S2MH_UPDATE_ASSET_DATA) command to MHWS 
 * 
 * @method sendDeviceUpdateToMH
 * @memberof db_sa
 * @param {array} deviceIdArray - Array of device Id's
 * @return {object} - Promise indicating process is complete
*/
function sendDeviceUpdateToMH(deviceIdArray){
	var dbMhDevice = require("./db_mh_device.js");
	//This function calls MH web service to send the S2MH asset update command
	return bluebird.map(deviceIdArray, function(deviceId){
		return dbMhDevice.sendDeviceUpdateToMH({id: deviceId}, "POST");
	});
}


module.exports = {
	getAllSaRules: getAllSaRules,
	getSaRuleById: getSaRuleById,
	postSaRule: postSaRule,
	putSaRule: putSaRule,
	deleteSaRule: deleteSaRule
};