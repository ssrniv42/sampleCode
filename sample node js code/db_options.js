var bluebird= require("bluebird");
var dbImage= require("./db_image.js");


/**
 * Insert/Updates current client's platform image
 * 
 * @param {Object} user - user token object
 * @param {Object} imageData - image data object
 * @return {Object} standard platform response object containing success message and the result 
 */

function updatePlatformImage(user, imageData){
	imageData.data = new Buffer(imageData.data, "base64");
	return dbImage.isImageExist(user, {tag: "platform"})
	.then(function(image){
		if(!image){
			return dbImage.postImage(imageData);
		}else{
			return dbImage.putImage(image, imageData);
		}
	});
}



/**
 * Deletes current client's platform image
 * 
 * @param {Object} user - user token object
 * @return {Object} standard platform response object containing success message and the result 
 */
function deletePlatformImage(user){
	return db.image.findOne({ where: {client_id: user.client_id, tag: "platform"}})
	.then(function(image){
		if(!image){
			throw new Error("Could not find image to remove.");
		}
		
		return image.destroy();
	})
	.then(function(image){
		image= image.get({ plain: true });
		return bluebird.resolve({ message: "Delete Platform Image Successful.", result: image});
	});
}

module.exports={
	updatePlatformImage: updatePlatformImage,
	deletePlatformImage: deletePlatformImage
};