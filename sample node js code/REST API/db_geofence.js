/* global  db */
/*
	This file contains all the server side mechanics 
	that interacts with the geofence module on the SCC Titan Platform
*/
var bluebird = require("bluebird");
var _ = require("lodash");
var dbPermission= require("./db_permission.js");
var dbGroup = require("./db_group.js");
var dbDevice = require("./db_device.js");


/**
 * Gets the list of geofences that the requesting user is allowed to view based on his/her role
 *  
 * @method getAllGeofence
 * @memberof db_geofence
 * @param {object} geofence - geofence information object 
 * @return {Object} a promise containing 'message' (status message) and 'result' (list of all geofences that belong to the client group)
 */
var getAllGeofence = function(user){
	return db.geofence.findAll({
		where: {client_id: user.client_id},
		include: [{
			model: db.geofence_coordinate,
			as: "coordinates",
			attributes: ["longitude", "latitude"],
			required: true
		}, {
			model: db.device,
			as: "DeviceTriggers",
			attributes: ["id"],
			required: false
		}, {
			model: db.group,
			as: "GroupTriggers",
			attributes: ["id"],
			required: false
		}, {
			model: db.device,
			as: "SyncedDevices",
			attributes: ["id"],
			required: false
		}]
	})
	.then(function(geofences){
		geofences = _.map(geofences, function(geofence){
			return refineGeofenceData(geofence);
		});
		geofences = _.keyBy(geofences, "id");
		return bluebird.resolve({message: "Get all Geofences successfull", result: geofences});
	});	
};


/** 
 * Returns info for a particular Geofence
 * 
 * @method getGeofenceById
 * @memberof db_geofence
 * @param {integer} id - geofence Id
 * @return {object} - info related to a particular geofence
*/
var getGeofenceById = function(id){
	return db.geofence.findOne({
		where: {id: id},
		include: [{
			model: db.geofence_coordinate,
			as: "coordinates",
			attributes: ["longitude", "latitude"],
			required: true
		}, {
			model: db.device,
			as: "DeviceTriggers",
			attributes: ["id"],
			required: false
		}, {
			model: db.group,
			as: "GroupTriggers",
			attributes: ["id"],
			required: false
		}, {
			model: db.device,
			as: "SyncedDevices",
			attributes: ["id"],
			required: false
		}]
	})
	.then(function(geofence){
		if(!geofence){
			throw new Error("Geofence not found for ID: ", id);
		}	
		return bluebird.resolve({message: "Get Geofence by Id successfull", result: refineGeofenceData(geofence), $raw: geofence});	
	});			
};

/** 
 * Adds new geofence into the DB and references it to the user's client group
 * 
 * @method postGeofence
 * @memberof db_geofence
 * @param {object} user - user information object
 * @param {object} geofenceData - object containing values necessary to successfully add the geofence
 * @return {object} - object containing info of newly created geofence and status message
*/
var postGeofence = function(user, geofenceData){
	return db.sequelize.transaction(function(t){
		var dbGeofence = db.geofence.build(geofenceData);
		return dbGeofence.save({transaction: t})
		//Add coordinates
		.tap(function(geofence){
			return bluebird.map(geofenceData.coordinates, function(coord){
				coord.geofence_id = geofence.id;
				return db.geofence_coordinate.create(coord, {transaction: t});
			});
		})
		//Add device triggers
		.tap(function(geofence){
			if(geofenceData.triggers && geofenceData.triggers.devices != undefined) {
				return dbPermission.validateUserPermissionForDevices(user, geofenceData.triggers.devices)
				.then(function(){
					return geofence.addDeviceTriggers(geofenceData.triggers.devices, {transaction: t});
				});
			}
			else return bluebird.resolve();
		})
		//Add group triggers
		.tap(function(geofence){
			if(geofenceData.triggers && geofenceData.triggers.groups != undefined) {
				return dbPermission.validateUserPermissionForGroups(user, geofenceData.triggers.groups)
				.then(function(){
					return geofence.addGroupTriggers(geofenceData.triggers.groups, {transaction: t});
				});
			}
			else return bluebird.resolve();
		})
		//Add synced devices
		.tap(function(geofence){
			if(geofenceData.sync && geofenceData.sync.devices != undefined) {
				return dbPermission.validateUserPermissionForDevices(user, geofenceData.sync.devices)
				.then(function(){
					return geofence.addSyncedDevices(geofenceData.sync.devices, {transaction: t});
				});
			} 
			else return bluebird.resolve();
		});
	})//end transaction
	.then(function(geofence){
		return getGeofenceById(geofence.id);
	})
	.then(function(geofence){
		return bluebird.resolve({message: "Post Geofence successful", result: geofence.result});
	});
};


