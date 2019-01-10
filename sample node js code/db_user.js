/* global log, db, utils */
var bluebird = require("bluebird");
var _ = require("lodash");
var dbPermission= require("./db_permission.js");


var jwtToken= require("../lib/token.js");
var blacklist = require("express-jwt-blacklist");
var jwt = require("jsonwebtoken");

var bcrypt= require("bcryptjs");
bcrypt.hash= bluebird.promisify(bcrypt.hash);

/**
 * Gets the list of users registered on the server
 *  
 * @method getAllUserForAdmin
 * @memberof db_user
 * @param {object} user - user information object 
 * @return {Object} a promise containing 'message' (status message) and 'result' (list of all users that belong to the client group)
 */
var getAllUserForAdmin = function(){
	return processUsersForAdmin()
	.then(function(users){
		return bluebird.resolve({message: "GET all User's for admin successful", result: users});
	});
};


/**
 * Gets the list of users that the requesting user is allowed to view based on his/her role
 *  
 * @method getAllUser
 * @memberof db_user
 * @param {object} user - user information object 
 * @return {Object} a promise containing 'message' (status message) and 'result' (list of all users that belong to the client group)
 */
var getAllUser = function(user){
	//Getting all users under the client group
	return processGetAllUsers(user)
	.then(function(users){
		return bluebird.resolve({message: "GET all user's successful", result: users});
	});
};


/** 
 * Returns the list of users that input user is permitted to access
 * 
 * @method getPermittedUsers
 * @memberof db_user
 * @param {Object} user - User object from the token
 * @return {Array} - Array of users in a promise
*/
var getPermittedUsers= function(user){
	return db.user.findAll({ where: { client_id: user.client_id } });
};

/** 
 * Returns info for a particular User
 * 
 * @method getUserById
 * @memberof db_user
 * @param {integer} id - user Id
 * @return {Object} - object containing info of a particular user
*/
var getUserById = function(id){
	return db.user.findOne({
		include: [{
			model: db.comm
		}],
		where: {id: id},
		attributes: { exclude: ["password", "token_data"] }
	})
	.then(function(user){
		if(!user) {
			log.warn("Cannot find user. There is no user record for the specified id", id);
			throw new Error("Cannot find user. There is no user record for the specified id");
		}
		
		user= user.get({ plain: true });

		if(user.comms[0]){
			user.comm_id= user.comms[0].id;
		}

		return bluebird.resolve({message: "GET User Successful", result: user});
	});
};

/** 
 * Adds new User into the DB
 * 
 * @method postUser
 * @memberof db_user
 * @param {object} user - user information object
 * @param {object} insertUser - object containing values necessary to successfully add the user
 * @param {object} urlOptions - object containing options for url, transaction etc
 * @return {object} - object containing info of newly created user and status message
*/
var postUser = function(user, insertUser, urlOptions){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t, urlOptions: urlOptions};	

		// for Provider Admin users, client_id is provided in the body of the request
		insertUser.client_id= user.client_id;
		insertUser.create_timestamp = Math.round(new Date().getTime() / 1000);
		
		return processInsertUser(user, insertUser, options);
	})
	.tap(function(userResult){
		if(insertUser.email_registration){
			return processUserRegistration(user, userResult, urlOptions);
		}
		return bluebird.resolve();
	})
	.then(function(userResult){
		return bluebird.resolve({message: "POST User Successful", result: userResult});
	});
};


/** 
 * Adds new User from admin module into the DB
 * 
 * @method postAdminUser
 * @memberof db_user
 * @param {object} user - user information object
 * @param {object} insertUser - object containing values necessary to successfully add the user
 * @param {object} urlOptions - object containing options for url, transaction etc
 * @return {object} - object containing info of newly created user and status message
*/
var postAdminUser = function(user, insertUser, urlOptions){
	return db.sequelize.transaction(function(t){
		user.client_id = insertUser.client_id;
		insertUser.create_timestamp = Math.round(new Date().getTime() / 1000);
		var options = {user: user, transaction: t, urlOptions: urlOptions};	
			
		return processInsertAdminUser(user, insertUser, options);	
	})
	.tap(function(userResult) {
		if(insertUser.email_registration){
			return processUserRegistration(user, userResult, urlOptions);
		}
	})
	.then(function(userResult) {
		return bluebird.resolve({message: "POST User Successful", result: userResult});
	});
};


