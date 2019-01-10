"use strict";

module.exports = function (sequelize, DataTypes) {
	var mapLayer = sequelize.define("map_layer", {
		id: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		title: {
			type: DataTypes.STRING(45),
			allowNull: true,
			defaultValue: null
		},
		
		code: {
			type: DataTypes.STRING(10),
			allowNull: true,
			defaultValue: null
		},

		is_base_layer: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
			defaultValue: 1
		}
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {
				mapLayer.belongsToMany(models.client, {through: "client_map_layers", as: "ClientMapLayers", foreignKey: {fieldName: "map_id", allowNull: false}});
			}
		}
	});
	return mapLayer;
};