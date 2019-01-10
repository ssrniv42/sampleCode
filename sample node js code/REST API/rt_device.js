/* global utils */

"use strict";

var _= require("lodash"); 
var express = require("express");
var router = express.Router();
var dbDevice= require("../db/db_device.js");
var permission= require("../lib/permission.js");
var socket= require("../lib/socket.js");
var plugin= require("../plugins");
var validate = require("../validation");
var bluebird= require("bluebird");

/**
 * @apiDefine DeviceSuccessError
 * @apiSuccess	{Object}		result													Info related to a device
 * @apiSuccess	{Number}		result.id												Device Id
 * @apiSuccess	{Number}		result.client_id										Client Id
 * @apiSuccess	{String}		result.imei												Device IMEI
 * @apiSuccess	{String}		result.tx_id											Device Transmission Id
 * @apiSuccess	{String}		result.sms												Device cellular number
 * @apiSuccess	{Number}		result.type_id											Device type Id
 * @apiSuccess	{String}		result.type												Device type
 * @apiSuccess	{String}		result.name												Device name
 * @apiSuccess	{Number}		result.mode												Device mode
 * @apiSuccess	{String}		result.encryption_key									Device encryption key
 * @apiSuccess	{String}		result.decryption_key									Device decryption key
 * @apiSuccess	{String}		result.settings											Device settings
 * @apiSuccess	{String}		result.poll_settings_code								Device poll settings code
 * @apiSuccess	{Number}		result.poll_settings_timestamp							Device poll settings timestamp
 * @apiSuccess	{String}		result.poll_firmware									Device poll firmware
 * @apiSuccess	{Number}		result.max_speed										Device maximum speed
 * @apiSuccess	{Number}		result.min_speed										Device minimum speed
 * @apiSuccess	{Number}		result.non_report_threshold								Device non-report threshold
 * @apiSuccess	{Number}		result.annotation										Device annotation
 * @apiSuccess	{Number[]}		result.groups											List of Device assigned groups
 * @apiSuccess	{Number}		result.longitude										Device longitude in decimal
 * @apiSuccess	{Number}		result.latitude											Device latitude in decimal
 * @apiSuccess	{Number}		result.speed											Device speed in kilometes per hour
 * @apiSuccess	{Number}		result.heading											Device heading in degrees
 * @apiSuccess	{Boolean}		result.panic											Device panic status
 * @apiSuccess	{Number}		result.report_timestamp									Device report timestamp
 * @apiSuccess	{Boolean}		result.polling											Device polling status
 * @apiSuccess	{Boolean}		result.ignition											Device ignition status
 * @apiSuccess	{Boolean}		result.battery_charge									Device charging status
 * @apiSuccess	{Number}		result.battery_level									Device battery level
 * @apiSuccess	{Number}		result.comm_id											Device communications Id
 * @apiSuccess	{String}		result.color											Color assigned to the asset
 * @apiSuccess	{Object}		result.consignment										Only available for Shadow, CCU or TAG devices
 * @apiSuccess	{Number}		result.consignment.id									Device Id
 * @apiSuccess	{String}		result.consignment.tag_id								Device ZigBee Id
 * @apiSuccess	{Object}		result.consignment.settings								Device consignment settings info
 * @apiSuccess	{Number}		result.consignment.settings.last_settings_reported		Time since settings were reported last
 * @apiSuccess	{Number}		result.consignment.settings.temp_low					Device low temperature threshold in degree celcius
 * @apiSuccess	{Number}		result.consignment.settings.temp_high					Device high temperature threshold in degree celcius
 * @apiSuccess	{Number}		result.consignment.settings.humidity					Device humidity threshold in %
 * @apiSuccess	{Number}		result.consignment.settings.shock_high					Device shock threshold in G forces
 * @apiSuccess	{Number}		result.consignment.settings.start_hour					Device start hour (0-23)
 * @apiSuccess	{Number}		result.consignment.settings.report_interval				Device report interval in seconds
 * @apiSuccess	{Object}		result.consignment.status								Device consignment status info
 * @apiSuccess	{Number}		result.consignment.status.last_status_reported			Time since status was reported last
 * @apiSuccess	{Number}		result.consignment.status.door_open						Device door status
 * @apiSuccess	{Number}		result.consignment.status.temperature					Device temperature in degree celcius
 * @apiSuccess	{Number}		result.consignment.status.humidity						Device humidity in %
 * @apiSuccess	{Number}		result.consignment.status.shock_alert					Device shock alert
 * @apiSuccess	{Boolean}		result.consignment.status.shock							Device shock in G forces
 * @apiSuccess	{Number}		result.consignment.status.battery_charge				Device battery charge
 * @apiSuccess	{Object}		result.consignment.geofence								Device geofence
 * @apiSuccess	{Number[]}		result.consignment.geofence.id							Device geofence Id
 * @apiSuccess	{Number}		result.consignment.geofence.number_geofences			Count of geofences asssigned to the cargo device 
 * 
 * @apiSuccess	{String}		message													Success message
 * 
 * @apiError	{String}		error													Error message
 */


