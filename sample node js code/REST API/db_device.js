/* global utils auditDb */
var bluebird = require("bluebird");
var _ = require("lodash");
var dbComm = require("./db_comm.js");
var dbMhDevice = require("./db_mh_device.js");

/**
 * identifies devices that user has access to view and 
 * returns a list of devices and their respective location info
 *
 * 
 * @method getAllDevices
 * @memberof db_device
 * @param {object} user - user information object 
 * @return {object} list of devices and their respective location info
 */
var getAllDevices = function(user){
	return getPermittedDevices(user)
	.then(function(permittedDevices){	
		return getDevicesById(_.map(permittedDevices, "id"));	
	})
	.then(function(devices){
		return { message: "Get Devices Successful",  result: devices };
	});
};


/**
 * processes and returns list of all devices registered on the server
 *
 * 
 * @method GetAllDevicesForAdmin
 * @memberof db_device
 * @return {object} list of devices registered on the server
 */
var getAllDevicesForAdmin = function(){
	return processGetDevicesForAdmin()
	.then(function(devices){
		return { message: "Get Devices for admin Successful",  result: devices };
	});
};

/**
 * inserts a new device
 * 
 * @method postAdminDevice
 * @memberof db_device
 * @param {object} user - user information object
 * @param {object} deviceData - object containing device info for device that needs to be inserted
 * @return {object} - object containing info of inserted device and status message
 */
var postAdminDevice = function(user, deviceData){
	return db.sequelize.transaction(function(t){
		var options = {transaction: t};
		return processInsertDevice(deviceData, options);
	})
	.tap(function(){
		return dbMhDevice.sendDeviceUpdateToMH(deviceData, "POST");
	})
	.tap(function(){
		if(deviceData.sendDeviceRegistration){
			return sendDeviceRegistration(deviceData);
		}
		return bluebird.resolve();
	})
	.then(function(device){
		return getDeviceByIdForAdmin(device.id);
	})
	.then(function(device){
		return bluebird.resolve({message: "Post admin device successful", result: device.data});
	});
};


/**
 * updates a device
 * 
 * @method putAdminDevice
 * @memberof db_device
 * @param {object} user - user information object
 * @param {object} deviceData - object containing device info for device that needs to be updated
 * @return {object} - object containing info of updated device and status message
 */
var putAdminDevice = function(user, deviceData){
	var originalDeviceData = {};
	return db.device.findById(deviceData.id)
	.then(function(device){
		originalDeviceData = device.get({plain: true});
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			return processUpdateAdminDevice(deviceData, device, options);
		});
	})
	.then(function(){
		return dbMhDevice.sendDeviceUpdateToMH(deviceData, "POST");
	})
	.then(function(){
		return getDeviceByIdForAdmin(deviceData.id);
	})
	.then(function(device){
		return bluebird.resolve({message: "Put admin device successful", result: device.data, originalDeviceData: originalDeviceData});
	});
};

/**
 * deletes a device
 * 
 * @method deleteAdminDevice
 * @memberof db_device
 * @param {object} user - user information object
 * @param {int} id - id of the device being deleted
 * @return {object} - object containing info of deleted device and status message
 */
var deleteAdminDevice = function(user, id){
	var deviceData = {};
	return getDeviceByIdForAdmin(id)
	.then(function(formattedDeviceData){
		deviceData = formattedDeviceData.data;
		return bluebird.resolve(formattedDeviceData.$raw);
	})
	.then(function(device){
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			return processAndDeleteDevice(id, device, options);
		});
	})
	.then(function(){
		return dbMhDevice.sendDeviceUpdateToMH(deviceData, "DELETE");
	})
	.then(function(){
		return bluebird.resolve({message: "Delete admin device successful", result: deviceData});
	});
};


/**
 * updates info of a particular device
 * 
 * @method putDevice
 * @memberof db_device
 * @param {object} user - user information object
 * @param {int} id - id of the device 
 * @param {object} deviceData - update data associated to the device
 * @return {object} - object containing updated info of device and status message
 */
var putDevice = function(user, id, deviceData){
	var originalDevice = {};
	
	return findDevice(user, id)
	.then(function(device){
		originalDevice = device.get({plain: true});
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			return processUpdateDevice(id, device, deviceData, options);	
		});
	})
	.tap(function(){
		return dbMhDevice.sendDeviceUpdateToMH(deviceData, "POST");
	})
	.then(function(device){
		return getDevicesById(device.id);
	})
	.then(function(device){
		return bluebird.resolve({message: "Put Device successful", result: device, originalDeviceData: originalDevice});
	});	
};


/**
 * returns a list of all device types, modes associated with the type 
 * and info of components that need to be displayed in the UI form
 * 
 * @method getAllDeviceTypes
 * @memberof db_device
 * @return {object} list of devices types and related info
*/
var getAllDeviceTypes = function(){
	return db.device_type.findAll({
		attributes: ["id", "title", "description", "image_id", "enabled"],
		include: [{
			model: db.device_type_components,
			as: "components", 
			attributes: [
				"phone_number", "mode", "cipher", "messaging", 
				"communication_mode_pairing", "apn_configurations", 
				"iridex_pin", "zigbee_id"
			],
			required: true
		}, {
			model: db.device_mode,
			as: "availableModes",
			required: true
		}, {
			model: db.communication_mode,
			as: "AvailableIncomingModes",
			required: false
		}, {
			model: db.communication_mode,
			as: "AvailableOutgoingModes",
			required: false
		}]
	})
	.then(function(deviceTypes){
		deviceTypes = _.map(deviceTypes, function(deviceType){
			return refineDeviceTypesData(deviceType);
		});

		deviceTypes = _.keyBy(deviceTypes, "id");

		//console.log("GET device/types:", deviceTypes);
		return bluebird.resolve({message: "Get all device types successful", result: deviceTypes});
	});
};


