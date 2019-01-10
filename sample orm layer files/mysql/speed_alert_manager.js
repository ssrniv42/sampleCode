"use strict";

module.exports = function (sequelize, DataTypes) {
	var speedAlertManager = sequelize.define("speed_alert_manager", {
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

		geofence_id: {
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
				speedAlertManager.belongsTo(models.alert, {foreignKey: {fieldName: "alert_id", allowNull: false}});
				speedAlertManager.belongsTo(models.geofence, {foreignKey: {fieldName: "geofence_id", allowNull: true}});
				speedAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "start_report_id", allowNull: true}});
				speedAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "end_report_id", allowNull: true}});
			}
		}
	});

	return speedAlertManager;
};