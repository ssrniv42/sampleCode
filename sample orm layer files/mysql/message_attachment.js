/*  global db */


//This table stores message attachment data.  


"use strict";

module.exports = function(sequelize, DataTypes) {
	var messageAttachment = sequelize.define("message_attachment", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		message_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		attachment_timestamp: {
			type: DataTypes.BIGINT(20),
			allowNull: false
		},

		attachment_name: {
			type: DataTypes.STRING(45),
			allowNull: true,
			default: null
		},
		
		attachment_type: {
			type: DataTypes.STRING(20),
			allowNull: false
		},
		
		attachment_size: {
			type: DataTypes.BIGINT(20),
			allowNull: false
		},

		attachment_data: {
			type: "LONGBLOB",
			allowNull: false
		}
	}, {
		tableName: "message_attachment",
		freezeTableName: true,
		classMethods: {
			associate: function(models){
				messageAttachment.belongsTo(models.message, {foreignKey: {fieldName: "message_id", allowNull: false}});
			}
		}
	});
	return messageAttachment;
};
