const bluebird= require("bluebird");
const _= require("lodash");

const dictOfType = {"polygon": "000", "box": "000", "rectangle": "000", "path": "001", "circle": "002"};
const dictOfBooleans = {"true": 1, "false": 0};
const dictOfColorCodes = {"Red": 0, "Green": 1, "Gray": 2};


/** 
 * Processes and constructs geofence data to be stored in SyncData, based on type of module action executed by the user
 * 
 * @method constructGeoDataToSync
 * @memberof sync
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} geoData - obj containing geofence data extracted from req.result passed from db layer
 * @return {object} dataToSync - returns obj containing deviceId and respective data to update as key=>value pairs
*/
function constructGeoDataToSync(action, geoData){
	var sync = require("./sync.js");

	var dataToSync = {};//This obj will store the devices and their respective data (key=>value pairs), that need to updated in SyncData
	var currentGeoData = geoData.result;
	var geofenceId = currentGeoData.id;
	var syncDevices = currentGeoData.sync.devices;

	//Building geo data obj for devices that were added to the geofence during user update
	var insertGeoObj = {
		id: geofenceId,
		type: dictOfType[currentGeoData.shape],
		status: dictOfBooleans[currentGeoData.active],
		type_area: dictOfBooleans[currentGeoData.inclusive],
		color: determineColor(currentGeoData.active, currentGeoData.inclusive),
		title: currentGeoData.title,
		note: currentGeoData.note,
		width: currentGeoData.width,
		coordinates: currentGeoData.coordinates
	};

	//Building geo data obj for devices that were removed from the geofence during user update
	var deleteGeoObj = {id: geofenceId, title: currentGeoData.title};
	
	//Structure data based on module action executed by user
	if(action == "post"){
		//Assign respective data for all the devices that were added to the geofence during user insert
		if(currentGeoData.active){
			dataToSync = sync.appendDataToSyncObj(syncDevices, insertGeoObj, dataToSync, action);
		}
		return bluebird.resolve(dataToSync);
	}
	else if(action == "put"){
		var originalGeoData = geoData.$originalData;//data of geofence before modification were applied
		
		//Filter out critical fields that need to be tracked
		var filteredOrginalGeofence = _.pick(originalGeoData, ["title", "note", "shape", "width", "coordinates", "active", "inclusive"]);		
				
		var modifiedFields = {};

		//Find out which fields were modified
		_.each(filteredOrginalGeofence, function(value, key){
			if(!_.isEqual(value, currentGeoData[key])) {
				modifiedFields[key] = currentGeoData[key];
			}
		});
		
		//Building geo data obj for devices that were unchanged during the user update
		var updateGeoObj = {};

		if(!_.isEmpty(modifiedFields)){
			//Assigning data to compulsory fields
			updateGeoObj.id = geofenceId;
			updateGeoObj.status = dictOfBooleans[currentGeoData.active];
			updateGeoObj.type_area = dictOfBooleans[currentGeoData.inclusive];
			updateGeoObj.color = determineColor(currentGeoData.active, currentGeoData.inclusive);

			//Assigning data to optional fields: Only assign data if fields were modified by user
			_.each(_.pick(modifiedFields, ["title", "note", "active"]), function(value, key){
				updateGeoObj[key] = value;
			});

			//Special case to support MH, requested by Guy
			if(_.has(modifiedFields, "shape") || _.has(modifiedFields, "coordinates") || _.has(modifiedFields, "width")){
				updateGeoObj.type = dictOfType[currentGeoData.shape];
				updateGeoObj.coordinates = currentGeoData.coordinates;
				updateGeoObj.width = currentGeoData.width;
			}

			/*
				NOTE: REPLACE THIS CODE WITH _.each and If condition above, When MH has fixed geo shape, coortdinate and width processing
				//Assigning data to optional fields: Only assign data if fields were modified by user
				_.each(_.pick(modifiedFields, ["title", "note", "shape", "coordinates", "width"]), function(value, key){
					if(key == "shape") updateGeoObj[key] = dictOfType[value];
					else updateGeoObj[key] = value;
				});
			*/
		}

		//Process, generate and return data to sync, using specific logic for 'put'
		return sync.generateEntityDataForPut(syncDevices, originalGeoData, insertGeoObj, updateGeoObj, deleteGeoObj, "geofence", currentGeoData.active);
	}
	else if(action == "delete"){
		//Assign respective data for all the devices that were part of geofence during user delete
		if(currentGeoData.active){
			dataToSync = sync.appendDataToSyncObj(syncDevices, deleteGeoObj, dataToSync, action);
		}
		return bluebird.resolve(dataToSync);	
	}
	return bluebird.resolve({});	
}

