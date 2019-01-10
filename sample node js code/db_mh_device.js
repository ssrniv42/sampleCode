/*
TODO: remove all raw SQL queries and use sequelize models

*/
var bluebird = require("bluebird");
var _ = require("lodash");
var mime = require("mime-types");
var rp = require("request-promise");
var dbComm = require("./db_comm.js");

/** 
 * Gets info for a particular device regsitered on the platform.
 * This data is used by MH for certain specific processes
 * @method getDeviceInfoById
 * @param {int} commId - comm_id associated with the device
 * @memberof db_mh_device
 * @return {object} - A response with message and result
*/
var getDeviceInfoById = function(commId){
	return dbComm.getIdFromComms([commId])
	.bind({})
	.then(function(commsData){
		if(commsData.deviceIds.length == 0){
			var msg = "Comm id [" + commId + "] does not belong to a device";
			throw new Error(msg); 
		}
		this.id = commsData.deviceIds[0];
		return db.device.findById(this.id);
	})
	.then(function(device){
		if(!device){
			var msg = "device not found for id: " + this.id;
			throw new Error(msg);
		}

		device = device.get({plain: true});

		if(device.settings == "NULL") device.settings = null;
		
		device = _.omit(device, [
			"id", "create_timestamp", "type_id", 
			"poll_settings_code", "poll_settings_timestamp",
			"poll_firmware", "max_speed", "min_speed", "non_report_threshold",
			"annotation", "device_incoming_mode", "device_outgoing_mode", 
			"registration_status", "error_message", "active"
		]);

		return bluebird.resolve({message: "Get device info for MH successful", result: device});
	});
};


/** 
 * Gets info for all devices regsitered on the platform.
 * This data is used by MH on startup to sync assets  
 * @method getAllPlatformDevices
 * @memberof db_mh_device
 * @return {object} - A response with message and result
*/
var getAllPlatformDevices = function(){
	return db.device.findAll({
		where: {client_id: {$ne: null}},
		include: [{
			model: db.comm, 
			where: {table_name: "assets"}
		}, {
			model: db.device_type
		}, {
			model: db.feed_code,
			as: "DeviceFeedCodes"
		}, {
			model: db.communication_mode,
			as: "DeviceIncomingMode",
			required: false
		}, {
			model: db.communication_mode,
			as: "DeviceOutgoingMode",
			required: false
		}, {
			model: db.group
		}, {
			model: db.situational_awareness,
			as: "SaMemberDevices",
			required: false
		}, {
			model: db.situational_awareness,
			as: "SaSubscriberDevices",
			required: false
		}]
	})
	.then(function(devices){
		devices = _.map(devices, function(device){
			return refineDeviceDataForMH(device);
		});

		return bluebird.resolve({message: "Get all devices for mh successful", result: devices});
	});
};

/** 
 * Updates mode of a device. This is called if mode of the device
 * is changed on the device end
 * 
 * @method putDeviceMode
 * @memberof db_mh_device
 * @param {object} deviceData - Body/ Data sent to the route
 * @return {object} - A response with message and result
*/
var putDeviceMode = function(deviceData){
	//console.log("putDeviceMode", deviceData);
	return processAndUpdateDeviceMode(deviceData)
	.then(function(device){
		device = device.get({plain: true});
		return getFinalDataForSocket(device.id);
	})
	.then(function(device){
		//This is used by route in next() called to sendSocketToPermitted Users. 
		//Keeping device_id a generic variable for all types of socket events
		device.device_id = device.id;
		device.socket_event = "put:/device";	
		return bluebird.resolve({message: "Put device mode info successful", result: device});
	});
};

/** 
 * Process and updates settings code info for a device. This is a device response 
 * to platform user sending a 'poll settngs' request to device
 * 
 * @method putDevicePollSettings
 * @memberof db_mh_device
 * @param {object} deviceData - Body/ Data sent to the route
 * @return {object} - A response with message and result
*/
var putDevicePollSettings = function(deviceData){
	return db.sequelize.transaction(function(t){
		var options = {transaction: t};
		var imei = deviceData.imei;
		return db.device.findOne({
			where: {imei: imei}
		})
		.then(function(device){
			if(!device){
				throw new Error("device not found. imei: ", imei);
			}
			deviceData = _.omit(deviceData, ["imei"]);
			device = _.extend(device, deviceData);
			return device.save(options);
		});
	})
	.then(function(device){
		device = device.get({plain: true});
		return getFinalDataForSocket(device.id);
	})
	.then(function(device){
		//This is used by route in next() called to sendSocketToPermitted Users. 
		//Keeping device_id a generic variable for all types of socket events
		device.device_id = device.id;
		device.socket_event = "put:/device";		
		return bluebird.resolve({message: "Put device poll settings info successful", result: device});
	});
};

