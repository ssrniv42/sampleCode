/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var alertType = sequelize.define("alert_type", {
		id: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		type: {
			type: DataTypes.STRING(45),
			allowNull: false
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				alertType.belongsToMany(models.alert_rule, {through: "alert_rule_alert_types", as: "AlertTypes", foreignKey: {fieldName: "alert_type_id", allowNull: false}});
				alertType.hasMany(models.alert, {foreignKey: {fieldName: "alert_type_id", allowNull: false}});
			}
		}
		
	});
	return alertType;
};
