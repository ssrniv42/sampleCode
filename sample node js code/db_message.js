/* global log, db */

var bluebird = require("bluebird");
var _ = require("lodash");
var mime = require("mime-types");
var dbDevice = require("./db_device.js");
var dbPermission= require("./db_permission.js");
var dbComm = require("./db_comm.js");

/**
 * Returns messages belonging to the suer based on folder type, page number and page limit
 *
 * @method getMessages
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @return {object} list of messages and all the info associated with it
 */
var getMessages = function(user, messageParams){
	return processGetMessages(user, messageParams)
	.then(function(){
		//only process the logic if a search parameter is passed to the route
		if(messageParams.searchParam != undefined && messageParams.messageIds.length > 0){
			var messageIdsToSearch = messageParams.messageIds;
			return processAndGetMessagesForSearch(user, messageIdsToSearch, messageParams);
		}
		else return bluebird.resolve();
	})
	.then(function(){
		//no need to search if there are no messages. return empty object and page number should always 
		if(messageParams.messageIds.length > 0 && (!isNaN(messageParams.pageNumber) || messageParams.pageNumber != null)){
			return getAllMessages(user, messageParams);
		}
		else{
			return bluebird.resolve({});
		}
	})
	.then(function(messages){
		return bluebird.resolve({message: "GET messages successfull", result: {messages: messages, total_message_count: messageParams.messageIds.length}});
	});
};


/**
 * Returns summary of number of messages in the different folders (inbox, sent, and trash)
 *
 * @method getMessageInfo
 * @memberof db_message
 * @param {object} user - user information object 
 * @return {object} - On success (message with info requested), on faliure (error message)
 */
var getMessageInfo = function(user){
	var messageInfo = {};

	return getInboxCount(user, messageInfo)
	.then(function(){
		return getSentCount(user, messageInfo);
	})
	.then(function(){
		return getTrashCount(user, messageInfo);
	})
	.then(function(){
		return bluebird.resolve({message: "Get message info successfull", result: messageInfo});
	});
};

/**
 * Returns list of canned messages related to the client group
 *
 * @method getAllCannedMessage
 * @memberof db_message
 * @param {object} user - user information object 
 * @return {object} - On success (message with info requested), on faliure (error message)
 */
var getAllCannedMessage = function(user){
	return db.canned_message.findAll({where: {client_id: user.client_id}})
	.then(function(cannedMessages){
		cannedMessages = _.map(cannedMessages, function(cannedMessage){
			cannedMessage = cannedMessage.get({plain: true});
			return cannedMessage;
		});
		cannedMessages = _.keyBy(cannedMessages, "id");
		return bluebird.resolve({message: "GET All canned messages Successful", result: cannedMessages});
	});
};


/**
 * Sends a message to the list of recipients provided
 *
 * @method postMessage
 * @memberof db_message
 * @param {object} user - user information object
 * @param {object} messageData - Info containing message data
 * @return {object} - On success (message with info requested), on faliure (error message)
 */
var postMessage = function(user, messageData){
	return db.sequelize.transaction(function(t){
		if(messageData.client_id == undefined){
			messageData.client_id = user.client_id;
		}

		if(messageData.message_timestamp == undefined){
			messageData.message_timestamp = Math.round(new Date().getTime() / 1000);
		}

		if(messageData.senders == undefined){
			messageData.senders = {users: [user.user_id], devices: []};
		}

		var options = {user: user, transaction: t};

		return processInsertMessage(messageData, options);
	})
	.then(function(message){
		return getMessageById(message.id);
	})
	.then(function(message){
		return bluebird.resolve({message: "POST message successfull", result: message}); 
	});
};


/**
 * Updates status of a message based on user actions like message read, message deleted, message restored
 *
 * @method putMessage
 * @memberof db_message
 * @param {object} user - user information object
 * @param {object} messageData - Info containing message data
 * @return {object} - On success (message with info requested), on faliure (error message)
 */
var putMessage = function(user, messageData){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		return processUpdateMessage(messageData, options);
	})
	.then(function(){
		var messageParams = {
			pageLimit: messageData.id.length,
			folder: messageData.folder,
			offset: 0,
			sortByDesc: true,
			messageIds: messageData.id
		};
		return getAllMessages(user, messageParams);
	})
	.then(function(message){
		return bluebird.resolve({message: "PUT message successfull", result: message}); 
	});
};

/**
 * Resend message to a recipient device/devices based on user request (normally used if message has previously failed or still pending)
 *
 * @method resendMessageToDevices
 * @memberof db_message
 * @param {object} user - user information object
 * @param {object} messageData - Info containing message data
 * @return {object} - On success (message with info requested), on faliure (error message)
 */
var resendMessageToDevices = function(user, messageData){
	return getMessageById(messageData.message_id)
	.tap(function(message){
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			return processAndResendMessage(user, message, messageData.recipient_devices, options);
		});
	})
	.then(function(message){
		return bluebird.resolve({message: "POST resend message successfull", result: message}); 
	});		
};

/**
 * Returns data related to the attachment that the user is trying to view
 *
 * @method getAttachmentData
 * @memberof db_message
 * @param {object} user - user information object
 * @param {int} attachmentId - id of the respective attachment
 * @return {object} - On success (message with info requested), on faliure (error message)
 */
var getAttachmentData = function(user, attachmentId){
	return db.message_attachment.findOne({
		where: {id: attachmentId}
	})
	.then(function(attachment){
		if(!attachment){
			var errorMessage = "Attachment data not found for id: " + attachmentId; 
			throw new Error(errorMessage);
		}
		attachment = attachment.get({plain: true});
		attachment.attachment_data = new Buffer(attachment.attachment_data, "binary").toString("base64");
		return bluebird.resolve({message: "GET attachemnt data successfull", result: attachment.attachment_data});
	});

};


/**
 * Returns data related to conversation between platform user and a particular device (to use in chat box in data display)
 *
 * @method getMessagesForChatBox
 * @memberof db_message
 * @param {object} user - user information object
 * @param {int} deviceId - id of the respective device that the user is chatting with
 * @return {object} - On success (message with info requested), on faliure (error message)
 */
var getMessagesForChatBox = function(user, deviceId){
	var messageParams = {
		messageIds: [],
		offset: 0,
		pageLimit: 50,
		sortByDesc: true,
		monitored_devices: [deviceId],
		monitored_users: [user.user_id]
	};

	return getConversationBetweenUserAndDevice(user, messageParams, true)
	.then(function(){
		return getAllMessages(user, messageParams);
	})
	.then(function(messages){
		return bluebird.resolve({message: "GET message for device successfull", result: messages}); 
	});
};