/**
 * Sends commands down to the device via MH to poll for GPS, 
 * settings code and to also send down settings code
 * 
 * @method sendCommandsToDevice
 * @memberof db_device
 * @param {object} user - object containing user info
 * @param {object} deviceData - data associated to the device
 * @return {object} Promise indicating success or failure.
*/
var sendCommandsToDevice = function(user, deviceData){
	return dbMhDevice.processAndSendCommandToDevice(user, deviceData)
	.then(function(){
		var message = "Put device command (" + deviceData.command + ") successful";
		return bluebird.resolve({message: message, result: {}});
	});
};


/**
 * gets all device modes loaded on the server
 * 
 * @method getAllDeviceModes
 * @memberof db_device
 * @return {object} Promise and result with modes
*/
var getAllDeviceModes = function(){
	return db.device_mode.findAll({})
	.then(function(deviceModes){
		deviceModes = _.map(deviceModes, function(mode){
			return mode.get({plain: true});
		});

		deviceModes = _.keyBy(deviceModes, "id");

		return bluebird.resolve({message: "Get all device modes successful", result: deviceModes});
	});
};




/**
 * queries the db and returns list of all devices registered on the server,
 * to serve the admin module
 * @method processGetDevicesForAdmin
 * @memberof db_device
 * @return {Array} list of devices
 */
function processGetDevicesForAdmin(){
	return db.device.findAll({
		//logging: console.log,
		include: [{
			model: db.comm,
			where: {table_name: "assets"}
		}, {
			model: db.feed_code,
			as: "DeviceFeedCodes",
			required: false
		}, {
			model: db.device_apn_configurations,
			required: false
		}, {
			model: db.device_iridex_pin,
			required: false
		}, {
			model: db.device_type
		}, {
			model: db.latest_report,
			required: false
		}]
	})
	.then(function(devices){
		devices = _.map(devices, function(device){
			return refineAdminDeviceData(device);
		});

		devices = _.keyBy(devices, "id");

		return bluebird.resolve(devices);
	});
}


/**
 * refines the device data being served to the admin module
 * @method refineAdminDeviceData
 * @memberof db_device
 * @param {object} device - raw data of device from query
 * @return {Array} modified and formatted data fopr a device
 */
function refineAdminDeviceData(device){
	device = device.get({plain: true});
	
	
	device.feed_codes = [];
	device.device_configurations = {};
	device.report_timestamp = null;
	if(device.latest_report != undefined){
		device.report_timestamp = device.latest_report.report_timestamp;
	}
	
	if(device.device_apn_configurations.length > 0){
		device.device_configurations = device.device_apn_configurations[0];
		device.device_configurations = _.omit(device.device_configurations, ["id", "device_id"]);
	}
	
	if(device.device_iridex_pins.length > 0 && device.device_type.title == "Iridium Extreme"){
		device.device_configurations.iridex_pin = device.device_iridex_pins[0].pin;
	}
	
	if(device.device_type.title == "Container CCU"){
		device.device_configurations.zigBee_id = device.tx_id;
	}

	if(device.device_type.title == "Container TAG"){
		device.device_configurations.zigBee_id = device.imei;
	}

	
	_.each(device.DeviceFeedCodes, function(feed){
		device.feed_codes.push(feed.id);
	});
	
	device.comm_id = device.comms[0].id;

	//Cleanup
	device = _.omit(device, ["comms", "DeviceFeedCodes", "settings", "poll_settings_code", 
		"poll_settings_timestamp", "poll_firmware", "max_speed", "min_speed", 
		"non_report_threshold", "annotation", "device_apn_configurations", "device_iridex_pins", "device_type", "latest_report"]);

	return device;
}

/**
 * queries the db and returns info of a particular device,
 * to serve the admin module
 * @method getDeviceByIdForAdmin
 * @memberof db_device
 * @param {int} deviceId - id of the device 
 * @return {object} formatted object with device info
 */
function getDeviceByIdForAdmin(deviceId){
	return db.device.findOne({
		where: {id: deviceId},
		include: [{
			model: db.comm,
			where: {table_name: "assets"}
		}, {
			model: db.feed_code,
			as: "DeviceFeedCodes",
			required: false
		}, {
			model: db.device_apn_configurations,
			required: false
		}, {
			model: db.device_iridex_pin,
			required: false
		}, {
			model: db.device_type
		}, {
			model: db.latest_report,
			required: false
		}]
	})
	.then(function(device){
		return bluebird.resolve({data: refineAdminDeviceData(device), $raw: device});
	});
}

/**
 * returns the list of devices that a given user is permitted to view
 * 
 * @param {Object} user user object {user_id:Number, client_id:Number}
 * @return {Array} array of device instances
 */
function getPermittedDevices(userObj){
	var queryObj= {};
	
	return db.user.findOne({ where: { id: userObj.user_id } })
	.then(function(user){
		if(!user) throw new Error("Could not find the specified user.");

		// for all users other than provider admin, asset permission is obtained
		// by using the reltion to the groups that users are permitted to view
		if(user.role_id != 1){
			queryObj= {
				where: {client_id: user.client_id},
				include: [{
					model: db.group,
					include: [{
						model: db.user,
						where: { id: user.id }
					}]
				}]
			};
		}
		return db.device.findAll(queryObj);
	});	
}


/**
 * processes and returns list of devices/device and their respective location info
 * 
 * @method getDevicesById
 * @memberof db_device
 * @param {Array/id} deviceIds - Array of device Ids or just an id of a device  
 * @return {object} object containing device info and respective location info of devices/device
 */
function getDevicesById(deviceIds){
	return db.device.findAll({
		where: {id: deviceIds},
		include: [{
			model: db.latest_report 
		}, {
			model: db.comm,
			where: {table_name: "assets"}
		}, {
			model: db.group,
			attributes: ["id"]
		}, {
			model: db.device_type
		}],
		order: [[{model: db.latest_report}, "report_timestamp", "DESC"]]
	})
	.then(function(devices){	
		devices = refineDeviceData(devices);		
		//This is done to make sure that consignment data id always available when viewing asset info and 
		//also updates in realtime when a consignment status or settings report comes in
		return appendDataForConsignmentDevices(devices);
	})
	.then(function(devices){
		//indexing devices by id
		devices= _.keyBy(devices, "id");			

		// returning just the device object if deviceId is not an array 
		if(!_.isArray(deviceIds)) devices= devices[deviceIds];		
		return bluebird.resolve(devices);
	});	
}


