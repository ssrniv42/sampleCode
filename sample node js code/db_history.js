/* global db */

/*
	History Mechanics
*/

/* 
	This file contains all DB mechanics related to the history module
*/
var bluebird = require("bluebird");
var dbDevice = require("./db_device.js");
var _ = require("lodash");


/**
 * Get historic data from search query
 * 
 * @method getHistory
 * @memberof db_history
 * @return {object} - object containing info of historic data that matches the search query
*/
var getHistory = function(user, params){
	let historicData = {
		report: {
			template: ["report_id", "device_id", "event_timestamp", 
				"latitude", "longitude", "altitude", "speed", "heading"],
			data: []
		},
		emergency: {
			template: ["alert_id", "device_id", "alert_started", "event_timestamp", "report_id"],
			data: []
		},
		speed: {
			template: ["alert_id", "device_id", "alert_started", "event_timestamp", "geofence_id", "report_id"],
			data: []
		},
		geofence: {
			template: ["alert_id", "device_id", "alert_started", "event_timestamp", "geofence_id", "report_id"],
			data: []
		},
		non_report: {
			template: ["alert_id", "device_id", "alert_started", "event_timestamp", "report_id"],
			data: []
		},
		cargo: {
			template: ["alert_id", "device_id", "alert_started", "event_timestamp", "status", "cargo_alert_type_id", "report_id"],
			data: []
		},
		alert_report_ids: [],
		report_ids: []
	};
	

	return validateAndGetPermittedDevices(user, params)
	.then(function(permittedDeviceIds){
		return processGetHistory(permittedDeviceIds, params, historicData);
	})
	.then(function(){
		historicData = _.omit(historicData, ["report_ids", "alert_report_ids"]);
		historicData.report.data = _.sortBy(historicData.report.data, [function(index){ return index[2]; }]);

		return bluebird.resolve({message: "GET Historic Data Successfull", result: historicData});
	});
};

/**
 * Get size of historic data set
 * 
 * @method getSizeOfHistoricData
 * @memberof db_history
 * @return {object} - promise indicating end of process
*/
var getSizeOfHistoricData = function(user, params){

	return validateAndGetPermittedDevices(user, params)
	.then(function(permittedDeviceIds){
		const whereClauseForReport = {
			device_id: {$in: [permittedDeviceIds]},
			$and: [{report_timestamp: {$gte: params.start_timestamp}}, {report_timestamp: {$lte: params.end_timestamp}}]
		};
		return getReportCount(whereClauseForReport);
	})
	.then(function(reportCount){
		return bluebird.resolve({message: "GET Validate Historic Data Successfull", result: reportCount});
	});
	
};


/**
 * Queries and processes report and alert data to build histric data within the timeframe provided in the request 
 * Throws error if no devices to search
 * 
 * @method getReportsForDevices
 * @memberof db_history
 * @return {object} - promise indicating end of process and modified historicData object
*/
function processGetHistory(deviceIds, params, historicData){
	const whereClauseForReport = {
		device_id: {$in: [deviceIds]},
		$and: [{report_timestamp: {$gte: params.start_timestamp}}, {report_timestamp: {$lte: params.end_timestamp}}]
	};

	return getPreviousStateOfReportsForAllDevices(deviceIds, params, historicData)
	.then(function(){
		return getPreviousStateOfAlertsForAllDevices(deviceIds, params, historicData);
	})
	.then(function(){
		return getReportsForDevices(historicData, whereClauseForReport);
	})
	.then(function(){
		const whereClauseForAlert = {
			device_id: {$in: deviceIds},
			$or: [
				{start_timestamp: {$gte: params.start_timestamp}, $and: {start_timestamp: {$lte: params.end_timestamp}}},
				{end_timestamp: {$gte: params.start_timestamp}, $and: {end_timestamp: {$lte: params.end_timestamp}}}
			]
		};

		return getAlertsForDevices(deviceIds, params, historicData, whereClauseForAlert);
	})
	.then(function(){
		//complete the data set by appending missing reports that gives location of where the alert was started or ended 
		let reportIdsToAppend = _.difference(historicData.alert_report_ids, historicData.report_ids);

		const whereClauseForReportsOfAlerts = {
			id: {$in: reportIdsToAppend}
		};

		return getReportsForDevices(historicData, whereClauseForReportsOfAlerts);
	});
}

/**
 * Filters out devices that the user has permission to view
 * 
 * @method validateAndGetPermittedDevices
 * @memberof db_history
 * @return {array} - array of device ids that user has permission to search historic data for
*/
function validateAndGetPermittedDevices(user, params){
	let deviceIds;
	return dbDevice.getPermittedDevices(user)
	.then(function(permittedDevices){
		var permittedDeviceIds = _.map(permittedDevices, "id");
		deviceIds = _.intersection(permittedDeviceIds, params.device_ids);

		if(deviceIds.length == 0){
			log.warn("User is not permitted to see historic data for any of the specified devices");
			throw new Error("User is not permitted to see historic data for any of the specified devices");
		}
		return bluebird.resolve(deviceIds);
	});
}

