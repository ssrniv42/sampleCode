/* global log, db, utils, auditDb */
var bluebird = require("bluebird");
var _= require("lodash");

/*
    The core of the sync plugin. Handles storing of sync data into mongo DB
    in bothe historic and data tables. 

    Also computes action per entity based on sync history
*/

const dictOfAction = {"post": 0, "put": 1, "delete": 2, "reject": 3};

/** 
 * Processes and generates data to be stored in SyncData, specifically for 'PUT' action executed by user
 * also determines which devices should get insert/update/delete obj based on whether the user has added or removed sync devices 
 * and also based on status of the entity (if it is a geofence)
 * @method generateEntityDataForPut
 * @memberof sync 
 * @param {array} syncDevices - array of devices (id's) assigned to the entity for syncing
 * @param {object} originalEntityData - object containing data of entity before the edit
 * @param {object} insertEntityObj - object that relates to devices that are adding the entity
 * @param {object} updateEntityObj - object that relates to devices that are updating the entity
 * @param {object} deleteEntityObj - object that relates to devices that are deleting the entity
 * @param {string} entityType - enum(geofence, poi, user, group, device)
 * @param {boolean} isActive - default false, but used to detemine the active/inactive status for geofences
 * @return {object} dataToSync - returns object containing deviceId's' and its data as key=>value pairs
 */
function generateEntityDataForPut(syncDevices, originalEntityData, insertEntityObj, updateEntityObj, deleteEntityObj, entityType, isActive){
	var originalDevices = originalEntityData.sync.devices;

	var dataToSync = {};

	/*
		Use the information to find out which tactical devices were added, removed and the ones untouched.
		This is to fullfill the following criteria:
		- if device is addded: The device gets sync info to add the entity to device
		- if device is removed: The device gets sync info to delete the entity from device
		- if device is untouched: The device gets info that will update the entity on device
	*/
	var deviceInfo = {
		devicesAdded: _.difference(syncDevices, originalDevices),
		devicesRemoved: _.difference(originalDevices, syncDevices),
		devicesUntouched: _.intersection(originalDevices, syncDevices)
	};

	if(entityType == "geofence"){
		var geofenceHandler = require("./geofenceHandler.js");
		geofenceHandler.determineDeviceAssignmentBasedOnGeoStatus(deviceInfo, updateEntityObj, isActive);
	}
	
	//Assign respective data to devices that were added to the entity during user update
	dataToSync = appendDataToSyncObj(deviceInfo.devicesAdded, insertEntityObj, dataToSync, "post");

	//Assign respective data to devices that were unchanged during user update
	dataToSync = appendDataToSyncObj(deviceInfo.devicesUntouched, updateEntityObj, dataToSync, "put");
	
	//Assign respective data to devices that were removed from the entity during user update
	dataToSync = appendDataToSyncObj(deviceInfo.devicesRemoved, deleteEntityObj, dataToSync, "delete");

	return bluebird.resolve(dataToSync);
}

/** 
 * This function assigns respective data for all the devices that the user has assigned to geofence/poi for syncing
 * 
 * @method appendDataToSyncObj
 * @memberof sync
 * @param {array} syncDevices - array of devices (id's) assigned to the geofence/poi for syncing
 * @param {object} dataObj - object containing data that needs to be assigned to the geofence/poi
 * @param {object} dataToSync - object that will be appended with deviceId's' and its data as key=>value pairs
 * @param {int} action - code describing action associated with the geofence/poi data for Tactical to use
 * @return {object} dataToSync - returns object containing deviceId's' and its data as key=>value pairs
*/
function appendDataToSyncObj(syncDevices, dataObj, dataToSync, action){
	_.each(syncDevices, function(deviceId){
		dataToSync[deviceId] = {
			action: dictOfAction[action],
			data: dataObj
		};
	});
	return dataToSync;
}

