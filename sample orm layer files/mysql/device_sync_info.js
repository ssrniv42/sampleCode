/* global db */

/*
	This table stores the latest sync watermark for each tactical device 
	and the timestamp of when a request for syncing has been made for a device 
	as well as the timestamp of the time that an acknowledgement has been received from the Message Handler. 
*/
"use strict";

module.exports = function(sequelize, DataTypes){
	var deviceSyncInfo = sequelize.define("device_sync_info", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		device_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			unique: true,
			validate: {isInt: true}
		},
		
		watermark: {
			type: DataTypes.BIGINT(20).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},
		
		ring_sent: {
			type: DataTypes.BIGINT(20).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},
		
		sync_received: {
			type: DataTypes.BIGINT(20).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},
		
		ack_received: {
			type: DataTypes.BIGINT(20).UNSIGNED,
			allowNull: true,
			defaultValue: null
		}
		
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models){
				deviceSyncInfo.belongsTo(models.device, {foreignKey: {fieldName: "device_id", allowNull: false}});
			}
		}		
	});
	return deviceSyncInfo;
};