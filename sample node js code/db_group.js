/* global */
var _ = require("lodash");
var bluebird= require("bluebird");
var dbDevice= require("./db_device.js");
var dbUser= require("./db_user.js");
var dbMhGroup = require("./db_mh_group.js");
var dbMhDevice = require("./db_mh_device.js");


/**
 * returns a list of groups and their respective devices,
 * 
 * @method getAllGroups
 * @memberof db_group
 * @param {object} user - user information object 
 * @return {object} list of groups and their respective devices
 */
var getAllGroups = function(user){
	return getPermittedGroups(user)	
	.then(function(permittedGroups){
		return getGroupsById(_.map(permittedGroups, "id"));
	})
	.then(function(groups){
		return { result: groups, message: "Get All Groups successful" };
	});
};


/**
 * returns a list of groups that the user has permission to view
 * 
 * @method getPermittedGroups
 * @memberof db_group
 * @param {object} user - user information object 
 * @return {object} list of groups
 */
function getPermittedGroups(user){
	var allGroups= [];
	return getGroupsRecursive(user, null, allGroups, true);
}  


/**
 * processes and returns list of groups/group and their respective location info
 * 
 * @method getGroupsById
 * @memberof db_group
 * @param {Array/id} groupIds - Array of group Ids or just an id of a group 
 * @return {object} object containing group info and respective devices of groups/group
*/
function getGroupsById(groupIds){
	var gIds= _.concat([], groupIds);
	
	return db.group.findAll({
		where: {id: gIds},
		attributes: ["id", "title", "parent_id", "tier_level"],
		include: [{
			model: db.user,	
			attributes: ["id"]
		}, {
			model: db.device,
			attributes: ["id"]				
		}, {
			model: db.device,
			attributes: ["id"],
			as: "SyncedDevices",
			required: false				
		}, {
			model: db.comm
		}]
	})
	.then(function(groups){
		groups= refineGroupData(groups);
		
		// returning just the group object if groupId is not an array 
		if(!_.isArray(groupIds)) groups= groups[groupIds];

		return bluebird.resolve(groups);
	});
}

/**
 * @method getGroupsRecursive
 * @memberOf db_group
 * 
 * @param {Object} user -  user information object 
 * @param {Array} parentIds - array of group IDs extracted in the previous step to be used as parent Id in current step
 * @param {Array} allGroups - array of all groups extracted 
 * @param {Boolean} checkPerm - indicates whether group-user relation should be verified
 * 
 * @return {Object} list of groups keyed by Group ID
 */
function getGroupsRecursive(user, parentIds, allGroups, checkPerm){
	// do not check parent when getting top level permitted groups
	var whereObj= { client_id: user.client_id };
	if(!checkPerm){
		whereObj= { client_id: user.client_id, parent_id: parentIds };
	}

	return db.group.findAll({
		where: whereObj,
		attributes: ["id", "title", "parent_id", "tier_level"],
		include: [{
			model: db.user,	
			attributes: ["id"],	
			where: {id: user.user_id},			
			// Only permission of top level groups need to be verified. All sub-groups of permitted groups are permitted to the user.
			required: checkPerm 
		},
		{
			model: db.device,	
			attributes: ["id"]
		}]
	})
	.bind({})
	.then(function(groups){

		if(!groups.length){
			// exit recursion if current iteration does not return any groups
			return bluebird.resolve(allGroups);
		}else{
			allGroups= _.concat(allGroups, groups);			
			return getGroupsRecursive(user, _.map(groups, "id"), allGroups, false);
		}
	});
}

/**
 * Refines the group data object to match expectation on the front end. 
 * 
 * @method refineGroupData
 * @memberof db_group
 * @param {object} groups - object containing info of groups/group retrieved from the DB
 * @return {object} refined group object, with parameters matching expectation on the front end
*/
function refineGroupData(groups){
	groups= _.map(groups, function(group){
		group= group.get({ plain: true });
		group.devices= _.map(group.devices, "id");
		group.comm_id= group.comms[0].id;
		group.users= _.map(group.users, "id");
		group.sync = {devices: _.map(group.SyncedDevices, "id")};
		group= _.omit(group, ["comms", "SyncedDevices"]);
		
		return group;
	});
	return _.keyBy(groups, "id");		
}



