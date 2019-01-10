/*  global db */


//This table stores custom canned message data per client.  


"use strict";

module.exports = function(sequelize, DataTypes) {
	var cannedMessage = sequelize.define("canned_message", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		canned_number: {
			type: DataTypes.INTEGER(10),
			allowNull: false
		},
		
		canned_message: {
			type: DataTypes.STRING(128),
			allowNull: false
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models){
				cannedMessage.belongsTo(models.client, {foreignKey: {fieldName: "client_id", allowNull: false}});
				cannedMessage.hasMany(models.message, {foreignKey: {fieldName: "cannedmessage_id"}});
			}
		}
	});
	return cannedMessage;
};