/**
 * finds a device by ID if user has access permission to the device
 * @method findDevice
 * @memberOf db_device
 * 
 * @param {Object} user - User object from the token
 * @param {Number} deviceId - Device Id
 * 
 * @return {Object} Sequelize instance of the device or undefined if not found 
 */
function findDevice(user, deviceId){
	return getPermittedDevices(user)
	.then(function(devices){
		return _.find(devices, { id: deviceId });
	});
}

/**
 * finds if user has access permission to view any of the device Ids in the array. 
 * filters out the non-permitted devices and only returns info of the devices user has 
 * permission to view
 * 
 * @method findDevices
 * @memberOf db_device
 * 
 * @param {Object} user - User object from the token
 * @param {Array} deviceIds - Array of device Ids
 * 
 * @return {Object} Returns an object containing devices that the user has permission to view
 */
function findDevices(user, deviceIds){
	return getPermittedDevices(user)
	.then(function(devices){
		deviceIds = _.concat([], deviceIds);
		return _.reduce(devices, function(result, device){
			if(_.indexOf(deviceIds, device.id) > -1){
				return _.concat(result, [device]);
			}else{
				return result;
			}
		}, []);
	});
}

/**
 * Refines the device data object to match expectation on the front end. 
 * 
 * @method refineDeviceData
 * @memberof db_device
 * @param {object} devices - object containing info related to devices retrieved from DB
 * @return {object} refined device type object, with parameters matching expectation on the front end
*/
function refineDeviceData(devices){
	devices= _.map(devices, function(device){
		device = device.get({plain: true});
		// refining the result device object
		device.latest_report= _.omit(device.latest_report, ["id", "device_id"]);
		device= _.merge(device, device.latest_report);
		device.comm_id= device.comms[0].id;
		device.groups = _.map(device.groups, "id");
		device.type = device.device_type.title;
		device= _.omit(device, [
			"latest_report", "comms", "device_type", "active", "error_message", 
			"device_incoming_mode", "device_outgoing_mode"
		]);
		return device;
	});
	
	return devices;
}

/**
 * Gets and appends consignment data to devices that contain that extra info like Shadow, CCU and TAG 
 * 
 * @method appendDataForConsignmentDevices
 * @memberof db_device
 * @param {object} devices - object containing info related to devices retrieved from DB
 * @return {object} promise indicating end of process
*/
function appendDataForConsignmentDevices(devices){
	return bluebird.map(devices, function(device){
		//only get data if device is consignment device
		if(device.type == "Shadow" || device.type == "Container CCU" || device.type == "Container TAG"){
			var dbCargo = require("./db_cargo.js");
			return dbCargo.getCargoDataById(device.id)
			.then(function(cargoData){
				device.consignment = cargoData;
				return bluebird.resolve();
			});
		}
		return bluebird.resolve();
	})
	.then(function(){
		return bluebird.resolve(devices);
	});
}

/**
 * Refines the deviceTypes data object to match expectation on the front end. 
 * 
 * @method refineDeviceTypesData
 * @memberof db_device
 * @param {object} deviceType - object containing info related to deviceType retrieved from DB
 * @return {object} refined device type object, with parameters matching expectation on the front end
*/
function refineDeviceTypesData(deviceType){
	deviceType = deviceType.get({plain: true});
	deviceType.modes = {};

	_.each(deviceType.availableModes, function(mode){
		deviceType.modes[mode.id] = {
			id: mode.id,
			title: mode.title
		};
	});

	deviceType.device_incoming_modes = {};
	_.each(deviceType.AvailableIncomingModes, function(incomingMode){
		deviceType.device_incoming_modes[incomingMode.id] = {
			id: incomingMode.id,
			title: incomingMode.title,
			default: incomingMode.device_type_incoming_modes.default_mode
		};
	});

	deviceType.device_outgoing_modes = {};
	_.each(deviceType.AvailableOutgoingModes, function(outgoingMode){
		deviceType.device_outgoing_modes[outgoingMode.id] = {
			id: outgoingMode.id,
			title: outgoingMode.title
		};
	});

	deviceType.components = deviceType.components[0];
	deviceType = _.omit(deviceType, ["availableModes", "AvailableOutgoingModes", "AvailableIncomingModes"]);

	return deviceType;
}

/**
 * Verifies the device data and processes the update for device
 * 
 * @method processUpdateDevice
 * @memberof db_device
 * @param {object} user - user information object
 * @param {int} id - id of the device 
 * @param {object} deviceInstance - sequelize instance of the device being updated
 * @param {object} deviceData - update data associated to the device
 * @param {object} options - object containing transaction info
 * @return {object} - sequelize object containing info of the device that was updated
*/
function processUpdateDevice(id, device, deviceData, options){
	
	return getAllDeviceTypes()		
	.then(function(deviceTypes){			
		var deviceType= deviceTypes.result[device.type_id];
		//this is condition from PHP file ASTRO/bin/feat/asset/mech/updateAsset.php
		if(_.indexOf(["iPhone", "Android", "Blackberry", "Windows"], deviceType.title) > -1){
			if(deviceData.encryption_key == "" || deviceData.encryption_key == " "){
				deviceData.encryption_key = "4964604F340B7D34DC2978A866D7FF8DAA82C23DECFF499FD2706C340828425F";
			}

			if(deviceData.decryption_key == "" || deviceData.decryption_key == " "){
				deviceData.decryption_key = "4964604F340B7D34DC2978A866D7FF8DAA82C23DECFF499FD2706C340828425F";
			}
		}

		deviceData = _.omit(deviceData, ["type_id"]);

		// Extending the device object from the DB with the object provided in the request.
		// The request object may only provide fields that has changed.
		device = _.extend(device, deviceData);
		return device.save({transaction: options.transaction});
	})
	.tap(function(updatedDevice){
		if(deviceData.groups){
			return validateGroupsAssignedToDevice(id, options.user, deviceData)
			.then(function(mainGroupId){
				return updateDeviceGroups(id, mainGroupId, updatedDevice, deviceData.groups, options);
			});
		}
		else{
			return bluebird.resolve();
		}
	});
}

