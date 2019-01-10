/* global process log */

/*
	This plugin contains all the functions and logic related to sending alert notifications 
	based on Alert Rule specifications set by user through AR module on platform
*/

var bluebird= require("bluebird");
var _ = require("lodash");
var dbMhDevice = require("../db/db_mh_device.js");
var dbComm = require("../db/db_comm.js");

//Fix for bug 2957 as part of platform version 2.7.0. definig utils as global 
//was getting required when invoked form speed or report plugin.
//This is because utils was not defined as a global inside those plugins
var utils = require("../lib/utils.js");


/** 
 * This function is invoked bu the other plugins when an asset has begun violating any of the respective alerts
 * The function sends alert notifications 
 * 
 * @method sendAlertNotification
 * @memberof alert_notification.js
 * @param {string} imei - unique imei of the asset
 * @param {string} alertType - type of the alert being violated
 * @param {obj} message - custom messages from the respective alert plugin
 * @param {obj} startTime - custom formatted times of when the alert was triggered
 * @return {object} - promise indicating end of process
*/
var sendAlertNotification = function(imei, alertType, message, startTime){
	log.info("Sending alert notification for imei: ", imei, "alert type: ", alertType, "start time: ", startTime.regular);
	return db.sequelize.transaction(function (t) {
		var transaction = t;
		return getNotificationInfoForAsset(imei, alertType, transaction)
		.then(function(info){
			return processAlertNotification(imei, alertType, message, startTime, info.reportInfo, info.alertRules, info.deviceInfo, transaction);
		});
	});
};

/** 
 * This function queries and get's relevant notification info like,
 * alert rules assigned to the asset, latest gps report info and device info
 * 
 * @method getNotificationInfoForAsset
 * @memberof alert_notification.js
 * @param {string} imei - unique imei of the asset
 * @param {string} alertType - type of the alert being violated
 * @param {key} transaction - contains transaction info
 * @return {object} - object containing notification info related to the asset
*/
function getNotificationInfoForAsset(deviceId, alertType, transaction){
	var sourceParameters = {};
	return getGroupsOfDevice(deviceId, transaction)
	.then(function(result){
		sourceParameters.device_id = result[0].id;
		sourceParameters.groups_ids = _.map(result[0].groups, "id");
		sourceParameters.device_name = result[0].name;
		sourceParameters.client_id = result[0].client_id;
		return getArForMemberDevices(sourceParameters.device_id, alertType, transaction);
	})
	.then(function(alertRuleIds){
		sourceParameters.alert_rule_ids = alertRuleIds;
		return getArForMemberGroups(sourceParameters.groups_ids, alertType, transaction);
	})
	.then(function(alertRuleIds){
		sourceParameters.alert_rule_ids = _.concat(alertRuleIds, sourceParameters.alert_rule_ids);
		sourceParameters.alert_rule_ids = _.uniq(sourceParameters.alert_rule_ids);
		return getDeviceReportInfo(sourceParameters.device_id, transaction);
	})
	.then(function(reportData){
		sourceParameters.reportInfo = reportData;
		return getArInfo(sourceParameters.alert_rule_ids, transaction);
	})
	.then(function(alertRules){
		var deviceInfo = {
			device_name: sourceParameters.device_name,
			client_id: sourceParameters.client_id
		};
		return bluebird.resolve({"alertRules": alertRules, "reportInfo": sourceParameters.reportInfo, "deviceInfo": deviceInfo});
	});
}

