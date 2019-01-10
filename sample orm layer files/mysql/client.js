"use strict";

module.exports = function (sequelize, DataTypes) {
	var client = sequelize.define("client", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},

		create_timestamp: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			allowNull: false,
			comment: "Unix timestamp (in seconds) recorded when client was first registered"
		},	

		company: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		country: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		city: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		email: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		device_limit: {
			type: DataTypes.INTEGER(5),
			allowNull: false
		},

		user_limit: {
			type: DataTypes.INTEGER(5),
			allowNull: false
		},

		start_timestamp: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			allowNull: false,
			comment: "Unix timestamp (in seconds) recorded when client services started"
		},

		expiry_timestamp: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			allowNull: true,
			defaultValue: null,
			comment: "Unix timestamp (in seconds) recorded to determine when client services is set to end or renewed"
		},

		active: {
			type: DataTypes.BOOLEAN, 
			allowNull: false,
			defaultValue: true,
			comment: "Variable that deactivates a client, staging process before completely deleting a client"
		},

		main_user_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		"2fa": {
			type: DataTypes.INTEGER(),
			allowNull: false,
			defaultValue: 0
		}

	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {
				client.hasMany(models.poi, { foreignKey: { fieldName: "client_id", allowNull: false } });
				client.hasMany(models.geofence, { foreignKey: { fieldName: "client_id", allowNull: false } });
				client.hasMany(models.message, { foreignKey: { fieldName: "client_id", allowNull: false } });
				client.hasMany(models.canned_message, { foreignKey: { fieldName: "client_id", allowNull: false } });
				client.hasMany(models.role, { foreignKey: { fieldName: "client_id", allowNull: true } });
				client.hasMany(models.device, { foreignKey: { fieldName: "client_id", allowNull: true} });
				client.hasMany(models.user, { foreignKey: { fieldName: "client_id", allowNull: true } });				
				client.hasMany(models.group, { foreignKey: { fieldName: "client_id", allowNull: false } });
				client.hasMany(models.nearest_responder, { foreignKey: { fieldName: "client_id", allowNull: false } });
				client.hasMany(models.alert_rule, {foreignKey: { fieldName: "client_id", allowNull: false } });
				client.hasMany(models.situational_awareness, {foreignKey: { fieldName: "client_id", allowNull: false } });
				client.hasMany(models.comm, { foreignKey: "row_id", constraints: false, scope: { table_name: "client" } });
				client.belongsToMany(models.feature, {through: "feature_client", foreignKey: {fieldName: "client_id", allowNull: false}});
				client.belongsToMany(models.map_layer, {through: "client_map_layers", as: "ClientMapLayers", foreignKey: {fieldName: "client_id", allowNull: false}});
				client.belongsTo(models.user, {foreignKey: {fieldName: "main_user_id", as: "MainUserInfo", allowNull: true}, constraints: false});
				client.hasMany(models.language_translation, { foreignKey: { fieldName: "client_id", allowNull: true}});
				client.hasOne(models.image, {foreignKey: {fieldName: "client_id", allowNull: true}});
				client.hasMany(models.category, { foreignKey: { fieldName: "client_id", allowNull: true } });
			}
		},

		hooks: {
			afterCreate: function(client, options){
				return triggerLogic(client, "insert", options);
			},
			
			afterUpdate: function(client, options){
				return triggerLogic(client, "update", options);
			},
			
			beforeDestroy: function(client, options){
				return triggerLogic(client, "delete", options);
			}
		}
	});
	return client;
};

function triggerLogic(client, action, options){
	var timestamp = Math.round(new Date().getTime() / 1000);
				
	var desc = {
		"company": client.company,
		"country": client.country,
		"city": client.city,
		"email": client.email,
		"asset_count": client.asset_limit,
		"user_count": client.user_limit,
		"start_timestamp": client.start_timestamp,
		"expiry_timestamp": client.expiry_timestamp
	};

	var qryAdminLog = "INSERT INTO AdminLog (client_id, `name`, `time`, `event`, `table`, `action`, row_id, `desc`) " 
						+ "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";                     
						
	return db.sequelize.query(qryAdminLog, { 
		replacements: [client.id, client.company, timestamp, "client", "client", action, client.id, JSON.stringify(desc)], 
		transaction: options.transaction
	});
}