/**
 * processes and updates device data that is being edited in admin module
 * 
 * @method processUpdateAdminDevice
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {object} device - sequelize instance of the device that is being updated
 * @param {object} options - object containing transaction info
 * @return {object} - sequelize object containing info of the device that was updated
*/
function processUpdateAdminDevice(deviceData, device, options){
	return db.device.findById(deviceData.id, {transaction: options.transaction})
	.tap(function(device){
		if(device.type_id != deviceData.type_id){
			return processChangeInDeviceType(device, deviceData, options);
		}		
		return setAppropriateDataBasedOnType(deviceData, options)
		.then(function(){
			deviceData.original_imei = device.imei;
			return processUpdateDeviceConfigurations(deviceData, deviceData.type, options);
		});
	})
	.tap(function(device){
		if(device.client_id != deviceData.client_id){
			return updateClientOfAsset(device, deviceData, options);
		}
		return bluebird.resolve();
	})
	.tap(function(){
		return validatePlatformFeed(deviceData, options.transaction);
	})
	.tap(function(device){
		return device.setDeviceFeedCodes(deviceData.feed_codes, {transaction: options.transaction});
	})
	.then(function(device){
		device = _.extend(device, deviceData);
		return device.save({transaction: options.transaction});
	});
}


/**
 * process and changes client that the device is registered under. 
 * also checks if customers device limit has been reached
 * 
 * @method updateClientOfAsset 
 * @memberof db_device
 * @param {object} device - sequelize instance of the device
 * @param {object} deviceData - update data associated to the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function updateClientOfAsset(device, deviceData, options){
	return checkCustomerLimitForDevices(deviceData.client_id, options)
	.then(function(){
		return deleteDeviceArData(device, options);
	})
	.then(function(){
		return deleteDeviceSaData(device, options);
	})
	.then(function(){
		//delete device and geofence relationship (devices that are triggers of a geo rule)
		return device.setDeviceTriggers([], {transaction: options.transaction});
	})
	.then(function(){
		return deleteDeviceMessageData(device, options);
	})
	.then(function(){
		//delete device and and group relationship
		return device.setGroups([], {transaction: options.transaction});
	})
	.then(function(){
		return deleteDeviceCargoData(device.id, options);
	})
	.then(function(){
		return deleteDeviceAlertData(device.id, options);
	})
	.then(function(){
		return deleteDeviceSyncData(device.id, device, options);
	})
	.then(function(){
		return db.group.findOne({
			where: {client_id: deviceData.client_id, title: "Main"},
			transaction: options.transaction
		});
	})
	.then(function(mainGroup){
		return device.setGroups([mainGroup.id], {transaction: options.transaction});
	});
}

/**
 * process and all edits necessary to successfully transition 
 * an edit to the type of an existing device
 * It adds extra info if necessary, removes data that is stored for specific device types etc
 * 
 * @method processChangeInDeviceType
 * @memberof db_device
 * @param {object} device - sequelize instance of the device
 * @param {object} deviceData - update data associated to the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function processChangeInDeviceType(device, deviceData, options){
	
	if(device.type_id == deviceData.type_id){
		return setAppropriateDataBasedOnType(deviceData, options)
		.then(function(){
			deviceData.original_imei = device.imei;
			return processUpdateDeviceConfigurations(deviceData, deviceData.type, options);
		});
	}		
	
	return db.device_type.findById(device.type_id, {transaction: options.transaction})
	.then(function(deviceType){
		deviceData.oldDeviceType = deviceType.title;
		return bluebird.resolve();
	})
	.then(function(){
		return setAppropriateDataBasedOnType(deviceData, options);
	})
	.then(function(){
		return cleanupDeviceConfiguration(deviceData, deviceData.oldDeviceType, options);
	})
	.then(function(){
		return processInsertDeviceConfigurations(deviceData, deviceData.type, options);
	});
}

/**
 * Deletes data from device_apn_configurations and device_iridex_pin if the 
 * logic deems it necessary for data to removed in case the device type has been changed
 * 
 * @method cleanupDeviceConfiguration
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {string} deviceType - type of the device as string
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function cleanupDeviceConfiguration(deviceData, deviceType, options){
	if(deviceType == "New Pocket Buddy" || deviceType == "Pocket Buddy" || deviceType == "GT300"){
		return db.device_apn_configurations.destroy({
			where: {device_id: deviceData.id},
			transaction: options.transaction
		});
	}
	else if(deviceType == "Iridium Extreme"){
		return db.device_iridex_pin.destroy({
			where: {device_id: deviceData.id},
			transaction: options.transaction
		});
	}
	
	return bluebird.resolve();
}

/**
 * processes and validates the groups assigned to device 
 * based on parent group permissions and also makes sure device is always part of main group
 * 
 * @method validateGroupsAssignedToDevice
 * @memberof db_device
 * @param {int} id - id of the device 
 * @param {object} user - user information object
 * @param {object} deviceData - update data associated to the device
 * @return {object} - promise indicating group validation checks are complete 
*/
function validateGroupsAssignedToDevice(id, user, deviceData){
	return db.device.findOne({
		where: {id: id},
		include: [{
			model: db.group,
			attributes: ["id"],
			where: {title: "Main"}
		}]
	})
	.then(function(device){
		device = device.get({plain: true});
		var mainGroupId = device.groups[0].id;

		var indexOfMain = deviceData.groups.indexOf(mainGroupId);
		if(indexOfMain > -1){
			return bluebird.resolve(mainGroupId);
		}else{
			throw new Error("Please make sure device is part of 'Main' group");
		}
	});
}