/**
 * Resends the registration email to the user. It also revokes the old token so 
 * it cannot be used anymore.
 * 
 * @param {Number} id ID of the user
 * 
 */
var resendRegistration = function(id, user, urlOptions){	
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t, urlOptions: urlOptions};	
		// getting user data from DB
		return db.user.findById(id)
		.bind({})
		.tap(function(data){
			var userData= data;
				
			// do not resend if user is already registered
			if(userData.username){
				throw new Error("User is already registered.");
			}
			// getting the old token object from the DB
			var tokenData= JSON.parse(userData.token_data);

			// revoking the old token issued to the user
			blacklist.revoke(tokenData);

			// generating and appending a new token object to userData
			this.token= generateAndAppendToken(userData);

			// storing the new token data in the DB
			return processUpdateUser(id, userData, options);		
		})
		.then(function(data){
			var userData= data;
			return sendRegistration(urlOptions, this.token, userData);		
		})
		.then(function(){
			return {message: "Registration email was resent successfully."};
		});	
	});
};



/** 
 * Updates info of a particular User in the DB
 * 
 * @method putUser
 * @memberof db_user
 * @param {object} user - user information object
 * @param {integer} id - id of the user being updated
 * @param {object} updateUserData - object containing user info that needs to be updated
 * @return {object} - object containing updated info of user and status message
*/
var putUser = function(user, id, updateUserData){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		
		return processUpdateUser(id, updateUserData, options);
	})
	.then(function(userResult) {
		return bluebird.resolve({message: "PUT User Successful", result: userResult.data, $originalData: userResult.originalData});
	});
};


/** 
 * Updates info of a customer admin User in the DB.
 * 
 * @method putAdminUser
 * @memberof db_user
 * @param {object} user - user information object
 * @param {integer} id - id of the user being updated
 * @param {object} userData - object containing user info that needs to be updated
 * @return {object} - object containing updated info of user and status message
*/
var putAdminUser = function(user, userData){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		
		return processUpdateUser(userData.id, userData, options);
	})
	.then(function(userResult) {
		return bluebird.resolve({message: "PUT admin user successful", result: userResult.data, $originalData: userResult.originalData});
	});
};


/** 
 * Deletes record of an existing User
 * 
 * @method deleteUser
 * @memberof db_user
 * @param {object} user - user information object
 * @param {integer} id - id of the user being deleted
 * @return {object} - object containing info of deleted user and status message 
*/
var deleteUser = function(user, id){
	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		return db.user.findById(id)
		.tap(function(userDeleteData){

			// Revoke the registration token if user is not registered yet
			if(!userDeleteData.username){
				// getting the old token object from the DB
				var tokenData= JSON.parse(userDeleteData.token_data);

				// revoking the old token issued to the user
				blacklist.revoke(tokenData);
			}
			var currentRoleId = userDeleteData.role_id;
			return checkUserPermission(user, currentRoleId);
		})
		.then(function(userDeleteData){
			return processDeleteUser(userDeleteData, options);
		})
		.then(function(userResult){
			return bluebird.resolve({message: "DELETE User Successful", result: userResult});
		});
	});
};


/**
 * Checks if the requesting user's role is a superset of the input user  
 * 
 * @method checkUserPermission
 * @memberof db_user
 * @param {object} user - user information object 
 * @param {Integer} updateRoleId - role ID of the user to be updated
 * 
 * @return {Object} empty promise if user is permitted and throws an error otherwise
 */
var checkUserPermission= function(user, updateRoleId){
	// getting all roles accessible to the requesting user	
	//console.log(user, updateRoleId);	
	return dbPermission.getAllPermissions(user)		
	.then(function(roleData){
		var roles= roleData.result;
		//console.log(roles);
		if(!_.has(roles, updateRoleId)){
			throw new Error("Operation not permitted for this user");
		}
		
		return bluebird.resolve();
	});
};


/** 
 * processes and adds new User from admin module into the DB
 * 
 * @method processInsertAdminUser
 * @memberof db_user
 * @param {object} user - user information object
 * @param {object} insertUser - object containing values necessary to successfully add the user
 * @param {object} options - object containing options for transaction
 * @return {object} - object containing info of newly created user
*/
function processInsertAdminUser(user, insertUser, options) {
	//Checking if a customer admin user is already registered under client
	return db.client.findById(insertUser.client_id)
	.then(function(client){
		if(!client){
			var msg1 = "Client not found for id: " + insertUser.client_id;
			throw new Error(msg1);
		}

		client = client.get({plain: true});

		if(client.main_user_id != null){
			var msg2 = "There is a customer admin user already registered under customer (" + client.company + ")";
			throw new Error(msg2);
		}
		return processInsertUser(user, insertUser, options);
	})
	.tap(function(userResult) {
		return saveUserGroupPerms(userResult.id, insertUser.client_id, options);
	})
	.tap(function(userResult){
		return processMainUserEdits(userResult.id, userResult.role_id, insertUser.client_id, options);
	});
}

