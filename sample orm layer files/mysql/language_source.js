"use strict";

module.exports = function (sequelize, DataTypes) {
	var languageSource = sequelize.define("language_source", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		word: {
			type: DataTypes.STRING(500),
			allowNull: true,
			defaultValue: null
		},

		tag: {
			type: DataTypes.STRING(50),
			allowNull: true,
			unique: true,
			defaultValue: null
		}

	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {				
				languageSource.hasMany(models.language_translation, { foreignKey: { fieldName: "language_source_id", allowNull: false}});
			}
		}
	});
	return languageSource;
};