/**
 * Gets the size report data for the historic replay
 * 
 * @method getReportCount
 * @memberof db_history
 * @return {object} - promise indicating end of process and modified historicData object
*/
function getReportCount(whereClause){
	return db.report.count({
		where: whereClause
	})
	.then(function(reportCount){
		//Report Limit
		if(reportCount == undefined){
			throw new Error("Failed to get report count");
		}
		return bluebird.resolve(reportCount);
	});
}


/**
 * Queries and processes report data for devices for a time just before the start time of the historic replay
 * This is used to pre-populate the map with the location of the device before the replay starts 
 * 
 * @method getPreviousStateOfReportsForAllDevices
 * @memberof db_history
 * @return {object} - promise indicating end of process and modified historicData object
*/
function getPreviousStateOfReportsForAllDevices(deviceIds, params, historicData){
	return db.report.findAll({
		raw: true,
		attributes: [
			"device_id", 
			[db.sequelize.fn("max", db.sequelize.col("id")), "id"], 
			[db.sequelize.fn("max", db.sequelize.col("report_timestamp")), "report_timestamp"]
		],
		where: {
			device_id: {$in: [deviceIds]},
			report_timestamp: {$lt: params.start_timestamp}
		},
		group: ["device_id"]
	})
	.then(function(maxReportData){
		let reportIds = _.map(maxReportData, "id");
		if(reportIds.length > 0){
			const whereClause = {id: {$in: [reportIds]}};
			return getReportsForDevices(historicData, whereClause);
		}
		return bluebird.resolve();
	});
}


/**
 * Queries and processes alert data for devices for a time just before the start time of the historic replay
 * This is used to pre-populate the map with any alerts that the device is already violating before the replay starts 
 * 
 * @method getPreviousStateOfAlertsForAllDevices
 * @memberof db_history
 * @return {object} - promise indicating end of process and modified historicData object
*/
function getPreviousStateOfAlertsForAllDevices(deviceIds, params, historicData){
	return db.alert.findAll({
		raw: true,
		attributes: [
			"device_id",
			[db.sequelize.fn("max", db.sequelize.col("id")), "id"], 
			[db.sequelize.fn("max", db.sequelize.col("start_timestamp")), "start_timestamp"]
		],
		where: {
			device_id: {$in: [deviceIds]},
			start_timestamp: {$lt: params.start_timestamp},
			$or: [
				{end_timestamp: {$gt: params.start_timestamp}},
				{end_timestamp: null}
			]
		},
		group: ["device_id"]
	})
	.then(function(maxAlertData){
		let alertIds = _.map(maxAlertData, "id");

		if(alertIds.length > 0){
			const whereClause = {id: {$in: [alertIds]}};
			return queryAlertData(whereClause)
			.then(function(alertData){
				return bluebird.map(alertData, function(alert){
					alert = alert.get({plain: true});
					alert.startInfo = [alert.id, alert.device_id, true, alert.start_timestamp];
					alert.endInfo = [];
					return processAlertBasedOnType(alert, alert.alert_type.type, historicData);
				});
			});
		}
		return bluebird.resolve();
	});
}


/**
 * Queries and returns all report data related to devices,
 * within the timeframe provided in the search query
 * 
 * @method getReportsForDevices
 * @memberof db_history
 * @return {object} - object containing info of report data that matches the search query
*/
function getReportsForDevices(historicData, whereClause){
	return db.report.findAll({
		attributes: ["id", "device_id", "latitude", "longitude", "altitude", "heading", "speed", "report_timestamp"],
		where: whereClause,
		order: "report_timestamp"
	})
	.then(function(reportData){
		return refineDeviceReportData(reportData, historicData);
	});
}

/**
 * Builds the report object for each report logged for device, in the format expected in the front end
 * 
 * @method refineDeviceReportData
 * @memberof db_history
 * @return {object} - modified historicData object with array of report objects appended to historicData.reports
*/
function refineDeviceReportData(reportData, historicData){
	_.each(reportData, function(report){
		const reportInfoArray = [report.id, report.device_id, report.report_timestamp, 
			report.latitude, report.longitude, report.altitude, report.speed, report.heading];

		historicData.report.data.push(reportInfoArray);
		historicData.report_ids.push(report.id);
	});

	return bluebird.resolve();
}

