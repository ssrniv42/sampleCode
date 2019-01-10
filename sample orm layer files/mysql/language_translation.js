"use strict";

module.exports = function (sequelize, DataTypes) {
	var languageTranslation = sequelize.define("language_translation", {
		id: {
			type: DataTypes.INTEGER(11),
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		language_source_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		language_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		translation: {
			type: DataTypes.STRING(500),
			allowNull: true,
			defaultValue: null
		}
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {				
				languageTranslation.belongsTo(models.client, { foreignKey: { fieldName: "client_id", allowNull: true}});
				languageTranslation.belongsTo(models.language_source, { foreignKey: { fieldName: "language_source_id", allowNull: false}});
				languageTranslation.belongsTo(models.language, { foreignKey: { fieldName: "language_id", allowNull: false}});
			}
		}
	});
	return languageTranslation;
};

