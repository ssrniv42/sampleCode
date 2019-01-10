/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var deviceType = sequelize.define("device_type", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		title: {
			type: DataTypes.STRING(50),
			allowNull: false
		},

		description: {
			type: DataTypes.STRING(255),
			allowNull: false
		},

		availability: {
			type: DataTypes.STRING(20),
			allowNull: false
		},

		image_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		enabled: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function (models) {
				deviceType.belongsToMany(models.device_mode, {through: "device_type_mode", as: "availableModes", foreignKey: {fieldName: "type_id", allowNull: false}});
				deviceType.hasMany(models.device_type_components, {as: "components", foreignKey: {fieldName: "type_id", allowNull: false}});
				deviceType.hasMany(models.device, {foreignKey: {fieldName: "type_id", allowNull: false}});
				deviceType.belongsTo(models.image, {foreignKey: {fieldName: "image_id"}});
				deviceType.belongsToMany(models.communication_mode, {through: models.device_type_incoming_modes, as: "AvailableIncomingModes", foreignKey: {fieldName: "type_id", allowNull: false}});
				deviceType.belongsToMany(models.communication_mode, {through: "device_type_outgoing_modes", as: "AvailableOutgoingModes", foreignKey: {fieldName: "type_id", allowNull: false}});
			}
		}
	});
	return deviceType;
};