/** 
 * Process and updates the tx_id of the device (scc pocket device) 
 * to complete registration with the platform
 * 
 * @method putDeviceRegistration
 * @memberof db_mh_device
 * @param {object} deviceData - Body/ Data sent to the route
 * @return {object} - A response with message and result
*/
var putDeviceRegistration = function(deviceData){
	//console.log("putDeviceRegistration", deviceData);
	return db.sequelize.transaction(function(t){
		//process for SCC POCKET (Android, iPhone etc)
		if(deviceData.is_pocket && deviceData.tx_id != null){
			deviceData.registration_status = 1;
			deviceData = _.omit(deviceData, "error_message");
		}
		//process for apn config devices (PB, New PB, GT300 etc)
		else{
			if(deviceData.registration_status == true){
				deviceData.registration_status = 1;
				deviceData.error_message = null;
			}
			else{
				deviceData.registration_status = 2;
			}
			//no need to update tx_id
			deviceData = _.omit(deviceData, "tx_id");
		}
		var options = {transaction: t};
		var imei = deviceData.imei;
		return db.device.findOne({
			where: {imei: imei}
		})
		.then(function(device){
			if(!device){
				throw new Error("device not found. imei: ", imei);
			}
			deviceData = _.omit(deviceData, ["imei"]);
			device = _.extend(device, deviceData);
			return device.save(options);
		});
	})
	.tap(function(device){
		device = device.get({plain: true});
		return sendDeviceUpdateToMH({id: device.id}, "POST");
	})
	.then(function(device){
		return getFinalDataForSocket(device.id);
	})
	.then(function(device){
		//This is used by route in next() called to sendSocketToPermitted Users. 
		//Keeping device_id a generic variable for all types of socket events
		device.device_id = device.id;
		device.socket_event = "put:/device";		
		return bluebird.resolve({message: "Put device registration (tx_id) info successful", result: device});
	});
};


/** 
 * Process and updates message_status of a message that was sent to a particular device
 * 
 * @method putDeviceMessageStatus
 * @memberof db_mh_device
 * @param {object} deviceData - Body/ Data sent to the route
 * @return {object} - A response with message and result
*/
var putDeviceMessageStatus = function(deviceData){
	//console.log("putDeviceMessageStatus", deviceData);
	return dbComm.getIdFromComms([deviceData.device_comm_id])
	.then(function(commsData){
		if(commsData.deviceIds.length == 0){
			var msg = "Comm id [" + deviceData.device_comm_id + "] does not belong to a device";
			throw new Error(msg); 
		}
		deviceData.device_id = commsData.deviceIds[0];
		
		var messageStatus = "";
		if(deviceData.message_status == 2) messageStatus = "fail";
		else if(deviceData.message_status == 1) messageStatus = "sent";
		else {
			throw new Error("Invalid message status received by platform");
		}
		return db.message_recipient_devices.update(
			{message_status: messageStatus},
			{where: {device_id: deviceData.device_id, message_id: deviceData.message_id}}
		);
	})
	.then(function(){
		var dbMessage = require("./db_message.js");
		return dbMessage.getMessageById(deviceData.message_id);
	})
	.then(function(message){
		//This is used by route in next() called to sendSocketToPermitted Users. 
		//Keeping device_id a generic variable for all types of socket events
		message.device_id = deviceData.device_id;
		message.socket_event = "put:/message";			
		return bluebird.resolve({message: "Put device message status successful", result: message});
	});
};


