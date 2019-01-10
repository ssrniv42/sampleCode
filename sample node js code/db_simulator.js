var bluebird = require("bluebird");
var _ = require("lodash"); 

/** 
 * Returns the list of all devices
 * 
 * @method getDeviceList
 * @memberof db_simulator
 * @return {object} - object a list of all devices in the Track24 DB 
*/
var getDeviceList = function(){	
	return db.device.findAll({
		attributes: ["id", "name", "type_id", "client_id", "mode", "imei"],		
		include: [{
			attributes: ["id"],			
			model: db.comm,
			where: {table_name: "assets"},
			required: true
		}, {
			model: db.device_type,
			required: true,
			include: [{
				model: db.device_type_components,
				as: "components", 
				attributes: [
					"phone_number", "mode", "cipher", "messaging", 
					"communication_mode_pairing", "apn_configurations", 
					"iridex_pin", "zigbee_id"
				],
				required: true
			}]
		}]
	})
	.then(function(devices){
		devices= _.map(devices, function(device){
			device = device.get({plain: true});
			device.type = device.device_type.title;
			device.components = device.device_type.components[0];
			device = _.omit(device, ["device_type"]);
			return device;
		});		
		
		devices= _.keyBy(devices, "id");
		return bluebird.resolve({message: "Get all devices successful", result: devices});
	});
};

/** 
 * Returns the list of all clients on the server
 * 
 * @method getClientList
 * @memberof db_simulator
 * @return {object} - object a list of all clients in the Track24 DB 
*/
var getClientList = function(){
	return db.client.findAll({
		attributes: ["id", "company"],
		where: {active: true}
	})
	.then(function(clients){
		clients = _.map(clients, function(client){
			client = client.get({plain: true});
			return client;
		});

		clients = _.keyBy(clients, "id");
		return bluebird.resolve({message: "Get all clients successful", result: clients});
	});
};

/** 
 * Returns the list of all devices under a client
 * 
 * @method getDeviceList
 * @memberof db_simulator
 * @return {object} - object a list of all devices under a client
*/
var getDeviceListForClient = function(clientId){
	return db.device.findAll({
		attributes: ["id", "name", "type_id", "client_id", "mode", "imei"],
		where: {client_id: clientId},		
		include: [{
			attributes: ["id"],			
			model: db.comm,
			where: {table_name: "assets"},
			required: true
		}, {
			model: db.device_type,
			required: true,
			include: [{
				model: db.device_type_components,
				as: "components", 
				attributes: [
					"phone_number", "mode", "cipher", "messaging", 
					"communication_mode_pairing", "apn_configurations", 
					"iridex_pin", "zigbee_id"
				],
				required: true
			}]
		}]
	})
	.then(function(devices){
		devices= _.map(devices, function(device){
			device = device.get({plain: true});
			device.type = device.device_type.title;
			device.components = device.device_type.components[0];
			device = _.omit(device, ["device_type"]);
			return device;
		});		
		
		devices= _.keyBy(devices, "id");
		return bluebird.resolve({message: "Get all devices successful", result: devices});
	});
};

/** 
 * Returns the list of all devices
 * 
 * @method getDeviceInfo
 * @memberof db_simulator
 * @param {integer} id - device Id 
 * @return {object} - device info for a particular device
*/
var getDeviceInfo = function(id){	
	return db.device.findOne({
		where: {id: id},
		attributes: ["id", "name", "type_id", "client_id" ],		
		include: [{
			attributes: ["id"],			
			model: db.comm,
			required: true
		}, {
			model: db.latest_report,
			required: false
		}]
	})
	.then(function(device){
		if(!device) throw new Error("Could not find the devie. ID: "+id); 
				
		device= device.get({plain: true});
		return bluebird.resolve({message: "Get device successful", result: device});
	});
};


