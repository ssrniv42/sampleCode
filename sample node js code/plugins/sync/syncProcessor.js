/* global log, db, utils, auditDb */

/* 
	This plugin specifically processes data and logs the difference in information
	related to Tactical devices assigned to the geofences/POIs/groups/users/devices
	
	The data is stored in mongo DB in SyncData table
	an archive of all the sync shared with a device is stored in SyncDataHistory table 
	
	For now this plugin handles and logs Geofence, POI, Groups, Users and Devices data
*/

var bluebird = require("bluebird");
var _= require("lodash");

var socket= require("../../lib/socket.js");

//DB Mech files
var deviceSync = require("../../db/db_device_sync.js");
var dbMhDevice = require("../../db/db_mh_device.js");
var dbSyncModule = require("../../db/db_sync.js");

//Sync Core
var sync = require("./sync.js");

//Sync Entity Handlers
var poiHandler = require("./poiHandler.js");
var geofenceHandler = require("./geofenceHandler.js");
var groupHandler = require("./groupHandler.js");
var userHandler = require("./userHandler.js");
var deviceHandler = require("./deviceHandler.js");

const dictOfModNameAndType = {"geofence": "geofences", "poi": "pois", "group": "groups", "device": "devices", "user": "users"};

/** 
 * This function gets called from the plugin.js and executes appropriate action based which module is being invoked for sync
 * 
 * @method processSync
 * @memberof sync
 * @param {object} req - req obj from route that container user info and result passed by db_geofence
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
var processSync = function(req, moduleName, timeStamp){
	var user = req.user;
	var moduleAction = req.action || utils.getActionType(req, {});
	var action = moduleAction[0];
	var data = req.result;	

	switch(moduleName){
	case "geofence":
	case "poi":
		return processAndUpdateSyncData(user, action, data, moduleName, timeStamp, true);
	case "group":
		return processAndUpdateSyncDataForGroups(user, action, data, moduleName, timeStamp);
	case "user":
		return bluebird.resolve(); 
		//return processAndUpdateSyncDataForUsers(user, action, data, moduleName, timeStamp);
	case "device":
		return bluebird.resolve();
	case "sync":
		return processSyncAssignmentsFromSyncModule(user, data, timeStamp);
	default:
		return bluebird.resolve();
	}
};

/** 
 * Processes latest modification of entities (geofence/poi) by a user 
 * and updates the SyncData table to initiate the syncing the process
 * 
 * @method processAndUpdateSyncData
 * @memberof sync
 * @param {object} user - info of the user editing the object
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} data - data related to the modified entity
 * @param {object} moduleName - name of the module that we need to process for
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @param {boolean}	sendRing - If true a ring will be sent per change in entity, if false the ring initiation is grouped for multiple edits (sync module edit)
 * @return - returns a promise to indicate process is completed
*/
function processAndUpdateSyncData(user, action, data, moduleName, timeStamp, sendRing){
	//Process and construct the modified data that needs to be sent to SyncData table
	return constructDataToSync(action, moduleName, data)
	.tap(function(dataToSync){
		const entityType = dictOfModNameAndType[moduleName];
		
		//Insert or update data for each device in SyncData table based on whether record already exists for device
		return sync.sendEntityDataToSync(user, dataToSync, timeStamp, entityType);
	})
	.then(function(dataToSync){
		if(sendRing){
			//array containing ids of devices that have data ready to be synced
			var devicesToReceiveSync= Object.keys(dataToSync);
			
			log.info("Successfully updated SyncData and SyncDataHistory with modifications related to module", moduleName, "for operation", action);
			
			if(devicesToReceiveSync.length > 0){
				return processAndInitiateSync(user, devicesToReceiveSync);
			}
			return bluebird.resolve();
		}
		return bluebird.resolve();
	});
}

/** 
 * This function processes and initiates the syncing process
 * @method processAndInitiateSync
 * @memberof sync
 * @param {object} user - user information object
 * @param {array} deviceIds - array of device ids with which the syncing processe should be initiated
 * @return {object} - boolean of weather the ring was sent or not
*/
function processAndInitiateSync(user, deviceIds){
	return processAndUpdateDeviceSyncInfo(user, deviceIds)
	.then(function(ringData){
		if(ringData.syncDeviceCommIds.length > 0){
			var mhData = {
				clientId: user.client_id,
				commIds: ringData.syncDeviceCommIds
			};
			dbMhDevice.callMHWS(mhData, "/mh/v1/sync/ring", "POST"); 
			return dbSyncModule.sendSocketToSyncModule(user, "put", ringData.syncDeviceIds)
			.then(function(){
				return bluebird.resolve(true);
			});
		}
		else return bluebird.resolve(false);
	});
}

