/* global db auditDb*/


/*
	This file contains all the server side mechanics 
	that interacts with platform user to provide most current info related to objects being synced with 
	tacticals
*/

var bluebird = require("bluebird");
var _ = require("lodash"); 
var dbDevice= require("./db_device.js");
var socket= require("../lib/socket.js");
var permission= require("../lib/permission.js"); 

var dictOfAction = {0: "add", 1: "edit", 2: "remove"};
var dictOfDeleteAction = {2: "delete", 3: "decline"};

/** 
 * gets sync info for all tactical devices that a user is permitted to see
 * @method getSyncInfo
 * @memberof db_sync
 * @param {object} user - info of the user requesting the data
 * @return {object} - sync info of all tactical devices that a user is permitted to see
*/
var getSyncInfo = function(user){
	return processAndGetEntitiesOfUser(user)
	.bind({})
	.then(function(entities){
		this.entities = entities;
		return dbDevice.getPermittedDevices(user);
	})
	.then(function(permittedDevices){
		permittedDevices = _.map(permittedDevices, "id");
		return processAndGetSyncInfoForDevices(permittedDevices, user);
	})	
	.tap(function(devices){
		return processAndGetSyncStatusOfEntities(devices, this.entities);
	})
	.tap(function(devices){
		return processAndGetSyncEntitiesForDevices(devices);
	})
	.then(function(devices){
		return bluebird.resolve({message: "Get Sync Successful", result: devices});
	});
};

/** 
 * gets sync info for a particular device
 * @method getSyncInfoById
 * @memberof db_sync
 * @param {number} id - id of the device
 * @param {object} user - info of the user requesting the data
 * @return {object} - sync info related to the device
*/
var getSyncInfoById = function(id, user){
	return processAndGetEntitiesOfUser(user)
	.bind({})
	.then(function(entities){
		this.entities = entities;
		return processAndGetSyncInfoForDevices([id], user);
	})
	.tap(function(device){
		return processAndGetSyncStatusOfEntities(device, this.entities);
	})
	.tap(function(device){
		return processAndGetSyncEntitiesForDevices(device);
	})
	.then(function(device){
		return bluebird.resolve({result: device[id]});
	});
};


/** 
 * Updates entities assgned to sync with a device and also triggers the sync process
 * @method putSyncInfo
 * @memberof db_sync
 * @param {object} user - info of the user requesting the data
 * @param {object} deviceSyncData - object containing sync info updates for a device
 * @return {object} - sync info related to the device
*/
var putSyncInfo = function(user, deviceSyncData){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		return processAndUpdateSyncEntitiesOfDevice(deviceSyncData, options);
	})
	.then(function(){
		return getSyncInfoById(deviceSyncData.id, user);
	})
	.then(function(syncInfoData){
		return bluebird.resolve({message: "PUT Sync Info Successful", result: syncInfoData.result, $sync_data: deviceSyncData.info});
	});
};


/** 
 * Finds entities assigned to a device and update the difference in assignments for each association
 * @method processAndUpdateSyncEntitiesOfDevice
 * @memberof db_sync
 * @param {object} deviceSyncData - object containing sync info updates for a device
 * @param {object} option - object containing user and transaction info
 * @return {object} - promise indocating end of process and modified deviceSyncData object
*/
function processAndUpdateSyncEntitiesOfDevice(deviceSyncData, options){
	return db.device.findOne({
		where: {id: deviceSyncData.id},
		attributes: ["id"],
		include: [{
			model: db.geofence,
			attributes: ["id"],
			as: "SyncedGeoDevices",
			required: false
		}, {
			model: db.poi,
			attributes: ["id"],
			as: "SyncedPoiDevices",
			required: false
		}, {
			model: db.group,
			attributes: ["id"],
			as: "SyncedGroupDevices",
			required: false
		}]
	})
	.then(function(device){
		return processAssignmentsOfEntities(device, deviceSyncData)
		.then(function(){
			return processAndUpdateEntitiesAssignedToDevices(device, deviceSyncData, options);
		});
	});
}

