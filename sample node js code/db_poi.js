var bluebird = require("bluebird");
var _ = require("lodash"); 
var dbPermission= require("./db_permission.js");
var dbDevice = require("./db_device.js");

/** 
 * Returns info of all Poi's belonging to the users client group 
 * 
 * @method getAllPoi
 * @memberof db_poi
 * @param {object} user - user information object
 * @return {object} - list of all poi's belonging to the user's client group
*/
var getAllPoi = function(user){
	var whereClause = {
		client_id: user.client_id
	};

	/*
		This is special check added just for compatibility with
		POI sync module. The requirement stated that poi's sent
		by tacticals can only be accepted by 'Customer Admins',
		hence we do a check to see if the user is a customer admin.
		if the user is a customer admin we load all approved and 
		non approved (poi's sent from tactical) poi's. All other roles
		only see approved poi's
	*/
	return getRoleOfUser(user)
	.then(function(userRole){
		if(userRole != "Customer Admin" && userRole != "Admin"){
			whereClause.approved = true;
		}

		return db.poi.findAll({
			where: whereClause,
			include: [{
				model: db.device,
				as: "SyncedDevices",
				attributes: ["id"],
				required: false
			}, {
				model: db.category_images,
				required: false
			}]
		});
	})
	.then(function(pois){			
		pois = _.map(pois, function(poi){
			return refinePoiData(poi);
		});
		pois= _.keyBy(pois, "id");
		return bluebird.resolve({message: "Get all POIs successful", result: pois});
	});
};


/** 
 * Returns info for a particular Poi
 * 
 * @method getPoiById
 * @memberof db_poi
 * @param {integer} id - poi Id
 * @return {object} - info related to a particular poi
*/
var getPoiById = function(id){	
	return db.poi.findOne({
		where: {id: id},
		include: [{
			model: db.device,
			as: "SyncedDevices",
			attributes: ["id"],
			required: false
		}, {
			model: db.category_images,
			required: false
		}]
	})
	.then(function(poi){
		if(!poi){
			throw new Error("POI not found. ID: "+ id);
		}		
		return bluebird.resolve({message: "Get POI successful", result: refinePoiData(poi), $raw: poi});
	});
};


/** 
 * Adds new Poi into the DB and references it to the user's client group
 * 
 * @method postPoi
 * @memberof db_poi
 * @param {object} user - user information object
 * @param {object} poi - object containing values necessary to successfully add the poi
 * @return {object} - object containing info of newly created poi and status message
*/
var postPoi = function(user, poi){
	if(poi.image_id == null && poi.nato_code == null){
		throw new Error("Cannot add a POI without a marker");
	}

	if(poi.image_id != null && poi.nato_code != null){
		throw new Error("It is unclear if you have chosen Nato or platform POI. Object contains image id and nato code");
	}

	if(poi.nato_code == null && poi.category_id == null && poi.image_id != null){
		throw new Error("Missing category information");
	}

	//Make sure that there are no devices or groups to sync with platform POI's (Non NATO)
	if(poi.image_id != null){
		poi.sync.devices = [];
		poi.sync.groups = [];
	}

	poi.created_timestamp = Math.round(new Date().getTime() / 1000);

	return db.sequelize.transaction(function(t){
		var options = {user: user, transaction: t};
		return processPostPoi(poi, options);
	})
	.then(function(poi){
		return getPoiById(poi.id);
	})
	.then(function(poi){
		return bluebird.resolve({message: "Post new POI successful", result: poi.result});
	});
};


/** 
 * Updates info for a particular poi
 * 
 * @method putPoi
 * @memberof db_poi
 * @param {object} user - user information object
 * @param {integer} id - id of the poi being updated
 * @param {object} poiData - object containing poi info that needs to be updated
 * @return {object} - object containing updated info of poi and status message
*/
var putPoi = function(user, id, poiData){
	var originalPoi = {};

	if(poiData.image_id != null && poiData.nato_code != null){
		throw new Error("It is unclear if you have chosen Nato or platform POI. Object contains image id and nato code");
	}

	if(poiData.nato_code == null && poiData.category_id == null && poiData.image_id != null){
		throw new Error("Missing category information");
	}

	return getPoiById(id)
	.then(function(poi){
		//Getting unrefined sequelize poie instance 
		originalPoi = poi.result;
		return poi.$raw;
	})
	.then(function(poi){
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			return processPutPoi(poi, poiData, options);
		});
	})
	.then(function(){
		return getPoiById(id);
	})
	.then(function(poi){
		var updatedPoi = poi.result;
		return bluebird.resolve({message: "Put POI successful", result: updatedPoi, $originalData: originalPoi});
	});
};

