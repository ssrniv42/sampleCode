"use strict";

module.exports = function (sequelize, DataTypes) {
	var alertAcknowledgements = sequelize.define("alert_acknowledgements", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},

		alert_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		user_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		ack_timestamp: {
			type: DataTypes.BIGINT(20),
			allowNull: true
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(models){
				alertAcknowledgements.belongsTo(models.alert, {foreignKey: {fieldName: "alert_id", allowNull: false}});
				alertAcknowledgements.belongsTo(models.user, {foreignKey: {fieldName: "user_id", allowNull: false}});
			}
		},
		indexes: [
			{
				unique: true,
				fields: ["alert_id", "user_id"]
			}
		]
	});

	return alertAcknowledgements;
};