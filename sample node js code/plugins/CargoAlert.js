const Alert= require("./Alert");
const bluebird= require("bluebird");
const _= require("lodash");
const statusObjectMap= {
	Door: "door_open",
	Humidity: "humidity",
	Temperature: "temperature",
	Shock: "shock_alert",
	Battery: "battery_charge"
};

const shortCargoAlertTypeMap= {
	Door: "Door",
	Humidity: "Hum",
	Temperature: "Temp",
	Shock: "Shock",
	Battery: "Btry"
};

class CargoAlert extends Alert{
	constructor(options){
		super(options);	
	}
	
	/**
	 * overrides from Alert to get cargo alerts before processing alerts
	 * @param {Object} data data corresponding to the action received
	 * @param {String} action type of event
	 */
	processAlert(data, action){
		return this.getCargoAlertTypes()
		.then(() => {
			return super.processAlert(data, action);
		});		
	}

	/**
	 * loads cargo alert types and adds it to the instance of CargoAlert
	 */
	getCargoAlertTypes(){		
		// only get types on the first run
		if (this.cargoAlertTypes) return bluebird.resolve();

		const $this= this;
		return db.cargo_alert_type.findAll()
		.then(types => {
			types= _.map(types, type => {
				return type.get({plain: true});
			});
			const keyedTypes= _.keyBy(types, "type");
			$this.cargoAlertTypes= keyedTypes;
			return bluebird.resolve();
		});
	}

	/**
	 * provides the id of the cargo alert based on the given type.
	 * @param {String} type cargo alert type name
	 * @return {Number} cargo alert type id
	 */
	getCargoAlertTypeId(type){
		return this.cargoAlertTypes[type].id;
	}

	/**
	 * wrapper of processAlert method
	 * 
	 * @param {Object} data data corresponding to the action received
	 * @param {String} action type of event {"status"}
	 */
	processAlertWrapper(data, action){
		if(action == "cargo_status"){
			log.info("Processing cargo alert triggered by a status report. ( Device ID: ", data.id, ")");
			return this.processCargoAlert(data);
		}
		else if(action == "cargo_settings"){
			log.info("Processing cargo alert triggered by a settings update on platform. ( Device ID: ", data.id, ")");
			return this.processCargoAlert(data);
		}	
		else{
			throw new Error("Action "+ action+ " is not recognized for Cargo Alert plugin.");
		}
	}

	/**
	 * calculates cargo alerts when a new status report is received
	 * 
	 * @param {Object} report reprot information object 
	 */
	processCargoAlert(status){		
		const $this= this;
		
		if(status.consignment != undefined){
			const deviceId= status.device_id;
			const statusId= status.consignment.status.status_id;
			
			return $this.getLatestReport(deviceId)
			.then(report => {
				const reportId= report && report.report_id;
				const cargoAlertTypes= _.keys(this.cargoAlertTypes);
				return bluebird.map(cargoAlertTypes, cargoAlertType => {
					const cargoAlertTypeId= $this.getCargoAlertTypeId(cargoAlertType);
					const now= utils.getTimestamp();
					
					const managerOptions= {
						condition: {cargo_alert_type_id: cargoAlertTypeId},
						start: { 
							start_report_id: reportId, 
							start_status_id: statusId, 
							cargo_alert_type_id: cargoAlertTypeId,
							cargo_alert_type_title: cargoAlertType,
							cargo_alert_value: getStatusValueByType(status, cargoAlertType),
							start_timestamp: now
						},
						finish: { end_status_id: statusId, end_report_id: reportId, end_timestamp: now }
					};
					const isViolated= this.isViolated(status, cargoAlertType);
					return this.processViolation(deviceId, isViolated, managerOptions);
				});
			});	
		}
		return bluebird.resolve();
	}	

	/**
	 * checks whether the status triggers a cargo alert
	 * 
	 * @param {Object} status cargo status data object
	 * @param {String} type cargo alert type
	 * 
	 * @return {Boolean} true if a cargo alert is set and false otherwise
	 */
	isViolated (status, type){
		const temp= status.consignment.status.temperature;
		const tempLow= status.consignment.settings.temp_low;
		const tempHigh= status.consignment.settings.temp_high;
		const humid= status.consignment.status.humidity;
		const humidHigh= status.consignment.settings.humidity_high;
		const shockHigh= status.consignment.settings.shock_high; 
		const shock= status.consignment.status.shock;

		switch(type){
		case "Door":
			return status.consignment.status.door_open;
		case "Humidity"	:
			return humid > humidHigh;
		case "Temperature":
			return temp < tempLow || temp > tempHigh;			
		case "Shock":
			return shock > shockHigh;			
		case "Battery":
			return status.consignment.status.battery_charge == 0;
		}		
	}

	sendAlertNotification(alert, options){		
		const alertType= options.cargo_alert_type_title;
		const message = {
			regular: "Cargo <" +alertType  + " (" + options.cargo_alert_value + ")>",
			sms: "Cargo " + getShortCargoAlertType(alertType)
		};
		
		super.sendAlertNotification(alert, options, message);
	}
}

function getStatusValueByType(status, type){
	var key= statusObjectMap[type];
	return status.consignment.status[key];
}

function getShortCargoAlertType(type){
	return shortCargoAlertTypeMap[type];
}

module.exports= new CargoAlert({
	alertName: "Cargo",
	managerTable: "cargo_alert_manager"
});