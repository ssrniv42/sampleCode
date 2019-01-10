/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var messageRecipientDevices = sequelize.define("message_recipient_devices", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		message_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		device_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		message_status: {
			type: DataTypes.ENUM("pending", "sent", "fail"),
			allowNull: false,
			defaultValue: "pending"
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				messageRecipientDevices.belongsTo(models.message, { foreignKey: { fieldName: "message_id", allowNull: false } });
				messageRecipientDevices.belongsTo(models.device, { foreignKey: { fieldName: "device_id", allowNull: false } });
			}
		}
        
	});
	return messageRecipientDevices;
};