/**
 * finds a group by ID if user has access permission to the group
 * @method findGroup
 * @memberOf db_group
 * 
 * @param {Object} user - User object from the token
 * @param {Number} groupId - Group Id
 * 
 * @return {Object} Sequelize instance of the group or undefined if not found 
 */
function findGroup(user, groupId){
	return getPermittedGroups(user)
	.then(function(groups){
		return _.find(groups, { id: groupId });
	});
}

/**
 * finds if user has access permission to view any of the group Ids in the array. 
 * filters out the non-permitted groups and only returns info of the groups user has 
 * permission to view
 * 
 * @method findGroups
 * @memberOf db_group
 * 
 * @param {Object} user - User object from the token
 * @param {Array} groupIds - Array of group Ids
 * 
 * @return {Object} Returns an object containing groups that the user has permission to view
 */
function findGroups(user, groupIds){
	return getPermittedGroups(user)
	.then(function(groups){
		groupIds = _.concat([], groupIds);
		return _.reduce(groups, function(result, group){
			if(_.indexOf(groupIds, group.id) > -1){
				return _.concat(result, [group]);
			}else{
				return result;
			}
		}, []);
	});
}



/**
 * Stores users and devices related to the group through association table
 * @method saveUsersAndDevices
 * @memberOf db_group
 * 
 * @param {Object} group - sequelize instance of the group
 * @param {Array} users - Array of user IDs
 * @param {Array} devices - Array of device IDs 
 * @param {Object} transaction - Sequelize transaction object
 * 
 * @return {Object} A promise  
 */
function saveUsersAndDevices(user, group, users, devices, transaction){	
	return dbUser.getAllPermittedUsers(user)
	.bind({})
	.then(function(permittedUsers){
		if(!users) return bluebird.resolve();

		var permittedUserIds= _.map(permittedUsers, "id");
		var nonPermitted= _.difference(users, permittedUserIds);
		
		if(nonPermitted.length){
			throw new Error("Access to Users "+nonPermitted+" is not permitted.");
		}
		return group.setUsers(users, { transaction: transaction });
	})
	.then(function(){
		return dbDevice.getPermittedDevices(user);
	})	
	.then(function(permittedDevices){
		if(!devices) return bluebird.resolve(); 	

		var permittedDeviceIds= _.map(permittedDevices, "id");
		var nonPermitted= _.difference(devices, permittedDeviceIds);
		if(nonPermitted.length){			
			throw new Error("Access to Devices "+nonPermitted+" is not permitted.");
		}
		
		return group.setDevices(devices, { transaction: transaction });		
	})
	.then(function(){
		return validateCustomerAdminGroupPerms(user, transaction);
	});
}

/*
	Checks if customer admin user has access to main group.
	This is important to make sure that customer admin always has access to 'Main' group
*/
function validateCustomerAdminGroupPerms(user, transaction){
	return db.user.findOne({
		where: {client_id: user.client_id},
		include: [{
			model: db.role,
			where: {title: "Customer Admin"},
			required: true
		}, {
			model: db.group,
			where: {title: "Main", client_id: user.client_id},
			required: false
		}],
		transaction: transaction
	})
	.then(function(customerAdminUser){
		if(!customerAdminUser){
			throw new Error("Client does not have a registered Customer Admin User");
		}

		if(customerAdminUser.groups.length == 0){
			return addMainGroupToCustomerAdminUser(customerAdminUser, user, transaction);
		}
		return bluebird.resolve();
	});
}

/*
	Adds Main group back to Customer Admin User
*/
function addMainGroupToCustomerAdminUser(customerAdminUser, user, transaction){
	return db.group.findOne({
		where: {client_id: user.client_id, title: "Main"},
		transaction: transaction
	})
	.then(function(group){
		return customerAdminUser.setGroups([group.id], {transaction: transaction});
	});
}

/**
 * Stores a new group in the DB
 * @method postGroup
 * @memberOf db_group
 * 
 * @param {Object} user - User object from the token 
 * @param {Object} groupData - Data of the new group
 * 
 * @return {Object} A promise  
 */