/**
 * Queries and returns all alert data related to devices,
 * within the timeframe provided in the search query
 * 
 * @method geAlertAlertData
 * @memberof db_history
 * @return {object} - promise indicating end of process and modified historicData object
*/
function getAlertsForDevices(deviceIds, params, historicData, whereClause){
	return queryAlertData(whereClause)
	.then(function(alertData){
		return refineAlertData(alertData, historicData, params);
	});
}

/**
 * Function runs the sequelize query to get aleert data for the whereClause passed to the function
 * 
 * @method queryAlertData
 * @memberof db_history
 * @return {object} - object containing list of alert data that matches the search query
*/
function queryAlertData(whereClause){
	return db.alert.findAll({
		where: whereClause,
		include: [{
			model: db.alert_type,
			required: true
		}, {
			as: "EmergencyAlertManager",
			model: db.emergency_alert_manager,
			required: false
		}, {
			as: "GeofenceAlertManager",
			model: db.geofence_alert_manager,
			required: false
		}, {
			as: "SpeedAlertManager",
			model: db.speed_alert_manager,
			required: false
		}, {
			as: "NonReportAlertManager",
			model: db.non_report_alert_manager,
			required: false
		}, {
			as: "CargoAlertManager",
			model: db.cargo_alert_manager,
			required: false,
			include: [{
				model: db.cargo_status,
				as: "StartStatus",
				required: false
			}, {
				model: db.cargo_status,
				as: "EndStatus",
				required: false
			}]
		}]
	});
}


/**
 * Processes and Builds the alert info object for each alert logged for device, 
 * in the format expected in the front end
 * 
 * @method refineAlertData
 * @memberof db_history
 * @return {object} - modified historicData object with array of alert objects appended to their repective parameters 
*/
function refineAlertData(alertData, historicData, params){
	return bluebird.map(alertData, function(alert){
		alert = alert.get({plain: true});

		return findApproriateStartAndEndAlerts(alert, params)
		.then(function(){
			return processAlertBasedOnType(alert, alert.alert_type.type, historicData);
		});
	})
	.then(function(){
		historicData.emergency.data = _.sortBy(historicData.emergency.data, [function(index){ return index[3]; }]);
		historicData.geofence.data = _.sortBy(historicData.geofence.data, [function(index){ return index[3]; }]);
		historicData.speed.data = _.sortBy(historicData.speed.data, [function(index){ return index[3]; }]);
		historicData.non_report.data = _.sortBy(historicData.non_report.data, [function(index){ return index[3]; }]);
		historicData.cargo.data = _.sortBy(historicData.cargo.data, [function(index){ return index[3]; }]);
		return bluebird.resolve();
	});
}


/**
 * Builds the alert info object for each alert logged for device by making sure that 
 * it falls withing the bounds of teh search query
 * 
 * @method findApproriateStartAndEndAlerts
 * @memberof db_history
 * @return {object} - modified alert object with respective start and end info 
*/
function findApproriateStartAndEndAlerts(alert, params){
	alert.startInfo = [];
	alert.endInfo = [];

	//alert.startInfo = [alert.id, alert.device_id, true, alert.start_timestamp];
	if(
		alert.start_timestamp >= params.start_timestamp && 
		alert.start_timestamp <= params.end_timestamp
	){
		alert.startInfo = [alert.id, alert.device_id, true, alert.start_timestamp];
	}

	if(
		alert.end_timestamp != null && 
		alert.end_timestamp >= params.start_timestamp && 
		alert.end_timestamp <= params.end_timestamp
	){
		alert.endInfo = [alert.id, alert.device_id, false, alert.end_timestamp];
	}

	return bluebird.resolve();
}

/**
 * Processes and appends the start and end alert info to the respective historicData obj parameter based on alert type
 * 
 * @method processAlertBasedOnType
 * @memberof db_history
 * @return {object} - modified historicData object 
*/
function processAlertBasedOnType(alert, alertType, historicData){
	switch(alertType) {
	case "Emergency":
		return processEmergencyAlertInfo(alert, historicData);
	case "Geofence":
		return processGeofenceAlertInfo(alert, historicData);
	case "Speed":
		return processSpeedAlertInfo(alert, historicData);
	case "Non-Report":
		return processNonReportAlertInfo(alert, historicData);
	case "Cargo":
		return processCargoAlertInfo(alert, historicData);
	default:
		return bluebird.resolve();
	}
}

/**
 * Processes and appends the start and end alert info to the respective historicData.emergency array
 * 
 * @method processEmergencyAlertInfo
 * @memberof db_history
 * @return {object} - modified historicData.emergency.data array 
*/
function processEmergencyAlertInfo(alert, historicData){
	if(alert.startInfo.length > 0){
		alert.startInfo.push(alert.EmergencyAlertManager.start_report_id);
		historicData.emergency.data.push(alert.startInfo);
		historicData.alert_report_ids.push(alert.EmergencyAlertManager.start_report_id);
	}

	if(alert.endInfo.length > 0){
		alert.endInfo.push(alert.EmergencyAlertManager.end_report_id);
		historicData.emergency.data.push(alert.endInfo);
		historicData.alert_report_ids.push(alert.EmergencyAlertManager.end_report_id);
	}

	return bluebird.resolve();
}

