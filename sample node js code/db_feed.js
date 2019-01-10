/* global db */
/**
 * DB mechanics for feed codes
 * 
 * @module
 */

var bluebird = require("bluebird");
var _ = require("lodash");
var dbMhDevice = require("./db_mh_device.js");

/**
 * returns all the feed codes available on the server
 * 
 * @method getAllFeedCode
 * @memberof db_feed_code
 * @return {object} list of all feed codes available on the server
 */
var getAllFeedCode = function(){
	/*
		This is temp piece of code that calls the MHWS to sync feed token info for previously added 
		feeds. Once all the data and respective tokens are synced between MH and Platform
		This code will be removed and will just be a findAll call to feed_codes table.

		If MHWS is not accessible the code will still serve the get all feed codes request to the
		user. Hence the catch
	*/
	return syncFeedDataFromMH()
	.then(function(){
		return db.feed_code.findAll()
		.then(function(feedCodes){
			feedCodes = _.map(feedCodes, function(code){
				return code.get({plain: true});
			});
	
			feedCodes = _.keyBy(feedCodes, "id");
			return bluebird.resolve({message: "Get all feed codes successfull", result: feedCodes});
		});
	})
	.catch(function(){
		return db.feed_code.findAll()
		.then(function(feedCodes){
			feedCodes = _.map(feedCodes, function(code){
				return code.get({plain: true});
			});
	
			feedCodes = _.keyBy(feedCodes, "id");
			return bluebird.resolve({message: "Get all feed codes successfull", result: feedCodes});
		});
	});
	
};


/**
 * adds a new feed code on the server
 * 
 * @method postFeedCode
 * @memberof db_feed_code
 * @param {object} feedCodeData = object containing info for the new feed code
 * @return {object} success message with newly added feed code or error message
 */
var postFeedCode = function(feedCodeData){
	return db.sequelize.transaction(function(t){
		var transaction = t;
		return generateFeedToken(feedCodeData)
		.then(function(feedToken){
			feedCodeData.token = feedToken;
			var dbFeedCode = db.feed_code.build(feedCodeData);
			return dbFeedCode.save({transaction: transaction});
		})
		.tap(function(){
			return sendFeedToMH(feedCodeData);
		})
		.then(function(newFeedCode){
			newFeedCode = newFeedCode.get({plain: true});
			return bluebird.resolve({message: "Post feed code successfull", result: newFeedCode});
		});
	});
};


/**
 * uses crypto lib to generate a random AES 256 hex token to assign to the feed code
 * 
 * @method generateFeedToken
 * @memberof db_feed_code
 * @param {object} feedCodeData = object containing info for the new feed code
 * @return {string} return feed token
 */
function generateFeedToken(feedCodeData){
	if(feedCodeData.generate_token){
		var crypto= require("crypto");
		var token = crypto.randomBytes(32).toString("hex").toUpperCase();
		return bluebird.resolve(token);
	}
	
	return bluebird.resolve(null);
}

/**
 * Calls MHWS and sends a feed code to MH.
 * 
 * @method sendFeedToMH
 * @memberof db_feed_code
 * @param {object} feedCodeData = object containing info for the new feed code
 * @return {string} feed token from MH
 */
function sendFeedToMH(feedCodeData){
	var mhData = {};
	mhData.code = feedCodeData.feed_code;
	mhData.token = feedCodeData.token;
	if(feedCodeData.token == null){
		mhData.token = "";
	}

	dbMhDevice.callMHWS(mhData, "/mh/v1/feed_code", "POST");
	return bluebird.resolve();
}


/**
 * updates info of a feed code on the server
 * 
 * @method putFeedCode
 * @memberof db_feed_code
 * @param {object} feedCodeData = object containing updated info for the feed code
 * @return {object} success message with newly added feed code or error message
 */
var putFeedCode = function(feedCodeData){
	return db.feed_code.findById(feedCodeData.id)
	.then(function(feedCode){
		feedCode = _.extend(feedCode, feedCodeData);
		return feedCode.save();
	})
	.then(function(updatedFeedCode){
		updatedFeedCode = updatedFeedCode.get({plain: true});
		return bluebird.resolve({message: "Put feed code successfull", result: updatedFeedCode});
	});
};


/**
 * Deletes a feed code on the server
 * 
 * @method deleteFeedCode
 * @memberof db_feed_code
 * @param {int} id - id of the feed code that is being deleted
 * @return {object} success message with newly added feed code or error message
 */
var deleteFeedCode = function(id){
	return db.sequelize.transaction(function(t){
		var transaction = t;
		return db.feed_code.findById(id, {transaction: transaction})
		.tap(function(feedCode){
			if(feedCode.feed_code == 128){
				var msg = "Prohibited from deleting default feed: " + feedCode.title + " (" + feedCode.feed_code + ")"; 
				throw new Error(msg);
			}
			return feedCode.setDeviceFeedCodes([], {transaction: transaction});
		})
		.tap(function(feedCode){
			return feedCode.destroy({transaction: transaction});
		})
		.tap(function(feedCode){
			var mhUrl = "/mh/v1/feed_code/" + feedCode.feed_code;
			dbMhDevice.callMHWS({}, mhUrl, "DELETE");
			return bluebird.resolve();
		});
	})
	.then(function(feedCode){
		feedCode = feedCode.get({plain: true});
		return bluebird.resolve({message: "Delete feed code successfull", result: feedCode});
	});
};


/**
 * Calls MHWS and gets all the feeds loaded on MH to sync the token info with platform DB
 * 
 * @method syncFeedDataFromMH
 * @memberof db_feed_code
 * @return {string} promise indicating end of process
 */
function syncFeedDataFromMH(){
	return dbMhDevice.callMHWS({}, "/mh/v1/feed_code", "GET")
	.then(function(result){
		return bluebird.each(result, function(mhFeedData){
			return processAndUpdateFeedData(mhFeedData);
		});
	});
}

/**
 * Prosesses feed data from MH and inserts, updates just returns based on data
 * 
 * @method processAndUpdateFeedData
 * @memberof db_feed_code
 * @param {object} mhFeedData - object containing info of one of feeds on MH
 * @return {string} promise indicating end of process
 */
function processAndUpdateFeedData(mhFeedData){
	return db.sequelize.transaction(function(t){
		var transaction = t;
		return db.feed_code.findOne({
			where: {feed_code: mhFeedData.code},
			transaction: transaction
		})
		.then(function(feedData){
			//If there is no record of the feedcode, enter it into platform DB with default title
			if(!feedData){
				var newfeed = {
					title: "mhFeed" + mhFeedData.code,
					feed_code: mhFeedData.code,
					token: mhFeedData.token
				};
				var dbFeedCode = db.feed_code.build(newfeed);
				return dbFeedCode.save({transaction: transaction});
			}

			//if record exists and the token associated with the feed is 0, then update the token with what MH has provided
			if(feedData.token == "0"){
				feedData = _.extend(feedData, mhFeedData);
				return feedData.save({transaction: transaction});
			}
			return bluebird.resolve();
		});
	});
}

module.exports = {
	getAllFeedCode: getAllFeedCode,
	postFeedCode: postFeedCode,
	putFeedCode: putFeedCode,
	deleteFeedCode: deleteFeedCode
};