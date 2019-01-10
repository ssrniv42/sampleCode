/* global utils */
"use strict";

var express= require("express");
var router= express.Router();
var socket= require("../lib/socket.js");
var plugin= require("../plugins");
var dbGeofence = require("../db/db_geofence.js");
var permission= require("../lib/permission.js");
var validate = require("../validation");
var bluebird= require("bluebird");

/**
 * @apiDefine GeofenceSuccessError
 * @apiSuccess 	{Object[]} 	result 							Info related to a gefence
 * @apiSuccess 	{Number} 	result.id 						Geo-Fence Id
 * @apiSuccess 	{String} 	result.title 					Geo-Fence title
 * @apiSuccess 	{String} 	result.note 					Geo-Fence note
 * @apiSuccess 	{String} 	result.shape 					Geo-Fence shape
 * @apiSuccess 	{Boolean} 	result.inclusive 				Geo-Fence inclusion status
 * @apiSuccess 	{Boolean} 	result.active	 				Geo-Fence active status
 * @apiSuccess 	{Number} 	result.min_speed 				Geo-Fence minimum allowed speed
 * @apiSuccess 	{Number} 	result.max_speed 				Geo-Fence maximum allowed speed
 * @apiSuccess 	{Number} 	result.width	 				Geo-Fence path width or circle radius
 * @apiSuccess 	{Object[]} 	result.coordinates 				Geo-Fence coordinates
 * @apiSuccess 	{Double} 	result.coordinates.latitude 	Geo-Fence latitude
 * @apiSuccess 	{Double} 	result.coordinates.longitude 	Geo-Fence longitude
 * @apiSuccess 	{Boolean} 	result.auto_sync				Geo-Fence auto_sync status
 * @apiSuccess 	{Object} 	result.triggers 				Geo-Fence trigger devices and groups
 * @apiSuccess 	{Number[]} 	result.triggers.devices 		Geo-Fence trigger devices
 * @apiSuccess 	{Number[]} 	result.triggers.groups	 		Geo-Fence trigger groups
 * @apiSuccess 	{Object} 	result.sync 					Geo-Fence sync members
 * @apiSuccess 	{Number[]} 	result.sync.devices				Geo-Fence synced devices
 * 
 * @apiSuccess 	{String} 	message 						Success message 
 * 
 * @apiError 	{String}	error							Error message 
 */

/**
 * @apiDefine GeofenceBody
 * 
 * @apiParam 	{String} 	title 							Geo-Fence title
 * @apiParam 	{String} 	note 							Geo-Fence note
 * @apiParam 	{String} 	shape 							Geo-Fence shape
 * @apiParam 	{Boolean} 	inclusive 						Geo-Fence inclusion status
 * @apiParam 	{Boolean} 	active	 						Geo-Fence active status
 * @apiParam 	{Number} 	[min_speed] 					Geo-Fence minimum allowed speed. Allowed to be null
 * @apiParam 	{Number} 	[max_speed] 					Geo-Fence maximum allowed speed. Allowed to be null
 * @apiParam 	{Number} 	[width]	 						Geo-Fence path width or circle radius. Allowed to be null
 * @apiParam 	{Object[]} 	coordinates 					Geo-Fence coordinates
 * @apiParam 	{Double} 	coordinates.latitude 			Geo-Fence latitude
 * @apiParam 	{Double} 	coordinates.longitude 			Geo-Fence longitude
 * @apiParam 	{Object} 	triggers 				  		Geo-Fence trigger devices and groups
 * @apiParam 	{Number[]} 	triggers.devices 				Geo-Fence trigger devices
 * @apiParam 	{Number[]} 	triggers.groups	 				Geo-Fence trigger groups
 * @apiParam 	{Object} 	sync							Geo-Fence sync members
 * @apiParam 	{Number[]} 	sync.devices					Geo-Fence synced devices
 */

