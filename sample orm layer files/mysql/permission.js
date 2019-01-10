"use strict";

module.exports = function (sequelize, DataTypes) {
	var permission = sequelize.define("permission", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},	
		
		module: {
			type: DataTypes.STRING(45),
			allowNull: false
		},
		
		action: {
			type: DataTypes.STRING(45),
			allowNull: false
		}
				
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {
				permission.belongsToMany(models.role, {through: "permission_role", foreignKey: "permission_id"});
			}
		}
	});
	return permission;
};