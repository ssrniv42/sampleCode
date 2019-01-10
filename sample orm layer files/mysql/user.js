/* global db */
"use strict";

var bluebird= require("bluebird");
module.exports = function (sequelize, DataTypes) {
	var user = sequelize.define("user", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		create_timestamp: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			allowNull: false
		},

		username: {
			type: DataTypes.STRING(45),
			allowNull: true,
			defaultValue: null,

			//Check if username is unique through all the platform users
			validate: { 
				isUniqueUsername: function(value, done){
					var id = this.id || null;
					return db.user.findOne({where: {username: value, id: {$ne: id}}})
					.then(function(username){
						if(username){
							done("Username is already in use");
						}
						else{
							done();
						}
					});
				}
			}
		},

		first_name: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		last_name: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		password: {
			type: DataTypes.STRING(255),
			allowNull: true,
			defaultValue: null
		},

		email: {
			type: DataTypes.STRING(45),
			allowNull: false
		},

		phone_number: {
			type: DataTypes.STRING(20),
			allowNull: true
		},
		
		image_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},
		
		role_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		token_data: {
			type: DataTypes.STRING(100),
			allowNull: true,
			defaultValue: null
		},

		"2fa_code": {
			type: DataTypes.STRING(6),
			allowNull: true
		},

		"2fa_expiry": {
			type: DataTypes.INTEGER(11),
			allowNull: true
		}
		
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {				
				user.belongsTo(models.client, { foreignKey: { fieldName: "client_id", allowNull: true}});
				user.belongsTo(models.role, { foreignKey: { fieldName: "role_id", allowNull: false}});
				user.hasMany(models.user_setting, { foreignKey: { fieldName: "user_id", allowNull: false}});
				user.belongsToMany(models.group, {through: "user_groups", foreignKey: "user_id", allowNull: false});
				user.hasMany(models.comm, {foreignKey: "row_id", constraints: false, scope: { table_name: "users"}});
				user.belongsToMany(models.alert_rule, {through: models.alert_rule_subscriber_users, as: "ArSubscriberUsers", foreignKey: {fieldName: "user_id", allowNull: false}});
				user.belongsToMany(models.message, {through: models.message_sender_users, as: "MessageSenderUsers", foreignKey: {fieldName: "user_id", allowNull: false}});   
				user.belongsToMany(models.message, {through: models.message_recipient_users, as: "MessageRecipientUsers", foreignKey: {fieldName: "user_id", allowNull: false}});
				user.hasMany(models.message_sender_users, {foreignKey: { fieldName: "user_id", allowNull: false } });
				user.hasMany(models.message_recipient_users, {foreignKey: { fieldName: "user_id", allowNull: false } });   
				user.hasMany(models.client, {foreignKey: {fieldName: "main_user_id", as: "MainUserInfo", allowNull: true}});  
				user.hasMany(models.alert_acknowledgements, {foreignKey: {fieldName: "user_id", allowNull: false}});
				user.hasMany(models.emergency_alert_manager, {foreignKey: {fieldName: "reset_user_id", allowNull: true}});
				user.belongsTo(models.image, {foreignKey: {fieldName: "image_id", allowNull: true}});
			}
		},
        
		hooks: {
			afterCreate: function(user, options){
				return triggerLogic(user, "insert", options);
			},
			
			afterUpdate: function(user, options){
				return triggerLogic(user, "update", options);
			},
			
			beforeDestroy: function(user, options){
				return triggerLogic(user, "delete", options);
			}
		}
	});
	return user;
};

function triggerLogic(user, action, options){
	var timestamp = Math.round(new Date().getTime() / 1000);
				
	var desc = {
		"first_Nam_old": "",
		"first_Nam_new": user.first_name,
		"last_Nam_old": "",
		"last_Nam_new": user.last_name,
		"usr_email": user.email
	};

	// no need to store log data if requesting user is Provider Admin who has no client_id
	if (!user.client_id) return bluebird.resolve();

	var qryAdminLog = "INSERT INTO AdminLog (client_id, `name`, `time`, `event`, `table`, `action`, row_id, `desc`) " 
						+ "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";                     
						
	return db.sequelize.query(qryAdminLog, { 
		replacements: [user.client_id, user.username, timestamp, "user", "users", action, user.id, JSON.stringify(desc)], 
		transaction: options.transaction
	});
}