module.exports = {
	getMessages: getMessages,
	getMessageInfo: getMessageInfo,
	getAllCannedMessage: getAllCannedMessage,
	postMessage: postMessage,
	putMessage: putMessage,
	resendMessageToDevices: resendMessageToDevices,
	getAttachmentData: getAttachmentData,
	getMessagesForChatBox: getMessagesForChatBox,
	getMessageById: getMessageById
};


/**
 * Queries and returns messages and respective data based on parameters passed
 *
 * @method getAllMessages
 * @memberof db_message
 * @param {object} user - user information object
 * @param {object} messageParams - Parameters that determine folder, pagination info
 * @return {object} - Promise with list of messages and respective data
 */
function getAllMessages(user, messageParams){
	messageParams.orderByClause = "message.message_timestamp DESC";
	if(messageParams.sortByDesc == "false"){
		messageParams.orderByClause = "message.message_timestamp ASC";
	}

	return db.message.findAll({
		//logging: console.log,
		where: {client_id: user.client_id, id: {$in: messageParams.messageIds}},
		include: [{
			model: db.device,
			as: "MessageSenderDevices",
			attributes: ["id"],
			required: false
		}, {
			model: db.user,
			as: "MessageSenderUsers",
			attributes: ["id"],
			through: {
				attributes: ["message_archived", "message_deleted"]
			},
			required: false
		}, {
			model: db.device,
			as: "MessageRecipientDevices",
			attributes: ["id"],
			through: {
				attributes: ["message_status"]
			},
			required: false
		}, {
			model: db.user,
			as: "MessageRecipientUsers",
			attributes: ["id"],
			through: {
				attributes: ["message_status", "message_read", "message_archived", "message_deleted"]
			},
			required: false
		}, {
			model: db.message_attachment,
			as: "attachments",
			required: false
		}],
		offset: messageParams.offset,
		limit: parseInt(messageParams.pageLimit),
		order: messageParams.orderByClause
	})
	.then(function(messages){
		messages = _.map(messages, function(message){
			return refineMessageData(message);
		});
		messages = _.keyBy(messages, "id");
		//messages.total_count = messageParams.messageIds.length;
		return bluebird.resolve(messages);
	});	
}

/**
 * Queries and returns message data based on message id passed
 *
 * @method getMessageById
 * @memberof db_message
 * @param {int} id - id of the message
 * @return {object} - Promise with message data
 */
function getMessageById(id){
	return db.message.findOne({
		//logging: console.log,
		where: {id: id},
		include: [{
			model: db.device,
			as: "MessageSenderDevices",
			attributes: ["id"],
			required: false
		}, {
			model: db.user,
			as: "MessageSenderUsers",
			attributes: ["id"],
			through: {
				attributes: ["message_archived", "message_deleted"]
			},
			required: false
		}, {
			model: db.device,
			as: "MessageRecipientDevices",
			attributes: ["id"],
			through: {
				attributes: ["message_status"]
			},
			required: false
		}, {
			model: db.user,
			as: "MessageRecipientUsers",
			attributes: ["id"],
			through: {
				attributes: ["message_status", "message_read", "message_archived", "message_deleted"]
			},
			required: false
		}, {
			model: db.message_attachment,
			as: "attachments",
			required: false
		}],
		order: "message.id DESC"
	})
	.then(function(message){
		if(!message){
			log.warn("Message data not found for id", id);
			return bluebird.resolve({});
		}
		return bluebird.resolve(refineMessageData(message));
	});	
}


/**
 * Refines and restructures the message data to match expectation on the front end
 *
 * @method refineMessageData
 * @memberof db_message
 * @param {object} rawMessage - message data as returned by the db models
 * @return {object} - Promise with refined and restructured message data
 */
function refineMessageData(rawMessage){
	var message = rawMessage.get({plain: true});

	message.senders = {
		devices: _.map(message.MessageSenderDevices, "id"),
		users: _.map(message.MessageSenderUsers, "id"),
		user_sender_info: {}
	};


	message.recipients = {
		devices: _.map(message.MessageRecipientDevices, "id"),
		device_message_status: {},
		users: _.map(message.MessageRecipientUsers, "id"),
		user_recipient_info: {}	
	};
	
	_.each(message.MessageRecipientUsers, function(user){
		message.recipients.user_recipient_info[user.id] = {
			message_read: user.message_recipient_users.message_read,
			message_archived: user.message_recipient_users.message_archived,
			message_deleted: user.message_recipient_users.message_deleted
		};			
	});

	_.each(message.MessageSenderUsers, function(user){
		message.senders.user_sender_info[user.id] = {
			message_archived: user.message_sender_users.message_archived,
			message_deleted: user.message_sender_users.message_deleted
		};			
	});

	_.each(message.MessageRecipientDevices, function(device){
		message.recipients.device_message_status[device.id] = {
			message_status: device.message_recipient_devices.message_status
		};
	});

	message.attachments = _.map(message.attachments, function(attachment){
		attachment.attachment_size = _.round(attachment.attachment_size * 0.001, 1);
		attachment = _.omit(attachment, ["attachment_data"]);
		return attachment;
	});

	message = _.omit(message, ["MessageSenderDevices", "MessageSenderUsers", "MessageRecipientDevices", "MessageRecipientUsers"]);
	
	return message; 
}


/**
 * Processes and returns message Ids based on parameters passed, 
 * the message ids are appended to messageParam object
 *
 * @method processGetMessages
 * @memberof db_message
 * @param {object} user - user information object
 * @param {object} messageParams - Parameters that determine folder, pagination info
 * @return {object} - Promise and message Ids that meets parameter criteria
 */
function processGetMessages(user, messageParams){
	if(messageParams.folder == "inbox"){
		//Taking care of case when page range has changed
		return getInboxMessageIds(user, messageParams)
		.then(function(){
			return calculateOffset(messageParams, messageParams.messageIds.length);
		});
	}
	else if(messageParams.folder == "sent"){
		//Taking care of case when page range has changed
		return getSentMessageIds(user, messageParams)
		.then(function(){
			return calculateOffset(messageParams, messageParams.messageIds.length);
		});
	}
	else if(messageParams.folder == "trash"){
		//Taking care of case when page range has changed
		return getTrashMessageIds(user, messageParams)
		.then(function(){
			return calculateOffset(messageParams, messageParams.messageIds.length);
		});
	}
	else if(messageParams.folder == "monitor"){
		//Taking care of case when page range has changed
		return getMonitoredMessageIds(user, messageParams)
		.then(function(){
			return calculateOffset(messageParams, messageParams.messageIds.length);
		});
	}
	else{
		var errorMessage = "Invalid page type ("+ messageParams.folder + ") sent to GET message route"; 
		throw new Error(errorMessage);
	}
}


