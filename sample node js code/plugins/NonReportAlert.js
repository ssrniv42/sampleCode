
const Alert= require("./Alert");
const bluebird= require("bluebird");

class NonReportAlert extends Alert{
	constructor(options){
		super(options);
	}

	/**
	 * wrapper of processAlert method
	 * 
	 * @param {Object} data data corresponding to the action received
	 * @param {String} action type of event {"report"}
	 */
	processAlertWrapper(data, action){
		if(action == "report"){
			log.info("Processing Non-Report alert triggered by device report. ( Device ID: ", data.id, ", Report ID: ", data.report_id, ")");
			return this.processAlertCausedByReport(data);
		}else if(action == "device"){
			log.info("Processing Non-Report alert triggered by device update. ( Device ID: ", data.id, ")");
			return this.processAlertCausedByDeviceUpdate(data);
		}else if(action == "report_timeout"){
			log.info("Processing Non-Report alert triggered by timeout. ( Device ID: ", data.id, ")");
			return this.processAlertCausedByTimeout(data);
		}else{
			throw new Error("Action "+ action+ " is not recognized for Emergency Alert plugin.");
		}
	}

	/**
	 * calculates non-report alerts when a new report is received
	 * 
	 * @param {Object} report reprot information object 
	 */
	processAlertCausedByReport(report){		
		const deviceId= report.device_id;
		const reportId= report.report_id;
		const now= utils.getTimestamp();
						
		const managerOptions= {
			condition: {},
			start: { start_report_id: reportId, start_timestamp: now },
			finish: { end_report_id: reportId, end_timestamp: now }
		};

		return db.device.findById(deviceId)
		.then(device => {
			const isViolated= this.isViolated(report, device);
			return this.processViolation(deviceId, isViolated, managerOptions);
		});		
	}

	/**
	 * calculates non-report alerts when device info is updated
	 * 
	 * @param {Object} device device information object 
	 */
	processAlertCausedByDeviceUpdate(device){		
		const deviceId= device.id;	
		const now= utils.getTimestamp();
		return this.getLatestReport(deviceId)
		.then(report => {
			if(!report) return bluebird.resolve();
			const reportId= report.report_id;
			const managerOptions= {
				condition: {},
				start: { start_report_id: reportId, start_timestamp: now},
				finish: { end_report_id: reportId, end_timestamp: now}
			};
			const isViolated= this.isViolated(report, device);
			return this.processViolation(deviceId, isViolated, managerOptions);
		});		
	}

	/**
	 * calculates non-report alerts when non-report threshold times out
	 * 
	 * @param {Object} device device information object 
	 */
	processAlertCausedByTimeout(device){		
		const deviceId= device.id;	
		const now= utils.getTimestamp();
		return this.getLatestReport(deviceId)
		.then(report => {
			let reportId= null;
			if(report){
				reportId = report.report_id;
			}
			//const reportId= report.report_id || null;
			const managerOptions= {
				condition: {},
				start: { start_report_id: reportId, start_timestamp: now},
				finish: { end_report_id: reportId, end_timestamp: now}
			};
			const isViolated= this.isViolated(report, device);
			return this.processViolation(deviceId, isViolated, managerOptions);
		});		
	}


	/**
	 * checks whether the report triggers an emergency
	 * 
	 * @param {Object} report report data object
	 * 
	 * @return {Boolean} true if emergency is set and false otherwise
	 */
	isViolated (report, deviceData){		
		var now= utils.getTimestamp();
		if(report == null){
			return now > deviceData.non_report_threshold/1000;
		}
		return now - report.report_timestamp > deviceData.non_report_threshold/1000;
	}
}

module.exports= new NonReportAlert({
	alertName: "Non-Report",
	managerTable: "non_report_alert_manager"
});