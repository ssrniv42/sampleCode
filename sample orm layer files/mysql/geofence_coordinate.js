/*  global db */

/*
	This table stores the coordinates of a Geo-Fence. 
	For everything other than a circle, we store breakpoints. For circles, we would only store the center point. 
*/
"use strict";


module.exports = function(sequelize, DataTypes) {
	var geofenceCoordinate = sequelize.define("geofence_coordinate", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		geofence_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		longitude: {
			type: DataTypes.DECIMAL(9, 5),
			allowNull: false,
			validate: {min: -360, max: 360, isDecimal: true},
			comment: "longitude in DegDec, EPSG:4326 format (min: -360, max: 360)"
		},
		
		latitude: {
			type: DataTypes.DECIMAL(9, 5),
			allowNull: false,
			validate: {min: -90, max: 90, isDecimal: true},
			comment: "latitude in DegDec, EPSG:4326 format (min: -90, max: 90)"
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models){
				geofenceCoordinate.belongsTo(models.geofence, { foreignKey: { fieldName: "geofence_id", allowNull: false}});
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
	return geofenceCoordinate;
};