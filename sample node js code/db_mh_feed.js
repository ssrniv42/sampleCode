/* global */
var bluebird = require("bluebird");
var _ = require("lodash");


/** 
 * Gets info for all Feeds on the platform.
 * This data is used by MH on startup to sync Feeds
 * @method getAllPlatformFeeds
 * @memberof db_mh_feed
 * @return {object} - A response with message and result
*/
var getAllPlatformFeeds = function(){
	return db.feed_code.findAll()
	.then(function(feeds){
		feeds = _.map(feeds, function(feed){
			feed = feed.get({plain: true});
			feed = _.omit(feed, ["id", "title"]);
		
			if(feed.token == null || feed.token == 0){
				feed.token = "";
			}
			
			return feed;
		});
		return bluebird.resolve({message: "Get all feeds for mh successful", result: feeds});
	});
};

module.exports = {
	getAllPlatformFeeds: getAllPlatformFeeds
};