/**
 * Calculates page offset that determines the messages to load for a particular page
 *
 * @method calculateOffset
 * @memberof db_message
 * @param {object} messageParams - Parameters that determine folder, pagination info
 * @param {int} count - total messages related to a folder (sent, inbox, trash, monitor)
 * @return {object} - Promise indicating end of process
 */
function calculateOffset(messageParams, count){
	messageParams.offset = messageParams.pageLimit * (messageParams.pageNumber - 1);
	if(messageParams.offset >= count && messageParams.offset >= messageParams.pageLimit){
		messageParams.offset = messageParams.offset - messageParams.pageLimit; 
	}
	return bluebird.resolve();
}

/**
 * Processes and inserts a new message 
 *
 * @method processInsertMessage
 * @memberof db_message
 * @param {object} messageData - data related to the message
 * @param {object} options - contains user and transaction info
 * @return {object} - Promise indicating end of process
 */
function processInsertMessage(messageData, options){
	if(!messageData.senders || (messageData.senders.users.length == 0 && messageData.senders.devices.length == 0)){
		throw new Error("POST message failed. Data must contain a sender");
	}

	if(messageData.senders && (messageData.senders.users.length > 0 && messageData.senders.devices.length > 0)){
		throw new Error("POST message failed. Message cannot be sent my a user and a device at the same time");
	}

	if(!messageData.recipients || (messageData.recipients.users.length == 0 && messageData.recipients.devices == 0)){
		throw new Error("POST message failed. Data must contain at least one recipient");
	}

	if(messageData.cannedmessage_id == "NULL" || messageData.cannedmessage_id == "null" || messageData.cannedmessage_id == undefined){
		messageData.cannedmessage_id = null;
	}

	var dbMessage = db.message.build(messageData);

	return dbMessage.save({user: options.user, transaction: options.transaction})
	.tap(function(message){
		return addAttachments(message.id, messageData, options);	
	})
	.tap(function(message){
		return addMessageSenderUsers(message, messageData, options);
	})
	.tap(function(message){
		return addMessageSenderDevices(message, messageData, options);
	})
	.tap(function(message){
		return addMessageRecipientUsers(message, messageData, options);
	})
	.tap(function(message){
		return addMessageRecipientDevices(message, messageData, options);
	});
}


/**
 * Inserts attachment and associates it with a message id.
 * if the message has no attachment. It returns a promise
 * @method addAttachments
 * @memberof db_message
 * @param {int} id - id of the message
 * @param {object} messageData - data related to the message being updated
 * @param {object} options - contains user and transaction info
 * @return {object} - Promise indicating end of process
 */
function addAttachments(id, messageData, options){
	if(messageData.attachments != undefined){
		return bluebird.map(messageData.attachments, function(attachment){
			var attachmentObj = {
				message_id: id,
				attachment_timestamp: messageData.message_timestamp,
				attachment_name: attachment.attachment_name,
				attachment_type: attachment.attachment_type,
				attachment_size: attachment.attachment_size,
				attachment_data: new Buffer(attachment.attachment_data, "base64")
			};
			return db.message_attachment.create(attachmentObj, {transaction: options.transaction});
		});
	}
	else return bluebird.resolve();
}


/**
 * Processes and adds association between message and the user that sent it
 * if the message was not sent by a user it will just skip and return a promise.
 *
 * @method addMessageSenderUsers
 * @memberof db_message
 * @param {object} message - raw data from the instance of the message that was added
 * @param {object} messageData - data related to the message
 * @param {object} options - data containing user and transaction info
 * @return {object} - Promise indicating end of process
 */
function addMessageSenderUsers(message, messageData, options){
	if(messageData.senders && messageData.senders.users != undefined && messageData.senders.users.length > 0){
		if(messageData.senders.users.length != 1){
			throw new Error("POST message failed. Data must contain only one sender");
		}
		messageData.message_from_asset = false;
		return message.addMessageSenderUsers(messageData.senders.users, {transaction: options.transaction});
	}
	else return bluebird.resolve();
}

/**
 * Processes and adds association between message and the device that sent it
 * if the message was not sent by a device it will just skip and return a promise.
 * Also validates if the client has access to the device sending the message
 *
 * @method addMessageSenderDevices
 * @memberof db_message
 * @param {object} message - raw data from the instance of the message that was added
 * @param {object} messageData - data related to the message
 * @param {object} options - data containing user and transaction info
 * @return {object} - Promise indicating end of process
 */
function addMessageSenderDevices(message, messageData, options){
	if(messageData.senders && messageData.senders.devices != undefined && messageData.senders.devices.length > 0){
		if(messageData.senders.devices.length != 1){
			throw new Error("POST message failed. Data must contain only one sender");
		}
		messageData.message_from_asset = true;
		return dbPermission.validateUserPermissionForDevices(options.user, messageData.senders.devices)
		.then(function(){
			return message.addMessageSenderDevices(messageData.senders.devices, {transaction: options.transaction});
		});
	}
	else return bluebird.resolve();
}

/**
 * Processes and adds association between message and the users that are receiving the message
 * if the message is not sent to any users it will just skip and return a promise.
 *
 * @method addMessageRecipientUsers
 * @memberof db_message
 * @param {object} message - raw data from the instance of the message that was added
 * @param {object} messageData - data related to the message
 * @param {object} options - data containing user and transaction info
 * @return {object} - Promise indicating end of process
 */
function addMessageRecipientUsers(message, messageData, options){
	if(messageData.recipients && messageData.recipients.users != undefined && messageData.recipients.users.length > 0){
		return message.addMessageRecipientUsers(messageData.recipients.users, {transaction: options.transaction});
	}
	else return bluebird.resolve();
}

