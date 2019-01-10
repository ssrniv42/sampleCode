"use strict";

module.exports = function (sequelize, DataTypes) {
	var role = sequelize.define("role", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		title: {
			type: DataTypes.STRING(45),
			allowNull: false,
			validate: {
				isUniqueTitle: function(value, done){
					var id = this.id || null;
					//User must not be able to create titles for default roles like Provider Admin, Customer Admin, Admin, Advanced User, End User 
					if (value == "Provider Admin" || value == "Customer Admin" || value == "Admin" || value == "Advanced User" || value == "End User"){
						done("The title you have chosen is part of Track24's default set of role titles and cannot be used");
					}
					else{
						//Role title must be unique among client group, 
						return db.role.findOne({where: {title: value, client_id: this.client_id, id: {$ne: id}}})
						.then(function(roleTitle){
							if(roleTitle && roleTitle.title == value){
								done("Role title is already in use");
							}                      
							else{
								done();
							}
						});
					}
				}
			}
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		}
		
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {
				role.belongsToMany(models.permission, {through: "permission_role", foreignKey: "role_id"});
				role.belongsTo(models.client, { foreignKey: { fieldName: "client_id", allowNull: true}});
				role.hasMany(models.user, {foreignKey: { fieldName: "role_id", allowNull: false } });
			}
		}
	});
	return role;
};

