/**
 * DB mechanics for the permission module  
 * 
 * @module
 */

var bluebird = require("bluebird");
var _ = require("lodash"); 

// this holds the list of features that are assigned to clients in the admin section.
// TODO: change the features list to match modules in the list of permissions 
// and remove the extra step to check whether the module name is available in admin
var allModules= ["device", "poi", "geofence", "sa", "nr", "eqnx", "ar", "container", "message"];



/**
 * returns all the roles/permissions available to a client
 * excluding those that current user's role is not allowed to modify
 * 
 * @method getAllPermissions
 * @memberof db_permission
 * @param {object} user - user information object 
 * @param {boolean} getNonPermitted. If getNonPermitted is false it omits all roles 
 * not accessible by the user before returning the permission list. 
 * If getNonPermitted is true it returns all permission roles that belong to the client group
 * @return {object} roles and permissions data of the client
 */
var getAllPermissions= function(user, getNonPermitted){
	return db.role.findAll({	
		where: {client_id: {$or: [user.client_id, null]}},		
		include: [{					
			model: db.permission,
			attributes: ["id"],			
			required: false
		}, {
			model: db.user,
			required: false
		}]
	})
	.then(function(roles){
		// getting the raw instance
		roles= _.map(roles, function(role){
			role = role.get({plain: true});
			role.role_users = [];
			if(role.users){
				role.role_users = _.map(role.users, "id");
				role = _.omit(role, ["users"]);
			}
			return role;
		});
		
		// indexing roles and permissions by the id
		roles= _.keyBy(roles, function(role){
			role.permissions= _.map(role.permissions, "id");
			return role.id;
		});

		if(!getNonPermitted){
			// removing roles that current user should not see based on their role
			return omitUnAccessibleRoles(user, roles);
		}else{
			return bluebird.resolve(roles);
		}		
	})
	.then(function(roles){	
		return {message: "Get All Permissions Succesful", result: roles};
	});
};




/**
 * Removes all the roles that a given user's role is not allowed to see
 * from the provided list of roles
 * 
 * @method omitUnAccessibleRoles
 * @memberof db_permission
 * @param {object} user - user information object 
 * @param {object} roles - list of roles to be checked 
 * @return {object} new roles and permissions data of the client
 */
var omitUnAccessibleRoles= function(user, roles){
	return bluebird.all([getPermissionData(), getPermission(user)])
	.then(function(result){				
		var allPerms= result[0].result;		
		var userRolePerms= result[1].result;
		
		// gets ID of all permissions that current user have
		// including those that are implicitly derived thorough 'all' action 
		var userPermIds= getFullPermissionIds(allPerms, userRolePerms, true);

		// building a new object from the original role excluding permissions 
		// that are not allowed for the current user.
		roles= _.transform(roles, function(result, role, id){
			
			// gets ID of all permissions for the specified role 
			var rolePermIds= getFullPermissionIds(allPerms, role, true);
			// checking to see if current user's role has access to all permissions 
			// of the specified role
			if(_.intersection(rolePermIds, userPermIds).length == rolePermIds.length){
				result[id]= role;
			}
		});	
		
		return roles;
	});
	
};



/**
 * returns the permission values for the user
 * 
 * @method getPermission
 * @memberof db_permission
 * @param {object} user - user information object 
 * @return {object} role and permission data of the user
 */
var getPermission = function(user){	
	return db.user.findOne({		
		where: {id: user.user_id},
		attributes: ["role_id"],
		include: [
			{				
				model: db.role,				
				required: true,
				include: [{					
					model: db.permission,
					attributes: ["id"],
					required: true,
					through: {
						attributes: []
					}        
				}]
			},
			{ 
				model: db.client,
				required: false,
				include: [
					{				 
						model: db.feature,
						required: false
					}
				]
			}
		]
	})
	.then(function(user){
		if (!user) throw new Error("Could not find roles for the specified user.");
		user= user.get({plain: true});
		
		user.role.permissions= _.map(user.role.permissions, "id");
		
		// getting the list of features avalialbe to the user's client
		user.role.features= (user.client)? _.map(user.client.features, "type"): [];
		
		return {message: "Get Permission Succesful", result: user.role};
	});
};