/** 
 * processes and completes the registration of user and also establishes relation with 
 * association tables
 * 
 * @method processInsertUser
 * @memberof db_user
 * @param {object} user - user information object
 * @param {object} insertUser - object containing values necessary to successfully add the user
 * @param {object} options - object containing options for transaction
 * @return {object} - object containing info of newly created user
*/
function processInsertUser(user, insertUser, options) {
	return validateUserRegistration(user, insertUser)
	.then(function(){
		var dbUser = db.user.build(insertUser);	
		return dbUser.save({user: user, transaction: options.transaction});
	})		
	.then(function(userResult){
		userResult = userResult.get({plain: true});	
		delete userResult.password;
		delete userResult.token_data;
		return bluebird.resolve(userResult);
	})
	.tap(function(userResult){
		return insertComm(userResult.id, options);
	})
	.tap(function(userResult){
		return insertUserSettings(userResult.id, options);
	});
}


/** 
 * Processes and validates the registration process:
 * 1. Checks is username and password fields are required
 * 2. Checks if user has permission to add another user
 * 3. Checks the user limit of the customer
 * 
 * @method validateUserRegistration
 * @memberof db_user
 * @param {object} user - user information object
 * @param {object} insertUser - object containing values necessary to successfully add the user
 * @return {object} - Promise indicating end of process or throws error if validations have failed
*/
function validateUserRegistration(user, insertUser){
	
	return validateUsernameAndPassword(insertUser)
	.then(function(passwordHash){
		if(passwordHash){
			insertUser.password = passwordHash;
		}
		return checkUserPermission(user, insertUser.role_id);
	})
	.then(function(){
		return checkCustomerUserLimit(user.client_id);
	});
}

/** 
 * Validates username and password if email_registration is false
 * - Throws error if username or password fields are not passed
 * - Converts password to hash
 * 
 * @method validateUserRegistration
 * @memberof db_user
 * @param {object} user - user information object
 * @param {object} insertUser - object containing values necessary to successfully add the user
 * @return {object} - Promise indicating end of process or throws error if validations have failed
*/
function validateUsernameAndPassword(insertUser){
	if(!insertUser.email_registration){
		if(insertUser.username == undefined || insertUser.username == null){
			throw new Error("Invalid registration. Please provide a username");
		}

		if(insertUser.password == undefined || insertUser.password == null){
			throw new Error("Invalid registration. Please provide a password");
		}

		return bcrypt.hash(insertUser.password, config.bcrypt.saltRounds);
	}

	return bluebird.resolve();
}


/**
 * sends an email to user with registration link to complete the registration
 * 
 * @param {Object} req express request object
 * @param {String} token registration token
 * @param {Object} userData user data from the model
 * 
 * @return {Object} a promise with information regarding sent email status
 */
function sendRegistration(urlOptions, token, userData){
	
	// remove the "/resend_registration" sub-query if triggered by the resend route
	var path    = require("path");
	var fs = require("fs");
	//var token= req.params.token;	
	
	// building the registration route URL
	var registerUrl= "https://" + urlOptions.host +"/api/v1/user/register/"+token;

	var dir= path.join(__dirname+"/../html/register_email.html");
	var html= fs.readFileSync(dir, "utf8");
	html= _.replace(html, "{{first_name}}", userData.first_name);
	html= _.replace(html, "{{last_name}}", userData.last_name);
	html= _.replace(html, "{{register_link}}", registerUrl);
	html= _.replace(html, "{{register_link2}}", registerUrl);

	var emailData = {		
		to: userData.email,
		subject: "SCC TITAN User Registration",
		html: html
	};

	utils.sendEmail(emailData);

	return bluebird.resolve(registerUrl);
}

/**
 * generates a new token from the provided user data and appends the token object 
 * to the user data object
 * 
 * @param {Object} userData user data object from the model
 * @return {String} generated token
 */