/** 
 * Process and inserts a message coming from the device
 * 
 * @method postMessage
 * @memberof db_mh_device
 * @param {object} deviceData - Body/ Data sent to the route
 * @return {object} - A response with message and result
*/
var postDeviceMessage = function(deviceData){
	//console.log("postDeviceMessage", deviceData);
	var finalMessageData = {};
	var user = {};//purely to be able to send user parameter to dbMessage.postMessage
	finalMessageData.message = deviceData.message;
	finalMessageData.message_timestamp = deviceData.message_timestamp;
	finalMessageData.attachments = deviceData.attachments;
	finalMessageData.senders = {};
	finalMessageData.senders.users = []; // always empty array, cause message sent by user cannot hit this route
	finalMessageData.recipients = {};

	_.each(finalMessageData.attachments, function(attachment){
		/*
			This is used for attachments sent from tactical to platform. 
			The tactical does not send the type description and 
			hence we use this object to get the correct type 
			description based on the extention of the file transfered
		*/
		var description = mime.lookup(attachment.attachment_type);
		if(!description){
			var msg = "Invalid attachment extention: " + attachment.attachment_type;
			throw new Error(msg); 
		}
		attachment.attachment_type = description;
	});

	return getClientUserId(deviceData.client_id)
	.then(function(userId){
		user.user_id = userId,
		user.client_id = deviceData.client_id;
		return dbComm.getIdFromComms([deviceData.sender_device_comm_id]);
	})
	.then(function(commsData){
		finalMessageData.senders.devices = commsData.deviceIds;
		return getCannedId(deviceData.canned_number, deviceData.client_id);
	})
	.then(function(cannedId){
		finalMessageData.cannedmessage_id = cannedId;
		return dbComm.getIdFromComms(deviceData.recipients.destination_comm_ids);
	})
	.then(function(commsData){
		finalMessageData.recipients.devices = commsData.deviceIds;
		finalMessageData.recipients.users = commsData.userIds;
		if(deviceData.is_to_client == 1){
			//Only add client user_id to the recipients list if deviceData.is_to_client is true
			finalMessageData.recipients.users.push(user.user_id);
		}
		return getUserIdsForUserNames(deviceData.recipients.destination_usernames);
	})
	.then(function(userIds){
		finalMessageData.recipients.users = _.concat(finalMessageData.recipients.users, userIds);
		
		//Fail safe to direct message to the customer admin if there are no recipients
		if(finalMessageData.recipients.users.length == 0 && finalMessageData.recipients.devices.length == 0){
			finalMessageData.recipients.users.push(user.user_id);
		}

		finalMessageData.recipients.users = _.uniq(finalMessageData.recipients.users);
		
		return validateMessagesSentToUsers(finalMessageData);
	})
	.then(function(){
		//console.log("POST DEVICE MESSAGE", finalMessageData);
		var dbMessage = require("./db_message.js");
		return dbMessage.postMessage(user, finalMessageData);
	})
	.then(function(message){
		//This is used by route in next() called to sendSocketToPermitted Users. 
		//Keeping device_id a generic variable for all types of socket events
		message.result.device_id = finalMessageData.senders.devices[0];
		message.result.socket_event = "post:/message";			
		return bluebird.resolve({message: "Post device message successful", result: message.result});
	});
};


/** 
 * inserts/updates a report (status and settings) related to a consignment device
 * 
 * @method postCargoReport
 * @memberof db_mh_device
 * @param {object} cargoData - Body/ Data sent to the route
 * @return {object} - A response with message and result
*/
var postCargoReport = function(cargoData){
	//console.log("postCargoReport", cargoData);
	return db.sequelize.transaction(function(t){
		var transaction = t;
		return processCargoReport(cargoData, transaction);
	})
	.then(function(){
		return getFinalDataForSocket(cargoData.device_id);
	})
	.then(function(device){
		//This is used by route in next() called to sendSocketToPermitted Users. 
		//Keeping device_id a generic variable for all types of socket events
		device.device_id = device.id;
		device.socket_event = "put:/device";	
		if(cargoData.warning){
			cargoData.device_id = device.device_id;
			cargoData.socket_event = "put:/device";	
			return bluebird.resolve({warning: cargoData.warning, result: cargoData});
		}
		return bluebird.resolve({message: "POST cargo report successfull", result: device});
	});
};


