/*global db */

/*
	stores randomly generated 5 digit hashed pin for Iridium Extreme devices
*/

"use strict";

module.exports = function(sequelize, DataTypes) {
	var deviceIridexPin = sequelize.define("device_iridex_pin", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		device_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		pin: {
			type: DataTypes.INTEGER(10),
			allowNull: false,
			comment: "5 digit hashed pin generated based on the IMEI of the device"
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				deviceIridexPin.belongsTo(models.device, {foreignKey: {fieldName: "device_id", allowNull: false}});
			}
		}
        
	});
	return deviceIridexPin;
};