function generateAndAppendToken(userData){
	var tokenData= { user_id: userData.id, client_id: userData.client_id };	
	var token= jwtToken.genToken(tokenData, config.registerToken);
	var tokenObj= jwt.verify(token, config.registerToken.secret);
	userData.token_data= JSON.stringify(tokenObj);
	return token;
}

/** 
 * processes data to keep track of first customer admin user added under a clinet group
 * 
 * @method processMainUserEdits
 * @memberof db_user
 * @param {int} userId - id of the user being added
 * @param {int} roleId - role id of the user being added
 * @param {int} clientId - client id of the user being added
 * @param {object} options - object containing options for transaction
 * @return {object} - promise indicating end of process
*/
function processMainUserEdits(userId, roleId, clientId, options){
	return db.role.findById(roleId, {transaction: options.transaction})
	.then(function(role){
		role = role.get({plain: true});
		if(role.title == "Customer Admin"){
			return updateMainUserOfClient(userId, clientId, options);
		}
		return bluebird.resolve();
	});
}

/** 
 * updates main_user_id of client table with the id of the first customer admin user
 * 
 * @method updateMainUserOfClient
 * @memberof db_user
 * @param {int} userId - id of the user being added
 * @param {int} clientId - client id of the user being added
 * @param {object} options - object containing options for transaction
 * @return {object} - promise indicating end of process
*/
function updateMainUserOfClient(userId, clientId, options){
	return db.client.findById(clientId, {transaction: options.transaction})
	.then(function(client){
		client = client.get({plain: true});
		//only update main_user_id if one does not already exist
		if(client.main_user_id == null){
			return db.client.update(
				{main_user_id: userId},
				{
					where: {id: clientId},
					transaction: options.transaction
				}
			);
		}
		return bluebird.resolve();
	});
}

/** 
 * updates insert user and group relationship between first customer admin 
 * user and main group of the client
 * 
 * @method saveUserGroupPerms
 * @memberof db_user
 * @param {int} userId - id of the user being added
 * @param {int} clientId - client id of the user being added
 * @param {object} options - object containing options for url, transaction etc
 * @return {object} - promise indicating end of process
*/
function saveUserGroupPerms(userId, clientId, options){
	return db.group.findOne({
		where: {
			client_id: clientId,
			title: "Main"
		}
	})
	.then(function(group) {
		return db.sequelize.query(
			"INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)",
			{replacements: [userId, group.id], transaction: options.transaction}
		);
	});
}


/** 
 * processes and completes the user registration process
 * 
 * @method processUserRegistration
 * @memberof db_user
 * @param {object} user - user information object
 * @param {int} userResult - instance of the user that has been added
 * @param {object} UrlOptions - object containing options for url, transaction et
 * @return {object} - promise indicating end of process
*/
function processUserRegistration(user, userResult, urlOptions){
	// generates a new registration token and appends token data to the user data 
	// object to be storred in the DB
	var token = generateAndAppendToken(userResult);
	
	// stores user token data in the DB
	return putUser(user, userResult.id, userResult)
	.then(function(updatedUserData){
		// sends user registration email to the user
		return sendRegistration(urlOptions, token, updatedUserData.result);
	})
	.then(function(registerUrl){
		userResult.registration_url = registerUrl;
		return bluebird.resolve(userResult);
	});
}

/** 
 * Processes and retrieves list of users for Admin
 * @method processUsersForAdmin
 * @memberof db_user
 * @param {object} user - user information object
 * @return {object} - object containing list of users
*/
function processUsersForAdmin(){
	return db.user.findAll({
		include: [{
			model: db.role,
			where: {title: "Customer Admin"}
		}]
	})
	.then(function(users){
		users = _.map(users, function(user){
			user = user.get({plain: true});
			user.role_id = user.role.id;
		
			user = _.omit(user, ["password", "role", "token_data"]);
			return user;
		});

		users = _.keyBy(users, "id");
		return bluebird.resolve(users);
	});
}


