/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var deviceMode = sequelize.define("device_mode", {
		id: {
			type: DataTypes.INTEGER(11),
			primaryKey: true,
			allowNull: false,
			unique: true
		},

		title: {
			type: DataTypes.STRING(50),
			allowNull: false
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function (models) {
				deviceMode.belongsToMany(models.device_type, {through: "device_type_mode", as: "availableModes", foreignKey: {fieldName: "mode_id", allowNull: false}});
				deviceMode.hasMany(models.device, {foreignKey: {fieldName: "mode", allowNull: false}});
			}
		}
	});
	return deviceMode; 
};