/**
 * returns the permission values for the given role id
 * 
 * @method getPermissionById
 * @memberof db_permission
 * @param {object} user - user information object 
 * @param {integer} roleId - role Id
 * @return {object} role and permission data for the given role_id
 */
var getPermissionById= function(user, roleId){
	var clientId= user.client_id;
	return db.role.findOne({
		where: {id: roleId, client_id: clientId},
		include: [{					
			model: db.permission,
			attributes: ["id"]
		}, {
			model: db.user,
			required: false
		}]
	})
	.then(function(role){
		if (!role) throw new Error("Could not find the specified role. id:"+ roleId);
		
		role= role.get({ plain: true });

		role.role_users = [];
		if(role.users){
			role.role_users = _.map(role.users, "id");
			role = _.omit(role, ["users"]);
		}
		
		role.permissions= _.map(role.permissions, "id");
		
		return {message: "Get Permission By Id Succesful", result: role};
	});
};



/**
 * returns all available Permissions (module/action relations)
 * 
 * @method getPermissionData
 * @memberof db_permission
  * @return {object} availabe Permissions
 */
var getPermissionData= function(permIds){
	var options= (permIds)? { where: { id: { $in: permIds }}} : {};
	return db.permission.findAll(options)
	.then(function(permissions){
		permissions= _.map(permissions, function(permission){
			return permission.get({ plain: true });
		});
		
		permissions= _.keyBy(permissions, function (permission){			
			return permission.id;
		});		
		return {message: "Get Permission Data Succesful", result: permissions};
	});
};



/**
 * Inserts new permission values for the user
 * 
 * @method postPermission
 * @memberof db_permission
 * @param {object} user - user information object 
 * @param {object} rolePermission - role and permission information object
 * @return {object} role and permission data of the user
 */
var postPermission = function(user, rolePermission){
	var clientId = user.client_id;	
	return db.sequelize.transaction(function (t) {
		var role= db.role.build({title: rolePermission.title, client_id: clientId});
		
		return checkDuplicateRoleActions(user, rolePermission)
		.then(function(){
			return role.save({transaction: t});
		})
		.tap(function(role){
			// adding the role ID and client ID to the returning object
			rolePermission.id= role.id;
			rolePermission.client_id= clientId;
			return db.permission.findAll({ where: {id: {$in: rolePermission.permissions }}, transaction: t})
			.tap(function(perms){
				return role.addPermissions(perms, {transaction: t});
			});			
		});			
	})
	.then(function(role){
		return getPermissionById(user, role.id);
	})
	.then(function(roleData){
		var rolePermission= roleData.result;		
		return {message: "Post Permission Successful", result: rolePermission};
	});
};



/**
 * Updates permission values for the user
 * 
 * @method putPermission
 * @memberof db_permission
 * @param {object} user - user information object 
 * @param {object} rolePermission - role and permission information object
 * @return {object} role and permission data of the user
 */
var putPermission = function(user, rolePermission){
	var clientId = user.client_id;	
	var roleId= rolePermission.id;	
	
	return db.role.findOne({where: {id: roleId, client_id: clientId}})	
	.tap(function(role){
		if (!role) throw new Error("Could not find the specified role or operation not permitted. id:"+roleId);
		
		return db.sequelize.transaction(function (t) {
			role.title= rolePermission.title;
			
			return checkDuplicateRoleActions(user, rolePermission)
			.then(function(){
				return role.save({transaction: t});
			})
			.then(function(){
				// updating the permissions data if provided, otherwise return
				if(rolePermission.permissions){
					// getting all available permissions, all permissions available to the user,
					// and permissions of the role being modified. Note that we need to obtain 
					// the roles from the DB to verify the role being modified is a subset of the 
					// user's role.
					return bluebird.all([getPermissionData(), getPermission(user), getPermissionById(user, roleId)]);
				}else{
					return bluebird.resolve();
				}				
			})
			.then(function(promises){
				if(!promises) return bluebird.resolve();

				var allPerms= promises[0].result;				
				var userRolePerms= promises[1].result;
				var rolePerms= promises[2].result;
				
				var userPermIds= getFullPermissionIds(allPerms, userRolePerms, true);
				var rolePermIds= getFullPermissionIds(allPerms, rolePerms, true);

				// Checking if the role being modified is a sub-set of the user's role					
				if(_.intersection(rolePermIds, userPermIds).length != rolePermIds.length){
					throw new Error("Not allowed to modify this role.");
				}
				
				return role.setPermissions(rolePermission.permissions, {transaction: t});
			});
		});				
	})
	.then(function(role){
		return getPermissionById(user, role.id);
	})
	.then(function(roleData){
		var rolePermission= roleData.result;		
		return {message: "Put Permission Successful", result: rolePermission};
	});
};



