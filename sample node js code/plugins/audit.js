/* global log, db, utils, auditDb */

/* 
	This plugin specifically processes data and restructures it to be logged 
	into mongo DB as audit data
	
	For now this plugin handles and logs Geofence and POI data
*/

var bluebird = require("bluebird");
var dict= {"get": "get", "post": "create", "put": "update", "delete": "delete"};

var processAuditData = function(req){
	var dataObj = {};
	var moduleName = utils.getModuleName(req);
	var moduleAction = utils.getActionType(req, dict);

	//The info stored in data field of auditObj is different for each type of action
	if(moduleAction[0] == "create") dataObj = req.result.result;
	else if(moduleAction[0] == "update") dataObj = req.body;
	else dataObj = {id: req.params.id};
	
	var auditObj = {
		object: moduleName,
		modified_by: {client_id: req.user.client_id, user_id: req.user.user_id, device_id: null},
		action: moduleAction[0],
		time: Math.round(new Date().getTime()),
		data: dataObj	
	};

	var audit = new auditDb.ModuleMods(auditObj);
	return audit.save()
	.then(function(data){
		log.info("Successfully stored modifictions related to module", moduleName, "for operation", moduleAction[0], "in ModuleMods table");
		return bluebird.resolve(data);
	});
};

module.exports = function(req){
	return processAuditData(req);
};