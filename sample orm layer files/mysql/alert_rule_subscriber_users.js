/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var alertSubscriberUsers = sequelize.define("alert_rule_subscriber_users", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		alert_rule_id: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			allowNull: false
		},
		
		user_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		send_email: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},

		send_sms: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				alertSubscriberUsers.belongsTo(models.alert_rule, { foreignKey: { fieldName: "alert_rule_id", allowNull: false } });
				alertSubscriberUsers.belongsTo(models.user, { foreignKey: { fieldName: "user_id", allowNull: false } });
			}
		}
        
	});
	return alertSubscriberUsers;
};