/** 
 * Processes and updates mode of a device. 
 * 
 * @method processAndUpdateDeviceMode
 * @memberof db_mh_device
 * @param {object} deviceData - Body/ Data sent to the route
 * @return {object} - raw data of the updated device
*/
function processAndUpdateDeviceMode(deviceData){
	var modeName = "Consignment";
	if(deviceData.is_tracker_mode){
		modeName = "Standalone";
	}
	var updateDeviceData = {};
	return db.sequelize.transaction(function(t){
		var options = {transaction: t};
		return db.device_mode.findOne({
			where: {title: modeName}
		})
		.then(function(mode){
			if(!mode){
				throw new Error("mode info not found. title: ", modeName);
			}
			mode = mode.get({plain: true});
			updateDeviceData.mode = mode.id;
			return db.device.findOne({
				where: {imei: deviceData.imei}
			});
		})
		.then(function(device){
			if(!device){
				throw new Error("device not found. imei: ", deviceData.imei);
			}
			device = _.extend(device, updateDeviceData);
			return device.save(options);
		});
	});
}

/** 
 * processes and inserts setting and status reports related to a consignment device
 * 
 * @method processCargoReport
 * @memberof db_mh_device
 * @param {Object} cargoData - setting and status info related to a cargo device
 * @param {Object} transaction - contains transaction info
 * @return {object} - promise indicating end of process
*/
function processCargoReport(cargoData, transaction){
	//console.log("processCargoReport", cargoData);
	//get device id of the consignment device
	return db.device.findOne({
		where: {imei: cargoData.imei},
		transaction: transaction
	})
	.then(function(device){
		if(!device){
			var errorMsg = "Id not found for imei: " + cargoData.imei;
			throw new Error(errorMsg);
		}
		device = device.get({plain: true});
		cargoData.device_id = device.id;
		cargoData.client_id = device.client_id;

		//Get latest gps_id from report
		return db.report.findAll({
			where: {device_id: cargoData.device_id},
			limit: 1,
			order: "report.id DESC",
			transaction: transaction
		});
	})
	.then(function(reportData){
		_.each(reportData, function(report){
			report = report.get({plain: true});
			cargoData.gps_id = report.id;
		});
		
		//insert cargo status
		if(cargoData.status){
			return processAndInsertContainerStatus(cargoData, transaction);
		}
		else return bluebird.resolve();
	})
	.then(function(){
		//insert cargo settings
		if(cargoData.settings && !_.isEmpty(cargoData.settings)){
			return insertLatestContainerSettings(cargoData, transaction);
		}
		else return bluebird.resolve();
	});
}

/** 
 * processes and inserts/updates container status and also arhives in history
 * 
 * @method processAndInsertContainerStatus
 * @memberof db_mh_device
 * @param {Object} cargoData - setting and status info related to a cargo device
 * @param {Object} transaction - contains transaction info
 * @return {object} - promise indicating end of process
*/
function processAndInsertContainerStatus(cargoData, transaction){
	cargoData.status.shock_alert = false;

	//insert cargo status history
	return archiveContainerStatus(cargoData, transaction)
	.then(function(insertData){
		cargoData.status_id= insertData.id;
		//insert cargo status
		return insertLatestContainerStatus(cargoData, transaction);
	});
} 

/** 
 * archives container status
 * 
 * @method archiveContainerStatus
 * @memberof db_mh_device
 * @param {Object} cargoData - setting and status info related to a cargo device
 * @param {Object} transaction - contains transaction info
 * @return {object} - promise indicating end of process
*/
function archiveContainerStatus(cargoData, transaction){
	var dbCargoStatus = db.cargo_status.build({
		device_id: cargoData.device_id,
		report_id: cargoData.gps_id,
		status_timestamp: cargoData.report_timestamp,
		door_open: cargoData.status.door_open,
		temperature: cargoData.status.temperature,
		humidity: cargoData.status.humidity,
		shock: cargoData.status.shock,
		shock_alert: cargoData.status.shock_alert,
		battery_charge: cargoData.status.battery_charge,
		anti_tamper: cargoData.status.anti_tamper
	});

	return dbCargoStatus.save({transaction: transaction});
}