/**
 * Processes and adds association between message and the devices that are receiving the message
 * if the message is not sent to any devices it will just skip and return a promise.
 * Also validates if the devies have messaging capability, is valid device that the user has permission to see.
 * Also forwards the message data to MHWS to deliver to the device
 *
 * @method addMessageRecipientDevices
 * @memberof db_message
 * @param {object} message - raw data from the instance of the message that was added
 * @param {object} messageData - data related to the message
 * @param {object} options - data containing user and transaction info
 * @return {object} - Promise indicating end of process
 */
function addMessageRecipientDevices(message, messageData, options){
	if(messageData.recipients && messageData.recipients.devices != undefined && messageData.recipients.devices.length > 0){
		return filterDevicesWithNoMessagingComponent(messageData)
		.then(function(){
			return dbPermission.validateUserPermissionForDevices(options.user, messageData.recipients.devices);
		})
		.then(function(){
			return message.addMessageRecipientDevices(messageData.recipients.devices, {transaction: options.transaction});
		})
		.then(function(){
			//SEND data to MHWS
			messageData.message_id = message.id;
			return processAndSendMessageToDevice(messageData, options);
		});
	}
	else return bluebird.resolve();
}

/**
 * Processes and filters out the devices that don't have messaging component.
 * This is a fail safe in case someone sent invalid devices to the post message route
 *
 * @method filterDevicesWithNoMessagingComponent
 * @memberof db_message
 * @param {object} messageData - data related to the message
 * @return {object} - Promise indicating end of process
 */
function filterDevicesWithNoMessagingComponent(messageData){
	var invalidDevices = [];

	return db.device.findAll({
		where: {id: {$in: messageData.recipients.devices}},
		include: [{
			model: db.device_type,
			required: false,
			include: [{
				model: db.device_type_components,
				as: "components",
				required: false
			}]
		}]
	})
	.then(function(devices){
		_.each(devices, function(device){
			device = device.get({plain: true});

			if(device.device_type.components[0].messaging == false){
				_.pull(messageData.recipients.devices, device.id);
				invalidDevices.push(device.id);
			}
		});

		if(invalidDevices.length > 0){
			var warning = "Cannot send message to following devices as their types don't support messaging: " + invalidDevices;
			log.warn(warning);
		}

		return bluebird.resolve();
	});
}

/**
 * Processes and sends message down to MHWS to deliver message to a device
 *
 * @method processAndSendMessageToDevice
 * @memberof db_message
 * @param {object} messageData - data related to the message
 * @param {object} options - contains transaction info
 * @return {object} - Promise indicating end of process
 */
function processAndSendMessageToDevice(messageData, options){
	var mhData = {};
	//no need to send data to MHWS if sender is a device
	//This is a Asset to Asset message and it should not be routed back to the device
	if(messageData.message_from_asset){
		return bluebird.resolve();
	}
	else{
		return dbComm.getCommIds(messageData.recipients.devices, "assets", options.transaction)
		.then(function(devcieCommIds){
			mhData.recipient_comm_ids = devcieCommIds;
			return processSenderInfoForUser(messageData.senders.users[0], options);
		})
		.then(function(senderInfo){
			mhData.sender_comm_id = senderInfo.user_comm_id;
			mhData.client_id = messageData.client_id;
			if(messageData.message == undefined || messageData.message == null){
				messageData.message = "";
			}
			mhData.message = senderInfo.handle + messageData.message;
			mhData.source_message_id = messageData.message_id;
			mhData.is_alert_message = false;
			return getCannedNumber(messageData.cannedmessage_id, messageData.client_id, options);
		})
		.then(function(cannedNumber){
			mhData.canned_number = cannedNumber;
			mhData.attachments = [];
			if(messageData.attachments != undefined && messageData.attachments.length > 0){
				mhData.attachments = messageData.attachments;
				_.each(mhData.attachments, function(attachment){
					var extention = mime.extension(attachment.attachment_type);
					if(!extention){
						var msg = "Invalid attachment type: " + attachment.attachment_type;
						throw new Error(msg);
					}

					//reset attachemnt type to be value of file extention as MH parses file extentions
					attachment.attachment_type = extention;
				});
			}

			//console.log("Forwarding message to MH", mhData.attachments);
			var dbMhDevice = require("./db_mh_device.js");
			dbMhDevice.callMHWS(mhData, "/mh/v1/message", "POST");
			return bluebird.resolve();
		});
	}
}

/**
 * Queries and gets the canned number associated with the canned message id being passed
 * This canned number is used by device to determine the pre-loaded canned text
 * @method getCannedNumber
 * @memberof db_message
 * @param {int} cannedId - id of the canned message
 * @param {int} clientId - id of the client id
 * @param {object} options - contains transaction info
 * @return {object} - Promise indicating end of process
 */
function getCannedNumber(cannedId, clientId, options){
	if(cannedId == null){
		return bluebird.resolve(null);
	}
	else{
		return db.canned_message.findOne({
			where: {id: cannedId, client_id: clientId},
			transaction: options.transaction
		})
		.then(function(cannedData){
			if(!cannedData){
				var errorMessage = "cannedData not found for id: " + cannedId; 
				throw new Error(errorMessage);
			}
			cannedData = cannedData.get({plain: true});
			return bluebird.resolve(cannedData.canned_number);
		});
	}
}


/**
 * Processes and gets the commid of the sender
 * @method processSenderInfoForUser
 * @memberof db_message
 * @param {int} userId - id of the user sending the message
 * @param {object} options - contains transaction info
 * @return {object} - Promise and sender info for user
 */
function processSenderInfoForUser(userId, options){
	var senderInfo = {};
	return db.user.findOne({
		where: {id: userId},
		transaction: options.transaction
	})
	.then(function(user){
		if(!user){
			var errorMessage = "user not found for id: " + userId; 
			throw new Error(errorMessage);
		}
		user = user.get({plain: true});
		
		senderInfo.handle = "From: " + user.username + "@u, ";

		var tableName = "users";

		var rowId = user.id;

		//Temporary solution until client users also get comm ids
		if(user.role_id == 2){
			tableName = "client";
			senderInfo.handle = "";
			rowId = user.client_id;
		}
		return dbComm.getCommIds([rowId], tableName, options.transaction);
	})
	.then(function(userCommIds){
		senderInfo.user_comm_id = userCommIds[0];
		return bluebird.resolve(senderInfo);
	});
}

/**
 * Processes and updates info (status, read, deleted, recover) of a message based on folder info
 * @method processUpdateMessage
 * @memberof db_message
 * @param {object} messageData - data related to the message being updated
 * @param {object} options - contains user and transaction info
 * @return {object} - Promise indicating end of process
 */
