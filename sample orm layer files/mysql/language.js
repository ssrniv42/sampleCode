"use strict";

module.exports = function (sequelize, DataTypes) {
	var language = sequelize.define("language", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		name: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		code: {
			type: DataTypes.INTEGER(10),
			allowNull: false
		}

	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {				
				language.hasMany(models.user_setting, { foreignKey: { fieldName: "language_id", allowNull: false}});
				language.hasMany(models.language_translation, { foreignKey: { fieldName: "language_id", allowNull: false}});
			}
		}
	});
	return language;
};

