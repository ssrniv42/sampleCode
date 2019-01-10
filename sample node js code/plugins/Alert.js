/* eslint-disable no-console */
const bluebird= require("bluebird");
const _= require("lodash");
const util= require("util");
const alertNotification= require("./alert_notification.js");

class Alert {
	constructor(options){
		this.options= options;

		this.alertName= options.alertName;
		this.managerTable= this.options.managerTable;
		this.managerAs= _.upperFirst(_.camelCase(this.managerTable));
		this.managerGetter= "get"+ this.managerAs;
		this.managerSetter= "set"+ this.managerAs;		
	}

	/**
	 * calculates alerts upon receiving a new event
	 * 
	 * @param {Object} data data corresponding to the action received
	 * @param {String} action type of event
	 */
	processAlert(data, action){
		var $this= this;
		return this.getAlertTypes()
		.then(() => {
			return $this.processAlertWrapper(data, action);
		})		
		.then(alerts => {
			// convert to array if it is not an array
			alerts= _.concat([], alerts);

			alerts= _.filter(_.flattenDeep(alerts), function(alert){
				return alert;
			});

			return bluebird.resolve(alerts);
		});
		
	}

	processAlertWrapper(){}

	isViolated(){}

	/**
	 * sends alert notifications based on alert rule subscriptions 
	 * @param {Object} alert alert object
	 * @param {Object} options extra options for the alert
	 * @param {Object} message message object
	 * @param {Number} startTime start time object
	 */
	sendAlertNotification(alert, options, message, startTime){
		if(!alertNotification) throw new Error("Alert Notification Module is not Initialized.");

		const $this= this;

		message = message || {
			regular: $this.alertName,
			sms: $this.alertShortName || $this.alertName
		};

		startTime = startTime || {
			regular: utils.getFormattedTime(alert.start_timestamp),
			sms: utils.getShortFormattedTime(alert.start_timestamp)
		};
			
		alertNotification.sendAlertNotification(alert.device_id, this.alertName, message, startTime);
		return bluebird.resolve();
	}

	/**
	 * get the latest report for a given device
	 * @param {Number} deviceId device id
	 * @return {Object} sequelize device instance in a promise
	 */
	getLatestReport(deviceId){
		return db.latest_report.findOne({
			where: {device_id: deviceId}
		});
	}

	/**
	 * loads alert types and adds it to the instance of Alert
	 */
	getAlertTypes(){		
		// only get types on the first run
		if (this.alertTypes) return bluebird.resolve();

		const $this= this;
		return db.alert_type.findAll()
		.then(types => {
			types= _.map(types, type => {
				return type.get({plain: true});
			});
			const keyedTypes= _.keyBy(types, "type");
			$this.alertTypes= keyedTypes;
			return bluebird.resolve();
		});
	}

	/**
	 * provides the id of the alert based on the given type.
	 * if no type is given it returns the id of the current alert instance
	 * @param {String} type alert type name or null
	 * @return {Number} alert type id
	 */
	getAlertTypeId(type){
		type= type || this.alertName;
		return this.alertTypes[type].id;
	}

	/**
	 * Checks if a device has ongoing alert
	 * @param {Integer} deviceId Device ID
	 * @param {Object} managerCondition Condition to be checked with alert manager table
	 * 
	 * @return {Object} Promise of alert instance
	 */
	wasViolated(deviceId, managerCondition){
		const $this= this;
		managerCondition= managerCondition || {};		
		return db.alert.findOne({
			where: {								
				device_id: deviceId,
				end_timestamp: { $eq: null }
			},
			include: [{
				as: $this.managerAs,
				model: db[$this.managerTable],
				where: managerCondition
			}]
		});
	}

	/**
	 * Starts a new alert for the device
	 * @param {Integer} deviceId 
	 * @param {Object} options 
	 * @return {Object} Promise
	 */
	startAlert(deviceId, options){			
		const $this= this;		
		const alertTypeId= this.getAlertTypeId();
		
		const alert= db.alert.build({
			alert_type_id: alertTypeId,
			device_id: deviceId,
			start_timestamp: options.start_timestamp
		});

		const alertManagerObject= db[$this.managerTable].build(options);	
		let alertObj= null;
		return db.sequelize.transaction(function (t) {
			return alert.save({transaction: t})			
			.then(alert => {
				alertObj= alert;
				return alert[$this.managerSetter](alertManagerObject, {transaction: t});
			})
			.then(alertManager => {				
				log.info("New", $this.alertName, "alert is started. Alert Manager Data:", alertManagerObject.get({ plain: true }));
				$this.sendAlertNotification(alertObj, options);
				// adding to sequelize object so it is not removed by get({plain:true})
				alertObj.dataValues[$this.managerAs]= alertManager;
				return bluebird.resolve(alertObj);
			});
		});
	}

	/**
	 * finishes an ongoing alert
	 * @param {Object} alert sequelize alert instance
	 * @param {Object} options extra options to be set for alert manager
	 * @return {Object} Promise
	 */
	finishAlert(alert, options){
		const $this= this;			
		alert.end_timestamp= options.end_timestamp;		
		let alertObj= null;
		return alert[$this.managerGetter]()
		.then(alertManagerObject => {
			return db.sequelize.transaction(function(t){
				return alert.save({transaction: t})				
				.then((alert) => {
					alertObj= alert;
					_.merge(alertManagerObject, options);
					return alertManagerObject.save({transaction: t});			
				})
				.then((alertManager) => {					
					log.info($this.alertName, "alert is ended. Alert Manager Data:", alertManagerObject.get({ plain: true }));
					// adding to sequelize object so it is not removed by get({plain:true})
					alertObj.dataValues[$this.managerAs]= alertManager.get({ plain: true });
					return bluebird.resolve(alertObj);
				});		
			});
		});
		
	}

	/**
	 * checkes whether if an alert is started or needs to finish
	 * @param {Integer} deviceId Device ID
	 * @param {Boolean} isViolated true if device is violating the alert, and false otherwise
	 * @param {Object} managerOptions options for the alert manager table
	 * @return {Object} Promise
	 */
	processViolation(deviceId, isViolated, managerOptions){
		const $this= this;
		if(isViolated){			
			return $this.wasViolated(deviceId, managerOptions.condition)
			.then(function(alert){
				if(!alert){	
					log.info($this.alertName, "Alert:", util.format("Device %d has started violating", deviceId), managerOptions.condition);
					return $this.startAlert(deviceId, managerOptions.start);
				}else{
					log.info($this.alertName, "Alert:", util.format("Device %d is already violating.", deviceId), managerOptions.condition);
					return bluebird.resolve();
				}
			});				
		}else{				
			return $this.wasViolated(deviceId, managerOptions.condition)
			.then(function(alert){
				if(alert){	
					log.info($this.alertName, "Alert:", util.format("Device %d has stopped violating", deviceId), managerOptions.condition);
					return $this.finishAlert(alert, managerOptions.finish);
				}else{
					log.info($this.alertName, "Alert:", util.format("Device %d is not violating", deviceId), managerOptions.condition);
					return bluebird.resolve();
				}					
			});				
		}
	}
}

module.exports= Alert;