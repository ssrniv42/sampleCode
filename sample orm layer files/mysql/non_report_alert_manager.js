/* global db */

"use strict";

module.exports = function (sequelize, DataTypes) {
	var nonReportAlertManager = sequelize.define("non_report_alert_manager", {
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
				nonReportAlertManager.belongsTo(models.alert, {foreignKey: {fieldName: "alert_id", allowNull: false}});
				nonReportAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "start_report_id", allowNull: true}});
				nonReportAlertManager.belongsTo(models.report, {foreignKey: {fieldName: "end_report_id", allowNull: true}});
			}
		}
	});

	return nonReportAlertManager;
};