/**
 * Processes and appends the start and end alert info to the respective historicData.geofence array
 * 
 * @method processGeofenceAlertInfo
 * @memberof db_history
 * @return {object} - modified historicData.geofence.data array 
*/
function processGeofenceAlertInfo(alert, historicData){
	if(alert.GeofenceAlertManager != null){
		if(alert.startInfo.length > 0){
			alert.startInfo.push(alert.GeofenceAlertManager.geofence_id);
			alert.startInfo.push(alert.GeofenceAlertManager.start_report_id);
			historicData.geofence.data.push(alert.startInfo);
			historicData.alert_report_ids.push(alert.GeofenceAlertManager.start_report_id);
		}
	
		if(alert.endInfo.length > 0){
			alert.endInfo.push(alert.GeofenceAlertManager.geofence_id);
			alert.endInfo.push(alert.GeofenceAlertManager.end_report_id);
			historicData.geofence.data.push(alert.endInfo);
			historicData.alert_report_ids.push(alert.GeofenceAlertManager.end_report_id);
		}
	}
	return bluebird.resolve();
}

/**
 * Processes and appends the start and end alert info to the respective historicData.speed array
 * 
 * @method processSpeedAlertInfo
 * @memberof db_history
 * @return {object} - modified historicData.speed.data array 
*/
function processSpeedAlertInfo(alert, historicData){
	if(alert.SpeedAlertManager != null){
		if(alert.startInfo.length > 0){
			alert.startInfo.push(alert.SpeedAlertManager.geofence_id);
			alert.startInfo.push(alert.SpeedAlertManager.start_report_id);
			historicData.speed.data.push(alert.startInfo);
			historicData.alert_report_ids.push(alert.SpeedAlertManager.start_report_id);
		}
	
		if(alert.endInfo.length > 0){
			alert.endInfo.push(alert.SpeedAlertManager.geofence_id);
			alert.endInfo.push(alert.SpeedAlertManager.end_report_id);
			historicData.speed.data.push(alert.endInfo);
			historicData.alert_report_ids.push(alert.SpeedAlertManager.end_report_id);
		}
	}
	return bluebird.resolve();
}

/**
 * Processes and appends the start and end alert info to the respective historicData.non_report array
 * 
 * @method processNonReportAlertInfo
 * @memberof db_history
 * @return {object} - modified historicData.non_report.data array 
*/
function processNonReportAlertInfo(alert, historicData){
	if(alert.startInfo.length > 0){
		alert.startInfo.push(alert.NonReportAlertManager.start_report_id);
		historicData.non_report.data.push(alert.startInfo);
		historicData.alert_report_ids.push(alert.NonReportAlertManager.start_report_id);
	}

	if(alert.endInfo.length > 0){
		alert.endInfo.push(alert.NonReportAlertManager.end_report_id);
		historicData.non_report.data.push(alert.endInfo);
		historicData.alert_report_ids.push(alert.NonReportAlertManager.end_report_id);
	}

	return bluebird.resolve();
}


/**
 * Processes and appends the start and end alert info to the respective historicData.cargo array
 * 
 * @method processCargoAlertInfo
 * @memberof db_history
 * @return {object} - modified historicData.cargo.data array 
*/
function processCargoAlertInfo(alert, historicData){
	if(alert.CargoAlertManager != null){
		if(alert.startInfo.length > 0){
			alert.startInfo.push(alert.CargoAlertManager.StartStatus);
			alert.startInfo.push(alert.CargoAlertManager.cargo_alert_type_id);
			alert.startInfo.push(alert.CargoAlertManager.start_report_id);
			historicData.cargo.data.push(alert.startInfo);
			historicData.alert_report_ids.push(alert.CargoAlertManager.start_report_id);
		}
	
		if(alert.endInfo.length > 0){
			alert.endInfo.push(alert.CargoAlertManager.EndStatus);
			alert.endInfo.push(alert.CargoAlertManager.cargo_alert_type_id);
			alert.endInfo.push(alert.CargoAlertManager.end_report_id);
			historicData.cargo.data.push(alert.endInfo);
			historicData.alert_report_ids.push(alert.CargoAlertManager.end_report_id);
		}
	}

	return bluebird.resolve();
}

module.exports={
	getHistory: getHistory,
	getSizeOfHistoricData: getSizeOfHistoricData
};