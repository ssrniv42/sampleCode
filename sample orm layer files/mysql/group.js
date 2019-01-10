"use strict";

module.exports = function (sequelize, DataTypes) {
	var group = sequelize.define("group", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			defaultValue: null
		},

		title: {
			type: DataTypes.STRING(45),
			allowNull: false,
			validate: { // check if group title is unique within the client
				isUniqueInClient: function(value, done){
					return db.group.findOne({where: {title: value, client_id: this.client_id}})
					.then(function(group){
						if(group && group.title == "Main"){
							done("Cannot recreate Main group");
						}
						if(group && group.title == value){
							done("Group title should be unique.");	
						} else{
							done();
						}
					});
				}
			}
		},

		parent_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},

		tier_level: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		}

	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {				
				group.belongsTo(models.client, { foreignKey: { fieldName: "client_id", allowNull: false}});
				group.belongsTo(models.group, {as: "ParentGroups", foreignKey: { fieldName: "parent_id", allowNull: true}});
				group.belongsToMany(models.user, {through: "user_groups", foreignKey: "group_id", allowNull: false});
				group.belongsToMany(models.device, {through: "group_devices", foreignKey: {fieldName: "group_id", allowNull: false}});
				group.hasMany(models.comm, {foreignKey: "row_id", constraints: false, scope: { table_name: "groups"}});
				group.belongsToMany(models.geofence, {through: "geofence_trigger_groups", as: "GroupTriggers", foreignKey: {fieldName: "group_id", allowNull: false}});
				group.belongsToMany(models.nearest_responder, {through: "nearest_responder_groups", as: "NrMembers", foreignKey: {fieldName: "group_id", allowNull: false}});
				group.belongsToMany(models.situational_awareness, {through: "situational_awareness_member_groups", as: "SaMemberGroups", foreignKey: {fieldName: "group_id", allowNull: false}});
				group.belongsToMany(models.alert_rule, {through: "alert_rule_member_groups", as: "ArMemberGroups", foreignKey: {fieldName: "group_id", allowNull: false}});
				group.belongsToMany(models.alert_rule, {through: "alert_rule_subscriber_groups", as: "ArSubscriberGroups", foreignKey: {fieldName: "group_id", allowNull: false}});
				group.belongsToMany(models.device, {through: "group_sync_devices", as: "SyncedDevices", foreignKey: {fieldName: "group_id", allowNull: false}});
			}
		}
	});
	return group;
};

