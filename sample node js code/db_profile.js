var bluebird = require("bluebird");
var _ = require("lodash"); 
var md5= require("md5");
var bcrypt= require("bcryptjs");
bcrypt.compare= bluebird.promisify(bcrypt.compare);
bcrypt.hash= bluebird.promisify(bcrypt.hash);

/** 
 * Returns user profile info
 * 
 * @method getProfile
 * @memberof db_profile
 * @param {object} user - user information object
 * @return {object} - user's profile info	
*/
var getProfile = function(user){
	return db.user.findOne({
		attributes: { exclude: ["password"] },
		include: [{			
			model: db.client,
			required: false,
			include: [{
				attributes: ["id"],
				model: db.comm,
				required: false
			}]		
		}],		
		where: {
			id: user.user_id
		}
	})
	.then(function(userObj){
		
		if(!userObj) {
			throw new Error("Could not find the user. ID: "+ user.user_id);
		}
		
		userObj= userObj.get({ plain: true });
		
		delete userObj.password;
				
		return bluebird.resolve({ message: "Get Profile Information Successful.", result: userObj });
	});
};

/**
 * Updates user info via profile menu
 * 
 * @method putProfile
 * @memberof db_profile
 * @param {object} user - user information object
 * @param {object} profile - object containing user's profile info that needs to be updated
 * @return {object} - object containing updated profile info of user and status message
*/
var putProfile= function(userToken, profile){	
	return db.user.findOne({ where: { id: userToken.user_id } })
	.bind({})
	.then(function(user){
		if(!user) {			
			throw new Error("Could not find the user. ID: "+ userToken.user_id);
		}
		this.user= user;
		if (!user.password) return bluebird.resolve(true);
		
		return bcrypt.compare(profile.old_password, user.password);
	})
	.then(function(isBcrypt){
		// would check whether or not old password matches MD5 or Bcrypt hash
		if(!isBcrypt && md5(profile.old_password) != this.user.password){
			throw new Error("Provided wrong old password.");
		}
		
		// picking only keys that are allowed to be changed
		profile= _.pick(profile, ["password"]);
		
		// checking if password field exists
		if(_.has(profile, "password")){
			// generating a Bcrypt hash to store in the DB
			return bcrypt.hash(profile.password, config.bcrypt.saltRounds);
		}

		return bluebird.resolve();
	})	
	.then(function(passwordHash){
		if(passwordHash){
			profile.password= passwordHash;
		}		
		_.merge(this.user, profile);
		
		return this.user.save();
	})
	.then(function(){
		return getProfile(userToken);
	})
	.then(function(profileData){
		var profile= profileData.result;
		return bluebird.resolve({ message: "Update Profile Information Successful.", result: profile });
	});
};



module.exports= {
	getProfile: getProfile,
	putProfile: putProfile
};