/** 
 * Inserts latest container status. 
 * Also checks if the status report coming in has a newer timestamp than the report already stored in the db
 * 
 * @method insertLatestContainerStatus
 * @memberof db_mh_device
 * @param {Object} cargoData - setting and status info related to a cargo device
 * @param {Object} transaction - contains transaction info
 * @return {object} - promise indicating end of process
*/
function insertLatestContainerStatus(cargoData, transaction){
	var cargoStatus = {
		device_id: cargoData.device_id,
		status_id: cargoData.status_id,
		report_id: cargoData.gps_id,
		status_timestamp: cargoData.report_timestamp,
		door_open: cargoData.status.door_open,
		temperature: cargoData.status.temperature,
		humidity: cargoData.status.humidity,
		shock: cargoData.status.shock,
		shock_alert: cargoData.status.shock_alert,
		battery_charge: cargoData.status.battery_charge,
		anti_tamper: cargoData.status.anti_tamper
	};

	return db.latest_cargo_status.findOne({
		where: {device_id: cargoData.device_id},
		transaction: transaction
	})
	.then(function(latestCargoStatus){
		var dbLatestCargoStatus;

		if(latestCargoStatus){
			if(cargoData.report_timestamp < latestCargoStatus.status_timestamp){
				log.warn("Platform Received Cargo Report With Old Timestamp, For device with id: ", cargoData.device_id);
				cargoData.warning = "Platform Received Cargo Report With Old Timestamp (" + cargoData.report_timestamp + ") for device with IMEI/Token (" + cargoData.imei + "). The Data Has Been Archived In Platform DB";
				return bluebird.resolve();
			}
			else{
				dbLatestCargoStatus = _.merge(latestCargoStatus, cargoStatus);
			}
		}
		else{
			dbLatestCargoStatus = db.latest_cargo_status.build(cargoStatus);
		}

		return dbLatestCargoStatus.save({transaction: transaction});
	});
}


/** 
 * Inserts latest container settings. 
 * Also checks if the settings report coming in has a newer timestamp than the report already stored in the db
 * 
 * @method insertLatestContainerSettings
 * @memberof db_mh_device
 * @param {Object} cargoData - setting and status info related to a cargo device
 * @param {Object} transaction - contains transaction info
 * @return {object} - promise indicating end of process
*/
function insertLatestContainerSettings(cargoData, transaction){
	var cargoSettingData = {
		device_id: cargoData.device_id,
		setting_timestamp: cargoData.report_timestamp,
		temperature_low: cargoData.settings.temperature_low,
		temperature_high: cargoData.settings.temperature_high,
		humidity_high: cargoData.settings.humidity_high,
		shock_high: cargoData.settings.shock_high
	};

	return db.cargo_setting.findOne({
		where: {device_id: cargoData.device_id},
		transaction: transaction
	})
	.then(function(cargoSetting){
		let dbCargoSetting;

		if(cargoSetting){
			if(cargoData.report_timestamp < cargoSetting.setting_timestamp){
				log.warn("Platform Received Cargo Report With Old Timestamp, For device with id: ", cargoData.device_id);
				cargoData.warning = "Platform Received Cargo Report With Old Timestamp (" + cargoData.report_timestamp + ") for device with IMEI/Token (" + cargoData.imei + "). The Data Has Been Archived In Platform DB";
				return bluebird.resolve();
			}
			else{
				dbCargoSetting = _.merge(cargoSetting, cargoSettingData);
			}
		}
		else{
			dbCargoSetting = db.cargo_setting.build(cargoSettingData);
		}

		return dbCargoSetting.save({transaction: transaction});
	});
}


/** 
 * Queries and returns user Ids based on usernames passed 
 * 
 * @method getUserIdsForUserNames
 * @memberof db_mh_device
 * @param {stringArray} usernames - array usernames of platform users
 * @return {intArray} - array of corressponding userIds
*/
function getUserIdsForUserNames(usernames){
	return db.user.findAll({
		where: {username: {$in: usernames}}
	})
	.then(function(users){
		var userIds = [];
		_.each(users, function(user){
			user = user.get({plain: true});
			userIds.push(user.id);
		});

		return bluebird.resolve(userIds); 
	});
}


/** 
 * Queries and returns user Id of a client
 * 
 * @method getClientUserId
 * @memberof db_mh_device
 * @param {int} recipientClientId - client id
 * @return {int} - user id of the client
*/
function getClientUserId(recipientClientId){
	return db.user.findOne({
		where: {client_id: recipientClientId, role_id: 2}
	})
	.then(function(user){
		if(!user){
			throw new Error("Clients user info not found");
		}

		user = user.get({plain: true});
		return bluebird.resolve(user.id);
	});
}


