/*  global db */

/*
	This table stores Geo-Fence data.  
*/

"use strict";

module.exports = function(sequelize, DataTypes) {
	var geofence = sequelize.define("geofence", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		title: {
			type: DataTypes.STRING(25),
			allowNull: false,
			validate: { // check if geofence title is unique within the client group
				isUniqueInClient: function(value, done){
					return db.geofence.findOne({where: {title: value, client_id: this.client_id}})
					.then(function(geofence){
						if(geofence && geofence.title == value){
							done("Geofence title should be unique.");
						}else{
							done();
						}
					});
				}
			}
		},
		
		note: {
			type: DataTypes.STRING(255),
			allowNull: false,
			defaultValue: ""
		},
		
		shape: {
			type: DataTypes.ENUM("polygon", "circle", "path", "rectangle"),
			allowNull: false,
			defaultValue: "polygon",
			comment: "shapes should be enum:{'polygon', 'circle', 'path', 'rectangle'}."
		},
		
		inclusive: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true,
			comment: "if false, geofence is exclusive."	
		},
		
		active: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: false
		},
		
		min_speed: {
			type: DataTypes.DOUBLE,
			allowNull: true,
			defaultValue: null,
			comment: "Min speed in KPH"
		},
		
		max_speed: {
			type: DataTypes.DOUBLE,
			allowNull: true,
			defaultValue: null,
			comment: "Max speed in KPH"
		},
		
		width: {
			type: DataTypes.DOUBLE,
			allowNull: true,
			defaultValue: null,
			comment: "Width in meters. For a circle Geo-Fence, width would be the radius."
		},
		
		approved: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true,
			comment: "If approved is true, the platform user has accepted the geofence that a tactical has sent them."
		}

	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models){
				geofence.belongsTo(models.client, {foreignKey: {fieldName: "client_id", allowNull: false}});
				geofence.hasMany(models.geofence_coordinate, {as: "coordinates", foreignKey: {fieldName: "geofence_id", allowNull: false}});
				geofence.belongsToMany(models.device, {through: "geofence_trigger_devices", as: "DeviceTriggers", foreignKey: {fieldName: "geofence_id", allowNull: false}});
				geofence.belongsToMany(models.group, {through: "geofence_trigger_groups", as: "GroupTriggers", foreignKey: {fieldName: "geofence_id", allowNull: false}});
				geofence.belongsToMany(models.device, {through: "geofence_sync_devices", as: "SyncedDevices", foreignKey: {fieldName: "geofence_id", allowNull: false}});
				geofence.hasMany(models.geofence_alert_manager, {foreignKey: {fieldName: "geofence_id", allowNull: false}});
				geofence.hasMany(models.speed_alert_manager, {foreignKey: {fieldName: "geofence_id", allowNull: true}});
				geofence.belongsToMany(models.device, {through: "cargo_geofences", as: "CargoGeofences", foreignKey: {fieldName: "geofence_id", allowNull: false}});
			}
		}
	});
	return geofence;
};