/** 
 * Processes the data against existing assignments and gives info of what entities needs to be added or removed
 * @method processAssignmentsOfEntities
 * @memberof db_sync
 * @param {object} device - sequelize instance of the device being updated
 * @param {object} deviceSyncData - object containing sync info updates for a device
 * @return {object} - promise indocating end of process and modified deviceSyncData object
*/
function processAssignmentsOfEntities(device, deviceSyncData){
	let originalGeofences = [];
	let originalPois = [];
	let originalGroups = [];

	if(device.SyncedGeoDevices.length > 0){
		originalGeofences = _.map(device.SyncedGeoDevices, "id");
	}

	if(device.SyncedPoiDevices.length > 0){
		originalPois = _.map(device.SyncedPoiDevices, "id");
	}

	if(device.SyncedGroupDevices.length > 0){
		originalGroups = _.map(device.SyncedGroupDevices, "id");
	}

	deviceSyncData.info = {
		geofences: {
			original: originalGeofences,
			added: _.difference(deviceSyncData.sync_entities.geofences, originalGeofences),
			removed: _.difference(originalGeofences, deviceSyncData.sync_entities.geofences),
			untouched: _.intersection(originalGeofences, deviceSyncData.sync_entities.geofences)
		}, 
		pois: {
			original: originalPois,
			added: _.difference(deviceSyncData.sync_entities.pois, originalPois),
			removed: _.difference(originalPois, deviceSyncData.sync_entities.pois),
			untouched: _.intersection(originalPois, deviceSyncData.sync_entities.pois)
		},
		groups: {
			original: originalGroups,
			added: _.difference(deviceSyncData.sync_entities.groups, originalGroups),
			removed: _.difference(originalGroups, deviceSyncData.sync_entities.groups),
			untouched: _.intersection(originalGroups, deviceSyncData.sync_entities.groups) 
		}
	};

	return bluebird.resolve();
}

/** 
 * Processes the data against existing assignments and gives info of what entities needs to be added or removed
 * @method processAssignmentsOfEntities
 * @memberof db_sync
 * @param {object} device - sequelize instance of the device being updated
 * @param {object} deviceSyncData - object containing sync info updates for a device
 * @param {object} option - object containing user and transaction info
 * @return {object} - promise indocating end of process and modified deviceSyncData object
*/
function processAndUpdateEntitiesAssignedToDevices(device, deviceSyncData, options){
	return updateGeofencesAssignedToDevice(device, deviceSyncData.info.geofences, options)
	.then(function(){
		return updatePoisAssignedToDevice(device, deviceSyncData.info.pois, options);
	})
	.then(function(){
		return updateGroupsAssignedToDevice(device, deviceSyncData.info.groups, options);
	});
}

/** 
 * Updates geofence assignments to device in geofence_sync_devices
 * @method updateGeofencesAssignedToDevice
 * @memberof db_sync
 * @param {object} device - sequelize instance of the device being updated
 * @param {object} geofenceInfo - object containing info of geofence assignments
 * @param {object} option - object containing user and transaction info
 * @return {object} - promise indocating end of process
*/
function updateGeofencesAssignedToDevice(device, geofenceInfo, options){
	return device.removeSyncedGeoDevices(geofenceInfo.removed, {transaction: options.transaction})
	.then(function(){
		return device.addSyncedGeoDevices(geofenceInfo.added, {transaction: options.transaction});
	});
}

/** 
 * Updates poi assignments to device in poi_sync_devices
 * @method updatePoisAssignedToDevice
 * @memberof db_sync
 * @param {object} device - sequelize instance of the device being updated
 * @param {object} poiInfo - object containing info of poi assignments
 * @param {object} option - object containing user and transaction info
 * @return {object} - promise indocating end of process
*/
function updatePoisAssignedToDevice(device, poiInfo, options){
	return device.removeSyncedPoiDevices(poiInfo.removed, {transaction: options.transaction})
	.then(function(){
		return device.addSyncedPoiDevices(poiInfo.added, {transaction: options.transaction});
	});
}

/** 
 * Updates group assignments to device in group_sync_devices
 * @method updateGroupsAssignedToDevice
 * @memberof db_sync
 * @param {object} device - sequelize instance of the device being updated
 * @param {object} groupInfo - object containing info of group assignments
 * @param {object} option - object containing user and transaction info
 * @return {object} - promise indocating end of process
*/
function updateGroupsAssignedToDevice(device, groupInfo, options){
	return device.removeSyncedGroupDevices(groupInfo.removed, {transaction: options.transaction})
	.then(function(){
		return device.addSyncedGroupDevices(groupInfo.added, {transaction: options.transaction});
	});
}


/** 
 * This function queries and gets all pois and geofences under the users client group
 * @method processAndGetEntitiesOfUser
 * @memberof db_sync
 * @param {object} user - info of the user requesting the data
 * @return {object} - object with arrays of geofences and pois under the client group
*/
function processAndGetEntitiesOfUser(user){
	var entities = {};

	return db.geofence.findAll({
		where: {client_id: user.client_id}
	})
	.then(function(geofences){
		entities.geofences = _.map(geofences, "id");

		return db.poi.findAll({
			where: {client_id: user.client_id}
		});
	})
	.then(function(pois){
		entities.pois = _.map(pois, "id");
		return bluebird.resolve(entities);
	});
}