/** 
 * Updates info for a particular Geofence
 * 
 * @method putGeofence
 * @memberof db_geofence
 * @param {object} user - user information object
 * @param {integer} id - id of the geofence being updated
 * @param {object} geofenceData - object containing geofence info that needs to be updated
 * @return {object} - object containing updated info of geofence and status message
*/
var putGeofence = function(user, id, geofenceData){
	var originalGeofence = {};
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		
		return getGeofenceById(id)
		.then(function(geofence){
			//Getting unrefined sequelize geofence instance 
			originalGeofence = geofence.result;
			return geofence.$raw;
		})
		.tap(function(geofence){
			// Extending the geofence object from the DB with the object provided in the request.
			// The request object may only provide fields that has changed.
			geofence = _.extend(geofence, geofenceData);
			return geofence.save({transaction: options.transaction});
		})
		//Update device triggers
		.tap(function(geofence){
			if(geofenceData.triggers && geofenceData.triggers.devices != undefined){
				return updateGeofenceTriggerDevices(geofence, geofenceData.triggers.devices, options);
			}
			else return bluebird.resolve();
		})
		//Update group triggers
		.tap(function(geofence){
			if(geofenceData.triggers && geofenceData.triggers.groups != undefined) {
				return updateGeofenceTriggerGroups(geofence, geofenceData.triggers.groups, options);
			}
			else return bluebird.resolve();
		})
		//Update synced devices
		.tap(function(geofence){
			if(geofenceData.sync && geofenceData.sync.devices != undefined){
				return updateGeofenceSyncedDevices(geofence, geofenceData.sync.devices, options);
			}
			else return bluebird.resolve();
		})
		//Update coordinates
		.then(function(){
			if(geofenceData.coordinates != undefined) return updateGeofenceCoordinates(id, geofenceData, options);
			else return bluebird.resolve();
		});
	})//end transaction
	.then(function(){
		return getGeofenceById(id);
	})
	.then(function(geofence){
		var updatedGeofence = geofence.result;	
		return bluebird.resolve({message: "Put Geofence successful", result: updatedGeofence, $originalData: originalGeofence});
	});	
};

/** 
 * Deletes the record for an existing geofence
 * 
 * @method deleteGeofence
 * @memberof db_geofence
 * @param {object} user - user information object
 * @param {integer} id - id of the geofence being deleted
 * @return {object} - object containing info of deleted geofence and status message 
*/
var deleteGeofence = function(user, id){
	var geoData = {};
	return db.sequelize.transaction(function(t){
		return getGeofenceById(id)
		.then(function(geofence){
			//Getting unrefined sequelize geofence instance 
			geoData = geofence.result;
			return geofence.$raw;
		})		
		//delete geofence coordinate
		.tap(function(geofence){
			return db.geofence_coordinate.destroy({where: {geofence_id: geofence.id}, transaction: t});
		})
		//Delete device triggers
		.tap(function(geofence){
			return geofence.setDeviceTriggers([], {transaction: t});
		})
		//Delete group triggers
		.tap(function(geofence){
			return geofence.setGroupTriggers([], {transaction: t});
		})
		//Delete synced devices
		.tap(function(geofence){
			return geofence.setSyncedDevices([], {transaction: t});
		})
		//Delete from cargo_geofences
		.tap(function(geofence){
			return db.sequelize.query("DELETE FROM cargo_geofences WHERE geofence_id = ?", {replacements: [geofence.id], transaction: t});
		})
		//End all alerts triggered by the geofence (speed and geofence) and remove data from speed and geo alert manager tables
		.tap(function(geofence){
			return processAndDeleteGeoAlerts(geofence, geoData, {transaction: t});
		})
		//Delete from geofence_new
		.tap(function(geofence){
			return geofence.destroy({transaction: t});
		});
	})//end transaction
	.then(function(){
		return bluebird.resolve({message: "Delete Geofence successful", result: geoData});
	});
};


function processAndDeleteGeoAlerts(geofence, geoData, options){
	var alertIds = [];
	return db.speed_alert_manager.findAll({
		where: {geofence_id: geofence.id, end_report_id: null},
		transaction: options.transaction
	})
	.then(function(speedAlertData){
		_.each(speedAlertData, function(speed){
			speed = speed.get({plain: true});
			alertIds.push(speed.alert_id);
			return;
		});
	
		return db.geofence_alert_manager.findAll({
			where: {geofence_id: geofence.id, end_report_id: null},
			transaction: options.transaction
		});
	})
	.then(function(geoAlertData){
		_.each(geoAlertData, function(geo){
			geo = geo.get({plain: true});
			alertIds.push(geo.alert_id);
			return;
		});

		alertIds = _.uniq(alertIds);
		
		geoData.deleted_alert_ids = alertIds;

		return db.speed_alert_manager.destroy({
			where: {geofence_id: geofence.id},
			transaction: options.transaction
		});
		
	})
	.then(function(){
		db.alert_acknowledgements.destroy({
			where: {alert_id: {$in: alertIds}},
			transaction: options.transaction
		});
	})
	.then(function(){
		return db.geofence_alert_manager.destroy({
			where: {geofence_id: geofence.id},
			transaction: options.transaction
		});
	})
	.then(function(){
		return db.alert.destroy({
			where: {id: {$in: alertIds}},
			transaction: options.transaction
		});
	});
}

