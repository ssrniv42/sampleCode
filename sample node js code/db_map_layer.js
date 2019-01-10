/* global db */
/**
 * DB mechanics for map_layer
 * 
 * @module
 */

var bluebird = require("bluebird");
var _ = require("lodash");

/**
 * returns all the map layers available on the server
 * 
 * @method getAllMapLayer
 * @memberof db_feature
 * @return {object} map_layer list of all map layers available on the server
 */
var getAllMapLayer = function(){
	return db.map_layer.findAll()
	.then(function(mapLayers){
		mapLayers = _.map(mapLayers, function(mapLayer){
			return mapLayer.get({plain: true});
		});

		mapLayers = _.keyBy(mapLayers, "id");
		return bluebird.resolve({message: "Get all maplayers successfull", result: mapLayers});
	});
};


/**
 * returns info of active map layer for client
 * 
 * @method getClientMapLayers
 * @memberof db_feature
 * 
 * @param {object} user - object containg info of session user
 * @return {object} info of active map layer for client
 */
var getClientMapLayers = function(user){
	return db.client.findOne({
		where: {id: user.client_id},
		include: [{
			model: db.map_layer,
			as: "ClientMapLayers",
			required: true
		}]
	})
	.then(function(clientData){
		clientData = clientData.get({plain: true});
		const mapLayers= _.map(clientData.ClientMapLayers, mapLayer=> {
			return {
				client_id: clientData.id, 
				code: mapLayer.code,
				id: mapLayer.id,
				is_base_layer: mapLayer.is_base_layer,
				map_id: mapLayer.id,
				name: mapLayer.title
			};
		});
		return bluebird.resolve({message: "Get active map layer successfull", result: mapLayers});
	});
};


module.exports = {
	getAllMapLayer: getAllMapLayer,
	getClientMapLayers: getClientMapLayers	
};