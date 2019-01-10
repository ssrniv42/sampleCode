/*global log, db, auditDb*/

/*
	This file contains all the server side mechanics 
	that interacts with MH to exchange and sync geofence info
	between Tactical devices and SCC Titan Platform
*/

var bluebird = require("bluebird");
var deviceSync = require("./db_device_sync.js");
var dbPoi = require("./db_poi.js");
var _ = require("lodash"); 


/** 
 * This function is invoked when MH sends get sync request
 * @method getSyncDevice
 * @memberof db_mh_sync
 * @param {int} commId - id of the device
 * @param {int} watermark - unix time in milliseconds sent from MH
 * @return {object} - Object containing sync data requested by the device
*/
var getSyncDevice = function(commId, watermark){
	log.info("GET /sync/geofence | Processing Geofence Sync Request For Device With Comm Id:", commId, "For Watermark:", watermark);

	if(watermark == undefined || (watermark != 0 && watermark.toString().length < 13)){
		log.error("Platform Received Geofence Sync Request With Invalid Watermark");
		throw new Error("Platform Received Geofence Sync Request With Invalid Watermark");		
	}

	if(commId == undefined){
		log.error("Platform Received Geofence Sync Request With Invalid Comm Id");
		throw new Error("Platform Received Geofence Sync Request With Invalid Comm Id");		
	}
	
	return processSyncRequest(commId, watermark)
	.then(function(syncObj){
		//log.info("SYNC RESPONSE:", syncObj);		
		return bluebird.resolve({message: "Successfully Processed Get Geofence Sync Obj Request", result: syncObj});
	});
};


/** 
 * This function is invoked when MH sends post sync poi request
 * @method postSyncPoi
 * @memberof db_mh_sync
 * @param {int} commId - id of the device
 * @param {object} poiData - data of the poi MH is trying to sync with platform
 * @return {object} - Object containing data of the poi added and success message
*/
var postSyncPoi = function(commId, poiData){
	//log.debug("postSyncPoi", poiData, commId);
	return validateCommId(commId)
	.tap(function(resultData){
		return checkClientFeature(resultData.clientId);
	})
	.bind({})
	.then(function(resultData){
		//log.debug("postSyncPoi", poiData);
		var user = {client_id: resultData.clientId, user_id: resultData.userId};
		var $this = this;
		$this.user = user;
		poiData.client_id = user.client_id;
		poiData.approved = 0;
		poiData.sync = {
			devices: [resultData.deviceId]
		};

		poiData.creator_device_id = resultData.deviceId;
		if(poiData.nato_code == null){
			//get image_id for a default poi icon in case tactical added a generic non NATO POI
			return getGenericIconForPoi(poiData);
		}else{
			poiData.nato_code = "S"+poiData.nato_code+"---------";
			return bluebird.resolve();
		}
	})
	.then(function(){
		//log.debug("postSyncPoi poi data", poiData);
		return dbPoi.postPoi(this.user, poiData);
	});
};

/** 
 * This function queries checks if the client of the tactical device has the Asset Syncing feature.
 * It throws an error and rejects the poi sync request if the tacticals client does not have the asset syncing feature
 * @method checkClientFeature
 * @memberof db_mh_sync
 * @param {Number} id - id of the client
 * @return {object} - promise indicating end of process or error
*/
function checkClientFeature(clientId){
	return db.client.findOne({
		where: {id: clientId},
		include: [{
			model: db.feature,
			where: {title: "Asset Syncing"},
			required: false
		}]
	})
	.then(function(client){
		client = client.get({plain: true});
		if(client.features.length == 0){
			throw new Error("ModuleNotAvailable");
		}
		return bluebird.resolve();
	});
}