/** 
 * Queries and returns canned Id based on Canned number and client group
 * 
 * @method getCannedId
 * @memberof db_mh_device
 * @param {int} cannedNumber - canned number sent by MH
 * @param {int} clientId - id of the client group the device belongs to
 * @return {int} - corressponding canned id
*/
function getCannedId(cannedNumber, clientId){
	if(cannedNumber == null){
		return bluebird.resolve(null);
	}
	else{
		return db.canned_message.findOne({
			where: {canned_number: cannedNumber, client_id: clientId}
		})
		.then(function(cannedData){
			if(!cannedData){
				var errorMessage = "cannedData not found for canned_number: " + cannedNumber + " and client Id: " + clientId; 
				throw new Error(errorMessage);
			}
			cannedData = cannedData.get({plain: true});
			return bluebird.resolve(cannedData.id);
		});
	}
}




/** 
 * Processes and checks if a recipient user is allowed to receive message from the device
 * 
 * @method validateMessagesSentToUsers
 * @memberof db_mh_device
 * @param {object} finalMessageData - final object containing message data in the format required by postMessage in db_message.js
 * @return {Object} - promise or error 
*/
function validateMessagesSentToUsers(finalMessageData){
	var dbDevice = require("./db_device.js");

	return bluebird.map(finalMessageData.recipients.users, function(userId){
		var user = {user_id: userId};
		return dbDevice.findDevices(user, finalMessageData.senders.devices)
		.then(function(device){
			var validDeviceIds = _.map(device, "id");
			var invalidDeviceIds = _.difference(finalMessageData.senders.devices, validDeviceIds);
			if(invalidDeviceIds.length > 0){
				log.warn("Following user (id):", userId, ", does not have access to receive messages from device (id):", JSON.stringify(invalidDeviceIds), ". The message will not be forwarded to the user");
				finalMessageData.recipients.users = _.pull(finalMessageData.recipients.users, userId);
			}
			return bluebird.resolve();
		});
	});
}


/** 
 * Gets device data to send to socket
 * 
 * @method getFinalDataForSocket
 * @memberof db_mh_device
 * @param {int} deviceId - Id of the device
 * @return {object} - A response with message and result
*/
function getFinalDataForSocket(deviceId){
	var dbDevice = require("./db_device.js");
	return dbDevice.getDevicesById(deviceId);
}


/** 
 * Sends data to MH web service, calls the API route based on the path and the method
 * passed to the function 
 * 
 * @method callMHWS
 * @memberof db_mh_device
 * @param {object} mhData - Body/ Data being sent to the MHWS route
 * @param {string} path - The url of the request
 * @param {string} method - The method of the request
 * @return {object} - Promise indicating end of process
*/
function callMHWS(mhData, path, method, noQueueOnFail){
	var mhwsAddress= process.env.MH_WS_ADDRESS;
	var mhwsPort = process.env.MH_WS_PORT;
	var mhUserName = process.env.MH_WS_USER;
	var mhPassword = process.env.MH_WS_PASSWORD;
	if(!mhwsAddress || !mhwsPort || !mhUserName || !mhPassword){
		throw new Error("Failed to verify Message Handler Web-Service credentials.");
	}
	
	var url = mhwsAddress+ ":"+ mhwsPort;
	url += path;
	
	log.info("Sending request to MHWS", {method: method, url: url, data: mhData});
	
	var options = {
		method: method,
		uri: url,
		body: mhData,
		auth: {
			"user": mhUserName,
			"pass": mhPassword
		},
		json: true
	};

	return rp(options)
	.then(function(response){
		var parseBody = JSON.parse(response);
		log.info("MHWS Success Response:", parseBody);
		if(parseBody.error && !noQueueOnFail){
			return queueRequestsForMHWS(path, mhData, method, parseBody.error);
		}

		if(parseBody.result){
			return bluebird.resolve(parseBody.result);
		}

		return bluebird.resolve();
	})
	.catch(function(err){
		if(!noQueueOnFail){
			return queueRequestsForMHWS(path, mhData, method, err);
		}
		return bluebird.resolve();
	});
}

