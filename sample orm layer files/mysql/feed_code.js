"use strict";

module.exports = function(sequelize, DataTypes){
	var feedCode = sequelize.define("feed_code", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false  
		},
		
		feed_code: {
			type: DataTypes.INTEGER(16).UNSIGNED,
			allowNull: false,
			unique: true,
			validate: {
				isUnique: function(value, done){
					return db.feed_code.find({
						where: {feed_code: value}
					})
					.then(function(result){
						if(result){
							done("Invalid feed code. Feed code value already exists"); 
						} else { 
							done(); 
						}
					});
				},
				max: 32767
			}
		},

		title: {
			type: DataTypes.STRING(50),
			allowNull: false,
			validate: {
				isUnique: function(value, done){
					return db.feed_code.find({
						where: {title: value}
					})
					.then(function(result){
						if(result && result.title == value){
							done("Invalid feed title. Feed title already assigned to another feed code"); 
						} else { 
							done(); 
						}
					});
				}
			}
		},

		token: {
			type: DataTypes.STRING(50),
			allowNull: true,
			defaultValue: 0
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				feedCode.belongsToMany(models.device, {through: "device_feed_codes", as: "DeviceFeedCodes", foreignKey: {fieldName: "feed_code_id", allowNull: false}});
			}
		}
	});
	return feedCode; 
};