function processUpdateMessage(messageData, options){
	if(messageData.folder == "inbox"){
		//mark message as read or unread
		if(messageData.message_read != undefined && (messageData.message_read == true || messageData.message_read == false)){
			return updateMessageRead(messageData, options);
		}
		//archive inbox message
		else if(messageData.message_archived != undefined && messageData.message_archived == true){
			return archiveInboxMessage(messageData, options);
		}
		else{
			throw new Error("Invalid action sent to PUT message route.");
		}
	}
	else if(messageData.folder == "sent"){
		//archive sent message
		if(messageData.message_archived != undefined && messageData.message_archived == true){
			return archiveSentMessage(messageData, options);
		}
		else{
			throw new Error("Invalid action sent to PUT message route.");
		}
	}
	else if(messageData.folder == "trash"){
		if(messageData.message_deleted != undefined && messageData.message_deleted == true){
			//delete trash message
			return deleteTrashMessage(messageData, options);
		}
		else if(messageData.message_archived != undefined && messageData.message_archived == false){
			//recover trash message
			return recoverTrashMessage(messageData, options);
		}
		else{
			throw new Error("Invalid action sent to PUT message route.");
		}
	}
	else{
		throw new Error("Invalid folder type sent to PUT message route.");
	}
}

/**
 * Updates message read info of a message
 * @method updateMessageRead
 * @memberof db_message
 * @param {object} messageData - data related to the message being updated
 * @param {object} options - contains user and transaction info
 * @return {object} - Promise indicating end of process
 */
function updateMessageRead(messageData, options){
	return db.message_recipient_users.update(
		{message_read: messageData.message_read},
		{where: {user_id: options.user.user_id, message_id: {$in: messageData.id}}}
	);
}

/**
 * Updates and sends inbox message to trash
 * @method archiveInboxMessage
 * @memberof db_message
 * @param {object} messageData - data related to the message being updated
 * @param {object} options - contains user and transaction info
 * @return {object} - Promise indicating end of process
 */
function archiveInboxMessage(messageData, options){
	return db.message_recipient_users.update(
		{message_archived: messageData.message_archived},
		{where: {user_id: options.user.user_id, message_id: {$in: messageData.id}}}
	);
}

/**
 * Updates and sends sent message to trash
 * @method archiveSentMessage
 * @memberof db_message
 * @param {object} messageData - data related to the message being updated
 * @param {object} options - contains user and transaction info
 * @return {object} - Promise indicating end of process
 */
function archiveSentMessage(messageData, options){
	return db.message_sender_users.update(
		{message_archived: messageData.message_archived},
		{where: {user_id: options.user.user_id, message_id: {$in: messageData.id}}}
	);
}

/**
 * Updates and makes trash message unviewable in the trash box. 
 * Giving an illusion to the user that the message has been deleted
 * @method deleteTrashMessage
 * @memberof db_message
 * @param {object} messageData - data related to the message being updated
 * @param {object} options - contains user and transaction info
 * @return {object} - Promise indicating end of process
 */
function deleteTrashMessage(messageData, options){
	//Find out if message was archived from sent box or inbox
	//only in the case that user has sent a message to himself, and has archived the message from 
	//both his inbox and sent box, will the logic hit both conditions

	return db.message_sender_users.update(
		{message_deleted: messageData.message_deleted},
		{where: {user_id: options.user.user_id, message_archived: true, message_deleted: false, message_id: {$in: messageData.id}}}
	)
	.then(function(){
		return db.message_recipient_users.update(
			{message_deleted: messageData.message_deleted},
			{where: {user_id: options.user.user_id, message_archived: true, message_deleted: false, message_id: {$in: messageData.id}}}
		);
	});
}

/**
 * Updates and recovers inbox/sent message from trash
 * @method recoverTrashMessage
 * @memberof db_message
 * @param {object} messageData - data related to the message being updated
 * @param {object} options - contains user and transaction info
 * @return {object} - Promise indicating end of process
 */
function recoverTrashMessage(messageData, options){
	//Find out if message was archived from sent box or inbox
	//only in the case that user has sent a message to himself, and has archived the message from 
	//both his inbox and sent box, will the logic hit both conditions. In this case user will recover both sent and inbox message
	return db.message_sender_users.update(
		{message_archived: messageData.message_archived},
		{where: {user_id: options.user.user_id, message_archived: true, message_deleted: false, message_id: {$in: messageData.id}}}
	)
	.then(function(){
		return db.message_recipient_users.update(
			{message_archived: messageData.message_archived},
			{where: {user_id: options.user.user_id, message_archived: true, message_deleted: false, message_id: {$in: messageData.id}}}
		);
	});
}


/**
 * Queries and gets message Ids of all inbox messages related to the user
 * @method getInboxMessageIds
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @return {object} - Promise and edited messageParams object
 */
function getInboxMessageIds(user, messageParams){
	return db.message_recipient_users.findAll({
		//logging: console.log,
		where: {user_id: user.user_id, message_archived: 0, message_deleted: 0},
		attributes: ["message_id", "message_read"]
	})
	.then(function(messages){
		messageParams.messageIds = [];
		messageParams.unreadMessageIds = [];
		_.each(messages, function(message){
			message = message.get({plain: true});
			messageParams.messageIds.push(message.message_id);
			//get unread count
			if(message.message_read == 0){
				messageParams.unreadMessageIds.push(message.message_id);
			}
		});
		return bluebird.resolve();
	});
}


/**
 * Queries and gets message Ids of all sent box messages of the user
 * @method getSentMessageIds
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @return {object} - Promise and edited messageParams object
 */
function getSentMessageIds(user, messageParams){
	return db.message_sender_users.findAll({
		where: {user_id: user.user_id, message_archived: 0, message_deleted: 0}
	})
	.then(function(messages){
		messageParams.messageIds = [];
		_.each(messages, function(message){
			message = message.get({plain: true});
			messageParams.messageIds.push(message.message_id);
		});
		return bluebird.resolve();
	});
}


/**
 * Queries and gets message Ids of all trash box messages of the user
 * @method getTrashMessageIds
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @return {object} - Promise and edited messageParams object
 */
