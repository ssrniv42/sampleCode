const bluebird= require("bluebird");
const _= require("lodash");

/** 
 * Processes and constructs user data to be stored in SyncData, based on type of module action executed by the user
 * 
 * @method constructUserDataToSync
 * @memberof sync
 * @param {int} action - Module action executed by the user from the front end (post/put/delete)
 * @param {object} userData - obj containing user data extracted from req.result passed from db layer
 * @return {object} dataToSync - returns obj containing deviceId and respective data to update as key=>value pairs
*/
function constructUserDataToSync(action, userData){
	var sync = require("./sync.js");

	var dataToSync = {};
	var currentUserData = userData.result;
	var userId = currentUserData.id;
	var userCommId = currentUserData.comm_id;
	var syncDevices = currentUserData.sync.devices;

	currentUserData.platform_enabled = true;
	currentUserData.sms_enabled = false;

	if(currentUserData.phone_number != null){
		currentUserData.sms_enabled = true;
	}

	if(currentUserData.role == "Contact User"){
		currentUserData.platform_enabled = false;
	}

	var insertUserObj = {
		id: userId,
		comm_id: userCommId,
		title: currentUserData.username,
		platform_enabled: currentUserData.platform_enabled, 
		sms_enabled: currentUserData.sms_enabled
	};

	var deleteUserObj = {id: userId, comm_id: userCommId, title: currentUserData.username};

	if(action == "post"){
		dataToSync = sync.appendDataToSyncObj(syncDevices, insertUserObj, dataToSync, action);
		return bluebird.resolve(dataToSync);
	}
	else if(action == "put"){
		var originalUserData = userData.$originalData; //data of user before modifications were applied
		
		//filter out critical fields that need to be tracked
		var filteredOriginalUser = _.pick(originalUserData, ["username"]);
		
		var modifiedFields = {};

		//find which fields are modified
		_.each(filteredOriginalUser, function(value, key){
			if(!_.isEqual(value, currentUserData[key])){
				modifiedFields[key] = currentUserData[key];
			}
		});

		//Building user data obj for devices that were unchanged during the user update
		var updateUserObj = {};

		if(!_.isEmpty(modifiedFields)){
			//Assigning data to compulsory fields
			updateUserObj.id = userId;
			updateUserObj.comm_id = userCommId;
			updateUserObj.title = currentUserData.username;
			updateUserObj.platform_enabled = currentUserData.platform_enabled;
			updateUserObj.sms_enabled = currentUserData.sms_enabled;

			//Assigning data to optional fields: Only assign data if fields were modified by user
			_.each(_.pick(modifiedFields, ["username"]), function(value, key){
				if(key == "username"){
					updateUserObj["title"] = value;
				}
			});
		}

		//Process, generate and return data to sync, using specific logic for 'put'
		return sync.generateEntityDataForPut(syncDevices, originalUserData, insertUserObj, updateUserObj, deleteUserObj, "user", false);
	}
	else if(action == "delete"){
		dataToSync = sync.appendDataToSyncObj(syncDevices, deleteUserObj, dataToSync, action);
		return bluebird.resolve(dataToSync);
	}

	return bluebird.resolve({});
}

/** 
 * Processes assignments for users added or removed for a particular device.
 * It then triggers the sync process for each entity based on respective action
 * 
 * @method processSyncAssignmentsForUsers
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} user - info of the user editing the assignments
 * @param {object} userInfo - object containing info of users assigned to a device via sync module
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @return - returns a promise to indicate process is completed
*/
function processSyncAssignmentsForUsers(deviceId, user, userInfo, timeStamp){
	return userAssignmentHandler(deviceId, user, userInfo.added, timeStamp, true)
	.then(function(){
		return userAssignmentHandler(deviceId, user, userInfo.removed, timeStamp, false);
	});
}

/** 
 * This handler constructs the user data in the format required to be processed by syncing process.
 * It processes the data based on whether the user entities were added or removed
 * 
 * @method userAssignmentHandler
 * @memberof sync
 * @param {int} deviceId - Id of device 
 * @param {object} user - info of the user editing the assignments
 * @param {array} userArray - Array of user ids being processed
 * @param {int} timeStamp - time in milliseconds, of the time the data was logged in module mods for audit
 * @param {boolean} isAdded - parameter is true if users were added and false if removed
 * @return - returns a promise to indicate process is completed
*/
function userAssignmentHandler(deviceId, user, userArray, timeStamp, isAdded){
	if(userArray.length > 0){
		return db.user.findAll({
			where: {id: {$in: userArray}},
			attributes: ["id", "username", "phone_number"],
			include: [{
				model: db.group,
				attributes: ["id"],
				required: false
			}, {
				model: db.role,
				required: false,
				attributes: ["title"]
			}, {
				model: db.comm,
				required: false,
				where: {table_name: "users"},
				attributes: ["id"]
			}]
		})
		.then(function(users){
			var syncProcessor = require("./syncProcessor.js");
			return bluebird.map(users, function(userData){
				userData = userData.get({plain: true});

				let dataForConstructor = {
					result: {
						id: userData.id,
						comm_id: userData.comms[0].id,
						username: userData.username,
						role: userData.role.title,
						phone_number: userData.phone_number,
						sync: {
							devices: [deviceId]
						}
					}
				};

				if(isAdded){
					return syncProcessor.processAndUpdateSyncData(user, "post", dataForConstructor, "user", timeStamp, false);
				}
				else if(!isAdded){
					const originalData = _.clone(dataForConstructor.result);

					//removing deviceId from sync to simulate as though the devices was unassigned from user
					dataForConstructor.result.sync = {devices: []}; 

					dataForConstructor["$originalData"] = originalData;
					return syncProcessor.processAndUpdateSyncData(user, "put", dataForConstructor, "user", timeStamp, false);
				}
				
				return bluebird.resolve();
			});
		});
	}
	return bluebird.resolve();
}

module.exports = {
	constructUserDataToSync: constructUserDataToSync,
	processSyncAssignmentsForUsers: processSyncAssignmentsForUsers
};