/** 
 * This function queries and get's relevant notification info like,
 * alert rules assigned to the asset, latest gps report info and device info
 * 
 * @method processAlertNotification
 * @memberof alert_notification.js
 * @param {string} imei - unique imei of the asset
 * @param {string} alertType - type of the alert being violated
 * @param {obj} message - custom messages from the respective alert plugin
 * @param {obj} startTime - custom formatted time of when the alert was triggered
 * @param {object} reportInfo - object containing info related to latest gps report of the asset
 * @param {array} alertRules - Array containing data of all the relevant alert rules
 * @param {object} device info - object containing info related to the asset
 * @param {key} transaction - contains transaction info
 * @return {object} -promise indicating end of process
*/
function processAlertNotification(imei, alertType, message, startTime, reportInfo, alertRules, deviceInfo, transaction){
	if (alertRules.length == 0) {
		log.info("No alert rule is available for asset_id: ", imei, alertType);
		return;
	}

	var notificationInfo = {
		message: message.regular,
		startTime: startTime.regular,
		alertType: alertType,
		imei: imei,
		device_name: deviceInfo.device_name,
		client_id: deviceInfo.client_id,
		smsFormat: {
			message: message.sms,
			startTime: startTime.sms + " GMT"
		},
		speed: "N/A",
		heading: "N/A",
		location: "N/A",
		googleLink: ""
	};

	if(!_.isEmpty(reportInfo)){
		var lat = reportInfo.latitude.toFixed(5);
		var lon = reportInfo.longitude.toFixed(5);
		var heading = ConvertHeadingToString(reportInfo.heading);
		var speed = reportInfo.speed;
		
		var location = lat + "/" + lon;
		var googleLink = "http://maps.google.com/maps?q=loc:" + lat + "," + lon;
			
		if (lat == undefined || isNaN(lat) || lon == undefined || isNaN(lon)) {
			location = "N/A";
			googleLink = "";
		}

		if (speed == undefined || isNaN(speed)) {
			speed = "N/A";
		}

		if (heading == undefined) {
			heading = "N/A";
		}

		
		notificationInfo.speed = speed;
		notificationInfo.heading = heading;
		notificationInfo.location = location;
		notificationInfo.googleLink = googleLink;
	}

	return processSubscribers(notificationInfo, alertRules, transaction);
}

function processSubscribers(notificationInfo, alertRules, transaction){
	var subscriberDevices = [];
	var subscriberGroups = [];
	var subscriberUsers = [];

	_.forEach(alertRules, function(alertRule){
		subscriberDevices = _.concat(alertRule.subscribers.devices, subscriberDevices);
		subscriberGroups = _.concat(alertRule.subscribers.groups, subscriberGroups);
		subscriberUsers = _.concat(_.keys(alertRule.subscribers.users), subscriberUsers);
	});

	var subscribers = {
		devices: _.uniq(subscriberDevices),
		groups: _.uniq(subscriberGroups),
		users: _.uniq(subscriberUsers)
	};

	//log.info("processAlertNotification", subscribers, notificationInfo);
	return formatAndSendNotifications(subscribers, notificationInfo, alertRules, transaction);
}

/** 
 * This function queries and get's groups that the asset/device belongs to
 * 
 * @method getGroupsOfDevice
 * @memberof alert_notification.js
 * @param {string} imei - unique imei of the asset
 * @param {key} transaction - contains transaction info
 * @return {array} - Groups related to the device
*/
function getGroupsOfDevice(deviceId, transaction){
	return db.device.findAll({
		where: {id: deviceId},
		include: [{
			model: db.group,
			attributes: ["id"],
			required: false
		}],
		transaction: transaction
	});
}

/** 
 * This function queries and get's latest gps report info for the device
 * 
 * @method getDeviceReportInfo
 * @memberof alert_notification.js
 * @param {int} deviceId - id of the device
 * @param {key} transaction - contains transaction info
 * @return {object} - latest gps report data
*/
function getDeviceReportInfo(deviceId, transaction){
	return db.latest_report.findOne({
		where: {device_id: deviceId},
		transaction: transaction
	})
	.then(function(reportData){
		if(!reportData){
			return bluebird.resolve({});
		}
		reportData = reportData.get({plain: true});
		return bluebird.resolve(reportData);
	});
}

/** 
 * This function queries and get's all alert rules where device is a member of
 * given alert rules are active/enabled and that they also monitor type of alert
 * 
 * @method getArForMemberDevices
 * @memberof alert_notification.js
 * @param {int} deviceId - id of the device
 * @param {string} alertType - type of alert being violated
 * @param {key} transaction - contains transaction info
 * @return {array} - Alert Rules Id's
*/
function getArForMemberDevices(deviceId, alertType, transaction){
	return db.alert_rule.findAll({
		where: {enabled: 1},
		include: [{
			model: db.alert_type,
			where: {type: alertType},
			as: "AlertTypes",
			attributes: ["id"]
		}, {
			model: db.device,
			where: {id: deviceId},
			as: "ArMemberDevices",
			attributes: ["id"]
		}],
		transaction: transaction
	})	
	.then(function(alertRules){
		var alertRuleIds = _.map(alertRules, function(alertRule){
			alertRule = alertRule.get({plain: true});
			return alertRule.id;	
		});
		return bluebird.resolve(alertRuleIds);
	}); 
}