function getTrashMessageIds(user, messageParams){
	//get trash of messages received by user
	return db.message_recipient_users.findAll({
		where: {user_id: user.user_id, message_archived: 1, message_deleted: 0}
	})
	.then(function(messages){
		messageParams.messageIds = [];
		_.each(messages, function(message){
			message = message.get({plain: true});
			messageParams.messageIds.push(message.message_id);
		});

		//get trash of messages sent by user
		return db.message_sender_users.findAll({
			where: {user_id: user.user_id, message_archived: 1, message_deleted: 0}
		});
	})
	.then(function(messages){
		_.each(messages, function(message){
			message = message.get({plain: true});
			messageParams.messageIds.push(message.message_id);
		});
		messageParams.messageIds = _.uniq(messageParams.messageIds);
		return bluebird.resolve();
	});
}

/**
 * Queries and get count of all messages in inbox and the number of messages that were read
 *
 * @method getInboxCount
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageInfo - object that will store all the count info
 * @return {object} - promise indicating end of process and altered messageInfo object with count
 */
function getInboxCount(user, messageInfo){
	return db.message_recipient_users.count({
		where: {user_id: user.user_id, message_archived: 0, message_deleted: 0}
	})
	.then(function(totalCount){
		messageInfo.inbox_count = totalCount;
		return db.message_recipient_users.count({
			where: {user_id: user.user_id, message_archived: 0, message_deleted: 0, message_read: 0}
		});
	})
	.then(function(unreadCount){
		messageInfo.unread_count = unreadCount;
		return bluebird.resolve();
	});
}

/**
 * Queries and get count of all messages in sent box 
 *
 * @method getSentCount
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageInfo - object that will store all the count info
 * @return {object} - promise indicating end of process and altered messageInfo object with count
 */
function getSentCount(user, messageInfo){
	return db.message_sender_users.count({
		where: {user_id: user.user_id, message_archived: 0, message_deleted: 0}
	})
	.then(function(sentCount){
		messageInfo.sent_count = sentCount;
		return bluebird.resolve();
	});
}

/**
 * Queries and get count of all messages in trash 
 *
 * @method getTrashCount
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageInfo - object that will store all the count info
 * @return {object} - promise indicating end of process and altered messageInfo object with count
 */
function getTrashCount(user, messageInfo){
	let trashCount = 0;

	return db.message_recipient_users.count({
		where: {user_id: user.user_id, message_archived: 1, message_deleted: 0}
	})
	.then(function(recipientCount){
		trashCount = recipientCount;
		
		return db.message_sender_users.count({
			where: {user_id: user.user_id, message_archived: 1, message_deleted: 0}
		});
	})
	.then(function(senderCount){
		trashCount += senderCount;
		messageInfo.trash_count = trashCount;
		return bluebird.resolve();
	});
}

/**
 * Processes and gets message Ids of all monitor box messages of the user
 * @method getMonitoredMessageIds
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @return {object} - Promise and array of message ids
 */
function getMonitoredMessageIds(user, messageParams){
	return findDevicesToMonitor(user)
	.then(function(devicesToMonitor){
		messageParams.monitored_devices = devicesToMonitor;
		return findUsersToMonitor(user);
	})
	.then(function(usersToMonitor){
		messageParams.monitored_users = usersToMonitor;
		//removing the user who is requesting the data from the array list
		//This is because in monitor folder the user should not see messages from his/her own inbox or sentbox or trash
		_.pull(messageParams.monitored_users, user.user_id);
		messageParams.messageIds = [];
		if(messageParams.monitored_devices.length == 0) return bluebird.resolve();				
		else return getAssetToAssetMessages(user, messageParams);
	})
	.then(function(){
		if(messageParams.monitored_users.length == 0) return bluebird.resolve();
		else return getUserToUserMessages(user, messageParams);
	})
	.then(function(){
		if(messageParams.monitored_users.length == 0 || messageParams.monitored_devices.length == 0) return bluebird.resolve();
		else return getConversationBetweenUserAndDevice(user, messageParams, false);
	})
	.then(function(){
		return bluebird.resolve(messageParams.messageIds);
	});
}

/**
 * Queries for devices that the user has access to monitor in monitor box
 * @method findDevicesToMonitor
 * @memberof db_message
 * @param {object} user - user information object 
 * @return {object} - Promise and array of device ids
 */
function findDevicesToMonitor(user){
	return dbDevice.getPermittedDevices(user)
	.then(function(permittedDevices){
		permittedDevices= permittedDevices || [];
		return bluebird.resolve(_.map(permittedDevices, "id"));
	});
}


/**
 * Queries for users that the user has access to monitor in monitor box
 * @method findUsersToMonitor
 * @memberof db_message
 * @param {object} user - user information object 
 * @return {object} - Promise and array of user ids
 */
function findUsersToMonitor(user){
	return dbPermission.getAllPermissions(user, false)
	.then(function(roleData){
		var roles= _.keys(roleData.result);
		return db.user.findAll({
			where: {
				client_id: user.client_id,
				role_id: {$in: roles}
			},
			attributes: { exclude: ["password"] }
		});
	})
	.then(function(userData){
		return bluebird.resolve(_.map(userData, "id"));
	});
}


/**
 * Queries and gets message Ids of all M2M messages between 2 devices/assets
 * @method getAssetToAssetMessages
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @return {object} - Promise indicating end of process
 */
function getAssetToAssetMessages(user, messageParams){
	return db.message.findAll({
		attributes: ["id"],
		where: {client_id: user.client_id},
		include: [{
			model: db.device,
			as: "MessageSenderDevices",
			where: {id: {$in: messageParams.monitored_devices}},
			required: true
		}, {
			model: db.device,
			as: "MessageRecipientDevices",
			where: {id: {$in: messageParams.monitored_devices}},
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			message = message.get({plain: true});
			messageParams.messageIds.push(message.id);
		});
		return bluebird.resolve();
	});
}


/**
 * Queries and gets message Ids of all messages between 2 users
 * @method getUserToUserMessages
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @return {object} - Promise indicating end of process
 */
function getUserToUserMessages(user, messageParams){
	return db.message.findAll({
		attributes: ["id"],
		where: {client_id: user.client_id},
		include: [{
			model: db.user,
			as: "MessageSenderUsers",
			where: {id: {$in: messageParams.monitored_users}},
			required: true
		}, {
			model: db.user,
			as: "MessageRecipientUsers",
			where: {id: {$in: messageParams.monitored_users}},
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			message = message.get({plain: true});
			messageParams.messageIds.push(message.id);
		});
		return bluebird.resolve();
	});
	
		
}