/** 
 * Iterates and updates device sync info to log time when the sync was initiated
 * @method processAndUpdateDeviceSyncInfo
 * @memberof sync
 * @param {object} user - user information object
 * @param {array} deviceIds - array of device ids with which the syncing processe should be initiated
 * @return {object} - Object containg array of deviceIds and their CommIds of tacticals ready to be synced.
*/
function processAndUpdateDeviceSyncInfo(user, deviceIds){
	/*
		Step 1: Process each device and ensure that the device being processed exists in pletform DB
		Step 2: Process each device and insert/update device_sync_info and update ring timestamp
		Step 3: Get comm_id's for all devices in array and send ring request to MH web service with array of comm_id
	*/
	return bluebird.each(deviceIds, function(deviceId){
		return db.device.findById(deviceId)
		.then(function(device){
			/*
				we are cross checking platform DB (MySQL) in case we have a record in Mongo (sync db) for 
				a device that has been deleted on platform
			*/
			if(!device){
				log.warn("This device has been deleted on platform, id: ", deviceId);
				return bluebird.resolve();
			}

			var syncInfo = {
				device_id: deviceId,
				ring_sent: new Date().getTime()
			};

			//insert/update ring_sent and watermark in device_sync_info table
			return deviceSync.updateDeviceSyncInfo(user, syncInfo);
		});
	})
	.then(function(){
		return getDeviceCommIds(deviceIds);
	})
	.then(function(processedDeviceCommIds){
		return {syncDeviceCommIds: processedDeviceCommIds, syncDeviceIds: deviceIds};
	});
}

/** 
 * Constructs data (specific to type of module) to be stored in SyncData
 * based on type of module action executed by the user
 * 
 * @method constructDataToSync
 * @memberof sync
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} moduleName - name of the module that we need to process for
 * @param {object} data - data related to the module, that needs to be formatted for sync
 * @return {object} dataToSync - returns obj containing deviceId and respective data to update as key=>value pairs
*/
function constructDataToSync(action, moduleName, data){
	//console.log("##### constructDataToSync", action, moduleName, data);
	
	switch(moduleName){
	case "geofence":
		return geofenceHandler.constructGeoDataToSync(action, data);
	case "poi":
		return poiHandler.constructPoiDataToSync(action, data);
	case "group":
		return groupHandler.constructGroupDataToSync(action, data);
	case "device":
		return deviceHandler.constructDeviceDataToSync(action, data);
	case "user":
		return userHandler.constructUserDataToSync(action, data);
	default:
		return bluebird.resolve({});
	}
}

/** 
 * Processes latest assignments of entities to a device and groups all the changes at once based on action and then feeds info to sync process
 * 
 * @method processSyncAssignmentsFromSyncModule
 * @memberof sync
 * @param {object} user - info of the user editing the assignments
 * @param {object} data - data containing info of all entities assigned to a device via sync module
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processSyncAssignmentsFromSyncModule(user, syncUpdateData, timeStamp){
	const deviceId = syncUpdateData.result.id;
	let syncEntityInfo = syncUpdateData.$sync_data;
	
	return getDeviceTypeAndMode(deviceId)
	.then(function(deviceInfo){
		return processSyncAssignmentsBasedOnDeviceType(deviceId, deviceInfo, user, syncEntityInfo, timeStamp);
	})
	.then(function(){
		//only initiate ring if entity assignments were updated
		if(checkIfInitiationNeeded(syncEntityInfo)){
			return processAndInitiateSync(user, [deviceId]);
		}
		return bluebird.resolve();
	});
}

/** 
 * Processes assignments for entities assigned via Sync module edit.
 * It determines entity assignment based on device type because according to requirement (plat V 2.11.0)
 * devices of type 'Wave' can only get group and inherited (user, device) entities 
 * and tactical devices can only get poi and geofence assignments
 *  
 * @method processSyncAssignmentsBasedOnDeviceType
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} deviceInfo - contains info of type and mode of the device
 * @param {object} user - info of the user editing the assignments
 * @param {object} syncEntityInfo - object containing info of all assigments
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processSyncAssignmentsBasedOnDeviceType(deviceId, deviceInfo, user, syncEntityInfo, timeStamp){
	if(deviceInfo.type == "Wave"){
		return groupHandler.processSyncAssignmentsForGroups(deviceId, user, syncEntityInfo.groups, timeStamp);
	}
	else if(deviceInfo.type == "Whisper" && deviceInfo.mode == "SCCT"){
		return geofenceHandler.processSyncAssignmentsForGeofences(deviceId, user, syncEntityInfo.geofences, timeStamp)
		.then(function(){
			return poiHandler.processSyncAssignmentsForPois(deviceId, user, syncEntityInfo.pois, timeStamp);
		});
	}
}

/*
function processAndUpdateSyncDataForUsers(user, action, data, moduleName, timeStamp){
	return findAllSyncDevicesOfUserViaGroup(data.result.id)
	.then(function(){
		return bluebird.resolve();
	});
}*/