/** 
 * Processes assignments for geofences added or removed for a particular device.
 * It then triggers the sync process for each entity based on respective action
 * 
 * @method processSyncAssignmentsForGeofences
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} user - info of the user editing the assignments
 * @param {object} geofenceInfo - object containing info of geofences assigned to a device via sync module
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processSyncAssignmentsForGeofences(deviceId, user, geofenceInfo, timeStamp){
	return geofenceAssignmentHandler(deviceId, user, geofenceInfo.added, timeStamp, true)
	.then(function(){
		return geofenceAssignmentHandler(deviceId, user, geofenceInfo.removed, timeStamp, false);
	});
}

/** 
 * This handler constructs the geofence data in the format required to be processed by syncing process.
 * It processes the data based on whether the geofence entities were added or removed
 * 
 * @method geofenceAssignmentHandler
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} user - info of the user editing the assignments
 * @param {array} geofencesArray - array of geofence Ids being processed
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @param {boolean} isAdded - parameter is true if geofences were added and false if removed
 * @return - returns a promise to indicate process is completed
*/
function geofenceAssignmentHandler(deviceId, user, geofenceArray, timeStamp, isAdded){
	if(geofenceArray.length > 0){
		return db.geofence.findAll({
			where: {id: {$in: geofenceArray}},
			include: [{
				model: db.geofence_coordinate,
				as: "coordinates",
				attributes: ["longitude", "latitude"],
				required: true
			}]
		})
		.then(function(geofences){
			var syncProcessor = require("./syncProcessor.js");
			return bluebird.map(geofences, function(geofence){
				geofence = geofence.get({plain: true});

				if(isAdded){
					//Ensuring that only geofences that are approved and active are synced
					if(geofence.approved && geofence.active){
						geofence.sync = {devices: [deviceId]};
						let dataForConstructor = {result: geofence};
						return syncProcessor.processAndUpdateSyncData(user, "post", dataForConstructor, "geofence", timeStamp, false);			
					}
					return bluebird.resolve();
				}
				else if(!isAdded){
					const originalData = _.clone(geofence);
					originalData.sync = {devices: [deviceId]};
					geofence.sync = {devices: []};
					let dataForConstructor = {result: geofence, "$originalData": originalData};
					return syncProcessor.processAndUpdateSyncData(user, "put", dataForConstructor, "geofence", timeStamp, false);
				}
				return bluebird.resolve();
			});
		});
	}
	return bluebird.resolve();
}

/** 
 * Uses geofence status to determine if devices need to be added or removed from geofences
 * @method determineDeviceAssignmentBasedOnGeoStatus
 * @memberof sync 
 * @param {object} deviceInfo - object containing arrays of devices that are added, removed or untouched
 * @param {object} updateGeoObj - object that relates to devices that are updating the geofence
 * @param {boolean} isActive - default false, but used to detemine the active/inactive status for geofences
 * @return determine end of process
 */
function determineDeviceAssignmentBasedOnGeoStatus(deviceInfo, updateGeoObj, isActive){
	if(!_.isEmpty(updateGeoObj)){
		//geo changed from inactive to active
		//all devices added and untouched will get insert command
		if(_.has(updateGeoObj, ["active"]) && isActive){
			deviceInfo.devicesAdded = _.concat(deviceInfo.devicesAdded, deviceInfo.devicesUntouched);
			deviceInfo.devicesUntouched = [];
		}

		//geo has been changed from active to inactive
		//all devices removed and untouched will get delete command, devices added will not get updated
		if(_.has(updateGeoObj, ["active"]) && !isActive){
			deviceInfo.devicesRemoved = _.concat(deviceInfo.devicesRemoved, deviceInfo.devicesUntouched);
			deviceInfo.devicesAdded = [];
			deviceInfo.devicesUntouched = [];
		}

		//user did not change status and it is still inactive do not register and sync any changes
		if(!_.has(updateGeoObj, ["active"]) && !isActive){
			deviceInfo.devicesAdded = [];
			deviceInfo.devicesRemoved = [];
			deviceInfo.devicesUntouched = [];
		}
	}
	else{
		//if geofence is inactive dont issue any commmand (update syncmods) to devices that were added or removed
		if(!isActive){
			deviceInfo.devicesAdded = [];
			deviceInfo.devicesRemoved = [];
		}
		//If no new Sync devices have been added, Do not log change in SyncData if user has not made critical changes to geofence
		deviceInfo.devicesUntouched = [];
	}
	return;
}

/** 
 * This function outputs color based on status and area info of the geofence
 * 
 * @method determineColor
 * @memberof sync
 * @param {boolean} status - variable indicating if geofence is enabled or disabled
 * @param {boolean} area - varibale indicating if geofence is inclusive or exclusive
 * @return {int} color code - returns code of the color based on the two parameter inputs to the function
*/
function determineColor(status, area){
	if(status){
		if(area) return dictOfColorCodes["Green"];
		else return dictOfColorCodes["Red"];
	}
	else return dictOfColorCodes["Gray"];
}

module.exports = {
	constructGeoDataToSync: constructGeoDataToSync,
	processSyncAssignmentsForGeofences: processSyncAssignmentsForGeofences,
	determineDeviceAssignmentBasedOnGeoStatus: determineDeviceAssignmentBasedOnGeoStatus
};