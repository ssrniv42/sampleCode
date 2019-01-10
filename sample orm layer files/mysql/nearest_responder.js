/*global db */

"use strict";

module.exports = function(sequelize, DataTypes) {
	var nearestResponder = sequelize.define("nearest_responder", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		title: {
			type: DataTypes.STRING(100),
			allowNull: false,
			//check if NR Rule name is unique within the client group
			validate: {
				isUniqueNrName: function(value, done){
					var id = this.id || null;
					return db.nearest_responder.findOne({where: {title: value, client_id: this.client_id, id: {$ne: id}}})
					.then(function(nrRuleName){
						if(nrRuleName && nrRuleName.title == value){
							done("NR rule title is already in use");
						}
						else{
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
		},
		
		device_count: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			validate: { 
				// Requirement from mh.
				// check device_count value is not greater than total number of assets in the client group
				// Also check if device count value is positive
				deviceCountValidation: function(value, done){
					return db.device.count({where: {client_id: this.client_id}})
					.then(function(deviceCount){
						if(value > deviceCount){
							done("MH REQUIREMENT: Max number of assets selected in NR module cannot exceed total devices registered under the client group");
						}
						if(value < 0){
							done("Max number of assets selected in NR module cannot be negative");
						}
						else{
							done();
						}
					});
				}
			}
		},
		
		radius: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			allowNull: false,
			defaultValue: 50000,
			comment: "Radius in meters",
			validate: { 
				// check if device count value is positive
				radiusValidation: function(value, done){
					if(value < 0){
						done("Radius selected in NR module cannot be negative");
					}
					else{
						done();
					}
				}
			}
		},
		
		report_age: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			defaultValue: 86400,
			comment: "Report age in seconds",
			validate: { 
				// check if device count value is positive
				reportAgeValidation: function(value, done){
					if(value < 0){
						done("Report age selected in NR module cannot be negative");
					}
					else{
						done();
					}
				}
			}
		}
	}, {
		freezeTableName: true, //do not pluralize
		classMethods: {
			associate: function (models) {
				nearestResponder.belongsTo(models.client, { foreignKey: { fieldName: "client_id", allowNull: false} });
				nearestResponder.belongsToMany(models.group, { through: "nearest_responder_groups", as: "NrMembers", foreignKey: { fieldName: "nearest_responder_id", allowNull: false}});
			}
		},
        
		hooks: {
			afterCreate: function(nrRule, options){
				return triggerLogic(nrRule, "insert", options);
			},
			
			afterUpdate: function(nrRule, options){
				return triggerLogic(nrRule, "update", options);
			},
			
			beforeDestroy: function(nrRule, options){
				return triggerLogic(nrRule, "delete", options);
			}
		}
	});
	return nearestResponder;
};

//Trigger logic taken from near_resp table triggers in MySQL
function triggerLogic(nrRule, action, options){
	var timestamp = Math.round(new Date().getTime() / 1000);

	var nrStatus = "OFF";

	if(nrRule.enabled){
		nrStatus = "ON";
	}

	var desc = {
		"NR status": nrStatus,
		"NR maximum asset": nrRule.device_count,
		"NR radius": nrRule.radius,
		"NR report age": nrRule.report_age
	};

	var qryAdminLog = "INSERT INTO AdminLog (client_id, `name`, `time`, `event`, `table`, `action`, row_id, `desc`) " 
						+ "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";                     
						
	return db.sequelize.query(qryAdminLog, { 
		replacements: [nrRule.client_id, nrRule.title, timestamp, "NR", "near_resp", action, nrRule.id, JSON.stringify(desc)], 
		transaction: options.transaction
	});
}