/*
function findAllSyncDevicesOfUserViaGroup(userId){
	return bluebird.resolve();
}*/

/** 
 * Process sync for group edits from group module
 * 
 * @method processAndUpdateSyncDataForGroups
 * @memberof sync
 * @param {object} user - info of the user editing the assignments
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} data - data related to the modified entity
 * @param {object} moduleName - name of the module that we need to process for
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processAndUpdateSyncDataForGroups(user, action, data, moduleName, timeStamp){
	return processGroupSyncBasedOnAction(user, action, data, moduleName, timeStamp)
	.then(function(syncDevices){
		return processAndInitiateSync(user, syncDevices);
	});
}

/** 
 * Determines logic for group sync to be executed based on user action 
 * 
 * @method processGroupSyncBasedOnAction
 * @memberof sync
 * @param {object} user - info of the user editing the assignments
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} data - data related to the modified entity
 * @param {object} moduleName - name of the module that we need to process for
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processGroupSyncBasedOnAction(user, action, data, moduleName, timeStamp){
	if(action == "delete"){
		return processDeleteGroup(user, data.result.groups, timeStamp);
	}
	
	let syncDevices = [];

	if(action == "post") syncDevices = data.result.sync.devices;
	else if(action == "put") syncDevices = _.uniq(_.concat(data.result.sync.devices, data.$originalData.sync.devices));

	return processSyncForGroupsAndInheritedEntities(user, action, data, moduleName, syncDevices, timeStamp);
}


/** 
 * Executes sync process for deleted group and all its deleted subgroups
 * 
 * @method processDeleteGroup
 * @memberof sync
 * @param {object} user - info of the user editing the assignments
 * @param {array} deletedGroups - Array of all groupIds that were deleted
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return {array} - returns a array of Ids for all devices that have sync changes 
*/
function processDeleteGroup(user, deletedGroups, timeStamp){
	let devicesWithChangesToSync = [];
	return auditDb["SyncDataHistory"].find(
		{client_id: user.client_id}, 
		{device_id: 1, groups: 1, users: 1, devices: 1}
	)
	.then(function(historicDataForClient){
		return bluebird.map(historicDataForClient, function(deviceData){
			if(deviceData.groups){
				const groupsAssignedToDevice = _.map(Object.keys(deviceData.groups), _.parseInt);
				const groupsToBeDeleted = _.intersection(groupsAssignedToDevice, deletedGroups);

				if(groupsToBeDeleted.length > 0){
					devicesWithChangesToSync.push(deviceData.device_id);
					return deleteGroupFromDevice(user, deviceData, groupsToBeDeleted, timeStamp)
					.then(function(){
						return processAssignmentOfInheritedEntities(user, deviceData, timeStamp);
					});
				}
				return bluebird.resolve();
			}
			return bluebird.resolve();
		});
	})
	.then(function(){
		return bluebird.resolve(devicesWithChangesToSync);
	});
}

/** 
 * Removes group assignment from each device that has the group
 * 
 * @method deleteGroupFromDevice
 * @memberof sync
 * @param {object} user - info of the user editing the assignments
 * @param {object} deviceData - historic data related to the sync device
 * @param {array} groupsToBeDeleted - Array of all groupIds that must be removed from device
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return {array} - promise indicating end of process
*/
function deleteGroupFromDevice(user, deviceData, groupsToBeDeleted, timeStamp){
	return bluebird.each(groupsToBeDeleted, function(groupId){
		if(deviceData.groups[groupId]){
			//Mimic as though the group delete came from route and execute sync process as "delete"
			const groupInfo = deviceData.groups[groupId].data;
			groupInfo.sync = {
				devices: [deviceData.device_id]
			};
			const groupData = {
				result: groupInfo
			};

			return processAndUpdateSyncData(user, "delete", groupData, "group", timeStamp, false);
		}
		return bluebird.resolve();
	});
}


