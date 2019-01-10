"use strict";

module.exports = function (sequelize, DataTypes) {
	var geofenceAlertManager = sequelize.define("geofence_alert_manager", {
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
			allowNull: false
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
				geofenceAlertManager.belongsTo(models.alert, {foreignKey: {fieldName: "alert_id", allowNull: false}});
				geofenceAlertManager.belongsTo(models.geofence, {foreignKey: {fieldName: "geofence_id", allowNull: false}});
				geofenceAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "start_report_id", allowNull: true}});
				geofenceAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "end_report_id", allowNull: true}});
			}
		}
	});

	return geofenceAlertManager;
};