/** 
 * Queues the MHWS requests with failed responses in the 'mh_command_queue' table 
 * 
 * @method queueRequestsForMHWS
 * @memberof db_mh_device
 * @param {object} mhData - Body/ Data being sent to the MHWS route
 * @param {string} path - The url of the request
 * @param {string} method - The method of the request
 * @param {string} err - The error thrown by mhws on failure
 * @return {object} - Promise indicating end of process
*/
function queueRequestsForMHWS(path, mhData, method, err){
	log.error("MHWS Error:", err);
	log.info("Queueing data for MHWS: ", path, mhData);

	const dbMhCommandQueue = db.mh_command_queue.build({
		path: path,
		method: method,
		data: JSON.stringify(mhData)
	});

	return dbMhCommandQueue.save();
}

/** 
 * gets device info in the format needed my MH for a particular device
 *  
 * @method getDeviceByIdForMH
 * @memberof db_mh_device
 * @param {int} id - id of the device
 * @return {object} - object containing info of the device
*/
var getDeviceByIdForMH = function(id){
	return db.device.findOne({
		where: {id: id},
		include: [{
			model: db.comm, 
			where: {table_name: "assets"}
		}, {
			model: db.device_type
		}, {
			model: db.feed_code,
			as: "DeviceFeedCodes"
		}, {
			model: db.communication_mode,
			as: "DeviceIncomingMode",
			required: false
		}, {
			model: db.communication_mode,
			as: "DeviceOutgoingMode",
			required: false
		}, {
			model: db.group
		}, {
			model: db.situational_awareness,
			as: "SaMemberDevices",
			required: false
		}, {
			model: db.situational_awareness,
			as: "SaSubscriberDevices",
			required: false
		}]
		//transaction: options.transaction
	})
	.then(function(device){
		if(!device){
			var msg = "Cannot find device for id: " + id;
			throw new Error(msg);
		}

		return bluebird.resolve(refineDeviceDataForMH(device));
	});
};


/** 
 * Processes and sends device update to MH\
 * This replaces S2MH_UPDATE_ASSET_DATA command
 *  
 * @method sendDeviceUpdateToMH
 * @memberof db_mh_device
 * @param {object} deviceInfo - contains some necessary device info
 * @param {string} method - indicates whether the action is POST or DELETE
 * @return {object} - promise indicating end of process
*/
function sendDeviceUpdateToMH(deviceInfo, method){
	var mhData = {};
	var mhUrl = "";
	if(method == "DELETE"){
		mhUrl = "/mh/v1/device/" + deviceInfo.comm_id + "/" + deviceInfo.client_id;
		callMHWS(mhData, mhUrl, method);
		return bluebird.resolve();
	}
	else if(method == "POST"){
		return getDeviceByIdForMH(deviceInfo.id)
		.then(function(device){
			mhData = device;
			mhUrl = "/mh/v1/device";
			callMHWS(mhData, mhUrl, method);
			return bluebird.resolve();
		});
	}
	else{
		var msg = "Invalid method passed to function: " + method;
		throw new Error(msg);
	}
}


/**
 * Processes req of user and sends respective command to MH (to be relayed down to the device)
 * It calls the respective MHWS URL to forward the commands down to the device
 * 
 * @method processAndSendCommandToDevice
 * @memberof db_device
 * @param {id} id - id of the device
 * @param {object} user - object containing user info
 * @param {object} deviceData - data associated to the device
 * @return {object} Promise indicating end of process
 */
function processAndSendCommandToDevice(user, deviceData){
	var mhUrl = "";

	var mhData = {
		client_id: user.client_id,
		comm_id: deviceData.comm_id
	};

	if(deviceData.command == "poll_gps"){
		mhUrl = "/mh/v1/gps/poll";
	}
	else if(deviceData.command == "poll_settings"){
		mhUrl = "/mh/v1/settings/poll";
	}
	else if(deviceData.command == "send_settings"){
		mhUrl = "/mh/v1/settings/update";
		mhData.settings_code = deviceData.settings_code;
	}
	else if(deviceData.command == "panic_reset"){
		mhUrl = "/mh/v1/gps/reset";
	}
	else if(deviceData.command == "device_registration"){
		mhUrl = "/mh/v1/device/registration";
		mhData.apn_host = deviceData.device_configurations.apn_host;
		mhData.apn_user =  deviceData.device_configurations.apn_user;
		mhData.apn_password =  deviceData.device_configurations.apn_password;
		mhData.sos_number =  deviceData.device_configurations.sos_number;
		mhData.interval =  deviceData.device_configurations.interval;
	}
	else{
		throw new Error("Invalid command [" + deviceData.command + "] sent to route");
	}

	callMHWS(mhData, mhUrl, "POST");
	return bluebird.resolve();
}

