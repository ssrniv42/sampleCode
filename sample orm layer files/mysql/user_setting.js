"use strict";

module.exports = function (sequelize, DataTypes) {
	var mapLayerObject = {
		OSM: true,
		"Google Physical": false,
		"Google Street": false,
		"Google Hybrid": false,
		"Google Satellite": false,
		Geofences: true,
		POI: true,
		Assets: true,
		Equinox: false,
		Trackers: true
	};
    
	var userSetting = sequelize.define("user_setting", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		user_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			unique: true,
			allowNull: false
		},
        
		lonlat_format: {
			type: DataTypes.STRING(45),
			allowNull: true,
			defaultValue: "EPSG:4326"
		},

		map_zoom_level: {
			type: DataTypes.INTEGER(10),
			allowNull: true,
			defaultValue: 3
		},

		map_longitude: {
			type: DataTypes.FLOAT(11, 5),
			allowNull: true,
			defaultValue: 6
		},
		
		map_latitude: {
			type: DataTypes.FLOAT(11, 5),
			allowNull: true,
			defaultValue: 46
		},
		
		cluster_distance: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: 20
		},
		
		panic_audio: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: 1
		},
		
		speed_format: {
			type: DataTypes.STRING(10),
			allowNull: true,
			defaultValue: "KPH"
		},
		
		report_age: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: 24
		},
		
		map_layers: {
			type: DataTypes.STRING,
			allowNull: false,
			defaultValue: JSON.stringify(mapLayerObject)
		},
		
		panic_popup: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: 0
		},
		
		time_zone_2: {
			type: DataTypes.STRING(40),
			allowNull: true,
			defaultValue: "UTC"
		},
		
		time_zone_3: {
			type: DataTypes.STRING(40),
			allowNull: true,
			defaultValue: "UTC"
		},
		
		clock_format: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: 24
		},
		
		language_id: {
			type: DataTypes.INTEGER(2).UNSIGNED,
			allowNull: false,
			defaultValue: 1
		},
		
		asset_label: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},
		
		asset_annotation: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},
		
		poi_label: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},
		
		poi_annotation: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},
		
		geofence_label: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		},
		
		geofence_annotation: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0
		}
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {				
				userSetting.belongsTo(models.user, { foreignKey: { fieldName: "user_id", allowNull: false}});
				userSetting.belongsTo(models.language, { foreignKey: { fieldName: "language_id", allowNull: false}});
			}
		}
	});
	return userSetting;
};