/** 
 * This function queries and get all sync data related to the tactical devices that the user is permitted to see
 * @method processAndGetSyncInfoForDevices
 * @memberof db_sync
 * @param {array} permittedDevices - array of devices that user requesting the data is allowed see
 * @param {object} user - info of the user requesting the data
 * @return {object} - object with syncData of all permitted tactical devices in expected structure
*/
function processAndGetSyncInfoForDevices(permittedDevices, user){
	return db.device_type.findOne({
		where: {title: "Wave"}
	})
	.then(function(deviceTypeData){
		return db.device.findAll({
			where: {
				id: {$in: permittedDevices}, 
				client_id: user.client_id,
				$or: [
					{mode: 3},
					{type_id: deviceTypeData.id}
				]
			},
			include: [{
				model: db.device_sync_info,
				required: false
			}]
		});
	})
	.then(function(syncDevices){
		syncDevices = _.map(syncDevices, function(device){
			return refineSyncInfoOfDevice(device);
		});

		syncDevices = _.keyBy(syncDevices, "id");

		return bluebird.resolve(syncDevices);
	});
}

/** 
 * This function processes and gets all entities assigned to the devices
 * @method processAndGetSyncEntitiesForDevices
 * @memberof db_sync
 * @param {object} devices - object of key value pairs of devices and respective sync info
 * @return {object} - Promise indicating end of process and modified devices object
*/
function processAndGetSyncEntitiesForDevices(devices){
	const deviceIds = Object.keys(devices);

	return getSyncPoisForDevices(deviceIds, devices)
	.then(function(){
		return getSyncGeofencesForDevices(deviceIds, devices);
	})
	.then(function(){
		return getSyncGroupsAndUsersForDevices(deviceIds, devices);
	});
}

/** 
 * This function queries and get all POIs assigned to the devices
 * @method getSyncPoisForDevices
 * @memberof db_sync
 * @param {array} deviceIds - Ids of all the sync devices
 * @param {object} devices - object of key value pairs of devices and respective sync info
 * @return {object} - Promise indicating end of process and modified devices object
*/
function getSyncPoisForDevices(deviceIds, devices){
	return db.device.findAll({
		where: {id: {$in: deviceIds}},
		include: [{
			model: db.poi,
			required: false,
			attributes: ["id"],
			as: "SyncedPoiDevices"
		}]
	})
	.then(function(poiDevices){
		_.each(poiDevices, function(device){
			device = device.get({plain: true});
			devices[device.id].sync_entities.pois = _.map(device.SyncedPoiDevices, "id");
		});

		return bluebird.resolve();
	});
}

/** 
 * This function queries and get all geofences assigned to the devices
 * @method getSyncGeofenceForDevices
 * @memberof db_sync
 * @param {array} deviceIds - Ids of all the sync devices
 * @param {object} devices - object of key value pairs of devices and respective sync info
 * @return {object} - Promise indicating end of process and modified devices object
*/
function getSyncGeofencesForDevices(deviceIds, devices){
	return db.device.findAll({
		where: {id: {$in: deviceIds}},
		include: [{
			model: db.geofence,
			required: false,
			attributes: ["id"],
			as: "SyncedGeoDevices"
		}]
	})
	.then(function(geoDevices){
		_.each(geoDevices, function(device){
			device = device.get({plain: true});
			devices[device.id].sync_entities.geofences = _.map(device.SyncedGeoDevices, "id");
		});

		return bluebird.resolve();
	});
}

/** 
 * This function queries and get all groups and users assigned to the devices
 * @method getSyncGroupsAndUsersForDevices
 * @memberof db_sync
 * @param {array} deviceIds - Ids of all the sync devices
 * @param {object} devices - object of key value pairs of devices and respective sync info
 * @return {object} - Promise indicating end of process and modified devices object
*/
function getSyncGroupsAndUsersForDevices(deviceIds, devices){
	return db.device.findAll({
		where: {id: {$in: deviceIds}},
		include: [{
			model: db.group,
			required: false,
			attributes: ["id"],
			as: "SyncedGroupDevices",
			include: [{
				model: db.user,
				attributes: ["id"]
			}]
		}]
	})
	.then(function(groupDevices){
		_.each(groupDevices, function(device){
			device = device.get({plain: true});
			devices[device.id].sync_entities.groups = _.map(device.SyncedGroupDevices, "id");
			_.each(device.SyncedGroupDevices, function(group){
				devices[device.id].sync_entities.users = _.map(group.users, "id");
			});
		});
		return bluebird.resolve();
	});
}


