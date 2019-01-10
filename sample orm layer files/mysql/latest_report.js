/*global */

"use strict";
module.exports = function(sequelize, DataTypes) {
	var latestReport = sequelize.define("latest_report", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true
		},
		
		report_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		device_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			unique: true,
			validate: {isInt: true}
		},
		
		latitude: {
			type: DataTypes.DECIMAL(9, 5),
			allowNull: false,			
			validate: {min: -90, max: 90, isDecimal: true},
			comment: "latitude in DegDec, EPSG:4326 format (min: -90, max: 90)"
		},
	
		longitude: {
			type: DataTypes.DECIMAL(9, 5),
			allowNull: false,
			validate: {min: -180, max: 180, isDecimal: true},
			comment: "longitude in DegDec, EPSG:4326 format (min: -180, max: 180)"
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
			comment: "speed in kph (kilometers per hour)"
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
				latestReport.belongsTo(models.device, { foreignKey: { fieldName: "device_id", allowNull: false }});
				latestReport.belongsTo(models.report, { foreignKey: { fieldName: "report_id", allowNull: true }});
			}
		},
		
		validation: {
			bothCoordsOrNone: function(){
				if((this.latitude === null) === (this.longitude === null)){
					throw new Error("Require Values For Both Latitide And Longitude Or Neither");
				}
			} 
		}
	});
	return latestReport;
};
