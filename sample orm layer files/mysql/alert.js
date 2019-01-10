"use strict";

module.exports = function (sequelize, DataTypes) {
	var alert = sequelize.define("alert", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		alert_type_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		device_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		start_timestamp: {
			type: DataTypes.BIGINT(20),
			allowNull: false
		},

		end_timestamp: {
			type: DataTypes.BIGINT(20),
			allowNull: true,
			defaultValue: null
		}
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function(models){
				alert.hasMany(models.alert_acknowledgements, {foreignKey: {fieldName: "alert_id", allowNull: false}});
				alert.belongsTo(models.device, {foreignKey: {fieldName: "device_id", allowNull: false}});
				alert.belongsTo(models.alert_type, {foreignKey: {fieldName: "alert_type_id", allowNull: false}});
				alert.hasOne(models.emergency_alert_manager, {as: "EmergencyAlertManager", foreignKey: {fieldName: "alert_id", allowNull: false}});
				alert.hasOne(models.geofence_alert_manager, {as: "GeofenceAlertManager", foreignKey: {fieldName: "alert_id", allowNull: false}});
				alert.hasOne(models.speed_alert_manager, {as: "SpeedAlertManager", foreignKey: {fieldName: "alert_id", allowNull: false}});
				alert.hasOne(models.non_report_alert_manager, {as: "NonReportAlertManager", foreignKey: {fieldName: "alert_id", allowNull: false}});
				alert.hasOne(models.cargo_alert_manager, {as: "CargoAlertManager", foreignKey: { fieldName: "alert_id", allowNull: false}});
			}
		}
	});

	return alert;
};