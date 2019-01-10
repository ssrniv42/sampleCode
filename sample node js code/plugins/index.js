const auditPlugin = require("../plugins/audit.js");
const syncPlugin = require("../plugins/sync/syncProcessor.js");
const messageAlert = require("../plugins/MessageAlert.js");
const geofenceAlert= require("../plugins/GeofenceAlert.js");
const emergencyAlert= require("../plugins/EmergencyAlert.js");
const speedAlert= require("../plugins/SpeedAlert.js");
const cargoAlert= require("../plugins/CargoAlert.js");
const nonReportAlert= require("../plugins/NonReportAlert.js");
const dbAlert= require("../db/db_alert");
const permission= require("../lib/permission");
const socket= require("../lib/socket");
const bluebird= require("bluebird");
const _= require("lodash");
const nonReportTimeouts= {};
const MAX_NO_REPORT_THRESHOLD= 259200000; //72 hours

// delay to add to threshold to make sure event is triggered after the previous report
const NO_REPORT_DELAY= 10000;

// initializes events to trigger non report alerts
initializeNonReportTimeoutEvents(null, true);

/**
 * Plugin Middleware
 * 
 * @module 
 */
module.exports= function(options){
	options= options || {};
	return function(req, res, next){
		if(next) next();
		pluginHandler(req, options);
	};	
};

/**
 * Handler invokes the respective plugin to be called based on module name
 * 
 * @param {Object} req request object
 * @param {Object} options contains info of moduleName if passed
 */
function pluginHandler(req, options){
	var moduleName= options.moduleName || utils.getModuleName(req);
	switch(moduleName){	
	case "report":				
		processAlert(emergencyAlert, req, "report");
		
		processAlert(nonReportAlert, req, "report")
		.then(report => {
			const deviceId= report.device_id;
			return initializeNonReportTimeoutEvents(deviceId);
		});
		
		processGeofenceAlert(req, "report")
		.then(()=> {
			// speed alert plugin needs to run after geofence alert plugin since			
			// it should not run for geofences that are already violated
			// by a given device
			return processAlert(speedAlert, req, "report");
		});
		break;
	case "cargo_status":
		processAlert(cargoAlert, req, "cargo_status");
		break;
	case "cargo_settings":
		processAlert(cargoAlert, req, "cargo_settings");
		break;
	case "geofence":		
		auditPlugin(req)
		.then(function(data){
			syncPlugin(req, "geofence", data.time);
		});
		processGeofenceAlert(req, "geofence")
		.then(()=> {
			processAlert(speedAlert, req, "geofence");
		});		
		break;
	case "device":
		var subModuleNameOfDevice = utils.getSubModuleName(req);
		if(subModuleNameOfDevice == "sync"){
			syncPlugin(req, "device", new Date().getTime());
		}
		else if(subModuleNameOfDevice == "message"){
			var messageData = req.result.result;
			messageAlert.processAlert(messageData);
		}
		else if(subModuleNameOfDevice == undefined){
			processAlert(speedAlert, req, "device");
			
			processAlert(nonReportAlert, req, "device")
			.then(device => {
				const deviceId= device.id;
				return initializeNonReportTimeoutEvents(deviceId);
			});
		}
		break;
	case "poi":
		syncPlugin(req, "poi", new Date().getTime());
		break;
	case "group":
		syncPlugin(req, "group", new Date().getTime());
		break;
	case "user":
		syncPlugin(req, "user", new Date().getTime());
		break;
	case "sync":
		var subModuleName = utils.getSubModuleName(req);
		if(subModuleName == "poi"){
			syncPlugin(req, "poi", new Date().getTime());
		}

		/*
		//If there is no sub module name then the edits are coming from 'Sync (put /sync)' module from platfor,
		if(subModuleName == undefined){
			syncPlugin(req, "sync", new Date().getTime());
		}*/
		break;
	default:
		throw new Error("Module name is not recognized by the Plugin Middleware.");		
	}	
}


/**
 * starts processing and alert based on type
 * @param {Object} alertObj instance of alert class to be processed
 * @param {Object} req request object
 * @param {String} action type of plugin action being triggered
 */
function processAlert(alertObj, req, action){
	return alertObj.processAlert(req.result.result, action)
	.then(alerts => {
		if(!alerts.length) return bluebird.resolve();

		const user= req.user;		
		let permittedUsers= req.permittedUsers;	
		return sendAlertSocket(user, permittedUsers, alerts, false);
	})
	.then(()=> {		
		return bluebird.resolve(req.result.result);
	});
}


