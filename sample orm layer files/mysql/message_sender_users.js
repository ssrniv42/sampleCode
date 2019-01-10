/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var messageSenderUsers = sequelize.define("message_sender_users", {
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
				messageSenderUsers.belongsTo(models.message, { foreignKey: { fieldName: "message_id", allowNull: false } });
				messageSenderUsers.belongsTo(models.user, { foreignKey: { fieldName: "user_id", allowNull: false } });
			}
		}
        
	});
	return messageSenderUsers;
};