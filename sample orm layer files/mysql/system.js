/*  global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var system = sequelize.define("system", {
		id: {
			type: DataTypes.INTEGER(10),
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		system_name: {
			type: DataTypes.STRING(45),
			allowNull: false
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(){}
		}
	});
	return system;
};