/**
 * @api {get} /device 
 * @apiName GetAllDevice
 * @apiGroup device
 * @apiDescription 	Get all devices and their current location and status information
 * @apiHeader {String} x-access-token Users unique access token
 * 
 * @apiSuccess {Object}	result	List of all devices that the user has permission to view (key'd by Id)
 * 
 * @apiUse DeviceSuccessError
 */
router.get("/device", permission(), getAllDevices, utils.responseHandler);

/**
 * @api {get} /device/type 
 * @apiDescription Get all devices types, modes associated with the type and info of components
 * @apiName GetAllDeviceTypes
 * @apiGroup device
 * @apiHeader {String} x-access-token Users unique access token
 *
 * @apiSuccess	{Object}		result											List of all device types, modes associated with the type 
 * 																				and info of components that need to be displayed in the UI form
 * @apiSuccess	{Number}		result.id										Device type Id
 * @apiSuccess	{String}		result.title									Device type title
 * @apiSuccess	{String}		result.description								Device type description
 * @apiSuccess	{Number}		result.image_id									Device type image Id
 * @apiSuccess	{Boolean}		result.enabled									Device type enabled status
 * @apiSuccess	{Object}		result.components								Device type components
 * @apiSuccess	{Boolean}		result.components.phone_number					Device type has a phone number
 * @apiSuccess	{String}		result.components.mode							Device type mode
 * @apiSuccess	{Boolean}		result.components.cipher						Device type has cypher
 * @apiSuccess	{Boolean}		result.components.messaging						Device type has messaging
 * @apiSuccess	{Boolean}		result.components.communication_mode_pairing	Device Mobile incoming mode and outgoing mode must be same
 * @apiSuccess	{Boolean}		result.components.apn_configurations			Device has extra configurations during registration
 * @apiSuccess	{Boolean}		result.components.iridex_pin					Device is iridium extreme device and must display the pin
 * @apiSuccess	{Boolean}		result.components.zigbee_id						Device is a consignment CCU or TAG
 * @apiSuccess	{Boolean}		result.components.alert_ack						Device accepts alert acknowledgements
 * @apiSuccess	{Boolean}		result.components.alert_reset					Device accepts alert resets
 * @apiSuccess	{Object}		result.modes									Device type modes
 * @apiSuccess	{Number}		result.modes.id									Device type mode Id
 * @apiSuccess	{String}		result.modes.title								Device type mode title
 * @apiSuccess	{Object}		result.device_incoming_modes					Device type incoming modes 
 * @apiSuccess	{Number}		result.device_incoming_modes.id					Device type incoming mode Id
 * @apiSuccess	{String}		result.device_incoming_modes.title				Device type incoming mode title
 * @apiSuccess	{Boolean}		result.device_incoming_modes.default			Device type incoming mode is default indicator
 * @apiSuccess	{Object}		result.device_outgoing_modes					Device type outgoing modes 
 * @apiSuccess	{Number}		result.device_outgoing_modes.id					Device type outgoing mode Id
 * @apiSuccess	{String}		result.device_outgoing_modes.title				Device type outgoing mode title
 
 * @apiSuccess	{String}		message											Success message.
 * 
 * @apiError	{String}		error									Error message
 */
