
/* global db */


/*
	This file contains all the server side mechanics 
	that interacts with MH to exchange and sync geofence info
	between Tactical devices and SCC Titan Platform
*/

var bluebird = require("bluebird");
var _ = require("lodash"); 
var dbDevice= require("./db_device.js");


/** 
 * This Function processes and returns sync info of all devices that the user has permission to view
 * @method getDeviceSync
 * @memberof db_device_sync
 * @param {object} user - user information object
 * @return {object} - object containing array deviceIds that are already synced and deviceIds that are still pending
*/
var getDeviceSync = function(user){
	return dbDevice.getPermittedDevices(user)
	.then(function(permittedDevices){
		return db.device_sync_info.findAll({
			where: { device_id: _.map(permittedDevices, "id")}
		});
	})
	.then(function(syncInfoArray){		
		return bluebird.resolve({ message: "Get Device Sync Data Successful", result: processGetDeviceSyncInfo(syncInfoArray)});
	});	
};


/** 
 * computes and separates devices that are already synced from devices that are still pending
 * @method processFetDeviceSyncInfo
 * @memberof db_device_sync
 * @param {array} syncInfoArray - object containing sync info data of the devices in device_sync_info table 
 * @return {object} - object containing array deviceIds that are already synced and deviceIds that are still pending
*/
function processGetDeviceSyncInfo(syncInfoArray){
	var synced= [];
	var pending= [];

	_.each(syncInfoArray, function(syncInfo){
		var deviceId= syncInfo.device_id;
		(syncInfo.ack_received >= syncInfo.ring_sent)? synced.push(deviceId) : pending.push(deviceId);
	});
	return { synced: synced, pending: pending };
}



/** 
 * updates device_sync_info for a device that is ready to be synced
 * @method updateDeviceSyncInfo
 * @memberof db_device_sync
 * @param {int} deviceId - id of the device
 * @param {int} watermark - unix time in milliseconds sent from MH
 * @return {object} - Object containing data returned after update of device_sync_info table
*/
function updateDeviceSyncInfo(user, syncInfo){
	return db.device_sync_info.findOne({
		where: {device_id: syncInfo.device_id}
	})
	.bind({})
	.then(function(syncInfoData){
		if(syncInfoData){
			// if sync info exists for the device, we just process it with new info and save it	
			return processUpdateDeviceSyncInfo(syncInfoData, syncInfo, syncInfoData.watermark);
		}else{
			// if sync info does not exist for the device, we create a new info object with the data received and save it
			var deviceSyncInfo = {
				device_id: syncInfo.device_id,
				watermark: 0
			};
			var dbDeviceSyncInfo = db.device_sync_info.build(deviceSyncInfo);
	
			return processUpdateDeviceSyncInfo(dbDeviceSyncInfo, syncInfo, 0);			
		}
	})
	.then(function(resultData){
		return bluebird.resolve({message: "Successfully updated device sync info", result: resultData});
	});
}


/**
 * process the device_sync_info sequelize instance and store it in the DB
 * @method processUpdateDeviceSyncInfo
 * @memberof db_device_sync
 * @param {Object} dbDeviceSyncInfo sequelize instance of device_sync_info to be saved in the DB
 * @param {Object} syncInfo the new sync information received
 * @param {Number} currentWatermark the current acknowledged watermark  
 */
function processUpdateDeviceSyncInfo(dbDeviceSyncInfo, syncInfo, currentWatermark){
	// when a platform user issues a sync request
	if(syncInfo.ring_sent) dbDeviceSyncInfo.ring_sent = syncInfo.ring_sent;
	// when MH issues a sync request
	else if(syncInfo.watermark && syncInfo.ack_received && syncInfo.sync_received){
		// when a sync request is received from MH with watermark greater than the previously received watermark,
		// the old watermark would be considered as acknowledged meaning the device has successfully received
		// all information up to that watermark. 
		if(syncInfo.watermark > currentWatermark) {
			dbDeviceSyncInfo.ack_received = syncInfo.ack_received;
		}

		dbDeviceSyncInfo.watermark = syncInfo.watermark;
		dbDeviceSyncInfo.sync_received = syncInfo.sync_received;
	}

	//only update the last synced (ack received) information when a device requests with watermark 0
	// This is because the device can request watermark 0 at any point, and it should still be considered as a sync 
	else if(syncInfo.watermark == 0){
		dbDeviceSyncInfo.ack_received = syncInfo.ack_received;
	}
	
	return dbDeviceSyncInfo.save()
	.then(function(resultData){
		resultData.old_watermark = currentWatermark;
		return bluebird.resolve(resultData);
	});
}



module.exports = {
	getDeviceSync: getDeviceSync,
	updateDeviceSyncInfo: updateDeviceSyncInfo
};