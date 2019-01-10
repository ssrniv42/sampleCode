"use strict";

module.exports = function (sequelize, DataTypes) {
	var cargoSetting = sequelize.define("cargo_setting", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		device_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			unique: true
		},

		setting_timestamp: {
			type: DataTypes.BIGINT(20),
			allowNull: false
		},

		temperature_low: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "Ideally -128 to 127 celcius"
		},

		
		temperature_high: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "Ideally -128 to 127 celcius"
		},

		humidity_high: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "Measured in percentage (0 to 100)"
		},

		shock_high: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "Shock in 0 to 255 measures G force"
		},

		report_interval: {
			type: DataTypes.BIGINT(20),
			allowNull: true,
			defaultValue: null
		},

		start_hour: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null,
			comment: "hours 0 - 23"
		},

		geofence_count: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: null
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models) {
				cargoSetting.belongsTo(models.device, {foreignKey: {fieldName: "device_id", allowNull: false}});
			}
		}
	});
	return cargoSetting;
};