/** 
 * This function queries and gets image_id of a chosen generic poi and assigns it to the poiData obj
 * @method getGenericIconForPoi
 * @memberof db_mh_sync
 * @param {object} poiData - data of the poi MH is trying to sync with platform
 * @return {object} - promise with the modified poiData object 
*/
function getGenericIconForPoi(poiData){
	return db.image.findOne({ 
		where: {name: "icon-0.png"},
		include: [{
			model: db.category,
			as: "CategoryImages",
			required: false
		}]
	})
	.then(function(image){
		if(!image){
			throw new Error("image not found for name: icon-0.png");
		}
		image = image.get({plain: true});
		poiData.category_id = image.CategoryImages[0].id;
		poiData.image_id = image.id;
		return bluebird.resolve();
	});
}

/** 
 * Processes request, validates that commId belongs to tactical asset 
 * and returns object with sync data for the device
 * @method processSyncRequest
 * @memberof db_mh_sync
 * @param {int} commId - id of the device
 * @param {int} watermark - unix time in milliseconds sent from MH
 * @return {object} - Object containing sync data requested by the device
*/
function processSyncRequest(commId, watermark){
	return validateCommId(commId)
	.tap(function(resultData){
		return checkClientFeature(resultData.clientId);
	})
	.bind({})
	.then(function(resultData){
		var $this = this;
		$this.deviceId = resultData.deviceId;
		var timeStamp = new Date().getTime();
		var user = {client_id: resultData.clientId, user_id: resultData.userId};

		var syncInfo = {
			device_id: resultData.deviceId,
			watermark: watermark,
			ack_received: timeStamp,
			sync_received: timeStamp
		};

		return deviceSync.updateDeviceSyncInfo(user, syncInfo);
	})
	.then(function(updatedSyncData){
		return processAndGetSyncData(this.deviceId, commId, watermark, updatedSyncData.result);	
	})
	.then(function(syncData){
		return restructureDataForMH(commId, syncData);
	});
}


/** 
 * Validates if commId belongs to a device on the platform
 * @method validateCommId
 * @memberof db_mh_sync
 * @param {int} commId - comm id of the device
 * @return {obj} resulData - device Info
*/
function validateCommId(commId){
	return getDeviceInfo(commId)
	.then(function(info){
		if(info.deviceId) {
			return bluebird.resolve(info);
		}
		else{
			log.warn("Platform Received Geofence Sync Request With Invalid Comm Id: ", commId, ". This Comm Id Does Not Belong To A Tactical Device In Platform DB");
			throw new Error("Platform Received Invalid Device Comm Id. The Comm Id Does Not Belong To A Tactical Device In Platform DB");
		}
	});
}


/** 
 * Restructures sync data to match the specified format requested by MH
 * @method restructureDataForMH
 * @memberof db_mh_sync
 * @param {int} commId - comm id of the device
 * @return {obj} query data - device info from the db
*/
function restructureDataForMH(commId, syncData){
	log.debug("Restructuring data for MH");
	var syncObj = {};

	if(syncData.length > 0){
		var geoData = [];
		var poiData = [];
		
		//extract geofence object 'key', 'value' pair from SyncData/SyncDataHistory/SyncDataBackup
		_.forEach(syncData[0].geofences, function(value, key){
			// converts path geofence to polygon 
			//It was deciced not to convert path to polygon as part of release of platform version 2.7.0
			//utils.convertPathToPolygon(value.data); 

			value.data.id = key;
			geoData.push(value);
		});
		
		//extract poi object 'key', 'value' pair from SyncData/SyncDataHistory/SyncDataBackup
		_.forEach(syncData[0].pois, function(value, key){
			value.data.id = key;
			poiData.push(value);
		});

		syncObj.device_comm_id = commId,
		syncObj.client_id = syncData[0].client_id,
		syncObj.watermark = syncData[0].watermark,
		syncObj.geofences = geoData;
		syncObj.pois = poiData;
	}
	return bluebird.resolve(syncObj);
}