/** 
 * Processes and updates groups assigned to the device
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateDeviceGroups
 * @memberof db_device
 * @param {int} id - id of the device
 * @param {int} mainGroupId - id of the main group
 * @param {object} device - object containing device instance that needs to be updated
 * @param {array} deviceGroups - array containing id's of groups assigned to the device
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateDeviceGroups(id, mainGroupId, device, deviceGroups, options){
	var dbGroup = require("./db_group.js");
	
	return dbGroup.getPermittedGroups(options.user)
	.then(function(groups){
		return bluebird.resolve(_.map(groups, "id"));
	})
	.tap(function(permittedGroups){
		var groupsToRemove = _.difference(permittedGroups, [mainGroupId]);
		//Remove all device group relations except for device and main group relation
		return device.removeGroups(groupsToRemove, {transaction: options.transaction});
	})
	.tap(function(permittedGroups){
		var finalDeviceGroups = _.intersection(permittedGroups, deviceGroups);
		
		//Remove parent group id from validation array
		var validateGroupsArray = _.difference(finalDeviceGroups, [mainGroupId]);
		
		//console.log("validating and adding device groups", deviceGroups, permittedGroups, finalDeviceGroups, validateGroupsArray);
		return validateParentAndAddGroup(id, device, validateGroupsArray, options);
	});
}


/**
 * processes and validates the groups assigned to device 
 * based on whether respective parent groups of each group in the array 
 * also have association to the device and adds the groups individually to the associations table
 * 
 * @method validateParentAndAddGroup
 * @memberof db_device
 * @param {id} id - id of the device
 * @param {object} device - object containing device instance that needs to be updated
 * @param {Array} groupIdArray - array of group Id's
 * @return {object} - promise indicating group validation checks are complete 
 * 					  Or error if user validation fails
*/
function validateParentAndAddGroup(id, device, groupIdArray, options){
	return bluebird.each(groupIdArray, function(groupId){
		return db.group.findOne({
			where: {id: groupId},
			transaction: options.transaction
		})
		.bind({})
		.then(function(groupData){
			this.parent_id = groupData.parent_id;
			return db.group.findOne({
				where: {id: groupData.parent_id},
				include: [{
					model: db.device,
					where: {id: id},
					attributes: ["id"]
				}],
				transaction: options.transaction
			});
		})
		.then(function(parentGroupData){
			if(!parentGroupData && groupIdArray.indexOf(this.parent_id) == -1){
				throw new Error("Invalid group assigned to asset. Asset does not belong to parent group of group (id:" + groupId + ")");
			}
			//console.log("Adding", groupId);
			return device.addGroups([groupId], {transaction: options.transaction}); 
		});
	});
}


/**
 * processes and inserts a device data that is being added from the admin module
 * 
 * @method processInsertDevice
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {object} options - object containing transaction info
 * @return {object} - sequelize object containing info of the device that is added
*/
function processInsertDevice(deviceData, options){
	deviceData.create_timestamp = Math.round(new Date().getTime() / 1000);
	if(deviceData.active == undefined) deviceData.active = false;
	//checks server limit and customer limit for devices
	return checkDeviceRegistrationLimits(deviceData.client_id, options)
	.then(function(){
		return setAppropriateDataBasedOnType(deviceData, options);
	})
	.then(function(){
		var dbDevice = db.device.build(deviceData);
		return dbDevice.save({transaction: options.transaction});
	})
	.tap(function(){
		return validatePlatformFeed(deviceData, options.transaction);
	})
	.tap(function(device){
		return device.addDeviceFeedCodes(deviceData.feed_codes, {transaction: options.transaction});
	})
	.tap(function(device){
		deviceData.id = device.id;
		return insertComm(deviceData.id, "assets", options);
	})
	.tap(function(){
		return processInsertDeviceConfigurations(deviceData, deviceData.type, options);
	})
	.tap(function(){
		return assignDeviceToMainGroup(deviceData, options);
	});
}

/**
 * Validates and makes sure that feed 128 (platform feed is always assigned to a device)
 * 
 * @method validatePlatformFeed
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {key} transaction - transaction instance
 * @return {object} - promise indicating end of process and edited deviceData.feed_codes array
*/
function validatePlatformFeed(deviceData, transaction){
	return db.feed_code.findOne({
		where: {feed_code: 128},
		transaction: transaction
	})
	.then(function(requiredFeed){
		if(!requiredFeed){
			throw new Error("Platform feed (128) is missing. Cannot register the device");
		}

		deviceData.feed_codes.push(requiredFeed.id);
		deviceData.feed_codes = _.uniq(deviceData.feed_codes);
		return bluebird.resolve();
	});
}


/**
 * processes to see if adding a new device violates server or customer limit
 * 
 * @method checkDeviceRegistrationLimits
 * @memberof db_device
 * @param {int} clientId - id if the client
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function checkDeviceRegistrationLimits(clientId, options){
	return checkServerLimitForDevices(options)
	.then(function(){
		return checkCustomerLimitForDevices(clientId, options);
	});
}

/**
 * Queries and checks if process is violating server limit for devices
 * 
 * @method checkServerLimitForDevices
 * @memberof db_device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function checkServerLimitForDevices(options){
	return db.device.count({transaction: options.transaction})
	//This validations will be re-enabled once details have been discussed
	.then(function(deviceCount){
		//throw error if total asset/device count on server exceeds maximum limit allowed on server 
		if(deviceCount >= config.api.device_limit){
			throw new Error("Asset count at maximum server limit!");
		}
		return bluebird.resolve();
	});
}

/**
 * Queries and checks if adding a new device violates customer limit for devices
 * 
 * @method checkCustomerLimitForDevices
 * @memberof db_device
 * @param {int} clientId - id if the client
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function checkCustomerLimitForDevices(clientId, options){
	var clientDeviceLimit;
	return db.client.findById(clientId)
	.then(function(client){
		clientDeviceLimit = client.device_limit;

		return db.device.count({
			where: {client_id: clientId},
			transaction: options.transaction
		});
	})
	.then(function(deviceCount){
		//throw error if total asset/device count on server exceeds maximum limit allowed on server 
		if(deviceCount >= clientDeviceLimit){
			throw new Error("Asset count at maximum customer limit. Please contact T24 support to increase the limit");
		}
		return bluebird.resolve();
	});
}

/**
 * queries and gets type info for the device
 * 
 * @method getDeviceType
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process and edited deviceData obj
*/
function getDeviceType(deviceData, options){
	return db.device_type.findOne({
		where: {id: deviceData.type_id},
		transaction: options.transaction
	})
	.then(function(type){
		type = type.get({plain: true});	
		deviceData.type = type.title;
		return bluebird.resolve();
	});
}