function postGroup(user, groupData){
	var parentId= groupData.parent_id;
	var userId= user.user_id;

	return findGroup(user, parentId)
	.bind({})
	.then(function(parent){
		if(!parent) throw new Error("Parent group "+parentId+" does not exist or not permitted for user "+userId+".");		

		checkDevicesInParent(parent, groupData.devices);

		groupData.tier_level= parent.tier_level+ 1;		

		return db.sequelize.transaction(function(t){			
			var options = {user: user, transaction: t};
			return processInsertGroup(groupData, options);
		});
	})
	.tap(function(group){
		return dbMhGroup.sendGroupUpdateToMH({id: group.id}, "POST");
	})
	.tap(function(){
		if(groupData.devices && groupData.devices.length > 0){   
			return bluebird.each(groupData.devices, function(deviceId){    
				return dbMhDevice.sendDeviceUpdateToMH({id: deviceId}, "POST");   
			});  
		}  
		return bluebird.resolve();
	})
	.then(function(group){
		return getGroupsById(group.id);
	})
	.then(function(group){
		return { result: group, message: "Add Group successful" };
	});	 
}


/**
 * processes the insert of a new group
 * @method processInsertGroup
 * @memberOf db_group
 * 
 * @param {Object} groupData - Data of the new group
 * @param {Object} options - Object containing user and transaction info
 * 
 * @return {Object} A promise  
 */
function processInsertGroup(groupData, options){
	var groupBuild= db.group.build(_.pick(groupData, ["title", "parent_id", "tier_level", "client_id"]));
	return groupBuild.save({ transaction: options.transaction })
	.tap(function(group){
		return saveUsersAndDevices(options.user, group, groupData.users, groupData.devices, options.transaction);
	})
	.tap(function(group){
		return addGroupSyncedDevices(group, groupData, options);
	})
	.tap(function(group){
		var dbComm = db.comm.build({
			row_id: group.id,
			table_name: "groups"
		});
		return dbComm.save({user: options.user, transaction: options.transaction})
		.then(function(comm){
			groupData.comm_id = comm.id;
		});
	})
	.tap(function(group){
		groupData.id = group.id;
		return;
	});
}


/**
 * processes and adds association to group_sync_devices
 * @method addGroupSyncedDevices
 * @memberOf db_group
 * 
 * @param {Object} group - Sequelize instance of the group being added
 * @param {Object} groupData - Data of the new group
 * @param {Object} options - Object containing user and transaction info
 * 
 * @return {Object} A promise  
 */
function addGroupSyncedDevices(group, groupData, options){
	var dbPermission= require("./db_permission.js");
	if(groupData.sync && groupData.sync.devices != undefined){
		return dbPermission.validateUserPermissionForDevices(options.user, groupData.sync.devices)
		.then(function(){
			return group.addSyncedDevices(groupData.sync.devices, {transaction: options.transaction});
		}); 
	}
	return bluebird.resolve();
}

/** 
 * Processes and updates synced devices of the group
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateGroupSyncedDevices
 * @memberof db_group
 * @param {Object} group - Sequelize instance of the group being updated
 * @param {Object} groupData - Data of the group being updated
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateGroupSyncedDevices(group, groupData, options){
	if(groupData.sync && groupData.sync.devices != undefined && group.title != "Main"){
		const syncedDevices = groupData.sync.devices;
		return dbDevice.getPermittedDevices(options.user)
		.then(function(devices){
			return bluebird.resolve(_.map(devices, "id"));
		})
		.tap(function(permittedDevices){
			return group.removeSyncedDevices(permittedDevices, {transaction: options.transaction});
		})
		.tap(function(permittedDevices){
			var finalSyncedDevices = _.intersection(permittedDevices, syncedDevices);
			return group.addSyncedDevices(finalSyncedDevices, {transaction: options.transaction});
		});
	}
	return bluebird.resolve();
}


/**
 * checks to make sure only assets from the parent are being added to the sub-group
 * 
 * @param {Object} parent parent group object
 * @param {Array} devices Id of the devices to be added to the current group
 */
function checkDevicesInParent(parent, devices){
	var parentDevices= _.map(parent.devices, "id");
	if(_.difference(devices, parentDevices).length > 0 ){
		throw new Error("Only assets from the parent group can be added to this group.");
	}
}


/**
 * Updates an existing group in the DB
 * @method putGroup
 * @memberOf db_group
 * 
 * @param {Object} user - User object from the token 
 * @param {Object} groupData - Data of the new group
 * 
 * @return {Object} A promise  
 */
