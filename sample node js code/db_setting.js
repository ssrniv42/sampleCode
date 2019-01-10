var bluebird = require("bluebird");
var _ = require("lodash"); 

/** 
 * Returns info of settings belonging to the user that has logged in
 * 
 * @method getUserSetting
 * @memberof db_setting
 * @param {object} user - user information object
 * @return {object} - object containing settings (savedStats) info related to user 
*/
var getUserSetting = function(user){
	return db.user_setting.findOne({
		where: {
			user_id: user.user_id
		}
	})
	.then(function(settings){
		var message="";
		if(!settings) {
			message= "Could not find the user setting for the user. ID: "+ user.user_id;
			throw new Error(message);
		}else{
			message= "Get all settings successful";
		}
		
		settings= settings.get({ plain: true });
		
		//converting map layers from string to json object
		settings.map_layers= JSON.parse(settings.map_layers);
		
		return bluebird.resolve({ message: message, result: settings });
	});
};


/** 
 * updates the user setting
 * 
 * @method updateUserSetting
 * @memberof db_setting
 * @param {object} user - user information object
 * @param {object} setting - object containing all the settings parameters that needs to be updated
 * @return {object} - object containing info of the updated user settings and status message
*/
var updateUserSetting = function(user, setting){
	return db.user_setting.findOne({
		where: {
			user_id: user.user_id
		}
	})
	.then(function(userSetting){
		if(!userSetting) {
			throw new Error("Could not find the user setting for the user. ID: "+ user.user_id);		
		}
		
		// converting from string to number
		setting= _.mapValues(setting, function(value){
			if(isNaN(value)){
				return value;
			}
			return Number(value);
		});
		
		if (_.has(setting, "map_layers")){
			setting.map_layers= JSON.stringify(setting.map_layers);
		}
	
		// applying the new setting to the sequelize object
		_.merge(userSetting, setting) ;	 

		return userSetting.save();
	})
	.then(function(){
		return getUserSetting(user);
	})
	.then(function(userSettingData){
		return bluebird.resolve({ message: "User Setting Update Successful.", result: userSettingData.result });
	});
};

module.exports= {
	getUserSetting: getUserSetting,
	updateUserSetting: updateUserSetting
};