/**
 * processes and gets message Ids of all messages between user and device
 * @method getConversationBetweenUserAndDevice
 * @memberof db_message
 * @param {object} user - user information object
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @param {boolean} isChatBox - Boolean indicating if function is serving chat box or monitor folder
 * @return {object} - Promise indicating end of process
*/
function getConversationBetweenUserAndDevice(user, messageParams, isChatBox){
	return getMessagesSentFromUsersToDevices(user.client_id, messageParams, isChatBox)
	.then(function(){
		return getMessagesSentFromDevicesToUsers(user.client_id, messageParams, isChatBox);
	});
}

/**
 * Queries and gets message Ids of all messages sent from users to devices
 * @method getMessagesSentFromUsersToDevices
 * @memberof db_message
 * @param {int} clientId - client id of the user
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @param {boolean} isChatBox - Boolean indicating if function is serving chat box or monitor folder
 * @return {object} - Promise indicating end of process, and altered messageParams with the messageIds
*/
function getMessagesSentFromUsersToDevices(clientId, messageParams, isChatBox){
	return db.message.findAll({
		attributes: ["id"],
		where: {client_id: clientId},
		include: [{
			model: db.user,
			where: {id: {$in: messageParams.monitored_users}},
			as: "MessageSenderUsers",
			through: {
				attributes: ["message_archived", "message_deleted"]
			},
			required: true
		}, 
		{
			model: db.device, 
			where: {id: {$in: messageParams.monitored_devices}},
			as: "MessageRecipientDevices",
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			message = message.get({plain: true});
			//Filter out archived and deleted messages for data display chat box
			if(isChatBox){
				if(message.MessageSenderUsers[0].message_sender_users.message_archived == false && message.MessageSenderUsers[0].message_sender_users.message_deleted == false){
					messageParams.messageIds.push(message.id);
				}
			}
			else{
				messageParams.messageIds.push(message.id);
			}
		});

		return bluebird.resolve();
	});
}


/**
 * Queries and gets message Ids of all messages sent from devices to users
 * @method getMessagesSentFromUsersToDevices
 * @memberof db_message
 * @param {int} clientId - client id of the user
 * @param {object} messageParams - Object containing parameters that determine type of message, number of messages and what page to load data for 
 * @param {boolean} isChatBox - Boolean indicating if function is serving chat box or monitor folder
 * @return {object} - Promise indicating end of process, and altered messageParams with the messageIds
*/
function getMessagesSentFromDevicesToUsers(clientId, messageParams, isChatBox){
	return db.message.findAll({
		attributes: ["id"],
		where: {client_id: clientId},
		include: [{
			model: db.device,
			where: {id: {$in: messageParams.monitored_devices}},
			as: "MessageSenderDevices",
			required: true
		}, {
			model: db.user, 
			where: {id: {$in: messageParams.monitored_users}},
			as: "MessageRecipientUsers",
			through: {
				attributes: ["message_status", "message_read", "message_archived", "message_deleted"]
			},
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			message = message.get({plain: true});
			//Filter out archived and deleted messages for data display chat box
			if(isChatBox){
				if(message.MessageRecipientUsers[0].message_recipient_users.message_archived == false && message.MessageRecipientUsers[0].message_recipient_users.message_deleted == false){
					messageParams.messageIds.push(message.id);
				}
			}
			else{
				messageParams.messageIds.push(message.id);
			}
		});

		return bluebird.resolve();
	});
}


/**
 * Processes and resends message to a device/devices if previous attempt failed or is still in pending
 * @method processAndResendMessag
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {object} message - object containing info of the message
 * @param {intArray} recipientDevices - array of device ids to which the message should be delivered to
 * @param {object} options - contains transaction info
 * @return {object} - Promise indicating end of process
 */
function processAndResendMessage(user, message, recipientDevices, options){
	var dataToResend = {};

	dataToResend.client_id = user.client_id;
	dataToResend.message = message.message;
	dataToResend.source_message_id = message.id;
	dataToResend.is_alert_message = false;

	return processSenderInfoForUser(user.user_id, options)
	.then(function(senderInfo){
		dataToResend.sender_comm_id = senderInfo.user_comm_id;
		return getCannedNumber(message.cannedmessage_id, user.client_id, options);
	})
	.then(function(cannedNumber){
		dataToResend.canned_number = cannedNumber;
		if(message.attachments != undefined && message.attachments.length > 0){
			dataToResend.attachments = message.attachments;
		}
		
		return dbComm.getCommIds(recipientDevices, "assets", options.transaction);
	})
	.then(function(deviceCommIds){
		dataToResend.recipient_comm_ids = deviceCommIds;
		var dbMhDevice = require("./db_mh_device.js");
		dbMhDevice.callMHWS(dataToResend, "/mh/v1/message", "POST");
		return bluebird.resolve();
	})
	.then(function(){
		//Resetting device status to "pending"
		return db.message_recipient_devices.update(
			{message_status: "pending"},
			{where: {device_id: {$in: recipientDevices}, message_id: message.id}, transaction: options.transaction}
		);
	});
}


/**
 * Processes all info realted to list of messages and retrieves 
 * message ids that have content that match the serach criteria passed by the user  
 * @method processAndGetMessagesForSearch
 * @memberof db_message
 * @param {object} user - user information object 
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise i
 */
function processAndGetMessagesForSearch(user, messageIdsToSearch, messageParams){
	messageParams.messageIds = [];
	if(messageIdsToSearch.length == 0){
		return bluebird.resolve();
	}
	return getIdsForMatchedSenders(messageIdsToSearch, messageParams)
	.then(function(){
		return getIdsForMatchedRecipients(messageIdsToSearch, messageParams);
	})
	.then(function(){
		return getIdsForMatchedMessages(messageIdsToSearch, messageParams);
	})
	.then(function(){
		return getIdsForMatchedCannedMessages(messageIdsToSearch, messageParams);
	})
	.then(function(){
		//Recalculate Offset
		return calculateOffset(messageParams, messageParams.messageIds.length);
	})
	.then(function(){
		messageParams.messageIds = _.uniq(messageParams.messageIds);
		return bluebird.resolve();
	});
}


/**
 * Processes and finds Ids of messages whose sender names match the search criteria sent by the user, 
 * it appends the list of ids to messageParams object
 * @method getIdsForMatchedSenders
 * @memberof db_message
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise indicating end of process edited messageParams with ids of messages
 */