function putGroup(user, groupData){
	let originalGroup = {};
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		return getGroupsById(groupData.id)
		.then(function(group){
			originalGroup = group;
			return processUpdateGroup(groupData, options);
		});	
	})
	.then(function(){
		return dbMhGroup.sendGroupUpdateToMH({id: groupData.id}, "POST");
	})
	.then(function(){
		var devicesToUpdate = _.union(groupData.devices, groupData.originalDeviceIds);
		return bluebird.each(devicesToUpdate, function(deviceId){
			return dbMhDevice.sendDeviceUpdateToMH({id: deviceId}, "POST");
		});
	})
	.then(function(){
		return getGroupsById(groupData.id);
	})
	.then(function(group){
		return { result: group, $originalData: originalGroup, message: "Update Group successful" };
	});	 
}


/**
 * process and updates group
 * @method processUpdateGroup
 * @memberOf db_group
 * 
 * @param {Object} groupData - Data of the group being updated
 * @param {Object} options - contains transaction info
 * @return {Object} A promise  
 */
function processUpdateGroup(groupData, options){

	return findGroup(options.user, groupData.id)
	.tap(function(group){
		if(!group) throw new Error("Group "+groupData.id+" does not exist or not permitted for user "+options.user.user_id+".");

		if(!groupData.parent_id){
			if(group.title == "Main"){
				groupData.devices = _.map(group.devices, "id"); // preventing users from editing devices of 'Main' group
			}else{
				throw new Error("Group updated failed because data provided was incorrect.");
			}
		}else{			
			_.merge(group, groupData);
		}

		return group.save({ transaction: options.transaction });
	})
	.tap(function(group){
		return group.getDevices()
		.then(function(originalDeviceIds){
			groupData.originalDeviceIds= _.map(originalDeviceIds, "id");
			return bluebird.resolve();
		});
	})
	.tap(function(group){
		return saveUsersAndDevices(options.user, group, groupData.users, groupData.devices, options.transaction);
	})
	.tap(function(group){
		return updateGroupSyncedDevices(group, groupData, options);
	})
	.tap(function(group){
		var allGroups = [group];
		return updateDevicesOfSubGroups(options.user, group, groupData.devices, allGroups, options);
	});
}


/**
 * process and updates devices of subgroups
 * @method updateDevicesOfSubGroups
 * @memberOf db_group
 * 
 * @param {Object} user - contains user info
 * @param {Object} parentGroup - contains info of parent group
 * @param {Array} parentDevices - array containing device Ids of parent
 * @param {Array} allGroups - array of objects containg info of each subgroup under the parent
 * @param {Object} options - contains transaction info
 * @return {Object} A promise  
 */
function updateDevicesOfSubGroups(user, parentGroup, parentDevices, allGroups, options){
	return getGroupsRecursive(user, [parentGroup.id], allGroups, false)
	.then(function(groups){
		var groupOrder = _.reverse(groups);
		return bluebird.each(groupOrder, function(group){
			/*
				Ensuring devices assigned to subgroup is a subset of the parent
				- getting subGroups recursively
				- checking devices of parent and that of subGroups
				- Getting intersection of the two arrays
				- updating instersection with subGroup Array
			*/
			//skipping updating parent again
			if(group.id != parentGroup.id){
				return findGroup(user, group.id)
				.tap(function(group){
					var subGroupDevices = _.map(group.devices, "id");
					var newDeviceArray = _.intersection(subGroupDevices, parentDevices);
					return group.setDevices(newDeviceArray, {transaction: options.transaction});
				});
			}
			else return bluebird.resolve();
		});	
	});
}

/**
 * Deletes an existing group in the DB
 * @method deleteGroup
 * @memberOf db_group
 * 
 * @param {Object} user - User object from the token 
 * @param {Number} groupId - ID of the group being deleted
 * 
 * @return {Object} A promise  
 */
function deleteGroup(user, groupId){
	var userId= user.user_id;
	return findGroup(user, groupId)
	.then(function(group){
		if(!group) throw new Error("Group "+groupId+" does not exist or not permitted for user "+userId+".");

		if(group.title == "Main") throw new Error("Deleting 'Main' group is not permitted.");
 
		return deleteGroupTree(user, group);
	})
	.then(function(groups){
		return { result: {id: groupId, groups: _.map(groups, "id") }, message: "Delete Group successful" };
	});
}