/** 
 * This function queries and get's all alert rules that groups are members of
 * given alert rules are active/enabled and that they also monitor type of alert
 * 
 * @method getArForMemberGroups
 * @memberof alert_notification.js
 * @param {array} groupIdArray - groups id's
 * @param {string} alertType - type of alert being violated
 * @param {key} transaction - contains transaction info
 * @return {array} - Alert Rules Id's
*/
function getArForMemberGroups(groupIdArray, alertType, transaction){
	return db.alert_rule.findAll({
		where: {enabled: 1},
		include: [{
			model: db.alert_type,
			where: {type: alertType},
			as: "AlertTypes",
			attributes: ["id"]
		}, {
			model: db.group,
			where: {id: groupIdArray},
			as: "ArMemberGroups",
			attributes: ["id"]
		}],
		transaction: transaction
	})	
	.then(function(alertRules){
		var alertRuleIds = _.map(alertRules, function(alertRule){
			alertRule = alertRule.get({plain: true});
			return alertRule.id;	
		});
		return bluebird.resolve(alertRuleIds);
	}); 
}

/** 
 * This function queries and get's all alert rules and respective subscriber information 
 * for specific alert rule ids
 * 
 * @method getArInfo
 * @memberof alert_notification.js
 * @param {array} alertRuleIds - Alert Rule id's
 * @param {key} transaction - contains transaction info
 * @return {array} - Alert Rules and respective subscriber data
*/
function getArInfo(alertRuleIds, transaction){
	return db.alert_rule.findAll({
		where: {id: alertRuleIds},
		include: [{
			model: db.device,
			as: "ArSubscriberDevices",
			attributes: ["id"],
			required: false
		}, {
			model: db.group,
			as: "ArSubscriberGroups",
			attributes: ["id"],
			required: false
		}, {
			model: db.user,
			as: "ArSubscriberUsers",
			attributes: ["id"],
			through: {
				attributes: ["send_email", "send_sms"]
			},
			required: false
		}],
		transaction: transaction
	})
	.then(function(alertRules){
		alertRules = _.map(alertRules, function(alertRule){	
			alertRule = alertRule.get({plain: true});
			alertRule.subscribers = {
				devices: _.map(alertRule.ArSubscriberDevices, "id"),
				groups: _.map(alertRule.ArSubscriberGroups, "id")
			};

			alertRule.subscribers.users = {};
			_.each(alertRule.ArSubscriberUsers, function(user){
				alertRule.subscribers.users[user.id] = {
					send_sms: user.alert_rule_subscriber_users.send_sms,
					send_email: user.alert_rule_subscriber_users.send_email
				};
			});
			alertRule = _.omit(alertRule, ["title", "client_id", "enabled", "AlertTypes", "ArMemberDevices", "ArMemberGroups", "ArSubscriberDevices", "ArSubscriberGroups", "ArSubscriberUsers"]);
			return alertRule;
		});
		return bluebird.resolve(alertRules);
	});
}

/** 
 * This function formats notification based on type of recipient and sends the notifications
 * 
 * @method formatAndSendNotifications
 * @memberof alert_notification.js
 * @param {object} subscribers - info of all the subscribers
 * @param {object} notificationInfo - info that is used as content for the notification messages
 * @param {array} alertRules- Alert Rules data
 * @return {object} - promise indicating end of process
*/
function formatAndSendNotifications(subscribers, notificationInfo, alertRules, transaction){
	return formatAndSendNotificationDevicesOrGroups(subscribers, notificationInfo, transaction)
	.then(function(){
		return getRecipientsOfUsers(subscribers.users, alertRules, transaction);
	})
	.tap(function(objOfSmsAndEmails){
		log.info("sending email notification to following emails", objOfSmsAndEmails.arrayOfEmails);
		return formatAndSendEmails(notificationInfo, objOfSmsAndEmails.arrayOfEmails);
	})
	.then(function(objOfSmsAndEmails){
		log.info("sending sms notification to following numbers", objOfSmsAndEmails.arrayOfSms);
		return formatAndSendSms(notificationInfo, objOfSmsAndEmails.arrayOfSms);
	});
}