/**
 * @apiDefine GeofenceTriggerSyncErrorSuccess
 * @apiSuccess	{Object}	result							Object containing the result
 * @apiSuccess	{Number}	result.id						Geo-Fence Id
 * @apiSuccess	{Number[]}	result.devices					Device Ids
 * @apiSuccess	{Number[]}	result.groups					Group Ids
 * @apiSuccess	{String}	message							Success message
 * @apiError 	{String}	error							Error mesage
 */

/**
 * @apiDefine GeofenceTriggerSyncParams
 * @apiParam	{Number}	id						Geo-Fence Id
 * @apiParam	{Number[]}	devices					Device Ids
 * @apiParam	{Number[]}	groups					Group Ids 
 */

/**
 * @api {get} /geofence Get all Geo-Fences  
 * @apiName GetGeofence
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Gets all Geo-Fences stored under current user's client.
 * 
 * Note: any user with view permission on Geo-Fence module can view all Geo-Fences 
 * under their client. 
 * 
 * @apiSuccess {Object}	result	List of all Geofences that user has permission to view (key'd by Id)
 * @apiUse GeofenceSuccessError
 */
router.get("/geofence", permission(), getAllGeofence, utils.responseHandler);


/**
 * @api {get} /geofence/:id Get a Geo-Fence by Id  
 * @apiName GetGeofenceById
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Gets a Geo-Fence stored under current user's client by Id
 * 
 * @apiParam	{Number} 	id	 Geo-Fence Id
 * 
 * @apiUse GeofenceSuccessError
 */ 
router.get("/geofence/:id", validate(), permission(), getGeofenceById, utils.responseHandler);


/**
 * @api {post} /geofence Insert a new Geo-Fence
 * @apiName PostGeofence
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Adds a new Geo-Fence under current user's client
 *
 * @apiUse GeofenceBody
 * 
 * @apiUse GeofenceSuccessError 
 */
router.post("/geofence", validate(), permission(), postGeofence, socket(), plugin(), utils.responseHandler);


/**
 * @api {put} /geofence Update an Existing Geo-Fence
 * @apiName PutGeofence
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Updates a given Geo-Fence. Only properties provided in the request body
 * would be updated.
 *
 * @apiParam	{Number}	id								Geo-Fence Id
 * @apiUse GeofenceBody
 * 
 * @apiUse GeofenceSuccessError
 */
router.put("/geofence", validate(), permission(), putGeofence, socket(), plugin(), utils.responseHandler);



/**
 * @api {delete} /geofence/:id Delete a Geo-Fence by Id
 * @apiName DeleteGeofence
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Deletes the requested Geo-Fence under current user's client
 * 
 * @apiParam 	{Number}	id 								Geo-Fence Id 
 * 
 * @apiUse GeofenceSuccessError
 */ 
router.delete("/geofence/:id", validate(), permission(), deleteGeofence, sendDeleteSocketForGeoAlerts, socket(), plugin(), utils.responseHandler);



/**
 * @api {get} /geofence/trigger/:id Get Geo-Fence triggers  
 * @apiName GetGeofenceTrigger
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Gets all devices and groups that are assgined to a Geo-Fence 
 * as triggers.
 * 
 * @apiParam	{Number} 	id								Geo-Fence Id
 *
 * @apiUse GeofenceTriggerSyncErrorSuccess
 */
router.get("/geofence/trigger/:id", permission(), getGeofenceTrigger, utils.responseHandler);


/**
 * @api {get} /geofence/sync/:id Get Geo-Fence sync members  
 * @apiName GetGeofenceSync
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Gets all devices and groups that are assgined to a Geo-Fence 
 * to be synced when the Geo-Fence updates.
 * 
 * @apiParam	{Number} 	id								Geo-Fence Id
 *
 * @apiUse GeofenceTriggerSyncErrorSuccess
 */
router.get("/geofence/sync/:id", permission(), getGeofenceSync, utils.responseHandler);



