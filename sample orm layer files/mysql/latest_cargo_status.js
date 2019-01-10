"use strict";

module.exports = function (sequelize, DataTypes) {
	var latestCargoStatus = sequelize.define("latest_cargo_status", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		status_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		device_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			unique: true
		},

		report_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		status_timestamp: {
			type: DataTypes.BIGINT(20),
			allowNull: false
		},

		door_open: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: null
		},

		temperature: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "Ideally -128 to 127 celcius"
		},

		humidity: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "Measured in percentage (0 to 100)"
		},

		shock: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "Shock in 0 to 255 measures G force"
		},

		shock_alert: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: null
		},

		battery_charge: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "Store as Percentage (0 - 100)"
		},

		anti_tamper: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: null
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models) {
				latestCargoStatus.belongsTo(models.device, {foreignKey: {fieldName: "device_id", allowNull: false}});
				latestCargoStatus.belongsTo(models.report, {foreignKey: {fieldName: "report_id", allowNull: false}});
				latestCargoStatus.belongsTo(models.cargo_status, {foreignKey: {fieldName: "status_id", allowNull: false}});
			}
		}
	});
	return latestCargoStatus;
};