router.get("/device/type", getAllDeviceTypes, utils.responseHandler);


/**
 * @api {get} /device/mode 
 * @apiDescription Get all devices types, modes associated with the type and info of components
 * @apiName GetAllDeviceModes
 * @apiGroup device
 * @apiHeader {String} x-access-token Users unique access token
 *
 * @apiSuccess	{Object}		result								List of all device modes 
 * 														
 * @apiSuccess	{Number}		result.id							Device mode Id
 * @apiSuccess	{String}		result.title						Device mode title
 
 * @apiSuccess	{String}		message								Success message.
 * 
 * @apiError	{String}		error										Error message
 */
router.get("/device/mode", getAllDeviceModes, utils.responseHandler);

/**
 * @api {put} /device Update info of an existing device
 * @apiName PutDevice
 * @apiGroup device
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.2.0
 * @apiDescription Updates info of a given device. Only properties provided in the request body
 * would be updated.
 * 
 * @apiParam	{Number}		id									Device Id
 * @apiParam	{String}		[imei]								Device IMEI
 * @apiParam	{String}		[sms]								Device cellular number. Allowed to be null
 * @apiParam	{String}		[name]								Device name
 * @apiParam	{Number}		[mode]								Device mode
 * @apiParam	{String}		[encryption_key]					Device encryption key
 * @apiParam	{String}		[decryption_key	]					Device decryption key
 * @apiParam	{Number}		[max_speed]							Device maximum speed. Allowed to be null
 * @apiParam	{Number}		[min_speed]							Device minimum speed. Allowed to be null
 * @apiParam	{Number}		[non_report_threshold]				Device non-report threshold
 * @apiParam	{Number}		[annotation]						Device annotation. Allowed to be empty string
 * @apiParam	{Number[]}		[groups]							Device group Ids
 * 
 * @apiUse DeviceSuccessError
 *
 */
router.put("/device", validate(), 
	permission(), 
	putDevice, 
	socket(), 
	socketUpdateForAdminDevice, 
	socketUpdateForSyncModule,
	plugin(), 
	utils.responseHandler
);


/**
 * @api {put} /device/commands
 * @apiName sendCommandsToDevice
 * @apiGroup device
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.2.0
 * @apiDescription Calls MHWS web service to forward user requests like 
 * gps polling, settings code polling and sending new settings code
 * 
 * @apiParam	{Number}		id									Device Id
 * @apiParam	{String}		imei								Device IMEI
 * @apiParam	{Number}		comm_id								Device Comm Id
 * @apiParam	{String}		command								Device command
 * @apiParam	{String}		settings_code						Device settings code (Only if command is 'send_settings'). Allowed to be null
 * 
 * @apiUse DeviceSuccessError
 */
router.put("/device/command", validate(), customCommandPermission, sendCommandsToDevice, utils.responseHandler);


/**
 * @api {get} /device/aes256 gets a randomly generated AES256 Key
 * @apiName getDeviceAes256
 * @apiGroup device
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.2.0
 * @apiDescription generates a new AES256 key using the crypto library in Node.js.
 * 
 * @apiSuccess	{String}		result									Randomly generated AES256 key
 * @apiSuccess	{String}		message								Success message
 * 
 * @apiError	{String}		error								Error message
 */
router.get("/device/aes256", 
	permission({
		noModuleCheck: true, 
		permissions: [
			{module: "device", actions: ["edit"]}
		]
	}), 
	getDeviceAes256, utils.responseHandler
);


/**
 * Middleware to get all devices
 */
function getAllDevices(req, res, next){	
	var user = req.user;
	utils.dbHandler(req, res, next, function(){
		return dbDevice.getAllDevices(user);
	});
}

/**
 * Middleware to get all device types
 */
function getAllDeviceTypes(req, res, next){	
	utils.dbHandler(req, res, next, function(){
		return dbDevice.getAllDeviceTypes();
	});
}