/**
 * adds association between new device and main group
 * 
 * @method assignDeviceToMainGroup
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process and edited deviceData obj
*/
function assignDeviceToMainGroup(deviceData, options){
	return db.group.findOne({
		where: {client_id: deviceData.client_id, title: "Main"},
		transaction: options.transaction
	})
	.then(function(group){
		return group.addDevices([deviceData.id], {transaction: options.transaction});
	});
}

/**
 * processes and add extra config info for specific device types
 * 
 * @method processInsertDeviceConfigurations
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {string} deviceType - type of the device as string
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process and edited deviceData obj
*/
function processInsertDeviceConfigurations(deviceData, deviceType, options){
	//log.info("CHK", deviceData.device_configurations);
	if(deviceType == "New Pocket Buddy" || deviceType == "Pocket Buddy" || deviceType == "GT300"){
		var dbDeviceApnConfig = db.device_apn_configurations.build({
			device_id: deviceData.id,
			apn_host: deviceData.device_configurations.apn_host,
			apn_user: deviceData.device_configurations.apn_user,
			apn_password: deviceData.device_configurations.apn_password,
			sos_number: deviceData.device_configurations.sos_number,
			interval: deviceData.device_configurations.interval
		});
		
		deviceData.sendDeviceRegistration = true;
		
		return dbDeviceApnConfig.save({transaction: options.transaction});
	}
	else if(deviceType == "Iridium Extreme"){
		deviceData.iridex_pin = getIridexPin(deviceData.imei);
		var dbDeviceIridexPin = db.device_iridex_pin.build({
			device_id: deviceData.id,
			pin: deviceData.iridex_pin
		});

		return dbDeviceIridexPin.save({transaction: options.transaction});
	}
	
	return bluebird.resolve();
}

/**
 * send device registration command down to device via MH
 * 
 * @method sendDeviceRegistration
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @return {object} - promise indicating end of process and edited deviceData obj
*/
function sendDeviceRegistration(deviceData){
	deviceData.command = "device_registration";
	return dbComm.getCommIds([deviceData.id], "assets")
	.then(function(commsData){
		deviceData.comm_id = commsData[0];
		return dbMhDevice.processAndSendCommandToDevice({client_id: deviceData.client_id}, deviceData);
	});
}

/**
 * processes and update extra config info for specific device types
 * 
 * @method processUpdateDeviceConfigurations
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {string} deviceType - type of the device as string
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process and edited deviceData obj
*/
function processUpdateDeviceConfigurations(deviceData, deviceType, options){
	if(deviceType == "New Pocket Buddy" || deviceType == "Pocket Buddy" || deviceType == "GT300"){
		return db.device_apn_configurations.update(
			{
				apn_host: deviceData.device_configurations.apn_host,
				apn_user: deviceData.device_configurations.apn_user,
				apn_password: deviceData.device_configurations.apn_password,
				sos_number: deviceData.device_configurations.sos_number,
				interval: deviceData.device_configurations.interval
			},
			{where: {device_id: deviceData.id}, transaction: options.transaction}
		)
		.then(function(){
			deviceData.command = "device_registration";
			return dbComm.getCommIds([deviceData.id], "assets", options.transaction)
			.then(function(commsData){
				deviceData.comm_id = commsData[0];
				return dbMhDevice.processAndSendCommandToDevice({client_id: deviceData.client_id}, deviceData);
			});
		});
	}
	else if(deviceType == "Iridium Extreme"){
		if(deviceData.original_imei != deviceData.imei){
			deviceData.iridex_pin = getIridexPin(deviceData.imei);
			return db.device_iridex_pin.update(
				{pin: deviceData.iridex_pin},
				{where: {device_id: deviceData.id}, transaction: options.transaction}
			);
		}
		return bluebird.resolve();
	}
	
	return bluebird.resolve();
}
	
/**
 * computes and generates 5 didgit hashed pin for iridium extreme devices
 * 
 * @method getIridexPin
 * @memberof db_device
 * @param {string} imei - imei of the device
 * @return {object} - 5 digit hashed pin for the iridium extreme device
*/
function getIridexPin(imei){
	var hash1 = hashIteration1(imei);
	var hash2 = hashIteration2(imei, hash1);
	
	var pin = complement(hash2);
	return pin;
}

/**
 * 1st iteration of pin generation
 * 
 * @method hashIteration1
 * @memberof db_device
 * @param {string} imei - imei of the device
 * @return {object} - hashed pin for the iridium extreme device
*/
function hashIteration1(imei){
	var hash = 0;
	var length = imei.length;

	for (var i = 0; i < length; i++){
		hash ^= ((hash << 5 ) % 65536 + (hash >> 2) + imei.charCodeAt(i)) % 65536;
	}
	return hash;
}

/**
 * 2nd iteration of pin generation
 * 
 * @method hashIteration2
 * @memberof db_device
 * @param {string} imei - imei of the device
 * @param {string} hash - hash received from 1st iteration
 * @return {object} - hashed pin for the iridium extreme device
*/
function hashIteration2(imei, hash){
	var length = imei.length;

	for (var i = length; i > 0; i--){
		hash ^= ((hash << 5 ) % 65536 + (hash >> 2) + imei.charCodeAt(i-1)) % 65536;
	}
	return hash;
}

/**
 * final step of pin generation, return 5 digit pin, 
 * adds 0's if pin is less than 5 digits long
 * 
 * @method complement
 * @memberof db_device
 * @param {string} hash - hash received from 1st iteration
 * @return {object} - 5 digit hashed pin for the iridium extreme device
*/
function complement(hash){
	var length = hash.length;

	for (var i = length; i < 5; i++){
		hash = "0" + hash;
	}
	return hash;
}