/** 
 * This action is invoked when a poi is accepted during syncing process
 * it updates the approved column for the poi
 * Does not process and throws an error 
 * if a user is accepting an already approved POI
 * 
 * @method putPoi
 * @memberof db_poi
 * @param {object} user - user information object
 * @param {integer} id - id of the poi being updated
 * @param {object} poiData - object containing poi info that needs to be updated
 * @return {object} - object containing updated info of poi and status message
*/
var acceptPoi = function(user, id, poiData){
	var originalPoi = {};

	return getPoiById(id)
	.then(function(poi){
		//Getting unrefined sequelize poi instance 
		originalPoi = poi.result;
		if(originalPoi.approved){
			throw new Error("This POI has already been approved");
		}
		return poi.$raw;
	})
	.then(function(poi){
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			return processPutPoi(poi, poiData, options);
		});
	})
	.then(function(){
		return getPoiById(id);
	})
	.then(function(poi){
		var updatedPoi = poi.result;
		return bluebird.resolve({message: "accept POI successful", result: updatedPoi, $originalData: originalPoi});
	});
};


/** 
 * Deletes the record for an existing poi
 * 
 * @method deletePoi
 * @memberof db_poi
 * @param {object} user - user information object
 * @param {integer} id - id of the poi being deleted
 * @return {object} - object containing info of deleted poi and status message 
*/
var deletePoi = function(user, id){
	var poiData = {};
	return getPoiById(id)
	.then(function(poi){
		poiData = poi.result;
		if(!poiData.approved){
			throw new Error("Cannot delete a poi that is not approved. This needs to be done via poi/decline route");
		}
		return poi.$raw;
	})
	.then(function(poi){
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			return processDeletePoi(poi, options);
		});
	})
	.then(function(){
		return bluebird.resolve({message: "Delete POI successful", result: poiData});
	});
};


/** 
 * This action is invoked when a poi is declined during syncing process
 * It Deletes the record for an existing poi. 
 * Does not process and throws an error 
 * if a user is declining an accepted POI
 * 
 * @method declinePoi
 * @memberof db_poi
 * @param {object} user - user information object
 * @param {integer} id - id of the poi being deleted
 * @return {object} - object containing info of deleted poi and status message 
 * Or error if user is trying to decline an approved POI
*/
var declinePoi = function(user, id){
	var poiData = {};
	return getPoiById(id)
	.then(function(poi){
		poiData = poi.result;
		if(poiData.approved){
			throw new Error("Cannot decline an approved POI");
		}
		return poi.$raw;
	})
	.then(function(poi){
		return db.sequelize.transaction(function(t){
			var options = {user: user, transaction: t};
			return processDeletePoi(poi, options);
		});
	})
	.then(function(){
		return bluebird.resolve({message: "Decline POI successful", result: poiData});
	});
};

/** 
 * Refines the poi data object to match expectation on the front end.
 * @method refinePoiData
 * @memberof db_poi
 * @param {object} rawPoi - object containing data related to a poi as returned by sequelize query
 * @return {object} - refined poi object, with parameters matching expectation on the front end
*/
function refinePoiData(rawPoi){
	var poi = rawPoi.get({plain: true});

	poi.category_id = null;
	poi.image_id = null;

	if(poi.category_image){
		poi.category_id = poi.category_image.category_id;
		poi.image_id = poi.category_image.image_id;
	}
	
	poi.sync = {
		devices: _.map(poi.SyncedDevices, "id"),
		groups: []
	};

	poi = _.omit(poi, ["SyncedDevices", "category_image", "category_images_id"]);
	return poi;
}


/** 
 * process and adds new Poi into the DB and also adds any associations sent by the user
 * 
 * @method processPostPoi
 * @memberof db_poi
 * @param {object} poiData - object containing values necessary to successfully add the poi
 * @param {object} options - object containing user and transaction info
 * @return {object} - object containing info of newly created poi
*/
function processPostPoi(poiData, options){
	var dbPoi = db.poi.build(poiData);	
	return dbPoi.save(options)
	.tap(function(poi){
		if(poiData.sync && poiData.sync.devices != undefined){
			return dbPermission.validateUserPermissionForDevices(options.user, poiData.sync.devices)
			.then(function(){
				return poi.addSyncedDevices(poiData.sync.devices, {transaction: options.transaction});
			});
		}
		else return bluebird.resolve();
	})
	.tap(function(poi){
		if(poiData.image_id != null && poiData.category_id != null){
			return updatePoiCategoryImagesId(poi.id, poiData.image_id, poiData.category_id, options);
		}
		return bluebird.resolve();
	});
}

