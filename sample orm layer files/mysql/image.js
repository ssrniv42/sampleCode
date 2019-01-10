"use strict";

module.exports = function (sequelize, DataTypes) {
	var image = sequelize.define("image", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},

		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		name: {
			type: DataTypes.STRING(255),
			allowNull: false
		},

		type: {
			type: DataTypes.STRING(20),
			allowNull: false
		},

		size: {
			type: DataTypes.INTEGER(11),
			allowNull: false
		},

		data: {
			type: "LONGBLOB",
			allowNull: false
		},
		
		tag: {
			type: DataTypes.ENUM("poi", "profile", "asset", "platform"),
			allowNull: true,
			defaultValue: null
		}
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {
				image.hasMany(models.user, { foreignKey: { fieldName: "image_id", allowNull: true } });
				image.hasOne(models.device_type, { foreignKey: { fieldName: "image_id"}});
				image.belongsTo(models.client, {foreignKey: {fieldName: "client_id", allowNull: true}});
				image.belongsToMany(models.category, {through: models.category_images, as: "CategoryImages", foreignKey: {fieldName: "image_id", allowNull: false}});
				image.hasMany(models.category_images, { foreignKey: { fieldName: "image_id", allowNull: false } });
			}
		}
	});
	return image;
};