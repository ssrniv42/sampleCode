
const Alert= require("./Alert");
class EmergencyAlert extends Alert{
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
			log.info("Processing emergency alert triggered by device report. ( Report ID: ", data.report_id, ")");
			return this.processAlertCausedByReport(data);
		}else{
			throw new Error("Action "+ action+ " is not recognized for Emergency Alert plugin.");
		}
	}

	/**
	 * calculates emergency alerts when a new report is received
	 * 
	 * @param {Object} report reprot information object 
	 */
	processAlertCausedByReport(report){		
		const deviceId= report.device_id;
		const reportId= report.report_id;

		const managerOptions= {
			condition: {},
			start: { start_report_id: reportId, start_timestamp: report.report_timestamp },
			finish: { is_reset: true, end_report_id: reportId, end_timestamp: report.report_timestamp }
		};

		const isViolated= this.isViolated(report);
		return this.processViolation(deviceId, isViolated, managerOptions);
	}

	/**
	 * checks whether the report triggers an emergency
	 * 
	 * @param {Object} report report data object
	 * 
	 * @return {Boolean} true if emergency is set and false otherwise
	 */
	isViolated (report){		
		return report.panic;
	}
}

module.exports= new EmergencyAlert({
	alertName: "Emergency",
	alertShortName: "Emgcy",
	managerTable: "emergency_alert_manager"
});