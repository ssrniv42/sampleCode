const Alert= require("./Alert");
const geofenceAlert= require("./GeofenceAlert");
const _= require("lodash");
const bluebird= require("bluebird");
const util= require("util");

class SpeedAlert extends Alert{
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
			log.info("Processing speed alert triggered by device report. ( Report ID: ", data.report_id, ")");
			return this.processAlertCausedByReport(data);
		}else if(action == "device"){
			log.info("Processing speed alert triggered by device update. ( Device ID: ", data.id, ")");
			return this.processAlertCausedByDeviceUpdate(data);
		}else if(action == "geofence"){
			log.info("Processing speed alert triggered by geofence update. ( Geo-Fence ID: ", data.id, ")");
			return this.processAlertCausedByGeofenceUpdate(data);
		}else{
			throw new Error("Action "+ action+ " is not recognized for Speed Alert plugin.");
		}
	}

	/**
	 * calculates geo-fence alerts when a new report is received
	 * 
	 * @param {Object} report reprot information object 
	 */
	processAlertCausedByReport(report){		
		const $this= this;
		let violatingGeofenceIds = [];

		// get all geofences that the device could trigger
		return geofenceAlert.getDeviceTriggerGeofences(report.device_id)
		.tap(geofences => {
			return $this.getAlreadyViolatingGeofences(geofences, report.device_id)
			.then(function(geofenceIds){
				violatingGeofenceIds = geofenceIds;
			});
		})
		.then(geofences => {
			return $this.appendDeviceDataToGeofenceList(geofences, report.device_id);
		})
		.then(function(geofences){
			return $this.processSpeedViolation(geofences, report, violatingGeofenceIds);
		});
	}


	/**
	 * calculates speed alert when a device is updated
	 * 
	 * @param {Object} device device information object 
	 */
	processAlertCausedByDeviceUpdate(device){		
		const $this= this;
		const deviceId= device.id;	
		const speedData= _.pick(device, ["min_speed", "max_speed"]);
		speedData.id= null;
		return $this.getLatestReport(deviceId)
		.then(function(report){
			if(!report) return bluebird.resolve([]);
			return $this.processSpeedViolation(speedData, report);
		});
	}

	/**
	 * calculates speed alert when a geofence is updated
	 * 
	 * @param {Object} geofence geofence information object 
	 */
	processAlertCausedByGeofenceUpdate(geofence){	
		const $this= this;
		let triggerAlerts= null;
		var reportData; 

		// get all reports for trigger devices of the geofence
		return geofenceAlert.getGeofenceTiggerReports(geofence)	
		.then(reports => {
			return $this.removeAlreadyViolatingReports(reports, geofence.id);
		})	
		.then(reports => {
			reportData = reports;
			return $this.processSpeedViolation(geofence, reports);
		})
		.then(function(alerts){
			triggerAlerts= alerts;
			const geoSpeedTriggerDeviceIds= _.map(reportData, "device_id");
			return $this.removeUntrackedGeoSpeedAlerts(geofence, geoSpeedTriggerDeviceIds);
		})
		.then(untrackAlerts => {		
			return bluebird.resolve(_.concat(triggerAlerts, untrackAlerts));
		});	
	}

	/**
	 * removes geo speed alerts of a geofence for all devices that have been removed 
	 * from the geofence trigger list
	 * 
	 * @param {object} geofence Geo-fence object being updated
	 * @param {Array} geoSpeedTriggerDeviceIds Device IDs of Geo-Fence triggers
	 * 
	 * @return {Boolean} true if any Geo-fence alert is removed, and false otherwise
	 */
	removeUntrackedGeoSpeedAlerts(geofence, geoSpeedTriggerDeviceIds){		
		const $this= this;
		
		// gets all ongoing alerts for the geofence
		return db.alert.findAll({			
			where: {end_timestamp: { $eq: null }},
			include: [{
				as: "SpeedAlertManager",
				model: db.speed_alert_manager,
				where: {geofence_id: geofence.id}				
			}, {				
				model: db.device,
				required: true,
				attributes: ["id"],
				include: [{
					attributes: ["report_id"],
					model: db.latest_report,
					required: true
				}]
			}]
		})
		.bind({})
		.then(function(alerts){
			const untrackedAlerts= _.filter(alerts, function(alert){
				return _.indexOf(geoSpeedTriggerDeviceIds, alert.device_id) < 0;
			});
			
			return bluebird.map(untrackedAlerts, function(alert){					
				log.info(util.format("Device %d is no longer a trigger of geofence '%s' ( Geofence ID: %d )", alert.device_id, geofence.title, geofence.id));
				const reportId= alert.device.latest_report.report_id;
				const now= utils.getTimestamp();
				return $this.finishAlert(alert, { end_report_id: reportId, end_timestamp: now });
			});
		});
	}

	/**
	 * processes speed violation for a given list of geofences and device reprots
	 * 
	 * NOTE: the geofence list could also contain the device info to calculated 
	 * speed alert triggered by device min/max setting. In such case, the object 
	 * would have id=null to be stored as geofence_id as per the speed alert manager 
	 * table logic.
	 * 
	 * @param {Array | Object} geofences an array of geofence objects or an individual geofence object
	 * @param {Array | Object} reports an array of report objects or an individual report object
	 * @param {Array} || undefined violatingGeofenceIds that will store geo ids that are already violated by a given device
	 * @return {Array} list of all alerts processed
	 */
	processSpeedViolation(geofences, reports, violatingGeofenceIds){
		const $this= this;
		violatingGeofenceIds = violatingGeofenceIds || [];

		// converting arguments to array if they are not
		geofences= _.concat([], geofences);
		reports= _.concat([], reports);

		return bluebird.map(geofences, function(geofence){
			return bluebird.map(reports, function(report){
				const deviceId= report.device_id;
				const reportId= report.report_id;
				const now= utils.getTimestamp();	

				const managerOptions= {
					condition: { geofence_id: {$eq: geofence.id} },
					start: { 
						geofence_id: geofence.id, 
						geofence_title: geofence.title,
						start_report_id: reportId, 
						speed: report.speed, 
						min_speed: geofence.min_speed,
						max_speed: geofence.max_speed,
						start_timestamp: now
					},
					finish: { end_report_id: reportId, end_timestamp: now }
				};

				let isViolatingGeofence = true;

				if(_.indexOf(violatingGeofenceIds, geofence.id) == -1){
					isViolatingGeofence = false;
				}

				const isViolated= (geofence.active || geofence.id == null) && $this.isViolated(geofence, report) && !isViolatingGeofence;				
				return $this.processViolation(deviceId, isViolated, managerOptions);
			});
		});
	}

	

	/**
	 * addes the device info to the geofence list to be calculated at the same time.
	 * @param {Array} geofences list of geofences
	 * @param {Number} deviceId device id to be added
	 * @return {Array} new geofence list
	 */
	appendDeviceDataToGeofenceList(geofences, deviceId){		
		return db.device.findById(deviceId)
		.then(device => {
			device= device.get({plain: true});
			device.id= null;
			
			geofences.push(device);
			return bluebird.resolve(geofences);
		});
	}

	/**
	 * queries and gets geofences that are already violated by a given device
	 * @param {Array} geofences list of geofences
	 * @param {Number} deviceId device id to be checked
	 * @return {Array} array of geo ids that are already violated by a given device
	**/
	getAlreadyViolatingGeofences(geofences, deviceId){
		const alertTypeId= geofenceAlert.getAlertTypeId();
		return db.alert.findAll({
			where: {
				device_id: deviceId, 
				alert_type_id: alertTypeId, 
				end_timestamp: {$eq: null}				
			},
			include: [{
				model: db.geofence_alert_manager,
				as: "GeofenceAlertManager",
				required: true
			}]
		})
		.then(alerts => {
			let violatingGeofenceIds= _.map(alerts, alert => {
				return alert.GeofenceAlertManager.geofence_id;
			});
			return bluebird.resolve(violatingGeofenceIds);
		});
	}

	/**
	 * removes reports for devices that already violate a given geofence
	 * @param {Array} reports list of reports for devices
	 * @param {Number} geofenceId geofence id to be checked
	 * @return {Array} new report list
	 */
	removeAlreadyViolatingReports(reports, geofenceId){
		const alertTypeId= geofenceAlert.getAlertTypeId();
		return db.alert.findAll({
			where: {				
				alert_type_id: alertTypeId, 
				end_timestamp: {$eq: null}				
			},
			include: [{
				model: db.geofence_alert_manager,
				as: "GeofenceAlertManager",
				where: {geofence_id: geofenceId},
				required: true
			}]
		})
		.then(alerts => {
			const deviceIds= _.map(alerts, "device_id");
			return _.filter(reports, report => {
				return _.indexOf(deviceIds, report.device_id) < 0;
			});
		});
	}

	
	
	/**
	 * checks whether the report triggers speed settings
	 * @param {Object} speedData an object containing speed min/max information
	 * @param {Object} report report data object	 * 
	 * @return {Boolean} true if speed limits are violated and false otherwise
	 */
	isViolated (speedData, report){
		const isMinSpeedViolated= speedData.min_speed != null && report.speed < speedData.min_speed;
		const isMaxSpeedViolated= speedData.max_speed != null && report.speed > speedData.max_speed;
		return isMinSpeedViolated || isMaxSpeedViolated;
	}


	sendAlertNotification(alert, options){		
		const speed= options.speed;
		const minSpeed= options.min_speed;
		const maxSpeed= options.max_speed;
		
		let str="";
		if (speed < minSpeed){
			str= "(<" + minSpeed + ")";
		}else if(speed > maxSpeed){
			str= "(>" + maxSpeed + ")";
		}

		const message = {
			regular: "Speed at " + speed + "KM/H " + str,
			sms: "Speed " + speed
		};

		if(options.geofence_id){
			message.regular+= " For Geo <" + options.geofence_title + ">";
			message.sms+= " "+ options.geofence_title;
		}	

		super.sendAlertNotification(alert, options, message);
	}
}

module.exports= new SpeedAlert({
	alertName: "Speed",
	managerTable: "speed_alert_manager"
});