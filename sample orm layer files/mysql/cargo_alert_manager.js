"use strict";

module.exports = function (sequelize, DataTypes) {
	var cargoAlertManager = sequelize.define("cargo_alert_manager", {
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

		cargo_alert_type_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		start_status_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		end_status_id: {
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
				cargoAlertManager.belongsTo(models.alert, {foreignKey: {fieldName: "alert_id", allowNull: false}});
				cargoAlertManager.belongsTo(models.cargo_alert_type, {foreignKey: {fieldName: "cargo_alert_type_id", allowNull: true}});
				cargoAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "start_report_id", allowNull: false}});
				cargoAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "end_report_id", allowNull: true}});
				cargoAlertManager.belongsTo(models.cargo_status, {as: "StartStatus", foreignKey: {fieldName: "start_status_id", allowNull: false}});
				cargoAlertManager.belongsTo(models.cargo_status, {as: "EndStatus", foreignKey: {fieldName: "end_status_id", allowNull: true}});
			}
		}
	});

	return cargoAlertManager;
};