/**
 * Middleware to get all device modes
 */
function getAllDeviceModes(req, res, next){	
	utils.dbHandler(req, res, next, function(){
		return dbDevice.getAllDeviceModes();
	});
}

/**
 * Middleware to update a device into the db under current user's client
 */
function putDevice(req, res, next){
	var user = req.user;
	var id = req.body.id;
	var deviceData = req.body;
	
	utils.dbHandler(req, res, next, function(){
		return dbDevice.putDevice(user, id, deviceData);
	});
}

/**
 * Middleware to generate a new random AES256 key
 */
function getDeviceAes256(req, res, next){
	var crypto= require("crypto");
	var key= crypto.randomBytes(32).toString("hex").toUpperCase();
	var result= {key: key};
	req.result= { message: "successfully generated AES256 Key", result: result };
	next();
}

/**
 * checking permission for the command based on the command string
 * 
 * @param {Object} req express requset object
 * @param {Object} res express reponse object
 * @param {Function} next express next function
 */
function customCommandPermission(req, res, next){
	if(req.body.command && req.body.command == "poll_gps"){
		return permission({permissions: [{module: "device", actions: ["poll"]}]})(req, res, next);
	}else if(req.body.command && _.indexOf(["poll_settings", "send_settings"], req.body.command) > -1) {
		return permission({permissions: [{module: "device", actions: ["setcode"]}]})(req, res, next);
	}else{
		throw new Error("Could not verify the permission for the specified command.");
	}
}

/**
 * Middleware to forward user commands to MHWS (gps polling, settings code polling and new settings code)
 */
function sendCommandsToDevice(req, res, next){
	var user = req.user;
	var deviceData = req.body;
	utils.dbHandler(req, res, next, function(){
		return dbDevice.sendCommandsToDevice(user, deviceData);
	});
}


/*
	Middleware calls the function defined in admin_device route to send custom update socket to device module
	invoked when a device is updated in platform session 
*/
function socketUpdateForAdminDevice(req, res, next){
	next();

	var user = {client_id: req.result.result.client_id};
	var deviceId = req.result.result.id;
	var permittedUsers = req.permittedUsers;

	return dbDevice.getDeviceByIdForAdmin(deviceId)
	.then(function(device){
		var rtAdminDevice = require("./rt_admin_device.js");
		return rtAdminDevice.sendSocketUpdateForAdminDevice(device.data, user, permittedUsers);
	});
}

//Custom function sends socket update to platform session users when a device is added, updated or deleted via Admin
function sendSocketUpdateForDevice(deviceId, user, method, permittedUsers){
	var socketEvent = method + ":/device"; 

	var dummyRequest = {
		socketEvent: socketEvent,
		user: user,
		permittedUsers: permittedUsers
	};

	if(method == "post"){
		//Have to manually call function because req.body does not have 'id' when a POST route is called 
		return permission.getPermittedUsers(user, "device", deviceId)
		.then(function(users){
			dummyRequest.permittedUsers = users;
			return dbDevice.getDevicesById(deviceId);
		})
		.then(function(device){
			dummyRequest.result = {result: device};
			socket.socketHandler(dummyRequest);
			return bluebird.resolve();
		});
	}
	else if(method == "delete"){
		dummyRequest.socketEvent = method + ":/device/:id"; 
		dummyRequest.result = {result: {id: deviceId}};
		socket.socketHandler(dummyRequest);
		return bluebird.resolve();
	}

	//method is put
	return dbDevice.getDevicesById(deviceId)
	.then(function(device){
		dummyRequest.result = {result: device};
		socket.socketHandler(dummyRequest);
		return bluebird.resolve();
	});
}

/*
	Middleware calls the function defined in sync route to send custom update socket to sync module
	invoked when a device is updated from platform
*/
function socketUpdateForSyncModule(req, res, next){
	next();
	var rtSync = require("./rt_sync.js");
	return rtSync.sendSocketToSyncModule(req, res, next);
}



module.exports= {
	router: router,
	sendSocketUpdateForDevice: sendSocketUpdateForDevice
};

