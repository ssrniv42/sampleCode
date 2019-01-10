const bluebird= require("bluebird");
const _= require("lodash");


/** 
 * Processes and constructs device data to be stored in SyncData, based on type of module action executed by the user
 * 
 * @method constructDeviceDataToSync
 * @memberof sync
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} deviceData - obj containing device data extracted from req.result passed from db layer
 * @return {object} dataToSync - returns obj containing deviceId and respective data to update as key=>value pairs
*/
function constructDeviceDataToSync(action, deviceData){
	var sync = require("./sync.js");
    
	var dataToSync = {}; 
	var currentDeviceData = deviceData.result;
	var deviceId = currentDeviceData.id;
	var deviceCommId = currentDeviceData.comm_id;
	var syncDevices = currentDeviceData.sync.devices;

	var insertDeviceObj = {
		id: deviceId,
		comm_id: deviceCommId,
		title: currentDeviceData.name
	};

	var deleteDeviceObj = {id: deviceId, comm_id: deviceCommId, title: currentDeviceData.name};

	if(action == "post"){
		dataToSync = sync.appendDataToSyncObj(syncDevices, insertDeviceObj, dataToSync, action);
		return bluebird.resolve(dataToSync);
	}
	else if(action == "put"){
		var originalDeviceData = deviceData.$originalData; //data of device before modifications were applied
		
		//filter out critical fields that need to be tracked
		var filteredOriginalDevice = _.pick(originalDeviceData, ["name"]);
		
		var modifiedFields = {};

		//find which fields are modified
		_.each(filteredOriginalDevice, function(value, key){
			if(!_.isEqual(value, currentDeviceData[key])){
				modifiedFields[key] = currentDeviceData[key];
			}
		});

		//Building device data obj for devices that were unchanged during the user update
		var updateDeviceObj = {};

		if(!_.isEmpty(modifiedFields)){
			//Assigning data to compulsory fields
			updateDeviceObj.id = deviceId;
			updateDeviceObj.comm_id = deviceCommId;
			updateDeviceObj.title = currentDeviceData.name;

			//Assigning data to optional fields: Only assign data if fields were modified by user
			_.each(_.pick(modifiedFields, ["name"]), function(value, key){
				if(key == "name"){
					updateDeviceObj["title"] = value;
				}
			});
		}

		//Process, generate and return data to sync, using specific logic for 'put'
		return sync.generateEntityDataForPut(syncDevices, originalDeviceData, insertDeviceObj, updateDeviceObj, deleteDeviceObj, "device", false);
	}
	else if(action == "delete"){
		dataToSync = sync.appendDataToSyncObj(syncDevices, deleteDeviceObj, dataToSync, action);
		return bluebird.resolve(dataToSync);
	}

	return bluebird.resolve({});
}

/** 
 * Processes assignments for devices added or removed for a particular device.
 * It then triggers the sync process for each entity based on respective action
 * 
 * @method processSyncAssignmentsForDevices
 * @memberof sync
 * @param {int} deviceId - Id of device being synced with
 * @param {object} user - info of the user editing the assignments
 * @param {object} deviceInfo - object containing info of devices assigned to a device via sync module
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processSyncAssignmentsForDevices(deviceId, user, deviceInfo, timeStamp){
	return deviceAssignmentHandler(deviceId, user, deviceInfo.added, timeStamp, true)
	.then(function(){
		return deviceAssignmentHandler(deviceId, user, deviceInfo.removed, timeStamp, false);
	});
}

/** 
 * This handler constructs the device data in the format required to be processed by syncing process.
 * It processes the data based on whether the device entities were added or removed
 * 
 * @method deviceAssignmentHandler
 * @memberof sync
 * @param {int} deviceId - Id of device to be synced with
 * @param {object} user - info of the user editing the assignments
 * @param {array} deviceArray - Array of device ids being processed
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @param {boolean} isAdded - parameter is true if users were added and false if removed
 * @return - returns a promise to indicate process is completed
*/
function deviceAssignmentHandler(deviceId, user, deviceArray, timeStamp, isAdded){
	if(deviceArray.length > 0){
		return db.device.findAll({
			where: {id: {$in: deviceArray}},
			attributes: ["id", "name"],
			include: [{
				model: db.comm,
				required: true,
				where: {table_name: "assets"},
				attributes: ["id"]
			}, {
				model: db.device_type,
				attributes: ["id"],
				required: true,
				include: [{
					model: db.device_type_components,
					where: {messaging: 1},
					as: "components",
					attributes: ["id", "messaging"],
					required: true
				}]
			}]
		})
		.then(function(devices){
			var syncProcessor = require("./syncProcessor.js");
			return bluebird.map(devices, function(device){
				device = device.get({plain: true});

				let dataForConstructor = {
					result: {
						id: device.id,
						comm_id: device.comms[0].id,
						name: device.name,
						sync: {
							devices: [deviceId]
						}
					}
				};

				if(isAdded){
					return syncProcessor.processAndUpdateSyncData(user, "post", dataForConstructor, "device", timeStamp, false);
				}
				else if(!isAdded){
					const originalData = _.clone(dataForConstructor.result);
					
					//removing deviceId from sync to simulate as though the devices was unassigned from device
					dataForConstructor.result.sync = {devices: []}; 

					dataForConstructor["$originalData"] = originalData;
					return syncProcessor.processAndUpdateSyncData(user, "put", dataForConstructor, "device", timeStamp, false);
				}

				return bluebird.resolve();
			});
		});
	}
	return bluebird.resolve();
}

module.exports = {
	constructDeviceDataToSync: constructDeviceDataToSync,
	processSyncAssignmentsForDevices: processSyncAssignmentsForDevices
};