/** 
 * Uses comm_id from device report to fetch and return 
 * device_id, client_id and Customer Admin user_id related to the device
 * 
 * @method getDeviceInfo
 * @memberof db_mh_sync
 * @param {int} commId - comm id of the device
 * @return {obj} - contains device_id, client_id and Customer Admin user_id
*/
function getDeviceInfo(commId){
	var deviceInfo = {};
	return db.device_mode.findOne({
		where: {title: "SCCT"}
	})
	.then(function(deviceMode){
		return db.device.findOne({
			where: {mode: deviceMode.id},
			attributes: ["id", "client_id"],
			include: [{
				attributes: ["id"],
				model: db.comm,
				where: {id: commId, table_name: "assets"},
				required: true
			}]
		});
	})
	.then(function(device){
		if(device){
			device = device.get({plain: true});
			deviceInfo.deviceId = device.id;
			deviceInfo.clientId = device.client_id;
			return db.user.findOne({
				attributes: ["id"],
				where: {client_id: device.client_id},
				include: [{
					model: db.role,
					where: {title: "Customer Admin"},
					required: true
				}]
			})
			.then(function(user){
				if(user){
					user = user.get({plain: true});
					deviceInfo.userId = user.id;
				}
				return bluebird.resolve();
			});
		}
		return bluebird.resolve();
	})
	.then(function(){
		return bluebird.resolve(deviceInfo);
	});
}

/** 
 * Uses watermark to determine which table to read he syncData from
 * if watermark is 0, read from SyncDataHistory
 * if watermark is same as one from previous request, read from SyncDataBackup
 * If watermark is greater than previous request, read from SyncData
 * @method processAndGetSyncData
 * @memberof db_mh_sync
 * @param {int} deviceId - id of the device
 * @param {int} commId - comm id of the device
 * @param {int} watermark - unix time in milliseconds sent from MH
 * @param {obj} resultData - data received after updating device sync info for the device
 * @return {object} data - sync data for the device
*/
function processAndGetSyncData(deviceId, commId, watermark, resultData){	
	if(watermark == 0)
		return syncDataHistoryHandler("SyncDataHistory", deviceId);
	if(watermark > resultData.old_watermark)
		return syncDataHandler("SyncData", deviceId);
	if(watermark == resultData.old_watermark) 
		return syncDataBackupHandler("SyncDataBackup", deviceId);
	else 
		return bluebird.resolve({message: "Warning: Platform received watermark that cannot be processed. Please reset watermark to 0", result: {}});
}


/** 
 * Handles logic that needs to be excuted if reading sync info from SyncDataHistory
 * @method syncDataHistoryHandler
 * @memberof db_mh_sync
 * @param {string} schemaName - contains name of table (SyncData/SyncDataHistory/SyncDataBackup) 
 * in auditDb to determine what logic to execute
 * @param {int} deviceId- Id of the device
 * @return {object} data - sync data for the device
*/
function syncDataHistoryHandler(schemaName, deviceId){
	log.debug("syncDataHistoryHandler", schemaName);
	return deleteSyncDataBackup(deviceId)
	.bind({})
	.then(function(){
		return getSyncDataForDevice(schemaName, deviceId);
	})
	.bind({})
	.then(function(syncHistoryData){
		this.syncData = syncHistoryData;
		return deleteSyncData(deviceId);
	})
	.then(function(){
		return bluebird.resolve(this.syncData);
	});
}


/** 
 * Handles logic that needs to be excuted if reading sync info from SyncData
 * @method syncDataHandler
 * @memberof db_mh_sync
 * @param {string} schemaName - contains name of table (SyncData/SyncDataHistory/SyncDataBackup) 
 * in auditDb to determine what logic to execute
 * @param {int} deviceId- Id of the device
 * @return {object} data - sync data for the device
*/
function syncDataHandler(schemaName, deviceId){
	log.debug("syncDataHandler", schemaName);
	return deleteSyncDataBackup(deviceId)
	.bind({})
	.then(function(){
		return getSyncDataForDevice(schemaName, deviceId);
	})
	.then(function(syncData){
		this.syncData = syncData;
		this.syncData = syncData;
		if(syncData.length > 0){
			return moveDataToBackup(deviceId, syncData)
			.then(function(){
				return deleteSyncData(deviceId);
			});
		}
		else return bluebird.resolve();
	})
	.then(function(){
		return bluebird.resolve(this.syncData);
	});
}


