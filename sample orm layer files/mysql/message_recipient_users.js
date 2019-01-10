/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var messageRecipientUsers = sequelize.define("message_recipient_users", {
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
		
		user_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		message_status: {
			type: DataTypes.ENUM("pending", "sent", "failed"),
			allowNull: false,
			defaultValue: "sent"
		},
		
		message_read: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		}, 

		message_archived: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},

		message_deleted: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				messageRecipientUsers.belongsTo(models.message, { foreignKey: { fieldName: "message_id", allowNull: false } });
				messageRecipientUsers.belongsTo(models.user, { foreignKey: { fieldName: "user_id", allowNull: false } });
			}
		}
        
	});
	return messageRecipientUsers;
};