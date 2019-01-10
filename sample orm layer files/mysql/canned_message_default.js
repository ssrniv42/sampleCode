/*  global db */


//This table stores default canned message list offered by T24.  


"use strict";

module.exports = function(sequelize, DataTypes) {
	var cannedMessageDefault = sequelize.define("canned_message_default", {
		canned_number: {
			type: DataTypes.INTEGER(11),
			allowNull: false
		},
		
		canned_message: {
			type: DataTypes.STRING(128),
			allowNull: false
		}
	}, {
		freezeTableName: true
	});
	return cannedMessageDefault;
};