function getIdsForMatchedSenders(messageIdsToSearch, messageParams){
	//no need to search if senders match if the folder is "sent"
	//as the user is the sender. 
	if(messageParams.folder == "sent"){
		return bluebird.resolve();
	}

	return getIdsWhereUserIsSender(messageIdsToSearch, messageParams)
	.then(function(){
		return getIdsWhereDeviceIsSender(messageIdsToSearch, messageParams);
	});
}

/**
 * Queries and finds Ids of messages whose messages are sent from user and the users first 
 * or last name matches the search criteria
 * it appends the list of ids to messageParams object
 * @method getIdsWhereUserIsSender
 * @memberof db_message
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise indicating end of process and edited messageParams with ids of messages
 */
function getIdsWhereUserIsSender(messageIdsToSearch, messageParams){
	return db.message.findAll({
		where: {id: {$in: messageIdsToSearch}},
		include: [{
			model: db.user,
			where: {$or: [{first_name: {$like: "%"+messageParams.searchParam+"%"}}, {last_name: {$like: "%"+messageParams.searchParam+"%"}}]},
			as: "MessageSenderUsers",
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			messageParams.messageIds.push(message.id);
		});
		return bluebird.resolve();
	});
}

/**
 * Queries and finds Ids of messages whose messages are sent from device and the device name 
 * matches the search criteria
 * it appends the list of ids to messageParams object
 * @method getIdsWhereDeviceIsSender
 * @memberof db_message
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise indicating end of process and edited messageParams with ids of messages
 */
function getIdsWhereDeviceIsSender(messageIdsToSearch, messageParams){
	return db.message.findAll({
		where: {id: {$in: messageIdsToSearch}},
		include: [{
			model: db.device,
			where: {name: {$like: "%"+messageParams.searchParam+"%"}},
			as: "MessageSenderDevices",
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			messageParams.messageIds.push(message.id);
		});
		return bluebird.resolve();
	}); 
}


/**
 * Processes and finds Ids of messages whose recipient names match the search criteria sent by the user, 
 * it appends the list of ids to messageParams object
 * @method getIdsForMatchedRecipients
 * @memberof db_message
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise indicating end of process and ids of messages
 */
function getIdsForMatchedRecipients(messageIdsToSearch, messageParams){
	//no need to search if recipients match if the folder is "inbox"
	//as the user is the recipient. 
	if(messageParams.folder == "inbox"){
		return bluebird.resolve();
	}
	
	return getIdsWhereUserIsRecipient(messageIdsToSearch, messageParams)
	.then(function(){
		return getIdsWhereDeviceIsRecipient(messageIdsToSearch, messageParams);
	});
}


/**
 * Queries and finds Ids of messages whose messages are sent to user and the users first 
 * or last name matches the search criteria
 * it appends the list of ids to messageParams object
 * @method getIdsWhereUserIsRecipient
 * @memberof db_message
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise indicating end of process and edited messageParams with ids of messages
 */
function getIdsWhereUserIsRecipient(messageIdsToSearch, messageParams){
	return db.message.findAll({
		where: {id: {$in: messageIdsToSearch}},
		include: [{
			model: db.user,
			where: {$or: [{first_name: {$like: "%"+messageParams.searchParam+"%"}}, {last_name: {$like: "%"+messageParams.searchParam+"%"}}]},
			as: "MessageRecipientUsers",
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			messageParams.messageIds.push(message.id);
		});
		return bluebird.resolve();
	});
}

/**
 * Queries and finds Ids of messages whose messages are sent to device and the device name 
 * matches the search criteria
 * it appends the list of ids to messageParams object
 * @method getIdsWhereDeviceIsRecipient
 * @memberof db_message
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise indicating end of process and edited messageParams with ids of messages
 */
function getIdsWhereDeviceIsRecipient(messageIdsToSearch, messageParams){
	return db.message.findAll({
		where: {id: {$in: messageIdsToSearch}},
		include: [{
			model: db.device,
			where: {name: {$like: "%"+messageParams.searchParam+"%"}},
			as: "MessageRecipientDevices",
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			messageParams.messageIds.push(message.id);
		});
		return bluebird.resolve();
	}); 
}


/**
 * Processes and finds Ids of messages whose message contents match the search criteria sent by the user, 
 * it appends the list of ids to messageParams object
 * @method getIdsForMatchedMessages
 * @memberof db_message
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise indicating end of process and ids of messages
 */
function getIdsForMatchedMessages(messageIdsToSearch, messageParams){
	
	return db.message.findAll({
		where: {id: {$in: messageIdsToSearch}, message: {$like: "%"+messageParams.searchParam+"%"}}
	})
	.then(function(messages){
		_.each(messages, function(message){
			messageParams.messageIds.push(message.id);
		});
		return bluebird.resolve();
	});
}


/**
 * Processes and finds Ids of messages whose canned message contents match the search criteria sent by the user, 
 * it appends the list of ids to messageParams object
 * @method getIdsForMatchedCannedMessages
 * @memberof db_message
 * @param {intArray} messageIdsToSearch - array of messageIds
 * @param {object} messageParams - Object containing parameters that determine type of search word/phrase, folder, number of messages and what page to load data for
 * @return {object} - Promise indicating end of process and ids of messages
 */
function getIdsForMatchedCannedMessages(messageIdsToSearch, messageParams){

	return db.message.findAll({
		where: {id: {$in: messageIdsToSearch}},
		include: [{
			model: db.canned_message,
			where: {canned_message: {$like: "%"+messageParams.searchParam+"%"}},
			required: true
		}]
	})
	.then(function(messages){
		_.each(messages, function(message){
			messageParams.messageIds.push(message.id);
		});

		//Filter and get messages that match the criteria if user searches for No canned message
		var noCannedStr1 = "no canned message";
		var noCannedStr2 = "NO CANNED MESSAGE";
		var noCannedStr3 = "No Canned Message";
		if((noCannedStr1.indexOf(messageParams.searchParam) > -1) || (noCannedStr2.indexOf(messageParams.searchParam) > -1) || (noCannedStr3.indexOf(messageParams.searchParam) > -1)){
			return db.message.findAll({
				where: {id: {$in: messageIdsToSearch}, cannedmessage_id: null}
			})
			.then(function(messages){
				_.each(messages, function(message){
					messageParams.messageIds.push(message.id);
				});
			});
		}
		else return bluebird.resolve();
	});
}