/** 
 * processes and updates info of a particular user
 * 
 * @method processUpdateUser
 * @memberof db_user
 * @param {int} id - id of the user being updated
 * @param {object} updateUserData - object containing user update object
 * @param {object} options - object containing options for transaction
 * @return {object} - object containing info of the updated user and original user data
*/
function processUpdateUser(id, updateUserData, options) {
	let originalUserData = {};
	return db.user.findById(id)
	.bind({})
	.tap(function(userUpdate){
		originalUserData = _.cloneDeep(userUpdate);
		this.userUpdate= userUpdate;
		
		if(!userUpdate){
			log.warn("Cannot update user. There is no user record for the specified id:", id);
			throw new Error("Cannot update user. There is no user record for the specified id");
		}
		
		return checkUserPermission(options.user, userUpdate.role_id);
	})
	.then(function(){
		this.userUpdate = _.extend(this.userUpdate, updateUserData);
		return this.userUpdate.save({user: options.user, transaction: options.transaction});
	})		
	.then(function(userResult){
		userResult = userResult.get({plain: true});	
		userResult= _.omit(userResult, ["password", "token_data"]);
		originalUserData = originalUserData.get({plain: true});
		originalUserData = _.omit(originalUserData, ["password", "token_data"]);
		return bluebird.resolve({data: userResult, originalData: originalUserData});
	});
}


/** 
 * Processes and retrieves list of users for client group. Role info will only be 
 * attached the user entity if the user requesting the info has permission to view the user entity
 * @method processGetAllUsers
 * @memberof db_user
 * @param {object} user - user information object
 * @return {object} - object containing list of users
*/
function processGetAllUsers(user){
	return getAllUsersUnderClient(user)
	.bind({})
	.then(function(allUsers){
		var $this = this;
		$this.allUsers = allUsers;
		return getAllPermittedUsers(user);
	})
	.tap(function(){
		var $this= this;

		// Note 1:this is to get the comm_id for customer admin which is stored as comm_id of the client
		// It should be removed when we revise the logic so customer admins are treated as users
		// and not as clients  
		return getClientCommId(user, $this);
	})
	.then(function(users){
		var allUsers = this.allUsers;
		var clientCommId= this.clientCommId;
		users= _.map(users, function(user){
			user= user.get({plain: true});
			user.comm_id= user.comms[0] && user.comms[0].id;
			
			// This is related to 'Note 1' explained above and should be removed later 
			if(user.role_id == 2) user.client_comm_id= clientCommId; 
			
			user= _.omit(user, "comms");
			//console.log("CHK permitted users", user.id);
			return user;
		});
		users= _.keyBy(users, "id");
		return bluebird.resolve(_.merge(allUsers, users));
	});
}

/** 
 * Queries for all users under the client/customer group
 * @method getAllUsersUnderClient
 * @memberof db_user
 * @param {object} user - user information object
 * @return {object} - object containing list of users
*/
function getAllUsersUnderClient(user){
	return db.user.findAll({
		where: {client_id: user.client_id},
		attributes: {exclude: ["password", "token_data"]}
	})
	.then(function(allUsers){
		allUsers = _.map(allUsers, function(user){
			user = user.get({plain: true});
			user = _.omit(user, "create_timestamp", "image_id", "role_id", "comm_id");
			return user;
		});
		allUsers = _.keyBy(allUsers, "id");
		return bluebird.resolve(allUsers);
	});
}


function getUserRole(userId){
	return db.user.findOne({
		where: {id: userId},
		attributes: ["role_id"],
		include: [{attributes: ["id", "title"], model: db.role, required: true}]
	})
	.then(function(user){
		return user.role;		
	});
}



//Deletes records of a particular User
function processDeleteUser(userDeleteData, options){
	var id = userDeleteData.id;
	return getUserCommId(id)
	.then(function(commId){
		return deleteFromUserSettings(id, commId, options);
	})
	.tap(function(){
		return deleteFromMessage(id, options);
	})
	.tap(function(commId){
		return deleteFromComm(commId, options);
	})
	.then(function(){
		return db.emergency_alert_manager.update(
			{reset_user_id: null},
			{
				where: {reset_user_id: id},
				transaction: options.transaction
			}
		);
	})
	.then(function(){
		return db.alert_acknowledgements.destroy({
			where: {user_id: id},
			transaction: options.transaction
		});
	})
	.then(function(){
		//only set main_user_id to null for customer/client if the user being deleted is a customer admin
		if(userDeleteData.role_id == 2){
			return setClientsMainUserToNull(id, userDeleteData.client_id, options);	
		}
		return;
	})
	.then(function(){
		return deleteFromUser(id, options);
	});
}

//Sets main_user_id field to null for client
function setClientsMainUserToNull(id, clientId, options){
	return db.client.update(
		{main_user_id: null},
		{where: {id: clientId}, transaction: options.transaction}
	);
}

