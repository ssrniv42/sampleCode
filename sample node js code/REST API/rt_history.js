/* global utils */
"use strict";

var express = require("express");
var router = express.Router();
var dbHistory = require("../db/db_history.js");
var validate = require("../validation");


/**
 * @api {get} /history/:device_ids/:start_timestamp/:end_timestamp
 *  
 * Get historic data bounded by the parameters passed to the route 
 * @apiName GetHistory
 * @apiGroup history
 * @apiHeader {String} x-access-token Users unique access token
 * @apiDescription	Get historic data bounded by the parameters passed to the route
 *
 * @apiParam	{Number[]}		device_ids										Ids of devices that that part of historic search 
 * @apiParam	{Number}		start_timestamp									Unix timestamp of the start of the historic search
 * @apiParam	{Number}		end_timestamp									Unix timestamp of the end of the historic search 
 * 
 * 
 * @apiSuccess	{Object}		result 											Object containg historic data
 * @apiSuccess	{Object}		result.report									Object containing report data
 * @apiSuccess	{Array}			result.report.template							Array containg info of report parameters sent to the front end
 * @apiSuccess	{Array}			result.report.data								Array of arrays containing info of each report in order of timestamp
 * @apiSuccess	{Object}		result.emergency								Object containing emergency alert data
 * @apiSuccess	{Array}			result.emergency.template						Array containg info of emergency alert parameters sent to the front end
 * @apiSuccess	{Array}			result.emergency.data							Array of arrays containing info of each emergency alert in order of timestamp
 * @apiSuccess	{Object}		result.geofence									Object containing geofence alert data
 * @apiSuccess	{Array}			result.geofence.template						Array containg info of geofence alert parameters sent to the front end
 * @apiSuccess	{Array}			result.geofence.data							Array of arrays containing info of each geofence alert in order of timestamp
 * @apiSuccess	{Object}		result.speed									Object containing speed alert data
 * @apiSuccess	{Array}			result.speed.template							Array containg info of speed alert parameters sent to the front end
 * @apiSuccess	{Array}			result.speed.data								Array of arrays containing info of each speed alert in order of timestamp
 * @apiSuccess	{Object}		result.non_report								Object containing non_report alert data
 * @apiSuccess	{Array}			result.non_report.template						Array containg info of non_report alert parameters sent to the front end
 * @apiSuccess	{Array}			result.non_report.data							Array of arrays containing info of each non_report alert in order of timestamp
 * @apiSuccess	{Object}		result.cargo									Object containing cargo alert data
 * @apiSuccess	{Array}			result.cargo.template							Array containg info of cargo alert parameters sent to the front end
 * @apiSuccess	{Array}			result.cargo.data								Array of arrays containing info of each cargo alert in order of timestamp
 * 
 * @apiSuccess 	{String} 		message 										Success message 
 * 
 * @apiError	{String}		error											Error message
 */
router.get("/history/:device_ids/:start_timestamp/:end_timestamp", parseParams, validate(), getHistory, utils.responseHandler);

 
/**
 *	@api {get} /history/size/:device_ids/:start_timestamp/:end_timestamp
 *  
 * Uses search params to get the size of the data set. The size is based on total amount of report data that will be returned to the client side
 * @apiName GetSizeOfHistoricData
 * @apiGroup history
 * @apiHeader {String} x-access-token Users unique access token
 * @apiDescription Gets size of the historic data set
 * 
 * @apiParam	{Number[]}		device_ids										Ids of devices that that part of historic search 
 * @apiParam	{Number}		start_timestamp									Unix timestamp of the start of the historic search
 * @apiParam	{Number}		end_timestamp									Unix timestamp of the end of the historic search 
 *
 * @apiSuccess	{Number}		result 											Total count of report data
 * @apiSuccess 	{String} 		message 										Success message 
 * @apiError	{String}		error											Error message
 */
router.get("/history/size/:device_ids/:start_timestamp/:end_timestamp", parseParams, validate(), getSizeOfHistoricData, utils.responseHandler);


/*
	middleware that processes and gets historic data bounded by the parameters passed to the route
*/
function getHistory(req, res, next){
	var user = req.user;

	var params = {
		device_ids: req.params.device_ids,
		start_timestamp: req.params.start_timestamp,
		end_timestamp: req.params.end_timestamp
	};

	utils.dbHandler(req, res, next, function(){
		return dbHistory.getHistory(user, params);
	});
}

/*
	middleware that processes and gets the size of the data set based on search params
*/
function getSizeOfHistoricData(req, res, next){
	var user = req.user;

	var params = {
		device_ids: req.params.device_ids,
		start_timestamp: req.params.start_timestamp,
		end_timestamp: req.params.end_timestamp
	};

	utils.dbHandler(req, res, next, function(){
		return dbHistory.getSizeOfHistoricData(user, params);
	});
}


function parseParams(req, res, next){
	req.params.device_ids = JSON.parse(req.params.device_ids);
	next();
}

module.exports= {
	router: router
};