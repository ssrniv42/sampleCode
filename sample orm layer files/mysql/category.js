/* global db */

"use strict";

module.exports = function(sequelize, DataTypes){
	var category = sequelize.define("category", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false    
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},
		
		title: {
			type: DataTypes.STRING(45),
			allowNull: false,
			//Check if alert rule name is unique within the client
			validate: {
				isUniqueName: function(value, done){
					var id = this.id || null;
					//{$or: [{client_id: null}, {client_id: user.client_id}]}
					return db.category.findOne({
						where: {
							title: value, 
							$or: [{client_id: null}, {client_id: this.client_id}],
							id: {$ne: id}
						}
					})
					.then(function(categoryName){
						if(categoryName && categoryName.title == value){
							done("Category title is already in use");	
						} else{
							done();
						}
					});
				}
			}
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				category.belongsTo(models.client, {foreignKey: {fieldName: "client_id", allowNull: true}});
				category.belongsToMany(models.image, {through: models.category_images, as: "CategoryImages", foreignKey: {fieldName: "category_id", allowNull: false}});
				category.hasMany(models.category_images, { foreignKey: { fieldName: "category_id", allowNull: false } });
			}
		}
	});
	return category; 
};