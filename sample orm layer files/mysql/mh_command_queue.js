/*  global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var mhCommandQueue = sequelize.define("mh_command_queue", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		path: {
			type: DataTypes.STRING(70),
			allowNull: false
		},

		method: {
			type: DataTypes.STRING(70),
			allowNull: true,
			defaultValue: null
		},

		options: {
			type: DataTypes.STRING(255),
			allowNull: true,
			defaultValue: null
		},

		data: {
			type: DataTypes.TEXT(),
			allowNull: true,
			defaultValue: null
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function(){}
		}
	});
	return mhCommandQueue;
};
