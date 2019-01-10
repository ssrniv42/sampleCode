/* global db */

"use strict";

module.exports = function(sequelize, DataTypes){
	var categoryImages = sequelize.define("category_images", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false    
		},
		
		category_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},
		
		image_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		}
		
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				categoryImages.belongsTo(models.category, {foreignKey: {fieldName: "category_id", allowNull: false}});
				categoryImages.belongsTo(models.image, {foreignKey: {fieldName: "image_id", allowNull: false}});
				categoryImages.hasMany(models.poi, {foreignKey: {fieldName: "category_images_id", allowNull: true}});
			}
		}
	});
	return categoryImages; 
};