/**
 * processes and edits values of device info based on device type
 * 
 * @method setAppropriateDataBasedOnType
 * @memberof db_device
 * @param {object} deviceData - update data associated to the device
 * @param {object} options - object containing transaction info
 * @return {object} - edited deviceData object
*/
function setAppropriateDataBasedOnType(deviceData, options){
	return getDeviceType(deviceData, options)
	.then(function(){
		deviceData.tx_id = null;
		deviceData.registration_status = 1;
	
		if(deviceData.sms == "" || deviceData.sms == " "){
			deviceData.sms = null;
		}
		if(deviceData.type == "Container TAG"){
			deviceData.imei = deviceData.device_configurations.zigBee_id;
		}
	
		if(deviceData.type == "Whisper" || deviceData.type == "Echo" || deviceData.type == "Shadow"){
			deviceData.tx_id = deviceData.imei;
		}
	
		if((deviceData.type == "New Pocket Buddy" || deviceData.type == "Pocket Buddy" || deviceData.type == "GT300" || deviceData.type == "NAL Nano GPRS") && deviceData.sms != ""){
			deviceData.tx_id = deviceData.sms;
		}
	
		if(deviceData.type == "Container CCU" || deviceData.type == "Container TAG"){
			deviceData.tx_id = deviceData.device_configurations.zigBee_id;
		}
	
		if(deviceData.type == "iPhone" || deviceData.type == "Android" || deviceData.type == "Blackberry" || deviceData.type == "Windows"){
			if(deviceData.encryption_key == "" || deviceData.encryption_key == " " || deviceData.encryption_key == null){
				deviceData.encryption_key = "4964604F340B7D34DC2978A866D7FF8DAA82C23DECFF499FD2706C340828425F";
			}
	
			if(deviceData.decryption_key == "" || deviceData.decryption_key == " " || deviceData.decryption_key == null){
				deviceData.decryption_key = "4964604F340B7D34DC2978A866D7FF8DAA82C23DECFF499FD2706C340828425F";
			}
	
			deviceData.registration_status = 0;
		}
		
		if(deviceData.type == "New Pocket Buddy" || deviceData.type == "Pocket Buddy" || deviceData.type == "GT300"){
			deviceData.registration_status = 0;
	
			if(deviceData.device_configurations.apn_user == null){
				deviceData.device_configurations.apn_user = "";
			}
	
			if(deviceData.device_configurations.apn_password == null){
				deviceData.device_configurations.apn_password = "";
			}
		}

		deviceData.settings = "NULL";
		deviceData.poll_settings_code = null;
		deviceData.poll_settings_timestamp = "0";
		deviceData.poll_firmware = "0";

		return bluebird.resolve();
	});
}

/** 
 * inserts a comm Id for the entity passed.
 * @method insertComm
 * @memberof db_admin
 * @param {int} id of the client 
 * @param {object} options - object containing user and transaction info
 * @return {object} promise indicating end of process
*/
function insertComm(id, tableName, options){
	var dbComm = db.comm.build({
		row_id: id,
		table_name: tableName
	});
	return dbComm.save({user: options.user, transaction: options.transaction});
}


/**
 * processes and deletes all data related to a particular device
 * 
 * @method processAndDeleteDevice
 * @memberof db_device
 * @param {int} id - id of the device
 * @param {object} device - sequelize instance of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function processAndDeleteDevice(id, device, options){
	return deleteDeviceArData(device, options)
	.then(function(){
		return deleteDeviceSaData(device, options);
	})	
	.then(function(){
		//delete device and geofence relationship (devices athat triggers of a geo rule)
		return device.setDeviceTriggers([], {transaction: options.transaction});
	})
	.then(function(){
		return deleteDeviceMessageData(device, options);
	})
	.then(function(){
		//delete device and and group relationship
		return device.setGroups([], {transaction: options.transaction});
	})
	.then(function(){
		return deleteDeviceAlertData(id, options);
	})
	.then(function(){
		return deleteDeviceCargoData(id, options);
	})
	.then(function(){
		return deleteDeviceReportData(id, options);
	})	
	.then(function(){
		return deleteDeviceRegistrationData(id, device, options);
	})
	.then(function(){
		return deleteDeviceSyncData(id, device, options);
	})
	.then(function(){
		return deleteDeviceData(id, device, options);
	});
}

/**
 * deletes all sync info (Mysql and Mongo DB) related to a particular device
 * 
 * @method deleteDeviceSyncData
 * @memberof db_device
 * @param {int} id - id of the device
 * @param {object} device - sequelize instance of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceSyncData(id, device, options){
	return device.setSyncedGeoDevices([], {transaction: options.transaction})
	.then(function(){
		return device.setSyncedPoiDevices([], {transaction: options.transaction});
	})
	.then(function(){
		return db.device_sync_info.destroy({
			where: {device_id: id},
			transaction: options.transaction
		});
	})
	.then(function(){
		/*
			While deleting a device, delete record of all POI's that were 
			created by the device and are still pending approval on the platform 
		*/
		return db.poi.destroy({
			where: {creator_device_id: id, approved: false},
			transaction: options.transaction
		});
	})
	.then(function(){
		/*
			While deleting a device, update record of all POI's that were 
			created by the device and set creator_device_id to null for the POI's
			that are already approved on the platform. These POI's will not have a creator anymore
		*/
		return db.poi.update(
			{creator_device_id: null},
			{
				where: {creator_device_id: id, approved: true},
				transaction: options.transaction
			}
		);
	})
	.then(function(){
		return deleteDeviceDataFromMongo(id);
	});	
}

/**
 * deletes all documents related to the device from mongo DB
 * 
 * @method deleteDeviceDataFromMongo
 * @memberof db_device
 * @param {int} id - id of the device
 * @return {object} - promise indicating end of process
*/
function deleteDeviceDataFromMongo(id){
	return auditDb.SyncMods.remove({device_id: id}).exec()
	.then(function(){
		return auditDb.SyncData.remove({device_id: id}).exec();
	})
	.then(function(){
		return auditDb.SyncDataBackup.remove({device_id: id}).exec();
	})
	.then(function(){
		return auditDb.SyncDataHistory.remove({device_id: id}).exec();
	});
}