/** 
* processes ping request and triggers the flushing of req for MHWS
* @method getAndFlushOutS2CQueue
* @memberof db_mh_device
* @return {object} - A promise indicating end of process
*/
var processPingForS2cData = function(){
	getAndFlushOutS2CQueue();
	return bluebird.resolve({message: "Received Ping", result: {}});
};


/** 
* Queries and flushes out any queued up requests for MHWS
* @method getAndFlushOutS2CQueue
* @memberof db_mh_device
* @return {object} - A promise indicating end of process
*/
function getAndFlushOutS2CQueue(){
	return db.mh_command_queue.findAll({
		attributes: ["id", "path", "method", "data"]
	})
	.then(function(dataForMh){
		return bluebird.each(dataForMh, function(mhData){
			mhData = mhData.get({plain: true});
			return callMHWS(JSON.parse(mhData.data), mhData.path, mhData.method, true)
			.then(function(){
				return db.mh_command_queue.destroy({
					where: {id: mhData.id}
				});
			});
		});
	});
}


/** 
 * refines the data from getAllPlatformDevices in a format that
 * meets MH requirements  
 * @method refineDeviceDataForMH
 * @memberof db_mh_device
 * @param {object} devices - object containg raw data of deviced polled from the DB
 * @return {object} - A response with message and result
*/
function refineDeviceDataForMH(device){
	device = device.get({plain: true});

	if(device.sms == "NULL"){
		device.sms = null;
	}

	device.comm_id = device.comms[0].id;
	device.type = device.device_type.title;
	device.feed_codes = [];
	device.groups = _.map(device.groups, "id");

	_.each(device.DeviceFeedCodes, function(feed){
		device.feed_codes.push(feed.feed_code);
	});

	device.primary_mtdm = null;
	device.primary_modm = null;
	device.secondary_mtdm = null;
	device.secondary_modm = null;

	if(device.DeviceIncomingMode){
		device.primary_mtdm = device.DeviceIncomingMode.title;
		
		if(device.DeviceIncomingMode.title == "GPRS:SMS"){
			device.primary_mtdm = "GPRS";
			device.secondary_mtdm = "SMS";
		}
	
		if(device.DeviceIncomingMode.title == "IRID:GPRS"){
			device.primary_mtdm = "IRID";
			device.secondary_mtdm = "GPRS";
		}
	}
	
	if(device.DeviceOutgoingMode){
		device.primary_modm = device.DeviceOutgoingMode.title;
		
		if(device.DeviceOutgoingMode.title == "GPRS:SMS"){
			device.primary_modm = "GPRS";
			device.secondary_modm = "SMS";
		}
	
		if(device.DeviceOutgoingMode.title == "IRID:GPRS"){
			device.primary_modm = "IRID";
			device.secondary_modm = "GPRS";
		}
	}

	device.sa_memberships = _.map(device.SaMemberDevices, "id");
	device.sa_subscriptions = _.map(device.SaSubscriberDevices, "id");

	device = _.omit(device, [
		"id", "create_timestamp", "type_id", 
		"settings", "poll_settings_code", "poll_settings_timestamp",
		"poll_firmware", "max_speed", "min_speed", "non_report_threshold",
		"annotation", "device_incoming_mode", "device_outgoing_mode", 
		"registration_status", "error_message", "active", "comms", "device_type", 
		"DeviceFeedCodes", "DeviceIncomingMode", "DeviceOutgoingMode", 
		"SaMemberDevices", "SaSubscriberDevices"
	]);
	
	return device;
}


module.exports = {
	putDeviceMode: putDeviceMode,
	putDevicePollSettings: putDevicePollSettings,
	putDeviceRegistration: putDeviceRegistration,
	putDeviceMessageStatus: putDeviceMessageStatus,
	callMHWS: callMHWS,
	postDeviceMessage: postDeviceMessage,
	postCargoReport: postCargoReport,
	getAllPlatformDevices: getAllPlatformDevices,
	sendDeviceUpdateToMH: sendDeviceUpdateToMH,
	processAndSendCommandToDevice: processAndSendCommandToDevice,
	getDeviceInfoById: getDeviceInfoById,
	processPingForS2cData: processPingForS2cData
};