/** 
 * Processes the sync data for groups separately, as it needs to do the following
 * - sync group that was modified
 * - sync all users under that group
 * - sync all devices under that group
 * 
 * @method processSyncForGroupsAndInheritedEntities
 * @memberof sync
 * @param {object} user - info of the user editing the assignments
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} data - data related to the modified entity
 * @param {object} moduleName - name of the module that we need to process for
 * @param {array} syncDevices - array of ids of devices that the group synced with 
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return {array} - returns a array of Ids for all devices that have sync changes 
*/
function processSyncForGroupsAndInheritedEntities(user, action, data, moduleName, syncDevices, timeStamp){
	return processAndUpdateSyncData(user, action, data, moduleName, timeStamp, false)
	.then(function(){
		return processSyncForUsersAndDevices(user, syncDevices, timeStamp);
	})
	.then(function(){
		return bluebird.resolve(syncDevices);
	});
}

/** 
 * Processes the sync data for users and devices associated with a group
 * 
 * @method processSyncForUsersAndDevices
 * @memberof sync
 * @param {object} user - info of the user editing the assignments
 * @param {array} syncDevices - array of ids of devices that the group synced with 
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processSyncForUsersAndDevices(user, syncDevices, timeStamp){
	if(syncDevices.length > 0){
		//Get historic data of all entities synced with devices
		return auditDb["SyncDataHistory"].find(
			{device_id: {$in: syncDevices}}, 
			{device_id: 1, groups: 1, users: 1, devices: 1}
		)
		.then(function(historicDataForDevices){
			//Process syncs for inherited entities for each sync device
			return bluebird.map(historicDataForDevices, function(deviceData){
				return processAssignmentOfInheritedEntities(user, deviceData, timeStamp);
			});
		});
	}
	return bluebird.resolve();
}

/** 
 * For each sync device it determines users and devices to be added or removed and 
 * executes sync for the respective entities.
 * 
 * @method processAssignmentOfInheritedEntities
 * @memberof sync
 * @param {object} user - info of the user editing the assignments
 * @param {object} deviceData - historic data related to the sync device
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processAssignmentOfInheritedEntities(user, deviceData, timeStamp){
	deviceData.groups = _.map(Object.keys(deviceData.groups), _.parseInt);
	deviceData.users = _.map(Object.keys(deviceData.users), _.parseInt);
	deviceData.devices = _.map(Object.keys(deviceData.devices), _.parseInt);

	//Get users and devices that belong to all groups synced with a device
	return getUsersAndDevicesAssociatedWithGroupsAlreadySynced(deviceData.groups)
	.then(function(syncInfo){
		//Determine which users and devices to be added and/or removed
		return getEntitiesToBeAddedAndRemoved(syncInfo, deviceData);
	})
	.tap(function(syncEntityInfo){
		return userHandler.processSyncAssignmentsForUsers(deviceData.device_id, user, syncEntityInfo.users, timeStamp);
	})
	.then(function(syncEntityInfo){
		return deviceHandler.processSyncAssignmentsForDevices(deviceData.device_id, user, syncEntityInfo.devices, timeStamp);
	});
}

/** 
 * Processes to find which users and devices must be added and removed
 * 
 * @method processSyncForUsersAndDevices
 * @memberof sync
 * @param {object} syncInfo - info of users and devices 
 * @param {object} deviceData - historic data related to the sync device
 * @return {object}- returns an object containing info of which users and devices must be added and removed
*/
function getEntitiesToBeAddedAndRemoved(syncInfo, deviceData){
	const syncEntityInfo = {
		users: {
			synced: syncInfo.users,
			added: [],
			removed: []
		},
		devices: {
			synced: syncInfo.devices,
			added: [],
			removed: []
		}
	};

	syncEntityInfo.users.added = _.difference(syncInfo.users, deviceData.users);
	syncEntityInfo.users.removed = _.difference(deviceData.users, syncInfo.users);

	syncEntityInfo.devices.added = _.difference(syncInfo.devices, deviceData.devices);
	syncEntityInfo.devices.removed = _.difference(deviceData.devices, syncInfo.devices);

	return bluebird.resolve(syncEntityInfo);
}

