/*  global db */


//This table stores message data.  


"use strict";

module.exports = function(sequelize, DataTypes) {
	var message = sequelize.define("message", {
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
		
		message_timestamp: {
			type: DataTypes.BIGINT(20),
			allowNull: false
		},

		message: {
			type: DataTypes.STRING(255),
			allowNull: true,
			default: null
		},
		
		cannedmessage_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models){
				message.belongsTo(models.client, {foreignKey: {fieldName: "client_id", allowNull: false}});
				message.belongsTo(models.canned_message, {foreignKey: {fieldName: "cannedmessage_id", allowNull: true}});
				message.belongsToMany(models.device, {through: "message_sender_devices", as: "MessageSenderDevices", foreignKey: {fieldName: "message_id", allowNull: false}});
				message.belongsToMany(models.device, {through: models.message_recipient_devices, as: "MessageRecipientDevices", foreignKey: {fieldName: "message_id", allowNull: false}});
				message.belongsToMany(models.user, {through: models.message_sender_users, as: "MessageSenderUsers", foreignKey: {fieldName: "message_id", allowNull: false}});
				message.belongsToMany(models.user, {through: models.message_recipient_users, as: "MessageRecipientUsers", foreignKey: {fieldName: "message_id", allowNull: false}});
				message.hasMany(models.message_attachment, { as: "attachments", foreignKey: { fieldName: "message_id", allowNull: false } });
				message.hasMany(models.message_sender_users, {foreignKey: { fieldName: "message_id", allowNull: false } });
				message.hasMany(models.message_recipient_users, {foreignKey: { fieldName: "message_id", allowNull: false } });
				message.hasMany(models.message_recipient_devices, {foreignKey: { fieldName: "message_id", allowNull: false } });
			}
		}
	});
	return message;
};