/** 
 * Inserts or updates entity data in SyncData and SyncDataHistory tables
 * 
 * @method sendEntityDataToSync
 * @memberof sync
 * @param {object} user - object containing user data (client_id and user_id) of user that modified the entity
 * @param {boolean} dataToSync - object that will be appended with deviceId's' and its data as key=>value pairs
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @param {string} entityType - enum(pois, geofences, groups, users, devices)
 * @return {} promise - returns a promise after operation is complete
*/
function sendEntityDataToSync(user, dataToSync, timeStamp, entityType){
	log.debug("sendEntityDataToSync", dataToSync);

	if(_.isEmpty(dataToSync)){
		return bluebird.resolve();
	}

	return getModifierCommId(user)
	.then(function(commId){
		/*
			Logic Flow: for each device in dataToSync do the following ->
			1. Search the SyncData table in mongoDB to see if record exists for the device_id
			2. If record exists, search data result to see if there is a record for the id of the entity
				a) If entity record exists update the information
				b) If entity record does not exist update the device record with info of the entity as a new 'key'=>'value' pair in respective entity array
			3. If record does not exist for the device insert a new record for the device in the SyncData table
		*/

		return bluebird.map(_.keys(dataToSync), function(deviceId){
			var entityData = dataToSync[deviceId];

			if(_.isEmpty(entityData)){
				return bluebird.resolve();
			}

			var entityId = entityData.data.id;

			if(!entityId){
				return bluebird.resolve();
			}

			//initiating obj that stores info of current modifications that need to sync
			var currentMods = {
				last_modified_by: commId,
				last_modified_time: timeStamp,
				action: entityData.action,
				data: entityData.data
			};

			return updateOrArchiveEntityDataForSync(deviceId, entityId, user, currentMods, "SyncData", timeStamp, entityType)
			.then(function(){
				return updateOrArchiveEntityDataForSync(deviceId, entityId, user, currentMods, "SyncDataHistory", timeStamp, entityType);
			});
		});
	});
}

/** 
 * Uses the schema name being passed to update the entity object of device in the respective table (SyncData/SyncDataHistory) 
 * 
 * @method updateOrArchiveEntityDataForSync
 * @memberof sync
 * @param {number} deviceId - id of the device
 * @param {number} entityId - id of the entity being edited
 * @param {object} user - object containing user data (client_id and user_id) of user that modified the entity
 * @param {object} currentMods - object containing most up-to-date info of the latest change to entity object that is ready to be updated in the respective table
 * @param {string} schemaName - name of the schema that needs to be updated (SyncData/SyncDataHistory)
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @param {string} entityType - enum(pois, geofences, groups, users, devices)
 * @return {} promise - returns a promise after operation is complete
*/
function updateOrArchiveEntityDataForSync(deviceId, entityId, user, currentMods, schemaName, timeStamp, entityType){
	//Search the SyncData/SyncDataHistory table in mongoDB to see if record exists for the device_id
	return auditDb[schemaName].find({device_id: deviceId})
	.then(function(syncData){
		//If record exists, finalize the data object that needs to be stored in the SyncData/SyncDataHistory table based on whether record already exists for entity.
		if(syncData.length > 0){
			//variable that will store final modification data that goes into SyncData/SyncDataHistory 
			var syncMods = {};
			
			if(!syncData[0][entityType]){
				syncData[0][entityType] = {};
			}

			//if data exists, perform specific merge actions to determine the final object to be updated in SyncData/SyncDataHistory
			if(syncData[0][entityType][entityId]) {
				syncMods =  getFinalObjectToSync(currentMods, syncData[0][entityType][entityId]);
			}
			
			//if data for entity does not exist, store the latest info in SyncData/SyncDataHistory
			else{
				syncMods = currentMods;
			}

			//building $set object programmatically
			var setModifier = {$set: {}};
			setModifier.$set["watermark"] = timeStamp;

			//In this case delete the entity record, because user has deleted the entity before tactical/wave has got it
			if(syncMods == 0){
				setModifier.$unset = {};
				setModifier["$unset"][entityType+"."+entityId] = "";
			}
			else{
				setModifier.$set[entityType+"."+entityId] = syncMods;
			}

			return auditDb[schemaName].update({"device_id": deviceId}, setModifier);
		}
		//If record does not exist for the device insert a new record for the device in the SyncData/SyncDataHistory table
		else{
			var pois = {};
			var geofences = {};
			var groups = {};
			var users = {};
			var devices = {};

			switch(entityType){
			case "pois":
				pois[entityId] = currentMods;
				break;
			case "geofences":
				geofences[entityId] = currentMods;
				break;
			case "groups":
				groups[entityId] = currentMods;
				break;
			case "users":
				users[entityId] = currentMods;
				break;
			case "devices":
				devices[entityId] = currentMods;
				break;
			}

			var insertObj = {
				device_id: deviceId,
				client_id: user.client_id,
				watermark: timeStamp,
				geofences: geofences,
				pois: pois,
				users: users,
				groups: groups,
				devices: devices
			};

			//inserting document for device in SyncData/SyncDataHistory table
			var mods = new auditDb[schemaName](insertObj);
			return mods.save();
		}
	});
}

