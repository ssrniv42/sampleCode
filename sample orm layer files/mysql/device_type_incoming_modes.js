/*global db */

/*
	This table contains relationship between device types and the different 
	communication modes each type supports, for data that is sent to the device.
*/

"use strict";

module.exports = function(sequelize, DataTypes) {
	var deviceTypeIncomingModes = sequelize.define("device_type_incoming_modes", {
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
		
		communication_mode_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		default_mode: {
			type: DataTypes.BOOLEAN,
			allowNull: false
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				deviceTypeIncomingModes.belongsTo(models.device_type, {foreignKey: {fieldName: "type_id", allowNull: false}});
				deviceTypeIncomingModes.belongsTo(models.communication_mode, {foreignKey: {fieldName: "communication_mode_id", allowNull: false}});
			}
		}
        
	});
	return deviceTypeIncomingModes;
};