/**
 * Deletes a given group and all its sub-groups in the DB
 * @method deleteGroupTree
 * @memberOf db_group
 * 
 * @param {Object} user - User object from the token 
 * @param {Object} group - Sequelize instance of the group to be deleted
 * 
 * @return {Object} A promise  
 */
function deleteGroupTree(user, group){
	var allGroups= [group];
	var topLevelGroupInfo = {
		id: group.id,
		client_id: user.client_id
	};

	return getGroupsRecursive(user, [group.id], allGroups, false)
	.then(function(groups){
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			var groupOrder = _.reverse(groups);
			
			return bluebird.each(groupOrder, function(group){
				return deleteGroupAssociations(user, group, options)
				.then(function(){
					return deleteGroupComms(group.id, options);
				})
				.then(function(commId){
					if(group.id == topLevelGroupInfo.id){
						topLevelGroupInfo.comm_id = commId;
					}
					return group.destroy({transaction: t});
				});
			})
			.then(function(){
				return dbMhGroup.sendGroupUpdateToMH(topLevelGroupInfo, "DELETE");
			})
			.then(function(){
				return bluebird.resolve(groups);
			});
		});
	});	
}

/**
 * Deletes group comm id
 * @method deleteGroupComms
 * @memberOf db_group
 * 
 * @param {Object} user - User object from the token 
 * @param {Object} group - Sequelize instance of the group to be deleted
 * @param {Object} options - contains transaction info
 * @return {Object} A promise  
 */
function deleteGroupComms(groupId, options){
	return db.comm.findOne({
		where: {row_id: groupId, table_name: "groups"},
		transaction: options.transaction
	})
	.tap(function(comms){
		if(!comms){
			var msg = "comm Id not found for group id " + groupId;  
			throw new Error(msg); 
		}

		return comms.destroy({transaction: options.transaction});
	})
	.then(function(comms){
		return bluebird.resolve(comms.id);
	});
}


/**
 * Deletes a all associations of a given group 
 * @method deleteGroupAssociations
 * @memberOf db_group
 * 
 * @param {Object} user - User object from the token 
 * @param {Object} group - Sequelize instance of the group to be deleted
 * @param {Object} options - contains transaction info
 * @return {Object} A promise  
 */
function deleteGroupAssociations(user, group, options){
	//Delete from group_devices and user_groups
	return saveUsersAndDevices(user, group, [], [], options.transaction)
	.then(function(){
		//Delete from geofence_trigger_groups
		return group.setGroupTriggers([], {transaction: options.transaction});
	})
	.then(function(){
		//Delete from group_sync_devices
		return group.setSyncedDevices([], {transaction: options.transaction});
	})
	.then(function(){
		//Delete from nearest_responder_groups
		return group.setNrMembers([], {transaction: options.transaction});
	})
	.then(function(){
		//Delete from situational_awareness_member_groups
		return group.setSaMemberGroups([], {transaction: options.transaction});
	})
	.then(function(){
		//Delete from alert_rule_member_groups
		return group.setArMemberGroups([], {transaction: options.transaction});
	})
	.then(function(){
		//Delete from alert_rule_subscriber_groups
		return group.setArSubscriberGroups([], {transaction: options.transaction});
	});	
}


/**
 * gets all parent ids of the groups in a recusrive manner
 * @method getParentIdsRecursive
 * @memberOf db_group
 * 
 * @param {int} groupId - id of the group
 * @param {array} parentIds - an array
 * @return {Object} A promise  
 */
function getParentIdsRecursive(groupId, parentIds){
	parentIds= parentIds || [];
	return db.group.findById(groupId)
	.then(function(group){
		if(!group) throw new Error("Could not find a group with ID "+groupId);
		
		parentIds.push(groupId);

		if(!group.parent_id){
			return parentIds;
		}
		return getParentIdsRecursive(group.parent_id, parentIds);
	});
}

module.exports={
	getAllGroups: getAllGroups,
	postGroup: postGroup,
	putGroup: putGroup,
	deleteGroup: deleteGroup,
	getParentIdsRecursive: getParentIdsRecursive,
	findGroup: findGroup,
	findGroups: findGroups,
	getPermittedGroups: getPermittedGroups,
	saveUsersAndDevices: saveUsersAndDevices,
	getGroupsById: getGroupsById
};