/** 
 * Queries DB and returns comm_id of the user
 * 
 * @method getModifierCommId
 * @memberof sync
 * @param {object} user - object containing user data (client_id and user_id) of user that modified the geofence
 * @return {int} comm_id - returns comm_id of the user who modified the geofence
*/
//This function processes and returns comm_id of user. If it is a client user it returns client comm_id, if it is a regular user it returns user comm_id 
function getModifierCommId(user){
	
	return db.comm.findOne({
		where: {row_id: user.user_id, table_name: "users"}
	})
	.then(function(commData){
		return bluebird.resolve(commData.id);
	});
}

/** 
 * This function performs certain merge actions based on actions, and returns an object containing final data to be synced
 * @method getFinalObjectToSync
 * @memberof sync
 * @param {object} sourceObj - object containing data of origin (exmaple data from db layer or SyncData)
 * @param {object} destObj - object containing data of destination (Data from SyncData or SyncDataHistory)
 * @return {object} - Object containing final data after merge actions
*/
function getFinalObjectToSync(sourceObj, destObj){
	//Case 1: going from sourceObj action 1 (update) to destObj action 0 (insert) -> return merge of the data in two objects, but keep action as 0
	if(sourceObj.action == 1 && destObj.action == 0){
		sourceObj = _.omit(sourceObj, ["action"]);
		return _.merge(destObj, sourceObj); 
	}
	
	//Case 2: going from sourceObj action 1 (update) to destObj action 1 (update) -> return merge of the data in two objects
	else if(sourceObj.action == 1 && destObj.action == 1) return _.merge(destObj, sourceObj);
	
	//Case 3: going from sourceObj action 2 (delete) to destObj action 0 (insert) -> return 0
	else if(sourceObj.action == 2 && destObj.action == 0) return 0;

	//Case 4: going from sourceObj action 3 (reject) to destObj action 0 (insert) -> return sourceObj. 
	//This case will only hit when platform commander rejects a poi/geo sent by tactical
	else if(sourceObj.action == 3 && destObj.action == 0) return sourceObj;

	//Case 5: Going from sourceObj action 0 to destObj action 2 -> return 0
	//This case only occurs when a tactical device is removed from an entity and readded back before the sync is complete
	//return 0 because you shouldn't send anything down to the device
	else if(sourceObj.action == 0 && destObj.action == 2) return 0;

	/*
		Case 6: 
		Other Possibilities, return sourceObj
		a) going from sourceObj action 2 (delete) to destObj action 1 (update)
		b) going from sourceObj action 0 (insert) to destObj action 0 (insert)
		c) going from sourceObj action 1 (update) to destObj action 2 (delete)
		d) going from sourceObj action 0 (insert) to destObj action 1 (update)
	*/ 
	else return sourceObj;
}

module.exports = {
	sendEntityDataToSync: sendEntityDataToSync,
	getFinalObjectToSync: getFinalObjectToSync,
	appendDataToSyncObj: appendDataToSyncObj,
	generateEntityDataForPut: generateEntityDataForPut
};