/**
 * deletes all alert rule info related to a particular device
 * 
 * @method deleteDeviceArData
 * @memberof db_device
 * @param {object} device - sequelize instance of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceArData(device, options){
	return device.setArMemberDevices([], {transaction: options.transaction})
	.then(function(){
		return device.setArSubscriberDevices([], {transaction: options.transaction});
	});
}


/**
 * deletes all SA rule info related to a particular device
 * 
 * @method deleteDeviceSaData
 * @memberof db_device
 * @param {object} device - sequelize instance of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceSaData(device, options){
	return device.setSaSubscriberDevices([], {transaction: options.transaction})
	.then(function(){
		return device.setSaMemberDevices([], {transaction: options.transaction});
	});
}

/**
 * deletes all message info related to a particular device
 * 
 * @method deleteDeviceMessageData
 * @memberof db_device
 * @param {object} device - sequelize instance of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceMessageData(device, options){
	return device.setMessageSenderDevices([], {transaction: options.transaction})
	.then(function(){
		return device.setMessageRecipientDevices([], {transaction: options.transaction});
	});
}


/**
 * deletes all gps report info related to a particular device
 * 
 * @method deleteDeviceReportData
 * @memberof db_device
 * @param {int} id - id of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceReportData(id, options){
	return db.latest_report.destroy({
		where: {device_id: id},
		transaction: options.transaction
	})
	.then(function(){
		return db.report.destroy({
			where: {device_id: id},
			transaction: options.transaction
		});
	});
}


/**
 * deletes all registration info related to a particular device
 * 
 * @method deleteDeviceRegistrationData
 * @memberof db_device
 * @param {int} id - id of the device
 * @param {object} device - sequelize instance of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceRegistrationData(id, device, options){
	return db.device_apn_configurations.destroy({
		where: {device_id: id},
		transaction: options.transaction
	})
	.then(function(){
		return db.device_iridex_pin.destroy({
			where: {device_id: id},
			transaction: options.transaction
		});
	})
	.then(function(){
		return device.setDeviceFeedCodes([], {transaction: options.transaction});
	});
}


/**
 * deletes comms and device record of a particular device
 * 
 * @method deleteDeviceData
 * @memberof db_device
 * @param {int} id - id of the device
 * @param {object} device - sequelize instance of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceData(id, device, options){
	return db.comm.destroy({
		where: {row_id: id, table_name: "assets"},
		transaction: options.transaction
	})
	.then(function(){
		return db.device.destroy({
			where: {id: id},
			transaction: options.transaction
		});
	});
}


/**
 * deletes all cargo data related to a particular device
 * 
 * @method deleteDeviceCargoData
 * @memberof db_device
 * @param {int} id - id of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceCargoData(id, options){
	return db.sequelize.query(
		"DELETE FROM cargo_geofences WHERE device_id = ?",
		{replacements: [id], transaction: options.transaction}
	)
	.then(function(){
		return db.sequelize.query(
			"DELETE FROM cargo_setting WHERE device_id = ?",
			{replacements: [id], transaction: options.transaction}
		);
	})
	.then(function(){
		return db.sequelize.query(
			"DELETE FROM latest_cargo_status WHERE device_id = ?",
			{replacements: [id], transaction: options.transaction}
		);
	})
	.then(function(){
		return db.sequelize.query(
			"DELETE FROM cargo_status WHERE device_id = ?",
			{replacements: [id], transaction: options.transaction}
		);
	});
}

/**
 * deletes all alert data related to a particular device
 * 
 * @method deleteDeviceAlertData
 * @memberof db_device
 * @param {int} id - id of the device
 * @param {object} options - object containing transaction info
 * @return {object} - promise indicating end of process
*/
function deleteDeviceAlertData(id, options){
	return db.alert.findAll({
		where: {device_id: id},
		transaction: options.transaction
	})
	.then(function(alerts){
		let alertIds = [];
		_.each(alerts, function(alert){
			alertIds.push(alert.id);
			return alert.id;
		});

		return bluebird.resolve(alertIds);
	})
	//Delete from emergency_alert_manager
	.tap(function(alertIds){
		return db.emergency_alert_manager.destroy({
			where: {alert_id: {$in: alertIds}},
			transaction: options.transaction
		});
	})
	//Delete from speed_alert_manager
	.tap(function(alertIds){
		return db.speed_alert_manager.destroy({
			where: {alert_id: {$in: alertIds}},
			transaction: options.transaction
		});
	})
	//Delete from geofence_alert_manager
	.tap(function(alertIds){
		return db.geofence_alert_manager.destroy({
			where: {alert_id: {$in: alertIds}},
			transaction: options.transaction
		});
	})
	//Delete from non_report_alert_manager
	.tap(function(alertIds){
		return db.non_report_alert_manager.destroy({
			where: {alert_id: {$in: alertIds}},
			transaction: options.transaction
		});
	})
	//Delete from cargo_alert_manager
	.tap(function(alertIds){
		return db.cargo_alert_manager.destroy({
			where: {alert_id: {$in: alertIds}},
			transaction: options.transaction
		});
	})
	//Delete from alert_acknowledgements
	.tap(function(alertIds){
		return db.alert_acknowledgements.destroy({
			where: {alert_id: {$in: alertIds}},
			transaction: options.transaction
		});
	})
	//Delete from alerts
	.then(function(alertIds){
		return db.alert.destroy({
			where: {id: {$in: alertIds}},
			transaction: options.transaction
		});
	});
}

module.exports={
	getAllDevices: getAllDevices,
	getAllDevicesForAdmin: getAllDevicesForAdmin,
	getAllDeviceTypes: getAllDeviceTypes,
	postAdminDevice: postAdminDevice,
	putDevice: putDevice,
	getPermittedDevices: getPermittedDevices,
	getDevicesById: getDevicesById,
	findDevices: findDevices,
	sendCommandsToDevice: sendCommandsToDevice,
	getAllDeviceModes: getAllDeviceModes,
	putAdminDevice: putAdminDevice,
	deleteAdminDevice: deleteAdminDevice,
	getDeviceByIdForAdmin: getDeviceByIdForAdmin,
	deleteDeviceDataFromMongo: deleteDeviceDataFromMongo
};
