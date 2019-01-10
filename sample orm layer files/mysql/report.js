"use strict";

module.exports = function(sequelize, DataTypes) {
	var report = sequelize.define("report", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true
		},
		
		device_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			validate: {isInt: true}
		},
		
		latitude: {
			type: DataTypes.DECIMAL(9, 5),
			allowNull: false,
			validate: {min: -90, max: 90, isDecimal: true},
			comment: "latitude in decimal (min: -90, max: 90)"
		},
	
		longitude: {
			type: DataTypes.DECIMAL(9, 5),
			allowNull: false,
			validate: {min: -180, max: 180, isDecimal: true},
			comment: "longitude in decimal (min: -180, max: 180)"
		},
	
		altitude: {
			type: DataTypes.DOUBLE,
			allowNull: true,
			defaultValue: null,
			validate: {isDecimal: true}
		},
	
		speed: {
			type: DataTypes.DOUBLE,
			allowNull: true,
			defaultValue: null,
			validate: {isDecimal: true},
			comment: "Speed in kph (kilometers per hour)"
		},
	
		heading: {
			type: DataTypes.DOUBLE,
			allowNull: true,
			defaultValue: null,
			validate: {min: 0, max: 360, isDecimal: true},
			comment: "heading in degrees (min: 0, max: 360)"
		},
	
		panic: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: null
		},
	
		report_timestamp: {
			type: DataTypes.BIGINT(20),
			allowNull: false
		},
	
		polling: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: null
		},
	
		ignition: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: null
		},
	
		battery_charge: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: null
		},
	
		battery_level: {
			type: DataTypes.INTEGER(10),
			allowNull: true,
			defaultValue: null,
			validate: {min: 0, max: 100, isInt: true},
			comment: "battery_level is a percentage between 0 and 100"			
		}

	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function(models) {
				//still have to create model for asset
				report.belongsTo(models.device, { foreignKey: { fieldName: "device_id", allowNull: false }});	
				report.hasOne(models.latest_report, { foreignKey: { fieldName: "report_id", allowNull: true }});
				report.hasMany(models.emergency_alert_manager, { foreignKey: { fieldName: "start_report_id", allowNull: false }});
				report.hasMany(models.emergency_alert_manager, { foreignKey: { fieldName: "end_report_id", allowNull: true }});	
				report.hasMany(models.geofence_alert_manager, { foreignKey: { fieldName: "start_report_id", allowNull: false }});
				report.hasMany(models.geofence_alert_manager, { foreignKey: { fieldName: "end_report_id", allowNull: true }});
				report.hasMany(models.speed_alert_manager, { foreignKey: { fieldName: "start_report_id", allowNull: false }});
				report.hasMany(models.speed_alert_manager, { foreignKey: { fieldName: "end_report_id", allowNull: true }});
				report.hasMany(models.non_report_alert_manager, { foreignKey: { fieldName: "start_report_id", allowNull: true }});
				report.hasMany(models.non_report_alert_manager, { foreignKey: { fieldName: "end_report_id", allowNull: true }});
				report.hasMany(models.cargo_alert_manager, { foreignKey: { fieldName: "start_report_id", allowNull: false }});
				report.hasMany(models.cargo_alert_manager, { foreignKey: { fieldName: "end_report_id", allowNull: true }});	
				report.hasMany(models.cargo_status, {foreignKey: {fieldName: "report_id", allowNull: true}});		
				report.hasMany(models.latest_cargo_status, {foreignKey: {fieldName: "report_id", allowNull: true}});	
			}
		},
		
		validation: {
			bothCoordsOrNone: function(){
				if((this.latitude === null) === (this.longitude === null)){
					throw new Error("Require values for both latitide and longitude or neither");
				}
			}
		}
	});
	return report;
};