/**
 * @api {put} /geofence/trigger/ Update Geo-Fence trigger devices and groups  
 * @apiName PutGeofenceTrigger
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Updates devices and groups that are assgined to a Geo-Fence 
 * as triggers.
 * 
 * @apiUse GeofenceTriggerSyncParams
 *
 * @apiUse GeofenceTriggerSyncErrorSuccess
 */
router.put("/geofence/trigger", permission(), putGeofenceTrigger, socket(), utils.responseHandler);


/**
 * @api {put} /geofence/sync/ Update Geo-Fence sync members  
 * @apiName PutGeofenceSync
 * @apiGroup geofence
 * @apiHeader {String} x-access-token Users unique access token
 * @apiVersion 2.1.0
 * @apiDescription Updates devices and groups that are assgined to a Geo-Fence 
 * to be synced when the Geo-Fence updates.
 * 
 * @apiUse GeofenceTriggerSyncParams
 *
 * @apiUse GeofenceTriggerSyncErrorSuccess
 */
router.put("/geofence/sync", permission(), putGeofenceSync, socket(), utils.responseHandler);


/**
 * Middleware to get all geofences of the current user from the db
 */
function getAllGeofence(req, res, next){
	var user = req.user;
	utils.dbHandler(req, res, next, function(){
		return dbGeofence.getAllGeofence(user);
	});
}

/**
 * Middleware to get info of a particular geofences requested by the user via id
 */
function getGeofenceById(req, res, next){
	var id = req.params.id;
	utils.dbHandler(req, res, next, function(){
		return dbGeofence.getGeofenceById(id);
	});
}

/**
 * Middleware to store a geofences into the db under current user's client
 */
function postGeofence(req, res, next){
	var user = req.user;
	var geofenceData = req.body;
	geofenceData.client_id = user.client_id;
	utils.dbHandler(req, res, next, function(){
		return dbGeofence.postGeofence(user, geofenceData);
	});
}

/**
 * Middleware to update a geofences into the db under current user's client
 */
function putGeofence(req, res, next){
	var user = req.user;
	var id = req.body.id;
	var geofenceData = req.body;
	utils.dbHandler(req, res, next, function(){
		return dbGeofence.putGeofence(user, id, geofenceData);
	});
}

/**
 * Middleware to delete a geofences into the db under current user's client
 */
function deleteGeofence(req, res, next){
	var user = req.user;
	var id = req.params.id;
	
	utils.dbHandler(req, res, next, function(){
		return dbGeofence.deleteGeofence(user, id);
	});
}

//Custom function sends 'DELETE' socket to alerts module for Geofence and Speed alerts that have been removed because 
//a geofence was deleted
function sendDeleteSocketForGeoAlerts(req, res, next){
	next();

	var deletedAlerts = req.result.result.deleted_alert_ids;

	var dummyRequest = {
		socketEvent: "delete:/alert/:id",
		user: req.user,
		result: {result: req.result.result},
		permittedUsers: []
	};

	return bluebird.each(deletedAlerts, function(id){
		dummyRequest.result = {result: {id: id}};
		socket.socketHandler(dummyRequest);
		return bluebird.resolve();
	}); 
}


/**
 * Middleware to get devices and groups assigned to a geofence as triggers
 */
function getGeofenceTrigger(){
	
}

/**
 * Middleware to get devices and groups assigned to a geofence to be synced 
 * when the Geo-Fence updates
 */
function getGeofenceSync(){
	
}

/**
 * Middleware to update devices and groups assigned to a geofence as triggers
 */
function putGeofenceTrigger(){
	
}

/**
 * Middleware to update devices and groups assigned to a geofence to be synced 
 * when the Geo-Fence updates
 */
function putGeofenceSync(){
	
}

module.exports= {
	router: router,
	postGeofence: postGeofence,
	putGeofence: putGeofence,
	deleteGeofence: deleteGeofence 
};