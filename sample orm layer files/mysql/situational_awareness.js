/* global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var situationalAwareness = sequelize.define("situational_awareness", {
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
			//check if SA Rule name is unique within the client group
			validate: {
				isUniqueSaName: function(value, done){
					var id = this.id || null;
					return db.situational_awareness.findOne({where: {title: value, client_id: this.client_id, id: {$ne: id}}})
					.then(function(saRuleName){
						if(saRuleName && saRuleName.title == value){
							done("SA rule title is already in use");  
						}
						else{
							done();
						} 
					});
				}
			}
		},
		
		interval: {
			type: DataTypes.INTEGER(11),
			allowNull: false,
			comment: "interval in seconds",
			defaultValue: 30
		},
		
		distance: {
			type: DataTypes.INTEGER(11),
			allowNull: false,
			comment: "distance in meters",
			defaultValue: 10
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function (models) {
				situationalAwareness.belongsTo(models.client, { foreignKey: { fieldName: "client_id", allowNull: false } });
				situationalAwareness.belongsToMany(models.group, { through: "situational_awareness_member_groups", as: "SaMemberGroups", foreignKey: { fieldName: "situational_awareness_id", allowNull: false}});
				situationalAwareness.belongsToMany(models.device, { through: "situational_awareness_member_devices", as: "SaMemberDevices", foreignKey: { fieldName: "situational_awareness_id", allowNull: false}});		
				situationalAwareness.belongsToMany(models.device, { through: "situational_awareness_subscriber_devices", as: "SaSubscriberDevices", foreignKey: { fieldName: "situational_awareness_id", allowNull: false}});
			}
		},

		hooks: {
			afterCreate: function(saRule, options){
				return triggerLogic(saRule, "insert", options);
			},
			
			afterUpdate: function(saRule, options){
				return triggerLogic(saRule, "update", options);
			},
			
			beforeDestroy: function(saRule, options){
				return triggerLogic(saRule, "delete", options);
			}
		}
	});
	return situationalAwareness;
};

//Trigger logic taken from sit_aware table triggers in MySQL
function triggerLogic(saRule, action, options){
	var timestamp = Math.round(new Date().getTime() / 1000);

	var desc = {
		"SA name": saRule.title,
		"interval": saRule.interval,
		"distance": saRule.distance
	};

	var qryAdminLog = "INSERT INTO AdminLog (client_id, `name`, `time`, `event`, `table`, `action`, row_id, `desc`) " 
						+ "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";                     
						
	return db.sequelize.query(qryAdminLog, { 
		replacements: [saRule.client_id, saRule.title, timestamp, "SA", "sit_aware", action, saRule.id, JSON.stringify(desc)], 
		transaction: options.transaction
	});
}