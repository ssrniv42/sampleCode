"use strict";

module.exports = function(sequelize, DataTypes){
	var commsMode = sequelize.define("communication_mode", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false  
		},
	
		title: {
			type: DataTypes.STRING(45),
			allowNull: false
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				commsMode.hasMany(models.device, {as: "DeviceIncomingMode", foreignKey: {fieldName: "device_incoming_mode", allowNull: true}});
				commsMode.hasMany(models.device, {as: "DeviceOutgoingMode", foreignKey: {fieldName: "device_outgoing_mode", allowNull: true}});
				commsMode.belongsToMany(models.device_type, {through: models.device_type_incoming_modes, as: "AvailableIncomingModes", foreignKey: {fieldName: "communication_mode_id", allowNull: false}});
				commsMode.belongsToMany(models.device_type, {through: "device_type_outgoing_modes", as: "AvailableOutgoingModes", foreignKey: {fieldName: "communication_mode_id", allowNull: false}});
			}
		}
	});
	return commsMode; 
};