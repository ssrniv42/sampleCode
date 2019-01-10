"use strict";

module.exports = function (sequelize, DataTypes) {
	var feature = sequelize.define("feature", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		type: {
			type: DataTypes.STRING(45),
			allowNull: false
		},
		
		title: {
			type: DataTypes.STRING(45),
			allowNull: false
		}
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {
				feature.belongsToMany(models.client, {through: "feature_client", foreignKey: {fieldName: "feature_id", allowNull: false}});		
			}
		}
	});
	return feature;
};