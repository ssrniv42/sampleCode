"use strict";

module.exports = function (sequelize, DataTypes) {
	var emergencyAlertManager = sequelize.define("emergency_alert_manager", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		alert_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		is_reset: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},

		reset_user_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		start_report_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		end_report_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				emergencyAlertManager.belongsTo(models.alert, {foreignKey: {fieldName: "alert_id", allowNull: false}});
				emergencyAlertManager.belongsTo(models.user, {foreignKey: {fieldName: "reset_user_id", allowNull: true}});
				emergencyAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "start_report_id", allowNull: true}});
				emergencyAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "end_report_id", allowNull: true}});
			}
		}
	});

	return emergencyAlertManager;
};