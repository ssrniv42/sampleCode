/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var deviceTypeComponents = sequelize.define("device_type_components", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		type_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		phone_number: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},

		mode: {
			type: DataTypes.ENUM("visible", "disable", "hide"),
			allowNull: false,
			defaultValue: "hide"
		},

		cipher: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},

		messaging: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 1
		},

		communication_mode_pairing: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 1,
			comment: "This column if set to true, means that the mode for device outgoing will take the same value of the mode selected for device outgoing"
		},

		apn_configurations: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},

		iridex_pin: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},

		zigbee_id: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function (models) {
				deviceTypeComponents.belongsTo(models.device_type, {as: "components", foreignKey: { fieldName: "type_id", allowNull: false}});
			}
		}
	});
	return deviceTypeComponents;
};