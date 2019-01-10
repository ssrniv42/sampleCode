/* global log, db */
/* global db */

var bluebird = require("bluebird");
var _ = require("lodash"); 


/** 
 * Handles logic and inserts device report into DB
 * 
 * @method postDeviceReport
 * @memberof db_report
 * @param {object} report - object containing gps report info of a particular device
 * @param {integer} commId - comm id of the reporting device 
 * @return {object} - object containg info of newly inserted device report with insert ids and status message
*/
var postDeviceReport = function(report, commId){
	
	log.info("POST /report | Processing New Device Report For Device With Comm Id: ", commId);
	
	if(commId == undefined || typeof commId != "number"){
		log.warn("Platform Received Device Report With Invalid Comm Id");
		throw new Error("Platform Received Device Report With Invalid Comm Id");		
	}
	
	return db.sequelize.transaction(function(t){
		var options = {transaction: t};
		
		//Get device_id of the device and also validate comm_id sent by MH
		return getDeviceId(report, commId, options)
		.then(function(comms){
			if(!comms){
				log.warn("Platform Received Device Report With Invalid Comm Id: ", commId, ". This Comm Id Does Not Belong To A Device In Platform DB");
				throw new Error("Platform Received Invalid Device Comm Id. The Comm Id Does Not Belong To A Device In Platform DB");
			}

			report.device_id = comms.row_id;

			//Archive device report in 'report' table
			return archiveReport(report, options);
		})		
		.then(function(dbRport){
			// for adding reference to the report table in the latest_report table
			report.report_id= dbRport.id;
			//Process and submit device report to 'latest_report' table
			return processLatestReport(report, commId, options);
		});		
	});	
};

module.exports = {
	postDeviceReport: postDeviceReport
};

//Uses comm_id from device report to fetch and return device_id (ats_id) from 'assets' table
function getDeviceId(report, commId, options){
	return db.comm.findOne({
		where: {id: commId, table_name: "assets"},
		transaction: options.transaction
	});
}

function archiveReport(report, options){
	var dbReport = db.report.build(report);
	return dbReport.save({transaction: options.transaction});
}

function processLatestReport(report, commId, options){	
	
	return db.latest_report.findOne({
		where: {
			device_id: report.device_id
		},
		transaction: options.transaction
	})
	.then(function(latestReport){			
		//Add commId to options and pass along for functions in model hooks to process panic data		
		var dbLatestReport;
		
		if(latestReport){
			//Handle case when MH sends old reports stuck in queue or device is reporting with old timestamp
			if(report.report_timestamp < latestReport.report_timestamp){
				log.warn("Platform Received Device Report With Old Timestamp, For Asset With Comm Id: ", commId);
				return bluebird.resolve({warning: "Platform Received Device Report With Old Timestamp. The Data Has Been Archived In Platform DB", result: report});	
			}
			//Update 'latest_report' table with new device report info
			else{
				//Specify what fields to update in 'latest_report' table
				var updateReport = _.pick(report, 
					["latitude", "longitude", "altitude", "speed", "heading", "panic", 
						"report_timestamp", "polling", "ignition", "battery_charge", "battery_level", "report_id"]
				);
				
				//Update the respective fields in object returned by the find method
				dbLatestReport = _.merge(latestReport, updateReport);			
			}
		}
		//Insert a new device report into 'latest_report' table
		else {
			dbLatestReport = db.latest_report.build(report);
		}									
		
		return dbLatestReport.save({transaction: options.transaction, commId: commId})
		.then(function(dbReport){
			dbReport = dbReport.get({plain: true});
			dbReport.comm_id = commId;
			log.info("Platform Successfully Processed New Report For Device With Comm Id: ", commId);
			return bluebird.resolve({message: "Platform Successfully Processed Device Report", result: dbReport});	
		});		
	});
	
}
