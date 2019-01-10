
const bluebird= require("bluebird");
const _= require("lodash");

/** 
 * Processes and constructs group data to be stored in SyncData, based on type of module action executed by the user
 * 
 * @method constructGroupDataToSync
 * @memberof sync
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} groupData - obj containing group data extracted from req.result passed from db layer
 * @return {object} dataToSync - returns obj containing deviceId and respective data to update as key=>value pairs
*/
function constructGroupDataToSync(action, groupData){
	var sync = require("./sync.js");

	var dataToSync = {};
	var currentGroupData = groupData.result;
	var groupId = currentGroupData.id;
	var groupCommId = currentGroupData.comm_id;
	var syncDevices = currentGroupData.sync.devices;

	var insertGroupObj = {
		id: groupId,
		comm_id: groupCommId,
		title: currentGroupData.title
	};

	var deleteGroupObj = {id: groupId, comm_id: groupCommId, title: currentGroupData.title};

	if(action == "post"){
		dataToSync = sync.appendDataToSyncObj(syncDevices, insertGroupObj, dataToSync, action);
		return bluebird.resolve(dataToSync);
	}
	else if(action == "put"){
		var originalGroupData = groupData.$originalData; //data of group before modifications were applied
		
		//filter out critical fields that need to be tracked
		var filteredOriginalGroup = _.pick(originalGroupData, ["title"]);
		
		var modifiedFields = {};

		//find which fields are modified
		_.each(filteredOriginalGroup, function(value, key){
			if(!_.isEqual(value, currentGroupData[key])){
				modifiedFields[key] = currentGroupData[key];
			}
		});

		//Building group data obj for devices that were unchanged during the user update
		var updateGroupObj = {};

		if(!_.isEmpty(modifiedFields)){
			//Assigning data to compulsory fields
			updateGroupObj.id = groupId;
			updateGroupObj.comm_id = groupCommId;
			updateGroupObj.title = currentGroupData.title;

			//Assigning data to optional fields: Only assign data if fields were modified by user
			_.each(_.pick(modifiedFields, ["title"]), function(value, key){
				updateGroupObj[key] = value;
			});
		}

		//Process, generate and return data to sync, using specific logic for 'put'
		return sync.generateEntityDataForPut(syncDevices, originalGroupData, insertGroupObj, updateGroupObj, deleteGroupObj, "group", false);
	}
	else if(action == "delete"){
		dataToSync = sync.appendDataToSyncObj(syncDevices, deleteGroupObj, dataToSync, action);
		return bluebird.resolve(dataToSync);
	}

	return bluebird.resolve({});
}

/** 
 * Processes assignments for groups added or removed for a particular device.
 * It then triggers the sync process for each entity based on respective action
 * 
 * @method processSyncAssignmentsForGroups
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} user - info of the user editing the assignments
 * @param {object} groupInfo - object containing info of groups assigned to a device via sync module
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processSyncAssignmentsForGroups(deviceId, user, geofenceInfo, timeStamp){
	return groupAssignmentHandler(deviceId, user, geofenceInfo.added, timeStamp, true)
	.then(function(){
		return groupAssignmentHandler(deviceId, user, geofenceInfo.removed, timeStamp, false);
	});
}

/** 
 * This handler constructs the group data in the format required to be processed by syncing process.
 * It processes the data based on whether the group entities were added or removed
 * 
 * @method groupAssignmentHandler
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} user - info of the user editing the assignments
 * @param {array} groupArray - array of group Ids being processed
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @param {boolean} isAdded - parameter is true if groups were added and false if removed
 * @return - returns a promise to indicate process is completed
*/
function groupAssignmentHandler(deviceId, user, groupArray, timeStamp, isAdded){
	if(groupArray.length > 0){
		return db.group.findAll({
			where: {id: {$in: groupArray}},
			attributes: ["id", "title"],
			include: [{
				model: db.comm,
				required: true,
				attributes: ["id"],
				where: {table_name: "groups"}
			}]
		})
		.then(function(groups){
			var syncProcessor = require("./syncProcessor.js");
			return bluebird.map(groups, function(group){
				group = group.get({plain: true});

				let dataForConstructor = {
					result: {
						id: group.id,
						comm_id: group.comms[0].id,
						title: group.title,
						sync: {
							devices: [deviceId]
						}
					}
				};

				if(isAdded){
					return syncProcessor.processAndUpdateSyncDataForGroups(user, "post", dataForConstructor, "group", timeStamp);
				}
				else if(!isAdded){
					const originalData = _.clone(dataForConstructor.result);
					
					//removing deviceId from sync to simulate as though the devices was unassigned from device
					dataForConstructor.result.sync = {devices: []}; 

					dataForConstructor["$originalData"] = originalData;
					return syncProcessor.processAndUpdateSyncDataForGroups(user, "put", dataForConstructor, "group", timeStamp);
				}

				return bluebird.resolve();
			});
		});
	}
	return bluebird.resolve();
}

module.exports = {
	constructGroupDataToSync: constructGroupDataToSync,
	processSyncAssignmentsForGroups: processSyncAssignmentsForGroups
};