/** 
 * This function formats notification for sms and sends it
 * 
 * @method formatAndSendSms
 * @memberof alert_notification.js
 * @param {object} notificationInfo - info that is used as content for the notification messages
 * @param {array} arrayOfSms - array of sms phone numbers to deliver notifications to
 * @return {object} - promise indicating end of process
*/
function formatAndSendSms(notificationInfo, arrayOfSms){
	var smsBody = formatSmsNotification(notificationInfo);
	var smsData= {
		client_id: notificationInfo.client_id,
		to: null,
		body: smsBody
	};

	return bluebird.map(arrayOfSms, function(sms){
		smsData.to= sms;
		return utils.sendSms(smsData);
	});
}

/** 
 * This function formats notification for email and sends it
 * 
 * @method formatAndSendEmail
 * @memberof alert_notification.js
 * @param {object} notificationInfo - info that is used as content for the notification messages
 * @param {array} arrayOfEmails - array of email addresses to deliver notifications to
 * @return {object} - promise indicating end of process
*/
function formatAndSendEmails(notificationInfo, arrayOfEmails){
	var emailInfo = formatEmailNotification(notificationInfo);

	var emailData = {		
		to: null,
		subject: emailInfo.subject,
		text: emailInfo.body
	};

	return bluebird.map(arrayOfEmails, function(email){
		emailData.to = email;
		return utils.sendEmail(emailData);
	});
}

/** 
 * This function queries and returns respiective comm_ids for the ids passed
 * 
 * @method formatAndSendNotificationDevicesOrGroups
 * @memberof alert_notification.js
 * @param {object} subscribers - info of all the subscribers
 * @param {object} notificationInfo - info that is used as content for the notification messages
 * @param {key} transaction - contains transaction info
 * @return {object} - promise indicating end of process
*/
function formatAndSendNotificationDevicesOrGroups(subscribers, notificationInfo, transaction){
	var s2cTextData = {
		client_id: notificationInfo.client_id,
		canned_number: null,
		message: formatTextNotification(notificationInfo),
		source_message_id: null,
		is_alert_message: true
	};
	
	return dbComm.getCommIds(subscribers.devices, "assets", transaction)
	.then(function(deviceCommIds){
		s2cTextData.recipient_comm_ids = deviceCommIds;
		return dbComm.getCommIds(subscribers.groups, "groups", transaction);
	})
	.then(function(groupCommIds){
		s2cTextData.recipient_comm_ids = _.concat(s2cTextData.recipient_comm_ids, groupCommIds);
		return dbComm.getCommIds([notificationInfo.client_id], "client", transaction);
	})
	.then(function(clientCommId){
		s2cTextData.sender_comm_id = clientCommId[0];
		if(s2cTextData.recipient_comm_ids.length == 0){
			return bluebird.resolve();
		}
		log.info("Sending notifications to devices with commIds", s2cTextData.recipient_comm_ids);
		dbMhDevice.callMHWS(s2cTextData, "/mh/v1/message", "POST");
		return bluebird.resolve();
	});
}


/** 
 * This function processes and appends emails and sms of users that are selected to receive notifications
 * 
 * @method getRecipientsOfUsers
 * @memberof alert_notification.js
 * @param {array} subscribers - ids of all the subscribers who are users
 * @param {array} alertRules- Alert Rules data
 * @param {key} transaction - contains transaction info
 * @return {object} - object containing array of emails and sms to which notifications must be sent to
*/
function getRecipientsOfUsers(subscribers, alertRules, transaction){
	let arrayOfEmails = [];
	let arrayOfSms = [];

	return db.user.findAll({
		where: {id: subscribers},
		transaction: transaction
	})
	.then(function(users){		
		_.forEach(users, function(user){
			user = user.get({plain: true});
			_.forEach(alertRules, function(alertRule){
				//check if AR requires to send email for this user
				if(alertRule.subscribers.users[user.id] && alertRule.subscribers.users[user.id].send_email == 1){
					arrayOfEmails.push(user.email);
				}
				//check if AR requires to send sms for this user
				if(alertRule.subscribers.users[user.id] && alertRule.subscribers.users[user.id].send_sms == 1){
					arrayOfSms.push(user.phone_number);
				}
			});
		});

		var objOfSmsAndEmails = {
			arrayOfEmails: arrayOfEmails,
			arrayOfSms: arrayOfSms
		};
		
		return bluebird.resolve(objOfSmsAndEmails); 
	});
}


