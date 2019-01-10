const bluebird= require("bluebird");
const _= require("lodash");

/** 
 * Processes and constructs poi data to be stored in SyncData, based on type of module action executed by the user
 * 
 * @method constructPoiDataToSync
 * @memberof sync
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} poiData - obj containing poi data extracted from req.result passed from db layer
 * @return {object} dataToSync - returns obj containing deviceId and respective data to update as key=>value pairs
*/
function constructPoiDataToSync(action, poiData){
	var sync = require("./sync.js");

	var dataToSync = {};//This obj will store the devices and their respective data (key=>value pairs), that need to updated in SyncData
	var currentPoiData = poiData.result;
	var poiId = currentPoiData.id;
	var syncDevices = currentPoiData.sync.devices;

	var natoCode = {};
	if(currentPoiData.nato_code != null && currentPoiData.image_id == null){
		natoCode.affiliation = currentPoiData.nato_code.substring(1, 2);
		natoCode.area = currentPoiData.nato_code.substring(2, 3);
	}

	var coordinates = [];

	var coordObj = {
		latitude: currentPoiData.latitude,
		longitude: currentPoiData.longitude
	};

	coordinates.push(coordObj);
	
	//Building poi data obj for devices that were added to the poi during user update
	var insertPoiObj = {
		id: poiId,
		title: currentPoiData.title,
		note: currentPoiData.note,
		coordinates: coordinates,
		nato_code: natoCode,
		image_id: null
	};

	//Building poi data obj for devices that were removed from the poi during user update
	var deletePoiObj = {id: poiId, title: currentPoiData.title};

	var rejectPoiObj = {
		id: poiId,
		title: currentPoiData.title,
		note: currentPoiData.note,
		coordinates: coordinates,
		nato_code: natoCode,
		image_id: null
	};

	//Structure data based on module action executed by user
	if(action == "post"){
		if(currentPoiData.approved == false) return bluebird.resolve(dataToSync);
		else{
			dataToSync = sync.appendDataToSyncObj(syncDevices, insertPoiObj, dataToSync, action);
			return bluebird.resolve(dataToSync);
		}
	}
	else if(action == "put"){
		var originalPoiData = poiData.$originalData;// data of poi before modification were applied
		
		//filter out critical fields that need to be tracked
		var filteredOriginalPoi = _.pick(originalPoiData, ["title", "note", "latitude", "longitude", "image_id", "nato_code", "approved"]);
		
		var modifiedFields = {};

		//find which fields were modified
		_.each(filteredOriginalPoi, function(value, key){
			if(!_.isEqual(value, currentPoiData[key])){
				modifiedFields[key] = currentPoiData[key];
			}
		});

		//Building poi data obj for devices that were unchanged during the user update
		var updatePoiObj = {};

		if(!_.isEmpty(modifiedFields)){
			updatePoiObj.id = poiId;
			
			//Assigning data to poi fields only if fields were modified
			_.each(_.pick(modifiedFields, ["title", "note", "image_id"]), function(value, key){
				if(key == "image_id"){
					//Temp until we find a way to share generic icons between platform and tactical
					updatePoiObj[key] == null;
				}
				else{
					updatePoiObj[key] = value;
				}
			});

			//special case
			if(_.has(modifiedFields, "latitude") || _.has(modifiedFields, "longitude")){
				updatePoiObj.coordinates = coordinates;
			}

			if(currentPoiData.nato_code != null && currentPoiData.image_id == null){
				if(_.has(modifiedFields, "nato_code")){
					updatePoiObj.nato_code = natoCode;
				}
			}
		}

		//case when user has approved poi, it should go in as an insert
		if(originalPoiData.approved == false && currentPoiData.approved == true) {
			dataToSync = sync.appendDataToSyncObj(syncDevices, insertPoiObj, dataToSync, "post");
			return bluebird.resolve(dataToSync);
		} 
		else{
			return sync.generateEntityDataForPut(syncDevices, originalPoiData, insertPoiObj, updatePoiObj, deletePoiObj, "poi", false);
		}
	}
	else if(action == "delete"){
		
		//This is case handling poi rejection by the platform. 
		if(currentPoiData.approved == false){
			action = "reject";
			//Assign respective data for all the devices that were assigned to the poi during user delete
			dataToSync = sync.appendDataToSyncObj(syncDevices, rejectPoiObj, dataToSync, action);
			return bluebird.resolve(dataToSync);
		}
		else{
			//Assign respective data for all the devices that were assigned to the poi during user delete
			dataToSync = sync.appendDataToSyncObj(syncDevices, deletePoiObj, dataToSync, action);
			return bluebird.resolve(dataToSync);
		}
	}	
	return bluebird.resolve({});
}

/** 
 * Processes assignments for POIs added or removed for a particular device.
 * It then triggers the sync process for each entity based on respective action
 * 
 * @method processSyncAssignmentsForPois
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} user - info of the user editing the assignments
 * @param {object} poiInfo - object containing info of POIs assigned to a device via sync module
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processSyncAssignmentsForPois(deviceId, user, poiInfo, timeStamp){
	return poiAssignmentHandler(deviceId, user, poiInfo.added, timeStamp, true)
	.then(function(){
		return poiAssignmentHandler(deviceId, user, poiInfo.removed, timeStamp, false);
	});
}

/** 
 * This handler constructs the POI data in the format required to be processed by syncing process.
 * It processes the data based on whether the POI entities were added or removed
 * 
 * @method poiAssignmentHandler
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} user - info of the user editing the assignments
 * @param {array} poiArray - Array of POI ids being processed
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @param {boolean} isAdded - parameter is true if POIs were added and false if removed
 * @return - returns a promise to indicate process is completed
*/
function poiAssignmentHandler(deviceId, user, poiArray, timeStamp, isAdded){
	if(poiArray.length > 0){
		return db.poi.findAll({
			where: {id: {$in: poiArray}}
		})
		.then(function(pois){
			var syncProcessor = require("./syncProcessor.js");
			return bluebird.map(pois, function(poi){
				poi = poi.get({plain: true});
				
				if(isAdded){
					//Ensuring that only POIs that are approved and of type NATO are synced
					if(poi.approved && poi.image_id == null && poi.nato_code != null){
						poi.sync = {devices: [deviceId]};
						let dataForConstructor = {result: poi};
						return syncProcessor.processAndUpdateSyncData(user, "post", dataForConstructor, "poi", timeStamp, false);
					}
					return bluebird.resolve();
				}
				else if(!isAdded){
					const originalData = _.clone(poi);
					originalData.sync = {devices: [deviceId]};
					poi.sync = {devices: []};
					let dataForConstructor = {result: poi, "$originalData": originalData};
					return syncProcessor.processAndUpdateSyncData(user, "put", dataForConstructor, "poi", timeStamp, false);
				}
				return bluebird.resolve();
			});
		});
	}
	return bluebird.resolve();
}


module.exports = {
	constructPoiDataToSync: constructPoiDataToSync,
	processSyncAssignmentsForPois: processSyncAssignmentsForPois
};