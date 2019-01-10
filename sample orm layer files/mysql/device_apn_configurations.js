/*global db */

/*
	This table stores apn user, apn host, password, sos# and interval values for PB, New PB and GT300 devices
*/

"use strict";

module.exports = function(sequelize, DataTypes) {
	var deviceApnConfigs = sequelize.define("device_apn_configurations", {
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
		
		apn_host: {
			type: DataTypes.STRING(100),
			allowNull: false
		},

		apn_user: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		apn_password: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		sos_number: {
			type: DataTypes.STRING(45),
			allowNull: true,
			defaultValue: null
		},

		interval: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			defaultValue: 1800,
			comment: "interval stored in seconds"
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				deviceApnConfigs.belongsTo(models.device, {foreignKey: {fieldName: "device_id", allowNull: false}});
			}
		}
        
	});
	return deviceApnConfigs;
};