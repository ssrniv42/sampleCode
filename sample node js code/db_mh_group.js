/* global */
var bluebird = require("bluebird");
var _ = require("lodash");
var dbMhDevice = require("./db_mh_device.js");

/** 
 * Gets info for all groups on the platform.
 * This data is used by MH on startup to sync groups
 * @method getAllPlatformGroups
 * @memberof db_mh_group
 * @return {object} - A response with message and result
*/
var getAllPlatformGroups = function(){
	var groupsData = {};
	return getAllMainGroups()
	.then(function(mainGroups){
		groupsData.main_groups = mainGroups;
		return getAllNonMainGroups();
	})
	.then(function(nonMainGroups){
		groupsData.non_main_groups = nonMainGroups;
		return bluebird.resolve({message: "Get all groups for mh successful", result: groupsData});
	});
};

/** 
 * Gets info for all 'Main' groups on the platform.
 *
 * @method getAllMainGroups
 * @memberof db_mh_group
 * @return {object} - list of 'Main' groups key'd by comm_id
*/
function getAllMainGroups(){
	return db.group.findAll({
		where: {title: "Main"},
		include: [{
			model: db.comm,
			where: {table_name: "groups"}
		}, {
			model: db.situational_awareness,
			as: "SaMemberGroups",
			required: false
		}, {
			model: db.nearest_responder,
			as: "NrMembers",
			required: false
		}]
	})
	.then(function(groups){
		groups = _.map(groups, function(group){
			return refineGroupsDataForMH(group);
		});

		return bluebird.resolve(groups);
	});
}


/** 
 * Gets info for all non Main groups on the platform.
 *
 * @method getAllNonMainGroups
 * @memberof db_mh_group
 * @return {object} - list of non Main groups key'd by comm_id
*/
function getAllNonMainGroups(){
	return db.group.findAll({
		where: {title: {$ne: "Main"}},
		include: [{
			model: db.comm,
			where: {table_name: "groups"}
		}, {
			model: db.situational_awareness,
			as: "SaMemberGroups",
			required: false
		}, {
			model: db.nearest_responder,
			as: "NrMembers",
			required: false
		}],
		order: "tier_level"
	})
	.then(function(groups){
		groups = _.map(groups, function(group){
			return refineGroupsDataForMH(group);
		});

		return bluebird.resolve(groups);
	});
}

/** 
 * Refines the group data being sent to MH 
 *
 * @method refineGroupsDataForMH
 * @memberof db_mh_group
 * @return {object} - refined group data
*/
function refineGroupsDataForMH(group){
	group = group.get({plain: true});

	group.comm_id = group.comms[0].id;
	group.sa_memberships = _.map(group.SaMemberGroups, "id");
	group.nr_membership_info = {};

	if(group.NrMembers.length > 0){
		group.nr_membership_info.nr_id = group.NrMembers[0].id;
		group.nr_membership_info.title = group.NrMembers[0].title;
		group.nr_membership_info.device_count = group.NrMembers[0].device_count;
		group.nr_membership_info.radius = group.NrMembers[0].radius;
		group.nr_membership_info.enabled = group.NrMembers[0].enabled;
		group.nr_membership_info.report_age = group.NrMembers[0].report_age;
	}

	group = _.omit(group, ["comms", "SaMemberGroups", "NrMembers"]);

	return group;
}

/** 
 * get group data in the format required by MH for a particular group
 *  
 * @method getGroupByIdForMH
 * @memberof db_mh_group
 * @param {int} id - id of the group
 * @return {object} - formatted info for group
*/
function getGroupByIdForMH(id){
	return db.group.findOne({
		where: {id: id},
		include: [{
			model: db.comm,
			where: {table_name: "groups"}
		}, {
			model: db.situational_awareness,
			as: "SaMemberGroups",
			required: false
		}, {
			model: db.nearest_responder,
			as: "NrMembers",
			required: false
		}],
		order: "tier_level"
	})
	.then(function(group){
		if(!group){
			var msg = "Cannot find group for id: " + id;
			throw new Error(msg);
		}

		return bluebird.resolve(refineGroupsDataForMH(group));
	});
}


/** 
 * Processes and sends group update to MH
 * This replaces S2MH_UPDATE_GROUP_DATA command
 *  
 * @method sendGroupUpdateToMH
 * @memberof db_mh_group
 * @param {object} groupInfo - contains some necessary group info
 * @param {string} method - indicates whether the action is POST or DELETE
 * @return {object} - promise indicating end of process
*/
function sendGroupUpdateToMH(groupInfo, method){
	var mhData = {};
	var mhUrl = "";
	if(method == "DELETE"){
		mhUrl = "/mh/v1/group/" + groupInfo.id + "/" + groupInfo.client_id + "/" + groupInfo.comm_id;
		dbMhDevice.callMHWS(mhData, mhUrl, method);
		return bluebird.resolve();
	}
	else if(method == "POST"){
		return getGroupByIdForMH(groupInfo.id)
		.then(function(group){
			mhData = group;
			mhUrl = "/mh/v1/group";
			dbMhDevice.callMHWS(mhData, mhUrl, method);
			return bluebird.resolve();
		});
	}
	else{
		var msg = "Invalid method passed to function: " + method;
		throw new Error(msg);
	}
}

module.exports = {
	getAllPlatformGroups: getAllPlatformGroups,
	sendGroupUpdateToMH: sendGroupUpdateToMH
};