//Returns comm Id of the User 
function getUserCommId(id){
	return db.comm.findOne({
		where: {row_id: id, table_name: "users"}
	})
	.then(function(comm){
		comm = comm.get({plain: true});	
		return comm.id;
	});
}

/** 
 * Queries for all users the req user has permission to see
 * @method getAllUsersUnderClient
 * @memberof db_user
 * @param {object} user - user information object
 * @return {object} - object containing list of users
*/
function getAllPermittedUsers(user){
	return dbPermission.getAllPermissions(user)
	.then(function(roleData){
		var roles= _.keys(roleData.result);
		return db.user.findAll({
			include: [{
				model: db.comm
			}],
			where: {
				client_id: user.client_id,
				role_id: {$in: roles}
			},
			attributes: { exclude: ["password", "token_data"] }
		});
	});
}

function getClientCommId(user, $this){
	return db.client.findOne({
		where: { id: user.client_id},
		include: [{
			model: db.comm
		}]
	})
	.then(function(client){
		$this.clientCommId = client.comms[0] && client.comms[0].id;
		return;
	});
}

//Removes user records from user_setting (savedStats) table
function deleteFromUserSettings(id, commId, options){
	return db.user_setting.findOne({
		where: {user_id: id}
	})
	.then(function(userSetting){
		if(!userSetting){
			log.warn("user_setting object not found for id", id);
			throw new Error("user_setting object not found for id");
		}
		return userSetting.destroy({user: options.user, transaction: options.transaction});
	})
	.then(function(){
		return commId;
	});	
}

//Removes user records from tables associated to message table
function deleteFromMessage(userId, options){
	//Remove user records from message_sender_users table
	return db.message_sender_users.destroy({
		where: {user_id: userId},
		transaction: options.transaction
	})
	.then(function(){
		//Remove user records from message_recipient_users table
		return db.message_recipient_users.destroy({
			where: {user_id: userId},
			transaction: options.transaction
		});
	});
}


//Removes user records from comm (comms) table
function deleteFromComm(commId, options){
	return db.comm.findById(commId)
	.then(function(comm){
		if(!comm){
			log.warn("Comm object not found for id", commId);
			throw new Error("Comm object not found for id");
		}
		return comm.destroy({user: options.user, transaction: options.transaction});
	});
}

//Delete records from user associate table (user_groups) and user table
function deleteFromUser(id, options){
	return db.user.findById(id)
	.tap(function(user){
		if(!user){
			log.warn("User object not found for id", id);
			throw new Error("User object not found for id");
		}
		//Deleting user records from 'user_groups'
		return user.setGroups([], {user: options.user, transaction: options.transaction});	
	})
	.tap(function(user){
		//Delete user record from alert_rule_subscriber_users
		return user.setArSubscriberUsers([], {user: options.user, transaction: options.transaction});
	})
	.tap(function(user){
		//Deleting records from user table
		return user.destroy({user: options.user, transaction: options.transaction});
	});
}


//Generates comm_id and inserts record into comms
function insertComm(id, options){
	var dbComm = db.comm.build({
		row_id: id,
		table_name: "users"
	});
	return dbComm.save({user: options.user, transaction: options.transaction});
}

//Inserts record in user_setting table for the new user
function insertUserSettings(id, options){
	var dbUserSetting = db.user_setting.build({user_id: id});
	return dbUserSetting.save({user: options.user, transaction: options.transaction});
}

//checks user limit set for customer/client group when he was registered via MOJO. Throws error if the cutomer has exceeded user limit
function checkCustomerUserLimit(clientId){
	return db.client.find({
		where: {id: clientId},
		attributes: ["user_limit"]
	})
	.then(function(client){
		return db.user.count({
			where: {client_id: clientId}
		})
		.then(function(userCount){
			if(userCount >= client.user_limit){
				throw new Error("Cannot add user. Customer's user limit has been maxed. Please contact T24 support to increase the limit");
			}else{
				return bluebird.resolve();
			}
		});
	});
}



module.exports = {
	getAllUserForAdmin: getAllUserForAdmin,
	getAllUser: getAllUser,
	getUserById: getUserById,
	postUser: postUser,
	postAdminUser: postAdminUser,
	putUser: putUser,
	deleteUser: deleteUser,
	getUserRole: getUserRole,
	getPermittedUsers: getPermittedUsers,
	resendRegistration: resendRegistration,
	putAdminUser: putAdminUser,
	getAllPermittedUsers: getAllPermittedUsers,
	processGetAllUsers: processGetAllUsers
};