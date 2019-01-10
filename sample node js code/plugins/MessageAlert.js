const bluebird= require("bluebird");
const alertNotification= require("./alert_notification.js");

class MessageAlert{
	constructor(){}
	
	/*
		This function determines if alertnotification plugin needs to be 
		initiated to send a notification based on a messaging event.
		Alert notification plugin will only be initiated if message sender is a device
	*/
	processAlert(messageData){
		if(messageData.senders.devices.length == 0)	return bluebird.resolve();
		
		const $this= this;
		const deviceId = messageData.senders.devices[0];		
		
		return $this.getCannedMessage(messageData)		
		.then(function(){
			if(messageData.canned_message != undefined){
				messageData.message += ", " + messageData.canned_message;
			}
	
			const message = {
				regular: messageData.message,
				sms: "Msg: " + messageData.message
			};
			
			const startTime = {
				regular: utils.getFormattedTime(messageData.message_timestamp),
				sms: utils.getShortFormattedTime(messageData.message_timestamp)
			};
	
			log.info("send message alert notification for asset_id: "+ deviceId);
			alertNotification.sendAlertNotification(deviceId, "Message", message, startTime);	
			return bluebird.resolve();
		});		
	}

	getCannedMessage(messageData){
		if(messageData.cannedmessage_id == null){
			return bluebird.resolve();
		}

		return db.canned_message.findById(messageData.cannedmessage_id)
		.then(function(cannedData){
			cannedData = cannedData.get({plain: true});
			messageData.canned_message = cannedData.canned_message;
			return bluebird.resolve();
		});
	}
}

module.exports= new MessageAlert();