/** 
 * This function sets the structure of the sync data for each tactical device based on expectation in front end
 * @method refineSyncInfoOfDevice
 * @memberof db_sync
 * @param {object} device - instance of the device and its data
 * @return {object} - object with device's sync data in expected structure
*/
function refineSyncInfoOfDevice(device){
	device = device.get({plain: true});
	var refinedSyncData = {
		id: device.id,
		last_synced_timestamp: null,
		last_ring_sent: null,
		watermark: 0,
		status: "N/A",
		current_syncs: {
			geofences: {},
			pois: {},
			users: {},
			devices: {}, 
			groups: {},
			deleted_objects: {
				geofences: {},
				pois: {},
				users: {},
				devices: {}, 
				groups: {}
			}
		},
		sync_entities: {
			geofences: [],
			pois: [],
			users: [],
			groups: []
		}
	};

	if(device.device_sync_infos.length > 0){
		refinedSyncData.last_synced_timestamp = device.device_sync_infos[0].ack_received;
		refinedSyncData.last_ring_sent = device.device_sync_infos[0].ring_sent;
		refinedSyncData.watermark = device.device_sync_infos[0].watermark;
	}

	return refinedSyncData;
}


/** 
 * This processes and queries specific tables in mongo DB for sync data related to each of the tacticals
 *  
 * @method processAndGetSyncStatusOfEntities
 * @memberof db_sync
 * @param {object} devices - object of key value pairs of devices and respective sync info
 * @param {object} entities - object containing array of geofences and pois on the platform
 * @return {object} - promise indicating end of process and modified devices object
*/
function processAndGetSyncStatusOfEntities(devices, entities){
	var deviceIds = Object.keys(devices);

	return bluebird.each(deviceIds, function(id){
		if(devices[id].watermark == 0){
			return getSyncStatusFromMongo(id, "SyncDataHistory", devices)
			.then(function(syncDataHistory){
				if(syncDataHistory){
					devices[id].status = "pending";
					//case when device first syncs it will send watermark 0. The logic below will identify the syncing process
					//for the very first sync from the device
					if(devices[id].watermark == 0 && devices[id].last_synced_timestamp != null){
						devices[id].status = "syncing";
					}
					return refineSyncData(id, syncDataHistory, devices, entities);
				}
				return bluebird.resolve();
			});
		}

		return getSyncStatusFromMongo(id, "SyncData", devices)
		.then(function(syncData){
			if(syncData){
				devices[id].status = "pending";
				return getSyncStatusFromMongo(id, "SyncDataBackup", devices)
				.then(function(syncDataBackup){
					if(syncDataBackup){
						_.merge(syncData[0], syncDataBackup[0]);
						return refineSyncData(id, syncData, devices, entities);
					}
					return refineSyncData(id, syncData, devices, entities);
				});
			}

			return getSyncStatusFromMongo(id, "SyncDataBackup", devices)
			.then(function(syncDataBackup){
				if(syncDataBackup){
					devices[id].status = "syncing";
					return refineSyncData(id, syncDataBackup, devices, entities);
				}
				
				//to differentiate between the case where a tactical has no sync objects 
				//ever shared with it and the one that has.
				//We want to only show status for devices that have atleast one object shared with it
				if(devices[id].last_ring_sent != null){
					devices[id].status = "synced";
				}

				return bluebird.resolve();
			});
		});
	});
}


/** 
 * This processes and queries device info from a specific table mongoDB 
 * based on the schemename passed
 *  
 * @method getSyncStatusFromMongo
 * @memberof db_sync
 * @param {number} id - id of the device
 * @param {string} schemaName - name of the schema in mongo from whic the data must be extracted
 * @return {object} - promise indicating end of process or the data from mongo DB
*/
function getSyncStatusFromMongo(id, schemaName){
	return auditDb[schemaName].find({device_id: id})
	.exec()
	.then(function(syncData){
		if(syncData.length > 0){
			return bluebird.resolve(syncData);
		}
		return bluebird.resolve();
	});
}

