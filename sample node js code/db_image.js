var bluebird = require("bluebird");
var _ = require("lodash"); 

/** 
 * Returns the list of all images
 * 
 * @method getAllImages
 * @memberof db_image
 * @param {object} user - user information object
 * @return {object} - object containg image data for all in the client group
*/
var getAllImages = function(user){
	var clientId= user.client_id;
	return db.image.findAll({
		where: {
			$or: [
				{client_id: clientId}, 
				{client_id: {$is: null}}
			]
		}
	})
	.then(function(images){
		_.map(images, function(image){
			image.data= new Buffer(image.data, "binary").toString("base64");
		});
		images= _.keyBy(images, "id");
		return bluebird.resolve({message: "Get all images successful", result: images});
	});
};


/**
 * verifies if image with given conditions exist in the DB
 * 
 * @method isImageExist
 * @memberof db_image
 * @param {object} user - user information object
 * @param {object} conditions - contains all the conditions that we are checking against to verify if image exists
 * @return {object} - object containing the image that matches all the conditions passed
*/
var isImageExist= function(user, conditions){
	var findCond= _.extend({ client_id: user.client_id }, conditions);
	return db.image.findOne({ where: findCond })
	.then(function(image){		
		return bluebird.resolve(image);
	});
};



/**
 * Updates the given image instance
 * 
 * @method putImage
 * @memberof db_image
 * @param {Object} image - Sequelize image instance
 * @param {Object} imageData - key/values of the image data to be updated
 * @return {Object} platforms standard DB result format 
*/
var putImage = function(image, imageData){
	image = _.extend(image, imageData);
	return image.save({image: imageData})
	.then(function(image){
		image= image.get({ plain: true });
		
		image.data= new Buffer(image.data, "binary").toString("base64");
		return bluebird.resolve({message: "Update Image successful", result: image});
	});
};



/**
 * Inserts a new image into the DB
 * 
 * @method postImage
 * @memberof db_image
 * @param {Object} imageData - key/values of the image data to be updated
 * @return {Object} platforms standard DB result format 
*/
var postImage= function(imageData){
	var image= db.image.build(imageData);
	return image.save()
	.then(function(image){
		image= image.get({ plain: true });
		
		image.data= new Buffer(image.data, "binary").toString("base64");
		return bluebird.resolve({message: "Insert Image successful", result: image});
	});
};

/**
 * Get data for all image Ids passed
 * 
 * @method getImagesById
 * @memberof db_image
 * @param {Array} ids - ids of all the images requested
 * @return {Object} platforms standard DB result format 
*/
function getImagesById(ids){
	return db.image.findAll({
		where: {
			id: {$in: ids}
		}
	})
	.then(function(images){
		_.map(images, function(image){
			image.data= new Buffer(image.data, "binary").toString("base64");
		});
		images= _.keyBy(images, "id");
		return bluebird.resolve({message: "Get images by id successful", result: images});
	});
}


module.exports={
	getAllImages: getAllImages,
	isImageExist: isImageExist,
	putImage: putImage,
	postImage: postImage,
	getImagesById: getImagesById
};