/**
 * gets all permission ids available to the user in an array
 * 
 * @method getFullPermissionIds
 * @memberof db_permission
 * @param {Object} allPerms - list of all available permission index by id 
 * @param {Object} userRolePerms - user's role object including permission data index by id  
 * @param {boolean} noModuleCheck - value is passed as a parameter to function hasPermission 
 * @return {Array} list of all permission ids that user have access to
 */
var getFullPermissionIds= function(allPerms, userRolePerms, noModuleCheck){
	var userRolePermsClone= _.cloneDeep(userRolePerms);	
	userRolePermsClone.permissions= getGroupedPermissions(allPerms, userRolePermsClone);				
 
	return _.transform(allPerms, function(result, permission){					
		permission.actions= [permission.action];
		
		if(hasPermission(userRolePermsClone, permission, noModuleCheck) && permission.action != "all"){
			result.push(permission.id);
		}
	}, []);
};

/**
 * compares and throws error if 2 roles have exactly identical actions. 
 * 
 * @method checkDuplicateRoleActions
 * @memberof db_permission
 * @param {object} user - user information object 
 * @param {object} rolePermissions - list of permissions selected for the role by the user
 * @return error if any other role has same set of actions, else returns true 
 */
var checkDuplicateRoleActions = function(user, rolePermission){
	if(rolePermission.permissions){
		// getting all available permissions, all permissions available to the user,
		// and permissions of the role being modified. Note that we need to obtain 
		// the roles from the DB to verify the role being modified is a unique set compared to the other roles already in the DB
		return bluebird.all([getPermissionData(), getAllPermissions(user, true)])
		.then(function(data){				
			var allPerms= data[0].result; //result from getPermissionData()				
			var allRolePerms= data[1].result; //result from getAlllPermissions()
			var curRolePerms= rolePermission;
			
			var rolePermIds= getFullPermissionIds(allPerms, curRolePerms, true);
			_.each(allRolePerms, function(rolePerms){
				//if conditions to make sure that role permission does not compare with itself in case of an edit
				if(curRolePerms.id != rolePerms.id){	
					var userPermIds= getFullPermissionIds(allPerms, rolePerms, true);
					// Checking if the role permission being submitted has a unique set of actions				
					if(_.isEqual(rolePermIds, userPermIds)){
						throw new Error("Another role ("+rolePerms.title+") with similar permissions already exists");
					}
				}
			});
			return bluebird.resolve();
		});
	}else{
		return bluebird.resolve();
	}		
};

/**
 * Removes a role and related permission values for the user
 * 
 * @method deletePermission
 * @memberof db_permission
 * @param {object} user - user information object 
 * @param {integer} roleId - ID of the role to be removed  
 * @return {object} role and permission data of the user
 */
var deletePermission = function(user, roleId){
	var clientId = user.client_id;	
	
	return db.role.findOne({where: {id: roleId, client_id: clientId}})	
	.tap(function(role){
		if (!role) throw new Error("Could not find the specified role or user is not permitted. id:"+roleId);		
		return db.sequelize.transaction(function (t) {
			return getUsersOfRole(role)
			.then(function(users){
				if(users.length > 0) throw new Error("Cannot remove the role. There are users assigned to this role");
				
				return role.setPermissions([], {transaction: t});
			})			
			.then(function(){
				return role.destroy({transaction: t});
			});
		});		
	})
	.then(function(role){
		return {message: "Delete Permission Successful", result: role};
	});
};

/**
 * gets all users of a given role.
 */
var getUsersOfRole= function(role){
	return db.user.findAll({ where: {role_id: role.id} });
};


/**
 * gets a new role object in which permissions are grouped by module name 
 * 
 * @method getGroupedPermission
 * @memberof permissions
 * @param {object} allPermission - list of all permissions
 * @param {object} rolePermission - list of all user permissions 
 * @return {object} the new permission object grouped by module name 
 */