/**
 * runs geo-fence alert plugin and sends socket if there are changes
 * @param {Object} req request object
 * @param {String} action action type
 */
function processGeofenceAlert(req, action){
	return geofenceAlert.processAlert(req.result.result, action)
	.then(alerts => {
		return sendGeofenceAlertSocket(req, alerts);				
	});
}


/**
 * sends socket data for geo-fence alerts
 * @param {Object} req request object
 * @param {Array | Object} alerts alert data object
 */
function sendGeofenceAlertSocket(req, alerts){	
	if(!alerts.length) return bluebird.resolve();
	
	const user= req.user;		
	let permittedUsers=req.permittedUsers;	
	return permission.getPermittedUsers(user, "geofence")	
	.then(geofenceUsers => {
		// remove users that are not permitted to view geofence
		permittedUsers= _.intersection(permittedUsers, geofenceUsers);
		return sendAlertSocket(user, permittedUsers, alerts, true);
	});	
}

/**
 * Sends socket object to clients with access rights to view the alert
 * @param {Object} user user object corresponding to the action
 * @param {Array} permittedUsers list of permitted user ids
 * @param {Array} alerts list of alerts being sent
 */
function sendAlertSocket(user, permittedUsers, alerts, isGeofence){
	return permission.getPermittedUsers(user, "alarm")
	.then(alarmUsers => {			
		// remove users that are not permitted to view alarms
		permittedUsers= _.intersection(permittedUsers, alarmUsers);
		
		return bluebird.map(alerts, function(alert){
			return permission.getPermittedUserIdsForDevice(alert.device_id)
			.then(function(deviceUsers){
				permittedUsers = _.intersection(permittedUsers, deviceUsers);

				return dbAlert.getAlertsById(user, [alert.id]);
			})
			.then(data=> {
				let dummyRequest= {
					socketEvent: "post:/alert",
					user: user,
					permittedUsers: permittedUsers,
					result: {result: data.alertData}
				};
	
				if(isGeofence == true){
					dummyRequest.result = {result: data.geoAlertData};
				}
	
				return socket.socketHandler(dummyRequest);
			});
		});
	});	
}


/**
 * generates timeout event for non report alert based on device settings
 * @param {Array} deviceIds list of device ids to reset the timeout for. would be all if null.
 * @param {Boolean} triggerPlugin whether or not to force the plugin to run calculation
 */
function initializeNonReportTimeoutEvents(deviceIds, triggerPlugin){
	const whereObj= (deviceIds)? {id: deviceIds} : {};
	return db.device.findAll({
		where: whereObj,
		include: [{
			model: db.latest_report
		}]
	})
	.then(devices => {
		return bluebird.map(devices, device => {
			setDeviceNonReportTimeoutEvent(device, triggerPlugin);
			return bluebird.resolve();
		});
	});
}


/**
 * sets the timeout event for a device based on its threshold for non report
 * @param {Object} device device object
 * @param {Boolean} triggerPlugin whether or not to force the plugin to run calculation
 */
function setDeviceNonReportTimeoutEvent(device, triggerPlugin){
	if(device.non_report_threshold == null || device.non_report_threshold > MAX_NO_REPORT_THRESHOLD) return;

	log.info("NonReport alert event for device ID", device.id, "will run in", device.non_report_threshold, "milliseconds.");

	const dummyRequest= {
		result: {
			result: device
		},
		user: {
			client_id: device.client_id
		}
	};

	clearNonReportTimeout(device.id);

	nonReportTimeouts[device.id]= setTimeout(function(){		
		processAlert(nonReportAlert, dummyRequest, "report_timeout");
	}, device.non_report_threshold+ NO_REPORT_DELAY);

	// force run the plugin without waiting for timeout
	if(triggerPlugin){
		processAlert(nonReportAlert, dummyRequest, "report_timeout");		
	}	
}

/**
 * clears the non report event if one is already in progress
 * @param {Number} deviceId device id
 */
function clearNonReportTimeout(deviceId){
	if(nonReportTimeouts[deviceId]){
		clearTimeout(nonReportTimeouts[deviceId]);
		nonReportTimeouts[deviceId]= null;
	}
}