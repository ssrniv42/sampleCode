var bluebird = require("bluebird");
var _ = require("lodash");

/** 
 * gets main customer admin username for all clientIds passed in array
 * @method getCustomerAdminUsernames
 * @memberof db_mh_customer
 * @param {Array} clientIdArray - array of client ids from req params
 * @return {object} - success message and result data
*/
var getCustomerAdminUsernames = function(clientIdArray){
	if(clientIdArray.length == 0){
		throw new Error("Invlaid params. No client Id's passed to api");
	}

	return db.user.findAll({
		where: {client_id: {$in: clientIdArray}},
		include: [{
			model: db.role,
			where: {title: "Customer Admin"}
		}]
	})
	.then(function(userData){
		userData =_.map(userData, function(user){
			user = user.get({plain: true});
			return {
				username: user.username,
				client_id: user.client_id
			};
		});
		return bluebird.resolve({message: "Succesfully processed GET customer usernames", result: userData});
	});
};

/** 
 * gets customer comm id for the client id passed
 * @method getCustomerCommId
 * @memberof db_mh_customer
 * @param {Number} clientId - id of the client from req params
 * @return {object} - success message and result data
*/
var getCustomerCommId = function(clientId){
	return db.comm.findOne({
		where: {row_id: clientId, table_name: "client"}
	})
	.then(function(comm){
		return bluebird.resolve({message: "Succesfully processed GET customer comm Id", result: {comm_id: comm.id}});
	});
};

module.exports = {
	getCustomerAdminUsernames: getCustomerAdminUsernames,
	getCustomerCommId: getCustomerCommId
};