/** 
 * Get all users and devices associated with the groups already synced with device
 * 
 * @method getUsersAndDevicesAssociatedWithGroupsAlreadySynced
 * @memberof sync
 * @param {array} groupIdArray - array of groupIds
 * @return {object}- returns an object containing info of users and devices associated with the group
*/
function getUsersAndDevicesAssociatedWithGroupsAlreadySynced(groupIdArray){
	if(groupIdArray.length > 0){
		return db.group.findAll({
			where: {id: {$in: groupIdArray}},
			attributes: ["id"],
			include: [{
				model: db.user,
				required: false,
				attributes: ["id"]
			}, {
				model: db.device,
				required: false,
				attributes: ["id"]
			}]
		})
		.then(function(groups){
			let allUsersSyncedWithDevice = [];
			let allDevicesSyncedWithDevice = [];
			_.each(groups, function(group){
				group = group.get({plain: true});
				
				group.users = _.map(group.users, "id");
				group.devices = _.map(group.devices, "id");
	
				allUsersSyncedWithDevice = _.concat(allUsersSyncedWithDevice, group.users);
				allDevicesSyncedWithDevice = _.concat(allDevicesSyncedWithDevice, group.devices);
			});
	
			allUsersSyncedWithDevice = _.uniq(allUsersSyncedWithDevice);
			allDevicesSyncedWithDevice = _.uniq(allDevicesSyncedWithDevice);
			return bluebird.resolve({users: allUsersSyncedWithDevice, devices: allDevicesSyncedWithDevice});
		});
	}
	else{
		return bluebird.resolve({users: [], devices: []});
	}
}

/** 
 * Checks and returns true if sync initiation (ring) needs to be sent down to device.
 * If there are no changes to sync assignments then no ring will be sent down
 * 
 * @method checkIfInitiationNeeded
 * @memberof sync
 * @param {object} syncEntityInfo - object containing info of entities assigned to the device
 * @return - returns true if assignments are modified, flase otherwise
*/
function checkIfInitiationNeeded(syncEntityInfo){
	if(syncEntityInfo.geofences.added.length > 0 ||
	syncEntityInfo.geofences.removed.length > 0 ||
	syncEntityInfo.pois.added.length > 0 ||
	syncEntityInfo.pois.removed.length > 0 || 
	syncEntityInfo.groups.added.length > 0 ||
	syncEntityInfo.groups.removed.length > 0){
		return true;
	}
	return false;
}

/** 
 * Queries and returns commIds assiciated with the deviceIds passed to the function 
 * @method getDeviceCommIds
 * @memberof sync
 * @param {array} deviceIds - array containing device Ids
 * @return {array} - Array containing comm Ids of the devices
*/
function getDeviceCommIds(deviceIds){
	if(deviceIds.length > 0){
		return db.comm.findAll({
			where: {row_id: {$in: deviceIds}, table_name: "assets"}
		})
		.then(function(commsData){
			var deviceCommIds = [];
			_.each(commsData, function(comm){
				comm = comm.get({plain: true});
				deviceCommIds.push(comm.id);
			});
			return bluebird.resolve(deviceCommIds);
		});
	}
	else return bluebird.resolve([]);
}

/** 
 * Queries and returns the type of the device
 * @method getDeviceTypeAndMode
 * @memberof sync
 * @param {int} deviceId - Id of the device
 * @return {object} - containing info of type and mode of the device
*/
function getDeviceTypeAndMode(deviceId){
	return db.device.findById(deviceId, {
		attributes: ["id"],
		include: [{
			model: db.device_type,
			attributes: ["title"],
			required: true
		}, {
			model: db.device_mode,
			attributes: ["title"],
			required: true
		}] 
	})
	.then(function(device){
		if(!device) throw new Error("Device not found for Id");
		device = device.get({plain: true});
		return bluebird.resolve({type: device.device_type.title, mode: device.device_mode.title});
	});
}

module.exports = function(req, moduleName, timeStamp){
	// a dummy request for sending new socket for sync info updates
	var dummyRequest= {
		socketEvent: "plugin:sync",
		user: req.user,
		permittedUsers: []
	};

	return processSync(req, moduleName, timeStamp)
	.then(function(isDataToSync){
		if(isDataToSync == null){
			return bluebird.resolve();
		}
		var message = (isDataToSync) ? "Device Sync Initiation Successful." : "There Are No Changes To Sync.";
		dummyRequest.result= { message: message, result: {}};
		
		return dbSyncModule.getPermittedUsersForSyncSocket(req.user)
		.then(function(permittedUsersForSync){
			dummyRequest.permittedUsers = permittedUsersForSync;
			socket.socketHandler(dummyRequest);
			return bluebird.resolve();
		});
	});	
};

module.exports.processAndUpdateSyncData = processAndUpdateSyncData;
module.exports.processAndUpdateSyncDataForGroups = processAndUpdateSyncDataForGroups;