/** 
 * This function refines the sync entities (geofenced and pois) to match the expectation in teh front end
 * @method refineSyncData
 * @memberof db_sync
 * @param {number} id - id of the device
 * @param {object} syncData - data extracted from mongo DB
 * @param {object} devices - object of key value pairs of devices and respective sync info
 * @param {object} entities - object containing array of geofences and pois on the platform
 * @return {object} - promise indicating end of process and modified devices object
*/
function refineSyncData(id, syncData, devices, entities){
	_.forEach(syncData[0].geofences, function(value, key){
		if(entities.geofences.indexOf(parseInt(key)) > -1){
			devices[id].current_syncs.geofences[key] = {
				id: key,
				action: dictOfAction[value.action],
				modifier_comm_id: value.last_modified_by,
				last_modified_timestamp: value.last_modified_time
			};
		}
		else{
			devices[id].current_syncs.deleted_objects.geofences[key] = {
				action: dictOfDeleteAction[value.action],
				title: value.data.title,
				modifier_comm_id: value.last_modified_by,
				last_modified_timestamp: value.last_modified_time
			}; 
		}
	});

	_.forEach(syncData[0].pois, function(value, key){
		if(entities.pois.indexOf(parseInt(key)) > -1){
			devices[id].current_syncs.pois[key] = {
				id: key,
				action: dictOfAction[value.action],
				modifier_comm_id: value.last_modified_by,
				last_modified_timestamp: value.last_modified_time
			};
		}
		else{
			devices[id].current_syncs.deleted_objects.pois[key] = {
				action: dictOfDeleteAction[value.action],
				title: value.data.title,
				modifier_comm_id: value.last_modified_by,
				last_modified_timestamp: value.last_modified_time
			}; 
		}
	});

	/*
		if sync Objects are empty then status is just synced
		This case is hit when a entity is added to a tactical and a ring is sent down
		But the entuty is deleted or un-assigned to the device before it gets data back. 
		Since we empty out the sync to save bandwidth, this check helps set teh status back to synced because
		there is nothing to sync
	*/
	if(
		_.isEmpty(devices[id].current_syncs.geofences) &&
		_.isEmpty(devices[id].current_syncs.pois) &&
		_.isEmpty(devices[id].current_syncs.deleted_objects.geofences) &&
		_.isEmpty(devices[id].current_syncs.deleted_objects.pois)
	){
		devices[id].status = "synced";
	}

	return bluebird.resolve();
}

/** 
 * This function sends the necessary socket update to the sync module
 * @method sendSocketToSyncModule
 * @memberof db_sync
 * @param {object} user - user information object
 * @param {string} method - contains info what socket action needs to be performed
 * @param {array} syncDeviceIds - array of device Ids to which the ring was sent to
 * @return {object} - promise indicating end of process
*/
function sendSocketToSyncModule(user, method, syncDeviceIds){
	var dummyRequest= {
		user: user,
		permittedUsers: []
	};

	var permittedUsersForSync = [];

	return getPermittedUsersForSyncSocket(user)
	.then(function(permittedUsers){
		permittedUsersForSync = permittedUsers;
		
		return bluebird.each(syncDeviceIds, function(deviceId){
			return permission.getPermittedUsers(user, "device", deviceId)
			.then(function(permittedUsersOfDevice){
				dummyRequest.permittedUsers = _.intersection(permittedUsersOfDevice, permittedUsersForSync);
				if(method == "delete"){
					dummyRequest.socketEvent = method + ":/sync/:id"; 
					dummyRequest.result = {result: {id: deviceId}};
					socket.socketHandler(dummyRequest);
					return bluebird.resolve();
				}
				
				return getSyncInfoById(deviceId, user)
				.then(function(syncInfoData){
					dummyRequest.socketEvent = method + ":/sync";
					dummyRequest.result = {
						message: "",
						result: syncInfoData.result
					};
					socket.socketHandler(dummyRequest);
					return bluebird.resolve();
				});
			});
		});
	});
}


/** 
 * This function queries and returns an array of users who are permitted to receive the sync sockets
 * @method getPermittedUsersForSyncSocket
 * @memberof db_sync
 * @param {object} user - user information object
 * @return {array} - array of permitted user ids
*/
function getPermittedUsersForSyncSocket(user){
	return db.user.findAll({
		where: {client_id: user.client_id},
		include: [{
			model: db.role,
			where: {title: {$in: ["Customer Admin", "Admin"]}}
		}]
	})
	.then(function(userData){
		var permittedUsersForSync = [];
		_.each(userData, function(user){
			permittedUsersForSync.push(user.id);
		});
		return bluebird.resolve(permittedUsersForSync);
	});
}

module.exports = {
	getSyncInfo: getSyncInfo,
	getSyncInfoById: getSyncInfoById,
	sendSocketToSyncModule: sendSocketToSyncModule,
	getPermittedUsersForSyncSocket: getPermittedUsersForSyncSocket,
	putSyncInfo: putSyncInfo 
};
