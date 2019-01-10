/* global db */

"use strict";

module.exports = function(sequelize, DataTypes){
	var alertRule = sequelize.define("alert_rule", {
		id: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false    
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		title: {
			type: DataTypes.STRING(45),
			allowNull: false,
			//Check if alert rule name is unique within the client
			validate: {
				isUniqueName: function(value, done){
					var id = this.id || null;
					return db.alert_rule.findOne({where: {title: value, client_id: this.client_id, id: {$ne: id}}})
					.then(function(alertRuleName){
						if(alertRuleName && alertRuleName.title == value){
							done("Alert rule name is already in use");	
						} else{
							done();
						}
					});
				}
			}
		},
		
		enabled: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: 0         
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function(models){
				alertRule.belongsTo(models.client, { foreignKey: { fieldName: "client_id", allowNull: false } });
				alertRule.belongsToMany(models.alert_type, {through: "alert_rule_alert_types", as: "AlertTypes", foreignKey: {fieldName: "alert_rule_id", allowNull: false}});
				alertRule.belongsToMany(models.device, {through: "alert_rule_member_devices", as: "ArMemberDevices", foreignKey: {fieldName: "alert_rule_id", allowNull: false}});
				alertRule.belongsToMany(models.group, {through: "alert_rule_member_groups", as: "ArMemberGroups", foreignKey: {fieldName: "alert_rule_id", allowNull: false}});
				alertRule.belongsToMany(models.device, {through: "alert_rule_subscriber_devices", as: "ArSubscriberDevices", foreignKey: {fieldName: "alert_rule_id", allowNull: false}});
				alertRule.belongsToMany(models.group, {through: "alert_rule_subscriber_groups", as: "ArSubscriberGroups", foreignKey: {fieldName: "alert_rule_id", allowNull: false}});
				alertRule.belongsToMany(models.user, {through: models.alert_rule_subscriber_users, as: "ArSubscriberUsers", foreignKey: {fieldName: "alert_rule_id", allowNull: false}});
			}
		},
		
		hooks: {
			afterCreate: function(alertRule, options){
				return triggerLogic(alertRule, "insert", options);
			},

			afterUpdate: function(alertRule, options){
				return triggerLogic(alertRule, "update", options);
			},

			beforeDestroy: function(alertRule, options){
				return triggerLogic(alertRule, "delete", options);
			}
		}     
	});
	return alertRule; 
};

function triggerLogic(alertRule, action, options){
	var timestamp = Math.round(new Date().getTime() / 1000);

	var ruleStatus = "OFF";

	if(alertRule.enabled){
		ruleStatus = "ON";
	}

	var desc = {
		"Alert Rule status": ruleStatus,
		"Alert Rule name": alertRule.name
	};

	var qryAdminLog = "INSERT INTO AdminLog (client_id, `name`, `time`, `event`, `table`, `action`, row_id, `desc`) " 
						+ "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";                     
						
	return db.sequelize.query(qryAdminLog, { 
		replacements: [alertRule.client_id, alertRule.name, timestamp, "Alert Rule", "AlertNotificationRules", action, alertRule.id, JSON.stringify(desc)], 
		transaction: options.transaction
	});
}
