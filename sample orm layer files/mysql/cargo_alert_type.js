"use strict";

module.exports = function (sequelize, DataTypes) {
	var cargoAlertType = sequelize.define("cargo_alert_type", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		type: {
			type: DataTypes.STRING(45),
			allowNull: false
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models) {
				cargoAlertType.hasMany(models.cargo_alert_manager, {foreignKey: {fieldName: "cargo_alert_type_id", allowNull: false}});
			}
		}
	});

	return cargoAlertType;
};