var getGroupedPermissions= function(allPermissions, rolePermission){
	// getting array of permission objects from array of permission IDs 
	var permissions=  _.map(rolePermission.permissions, function(permId){
		return allPermissions[permId];
	});
	
	permissions= _.groupBy(permissions, "module");
	
	return permissions;
};



/**
 * verifies whether or not the user has permission to provided actions in a given module 
 * 
 * @method hasPermission
 * @memberof permissions
 * @param {object} rolePermission - list of all user permissions 
 * @param {object} permission - an object with module and actions to be verified
 * @param {boolean} noModuleCheck - If true the function hasPermission does not check for valid features
 * @return {boolean} true if requested permission is satisfied, and false otherwise
 */
var hasPermission= function(rolePermission, permission, noModuleCheck){
	var moduleName= permission.module;
	var actions= permission.actions;
	
	var userPermissions= rolePermission.permissions;	
	var userAction= _.map(userPermissions[moduleName], "action");
	
	var moduleAvailable= true;
	if(!noModuleCheck){
		// checks whether or not the corresponding module is available to the client
		moduleAvailable = isModuleAvailable(rolePermission.features, moduleName);
	}
	
	// does user have access to everything in the module?
	var allPermitted= _.indexOf(userAction, "all") > -1;
		
	// does user have access to each requested action? 
	var actionsPermitted= _.intersection(userAction, actions).length == actions.length;
		
	// should have access to all actions or to each action individually 
	return moduleAvailable && (allPermitted || actionsPermitted);	
};



/**
 * verifies whether or not requested module is available to the client 
 * 
 * @method isModuleAvailable
 * @memberof permissions
 * 
 * @param {String} moduleName - module name 
 * @return {Boolean} true if requested module is available or does not require checking, and false otherwise 
 */
var isModuleAvailable= function(availableModules, moduleName){
	if(_.indexOf(allModules, moduleName) > -1){
		return (_.indexOf(availableModules, moduleName) > -1);
	}
	
	return true;
};


/**
 * processes and validates the groups assigned to an entity 
 * based on whether user permission to view the groups 
 * 
 * @method validateUserPermissionForGroups
 * @memberof db_permission
 * @param {object} user - user information object
 * @param {Array} groupIdArray - array of group Id's
 * @return {object} - promise indicating group validation checks are complete 
 * 					  Or error if user validation fails
*/
function validateUserPermissionForGroups(user, groupIdArray){
	var dbGroup = require("./db_group.js");
	return dbGroup.findGroups(user, groupIdArray)
	.then(function(group){
		var validGroupIds = _.map(group, "id");
		var invalidGroupIds = _.difference(groupIdArray, validGroupIds);
		if(invalidGroupIds.length > 0){
			throw new Error("Invalid groups assigned to entity. User does not have permission to view groups with ids:" + JSON.stringify(invalidGroupIds));
		}
		return bluebird.resolve();
	});
}

/**
 * processes and validates the devices assigned to an entity 
 * based on whether user permission to view the devices
 * 
 * @method validateUserPermissionForDevices
 * @memberof db_permission
 * @param {object} user - user information object
 * @param {Array} deviceIdArray - array of device Id's
 * @return {object} - promise indicating device validation checks are complete 
 * 					  Or error if user validation fails
*/
function validateUserPermissionForDevices(user, deviceIdArray){
	var dbDevice = require("./db_device.js");
	return dbDevice.findDevices(user, deviceIdArray)
	.then(function(device){
		var validDeviceIds = _.map(device, "id");
		var invalidDeviceIds = _.difference(deviceIdArray, validDeviceIds);
		if(invalidDeviceIds.length > 0){
			throw new Error("Invalid devices assigned to entity. User does not have permission to view devices with ids:" + JSON.stringify(invalidDeviceIds));
		}
		return bluebird.resolve();
	});
}

module.exports={
	getAllPermissions: getAllPermissions,
	getPermission: getPermission,
	getPermissionById: getPermissionById,
	getPermissionData: getPermissionData,
	postPermission: postPermission,
	putPermission: putPermission,
	deletePermission: deletePermission,
	getGroupedPermissions: getGroupedPermissions,
	hasPermission: hasPermission,
	checkDuplicateRoleActions: checkDuplicateRoleActions,
	validateUserPermissionForGroups: validateUserPermissionForGroups,
	validateUserPermissionForDevices: validateUserPermissionForDevices
};