/** 
 * Returns the list of default canned messages loaded on the platform
 * 
 * @method getCannedList
 * @memberof db_simulator
 * @return {object} -  list of default canned messages loaded on the platform
*/
var getCannedList = function(){
	return db.canned_message_default.findAll({
		attributes: ["canned_number", "canned_message"]
	})
	.then(function(cannedMessageList){
		cannedMessageList = _.map(cannedMessageList, function(canned){
			return canned.get({plain: true});
		});

		return bluebird.resolve({message: "Get default canned message list successful", result: cannedMessageList});
	});
};


/** 
 * Returns the list of users under a client
 * 
 * @method getUserListForClient
 * @memberof db_simulator
 * @return {object} -  list of users under a client
*/
var getUserListForClient = function(clientId){
	return db.user.findAll({
		where: {client_id: clientId, username: {$ne: null}},
		include: [{
			model: db.comm,
			where: {table_name: "users"},
			attributes: ["id"]
		}]
	})
	.then(function(users){
		users = _.map(users, function(user){
			user = user.get({plain: true});
			
			user.comm_id = user.comms[0].id;
			user = _.omit(user, ["comms", "create_timestamp", 
				"password", "email", "image_id", "role_id", "token_data"]);
			return user;
		});

		users= _.keyBy(users, "id");
		return bluebird.resolve({message: "Get all users of client", result: users});
	});
};


/** 
 * Get list of all devices that having pending status for messages sent from platform to devices
 * 
 * @method getDevicesToSimulateMessageStatus
 * @memberof db_simulator
 * @return {object} -  list of all devices that having pending status for messages sent from platform to devices
*/
var getDevicesToSimulateMessageStatus = function(){
	return db.message_recipient_devices.findAll({
		where: {message_status: "pending"},
		attributes: ["message_id", "device_id", "message_status"],
		include: [{
			model: db.device,
			attributes: ["id", "name", "type_id", "client_id" ],
			required: false,
			include: [{
				attributes: ["id"],			
				model: db.comm,
				where: {table_name: "assets"},
				required: true
			}]
		}, {
			model: db.message,
			attributes: ["id", "message"],
			required: false
		}]
	})
	.then(function(statusData){
		statusData = _.map(statusData, function(data){
			data = data.get({plain: true});
			data.name = data.device.name;
			data.device_comm_id = data.device.comms[0].id;
			data.message_string = data.message.message;
			data.client_id = data.device.client_id;

			data = _.omit(data, ["device", "message"]);
			return data;
		});
	
		return bluebird.resolve({message: "Get all devices for message status successful", result: statusData});
	});
};


/** 
 * Get list of tactical devices for sync menu
 * 
 * @method getTacticalDevicesForSync
 * @memberof db_simulator
 * @return {object} -  list of tactical devices for sync menu
*/
var getTacticalDevicesForSync = function(){
	return db.device_mode.findOne({
		where: {title: "SCCT"}
	})
	.then(function(deviceMode){
		return db.device.findAll({
			where: {mode: deviceMode.id},
			attributes: ["id", "name", "client_id"],
			include: [{
				attributes: ["id"],			
				model: db.comm,
				where: {table_name: "assets"},
				required: true
			}]
		});
	})
	.then(function(devices){
		devices = _.map(devices, function(device){
			device = device.get({plain: true});
			device.comm_id = device.comms[0].id;
			device = _.omit(device, ["comms"]);
			return device;
		});

		devices = _.keyBy(devices, "id");
		return bluebird.resolve({message: "Get devices for sync menu successful", result: devices});
	});
};

module.exports={
	getDeviceList: getDeviceList,
	getClientList: getClientList,
	getDeviceInfo: getDeviceInfo,
	getCannedList: getCannedList,
	getUserListForClient: getUserListForClient,
	getDevicesToSimulateMessageStatus: getDevicesToSimulateMessageStatus,
	getTacticalDevicesForSync: getTacticalDevicesForSync,
	getDeviceListForClient: getDeviceListForClient
};