/** 
 * Refines the geo data object to match expectation on the front end.
 * @method refineGeofenceData
 * @memberof db_geofence
 * @param {object} rawGeofence - object containing data related to a geofence as returned by sequelize query
 * @return {object} - refined geofence object, with parameters matching expectation on the front end
*/
function refineGeofenceData(rawGeofence){
	var geofence = rawGeofence.get({plain: true});
	geofence.triggers = {
		devices: _.map(geofence.DeviceTriggers, "id"),
		groups: _.map(geofence.GroupTriggers, "id")
	};
	geofence.sync = {
		devices: _.map(geofence.SyncedDevices, "id"),
		groups: []
	};
		
	geofence = _.omit(geofence, ["DeviceTriggers", "GroupTriggers", "SyncedDevices"]);	
	return geofence; 
}

/** 
 * Updates coordinates of a geofence
 * @method updateGeofenceCoordinates
 * @memberof db_geofence
 * @param {int} id - id of the geofence
 * @param {object} geofenceData - object containing data related to a geofence
 * @param {object} options - object containing transaction info passed along the chain
 * @return {object} - Object of modified geofence after update.
*/
function updateGeofenceCoordinates(id, geofenceData, options){
	return db.geofence_coordinate.destroy({where: {geofence_id: id}, transaction: options.transaction})
	.then(function(){
		return bluebird.map(geofenceData.coordinates, function(coord){
			coord.geofence_id = id;
			return db.geofence_coordinate.create(coord, {transaction: options.transaction});
		});
	});	
}

/** 
 * Processes and updates trigger groups of the geofence
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateGeofenceTriggerGroups
 * @memberof db_geofence
 * @param {object} geofence - object containing geofence instance that needs to be updated
 * @param {array} triggerGroups - array containing id's of triggers who are groups
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateGeofenceTriggerGroups(geofence, triggerGroups, options){
	return dbGroup.getPermittedGroups(options.user)
	.then(function(groups){
		return bluebird.resolve(_.map(groups, "id"));
	})
	.tap(function(permittedGroups){
		return geofence.removeGroupTriggers(permittedGroups, {transaction: options.transaction});
	})
	.tap(function(permittedGroups){
		var finalTriggerGroups = _.intersection(permittedGroups, triggerGroups);
		return geofence.addGroupTriggers(finalTriggerGroups, {transaction: options.transaction});
	});
}


/** 
 * Processes and updates trigger devices of the geofence
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateGeofenceTriggerDevices
 * @memberof db_geofence
 * @param {object} geofence - object containing geofence instance that needs to be updated
 * @param {array} triggerDevices - array containing id's of triggers who are devices
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateGeofenceTriggerDevices(geofence, triggerDevices, options){
	return dbDevice.getPermittedDevices(options.user)
	.then(function(devices){
		return bluebird.resolve(_.map(devices, "id"));
	})
	.tap(function(permittedDevices){
		return geofence.removeDeviceTriggers(permittedDevices, {transaction: options.transaction});
	})
	.tap(function(permittedDevices){
		var finalTriggerDevices = _.intersection(permittedDevices, triggerDevices);
		return geofence.addDeviceTriggers(finalTriggerDevices, {transaction: options.transaction});
	});
}


/** 
 * Processes and updates synced devices of the geofence
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updateGeofenceSyncedDevices
 * @memberof db_geofence
 * @param {object} geofence - object containing geofence instance that needs to be updated
 * @param {array} syncedDevices - array containing id's of synced devices
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updateGeofenceSyncedDevices(geofence, syncedDevices, options){
	return dbDevice.getPermittedDevices(options.user)
	.then(function(devices){
		return bluebird.resolve(_.map(devices, "id"));
	})
	.tap(function(permittedDevices){
		return geofence.removeSyncedDevices(permittedDevices, {transaction: options.transaction});
	})
	.tap(function(permittedDevices){
		var finalSyncedDevices = _.intersection(permittedDevices, syncedDevices);
		return geofence.addSyncedDevices(finalSyncedDevices, {transaction: options.transaction});
	});
}


module.exports = {
	getAllGeofence: getAllGeofence,
	getGeofenceById: getGeofenceById,
	postGeofence: postGeofence,
	putGeofence: putGeofence,
	deleteGeofence: deleteGeofence
};