/** 
 * This function formats notification as text messages
 * 
 * @method formatTextNotification
 * @memberof alert_notification.js
 * @param {object} notificationInfo - info that is used as content for the notification messages
 * @return {string} - final formatted text notification
*/
function formatTextNotification(notificationInfo){
	if(notificationInfo.message == undefined || notificationInfo.message == null){
		notificationInfo.message = "";
	}
	var textMessageStr = "F: " + notificationInfo.device_name + 
						"\n G: " + notificationInfo.location +  " head " + notificationInfo.heading + 
						"\n T: " + notificationInfo.message + 
						"\n " + notificationInfo.startTime;

	var textMsgStrPocket = "From: " + notificationInfo.device_name +
							"\nGPS: " + notificationInfo.location +  " head " + notificationInfo.heading;
							
	if (notificationInfo.alertType == "Message") {
		textMsgStrPocket += "\nText: " + notificationInfo.message;
	}
	else{
		textMsgStrPocket += "\nType: " + notificationInfo.message;
	}
	
	textMsgStrPocket += "\nDate: " + notificationInfo.startTime + "\n" + notificationInfo.googleLink;

	var finalStr = textMessageStr + "\n|SCC POCKET FORMAT|\n" + textMsgStrPocket;

	return finalStr;
}


/** 
 * This function formats notification as email
 * 
 * @method formatEmailNotification
 * @memberof alert_notification.js
 * @param {object} notificationInfo - info that is used as content for the notification messages
 * @return {object} - final email data containing formatted subject and body
*/
function formatEmailNotification(notificationInfo){
	var emailSubject = notificationInfo.alertType + ": " + notificationInfo.device_name;
	var emailBody = "From: " + notificationInfo.device_name +
					"\nGPS: " + notificationInfo.location + " head " + notificationInfo.heading;
	
	if (notificationInfo.alertType == "Message") {
		emailBody += "\nText: " + notificationInfo.message;
	}
	else{
		emailBody += "\nType: " + notificationInfo.message;
	}

	emailBody += "\nDate: " + notificationInfo.startTime + "\n" + notificationInfo.googleLink;

	var emailData = {
		subject: emailSubject,
		body: emailBody 
	};

	return emailData;
}

/** 
 * This function formats notification as sms
 * 
 * @method formatSmsNotification
 * @memberof alert_notification.js
 * @param {object} notificationInfo - info that is used as content for the notification messages
 * @return {object} - final sms data containing formatted body
*/
function formatSmsNotification(notificationInfo){

	var smsBody = notificationInfo.smsFormat.message + ">" + notificationInfo.device_name +
					"\n" + notificationInfo.smsFormat.startTime;
					
	if (notificationInfo.alertType != "Message") {
		smsBody += "\n" + notificationInfo.googleLink;
	}
	
	/*var smsBody = "From: " + notificationInfo.device_name +
					"\nGPS: " + notificationInfo.location + " head " + notificationInfo.heading;
	smsBody += "\nDate: " + notificationInfo.startTime;
	*/

	return smsBody;
}


/** 
 * This function converts heading from decimal to corresponsing directions as strings
 * 
 * @method ConvertHeadingToString
 * @memberof alert_notification.js
 * @param {double} heading - heading in decimal format
 * @return {string} - corresponsing directions as string
*/
function ConvertHeadingToString(heading) {
	if (heading > 337.5 || heading <= 22.5) return "North";
	if (heading > 22.5 || heading <= 67.5) return "North East";
	if (heading > 67.5 || heading <= 112.5) return "East";
	if (heading > 112.5 || heading <= 157.5) return "South East";
	if (heading > 157.5 || heading <= 202.5) return "South";
	if (heading > 202.5 || heading <= 247.5) return "South West";
	if (heading > 247.5 || heading <= 292.5) return "West";
	if (heading > 292.5 || heading <= 337.5) return "North West";

	return "N/A";
}

module.exports = {
	sendAlertNotification: sendAlertNotification
};