/** 
 * Handles logic that needs to be excuted if reading sync info from SyncDataBackup
 * @method syncDataBackupHandler
 * @memberof db_mh_sync
 * @param {string} schemaName - contains name of table (SyncData/SyncDataHistory/SyncDataBackup) 
 * in auditDb to determine what logic to execute
 * @param {int} deviceId- Id of the device
 * @return {object} data - sync data for the device
*/
function syncDataBackupHandler(schemaName, deviceId){
	log.debug("syncDataBackupHandler", schemaName);
	return getSyncDataForDevice(schemaName, deviceId)
	.then(function(syncBackupData){
		if(syncBackupData.length == 0){
			log.debug("Recursive Logic Hit -> No data in SyncDataBackup");
			return getSyncDataForDevice("SyncData", deviceId)
			.then(function(syncData){
				this.syncData = syncData;
				if(syncData.length > 0){
					return moveDataToBackup(deviceId, syncData)
					.then(function(){
						return deleteSyncData(deviceId);
					});
				}
				else return bluebird.resolve();
			})
			.then(function(){
				return bluebird.resolve(this.syncData);
			});
		}
		else return bluebird.resolve(syncBackupData);
	});
}


/** 
 * Queries SyncData/SyncDataHistory/SyncDataBackup based on schema name passed in first argument
 * @method getSyncDataForDevice
 * @memberof db_mh_sync
 * @param {string} schemaName - contains name of table (SyncData/SyncDataHistory/SyncDataBackup) 
 * in auditDb to determine what logic to execute
 * @param {int} deviceId- Id of the device
 * @param {int} commId - id of the device
 * @return {object} syncObj - sync data for the device
*/
function getSyncDataForDevice(schemaName, deviceId){
	log.debug("getSyncDataForDevice", schemaName);
	return auditDb[schemaName].find({device_id: deviceId})
	.exec()
	.then(function(syncData){
		return bluebird.resolve(syncData);		
	});
}


/** 
 * Deletes data from SyncDataBackup
 * @method deleteSyncDataBackup
 * @memberof db_mh_sync
 * @param {int} deviceId- Id of the device
 * @return {object} - promise indicating process is complete
*/
function deleteSyncDataBackup(deviceId){
	log.debug("Deleting device data in SyncDataBackup");
	return auditDb.SyncDataBackup.remove({device_id: deviceId}).exec();
}

/** 
 * Deletes data from SyncData
 * @method deleteSyncData
 * @memberof db_mh_sync
 * @param {int} deviceId- Id of the device
 * @return {object} - promise indicating process is complete
*/
function deleteSyncData(deviceId){
	log.debug("Deleting device data in SyncData");
	return auditDb.SyncData.remove({device_id: deviceId}).exec();
}


/** 
 * Back's up data of device from SyncData into SyncDataBackup
 * @method moveDataToBackup
 * @memberof db_mh_sync
 * @param {int} deviceId - id of the device
 * @param {object} syncData - raw data from mongo schema (SyncData)
 * @return {object} - returns a promise indicating process is complete
*/
function moveDataToBackup(deviceId, syncData){
	if(syncData.length > 0){
		log.debug("Moving SyncData of device to SyncDataBackup");
		var syncBackupData = {
			device_id: deviceId,
			client_id: syncData[0].client_id,
			watermark: syncData[0].watermark,
			geofences: syncData[0].geofences,
			pois: syncData[0].pois,
			groups: syncData[0].groups,
			users: syncData[0].users,
			devices: syncData[0].devices
		};

		//insert data into SyncDataBackup
		var syncBackup = new auditDb.SyncDataBackup(syncBackupData);
		return syncBackup.save();
	}
	else return bluebird.resolve();
}

module.exports = {
	getSyncDevice: getSyncDevice,
	getDeviceInfo: getDeviceInfo,
	postSyncPoi: postSyncPoi
};