/** 
 * process and updates poi record with the respective category_images_id
 * 
 * @method updatePoiCategoryImagesId
 * @memberof db_poi
 * @param {Number} poiId - Id of the poi
 * @param {Number} imageId - Id of the poi
 * @param {Number} categoryId - Id of the poi
 * @param {object} options - object containing user and transaction info
 * @return {object} - Promise indicating end of process
*/
function updatePoiCategoryImagesId(poiId, imageId, categoryId, options){
	const dbCategory = require("./db_category.js"); 

	return dbCategory.getCategoryById(categoryId)
	.then(function(categoryData){
		if(_.indexOf(categoryData.result.images, imageId) == -1){
			throw new Error("Image does not belong to category");
		}
		return db.category_images.findOne({
			attributes: ["id"],
			where: {image_id: imageId, category_id: categoryId},
			transaction: options.transaction
		});
	})
	.then(function(categoryImage){
		return db.poi.update(
			{category_images_id: categoryImage.id},
			{where: {id: poiId}, transaction: options.transaction}
		);
	});
}


/** 
 * process and updates Poi into the DB and also upadtes any associations sent by the user
 * 
 * @method processPutPoi
 * @memberof db_poi
 * @param {object} poi - object containing sequelize instance of a poi that needs to be updated
 * @param {object} options - object containing user and transaction info
 * @param {object} poiData - object containing values necessary to successfully add the poi
 * @param {object} options - object containing user and transaction info
 * @return {object} - object containing info of newly created poi
*/
function processPutPoi(poi, poiData, options){

	if(poiData.image_id){
		poiData.nato_code = null;
		
		//Done as part of platform version 2.7.0. It was deciced that if NATO poi was changed to platform poi
		//Then the poi must be removed from all tacticals on the ground (Task 2977)
		poiData.sync.devices = [];
	}

	if(poiData.nato_code){
		poiData.image_id = null;
	}

	// Extending the poi object from the DB with the object provided in the request.
	// The request object may only provide fields that has changed.
	poi = _.extend(poi, poiData);		
	return poi.save({transaction: options.transaction})
	.then(function(){
		if(poiData.sync && poiData.sync.devices != undefined){
			return updatePoiSyncedDevices(poi, poiData.sync.devices, options);
		}
		else return bluebird.resolve();
	})
	.then(function(){
		if(poiData.image_id != null && poiData.category_id != null){
			return updatePoiCategoryImagesId(poi.id, poiData.image_id, poiData.category_id, options);
		}
		return bluebird.resolve();
	});
}


/** 
 * Processes and updates synced devices of the poi
 * Removes all existing associations and re-adds them to maintain sanity of the data. 
 * Precaution suggested by Masoud
 * 
 * @method updatePoiSyncedDevices
 * @memberof db_poi
 * @param {object} poi - object containing poi instance that needs to be updated
 * @param {array} syncedDevices - array containing id's of synced devices
 * @param {object} options - object containing user and transaction info
 * @return {object} - promise indicating end of function
*/
function updatePoiSyncedDevices(poi, syncedDevices, options){
	return dbDevice.getPermittedDevices(options.user)
	.then(function(devices){
		return bluebird.resolve(_.map(devices, "id"));
	})
	.tap(function(permittedDevices){
		return poi.removeSyncedDevices(permittedDevices, {transaction: options.transaction});
	})
	.tap(function(permittedDevices){
		var finalSyncedDevices = _.intersection(permittedDevices, syncedDevices);
		return poi.addSyncedDevices(finalSyncedDevices, {transaction: options.transaction});
	});
}


/** 
 * Process and deletes poi records and association and poi tables
 * 
 * @method processDeletePoi
 * @memberof db_poi
 * @param {object} poi - sequelize instance of poi that needs to be deleted
 * @param {object} options - object containing user and transaction info
 * @return {object} - A promise indication end of process
*/
function processDeletePoi(poi, options){
	return poi.setSyncedDevices([], {transaction: options.transaction})
	.then(function(){
		return poi.destroy({user: options.user, transaction: options.transaction});
	});
}

/** 
 * Returns role name of user accessing poi module
 * 
 * @method getRoleOfUser
 * @memberof db_poi
 * @param {object} user - user information object
 * @return {string} - name of users role
*/
function getRoleOfUser(user){
	return db.user.findOne({
		where: {id: user.user_id},
		include: [{
			model: db.role
		}]
	})
	.then(function(userData){
		userData = userData.get({plain: true});
		return bluebird.resolve(userData.role.title);
	});	
}


module.exports = {
	getAllPoi: getAllPoi,
	getPoiById: getPoiById,
	postPoi: postPoi, 
	putPoi: putPoi,
	acceptPoi: acceptPoi,
	deletePoi: deletePoi,
	declinePoi: declinePoi
};