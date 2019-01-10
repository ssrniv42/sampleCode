/* global db */
"use strict";

module.exports = function (sequelize, DataTypes) {
	var device = sequelize.define("device", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			autoIncrement: true,
			allowNull: false
		},
		
		create_timestamp: {
			type: DataTypes.INTEGER(11).UNSIGNED,
			allowNull: false,
			comment: "Unix timestamp (in seconds) recorded when device was first registered"
		},	

		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null
		},
		
		imei: {
			type: DataTypes.STRING(45),
			allowNull: false,
			validate: {
				isUnique: function(value, done) {
					return db.device.find({ where: { imei: value }})
					.then(function(result) { 
						if (result) { 
							done("Invalid IMEI. IMEI is already assigned to another device"); 
						} else { 
							done(); 
						}
					});
				} 
			}
		},
		
		tx_id: {
			type: DataTypes.STRING(255),
			allowNull: true,
			validate: {
				isUnique: function(value, done) {
					return db.device.find({ where: { tx_id: value }})
					.then(function(result) { 
						if (result) { 
							done("Invalid tx_id. tx_id is already assigned to another device"); 
						} else { 
							done(); 
						}
					});
				} 
			}   
		},
		
		sms: {
			type: DataTypes.STRING(45),
			allowNull: true,
			validate: {
				isUnique: function(value, done) {
					return db.device.find({ where: { sms: value }})
					.then(function(result) { 
						if (result) { 
							done("Invalid SMS. SMS is already assigned to another device"); 
						} else { 
							done(); 
						}
					});
				} 
			}          
		},
		
		type_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},

		name: {
			type: DataTypes.STRING(45),
			allowNull: false,
			validate: { // check if device name is unique within the client group
				isUniqueInClient: function(value, done){
					return db.device.findOne({where: {name: value, client_id: this.client_id}})
					.then(function(device){
						if(device && device.name == value){
							done("Device title should be unique.");
						} else{
							done();
						}
					});
				}
			}
		},
		
		mode: {
			type: DataTypes.INTEGER(11),
			allowNull: false,
			field: "mode_id"
		},

		encryption_key: {
			type: DataTypes.STRING(64),
			allowNull: true
		},
		
		decryption_key: {
			type: DataTypes.STRING(64),
			allowNull: true
		},
		
		settings: {
			type: DataTypes.STRING(32),
			allowNull: true
		},
		
		poll_settings_code: {
			type: DataTypes.STRING(38),
			allowNull: true
		},
		
		poll_settings_timestamp: {
			type: DataTypes.INTEGER(10),
			allowNull: true
		},
		
		poll_firmware: {
			type: DataTypes.STRING(10),
			allowNull: true
		},

		max_speed: {
			type: DataTypes.DOUBLE,
			allowNull: true,
			defaultValue: null,
			comment: "max_speed in kph (kilometers per hour)"
		},
		
		min_speed: {
			type: DataTypes.DOUBLE,
			allowNull: true,
			defaultValue: null,
			comment: "min_speed in kph (kilometers per hour)"
		},
		
		non_report_threshold: {
			type: DataTypes.INTEGER(11),
			allowNull: true,
			defaultValue: 999999999
		},
		
		annotation: {
			type: DataTypes.STRING(255),
			allowNull: false,
			defaultValue: ""
		},

		device_incoming_mode: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null,
			comment: "primary comms through which data is sent to the device"
		},

		device_outgoing_mode: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: true,
			defaultValue: null,
			comment: "primary comms through which data is received from the device"
		},

		registration_status: {
			type: DataTypes.INTEGER(10),
			allowNull: false,
			defaultValue: 0,
			comment: "determines the state of device registration process. 0 (pending), 1 (pass), 2 (fail)"
		},

		error_message: {
			type: DataTypes.TEXT,
			allowNull: true,
			defaultValue: null
		},

		/*
			This is from Giles requirement for T24 
			to have a way to identify assets that have been 
			removed from SP net, but still kept on for the 
			customer for history purposes. 
			This will help with billing process as well.
		*/
		active: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true,
			comment: "Variable that allows business to identify device still registered on SP net and currently active"
		},

		color: {
			type: DataTypes.ENUM("#000000", "#0000ff", "#ff0000", "#008000", "#e6e600"),
			alloNull: false,
			defaultValue: "#000000",
			comment: "Allows user to assign 1 of 5 colors (black, blue, red, green, yellow) to categorize an asset"
		}
	},
	{
		freezeTableName: true,
		classMethods: {
			associate: function (models) {
				device.belongsTo(models.client, {foreignKey: {fieldName: "client_id", allowNull: false}});
				device.hasOne(models.latest_report, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.hasMany(models.report, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.group, {through: "group_devices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.hasMany(models.comm, {foreignKey: "row_id", constraints: false, scope: { table_name: "assets"}});
				device.belongsToMany(models.geofence, {through: "geofence_trigger_devices", as: "DeviceTriggers", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.geofence, {through: "geofence_sync_devices", as: "SyncedGeoDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.poi, {through: "poi_sync_devices", as: "SyncedPoiDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.group, {through: "group_sync_devices", as: "SyncedGroupDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.hasMany(models.device_sync_info, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.situational_awareness, {through: "situational_awareness_member_devices", as: "SaMemberDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.situational_awareness, {through: "situational_awareness_subscriber_devices", as: "SaSubscriberDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.alert_rule, {through: "alert_rule_member_devices", as: "ArMemberDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.alert_rule, {through: "alert_rule_subscriber_devices", as: "ArSubscriberDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsTo(models.device_type, {foreignKey: { fieldName: "type_id", allowNull: false}});
				device.hasMany(models.poi, {foreignKey: {fieldName: "creator_device_id", allowNull: true } });
				device.belongsToMany(models.message, {through: "message_sender_devices", as: "MessageSenderDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.message, {through: models.message_recipient_devices, as: "MessageRecipientDevices", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.feed_code, {through: "device_feed_codes", as: "DeviceFeedCodes", foreignKey: {fieldName: "device_id", allowNull: false}}); 
				device.belongsTo(models.communication_mode, {as: "DeviceIncomingMode", foreignKey: {fieldName: "device_incoming_mode", allowNull: true}});
				device.belongsTo(models.communication_mode, {as: "DeviceOutgoingMode", foreignKey: {fieldName: "device_outgoing_mode", allowNull: true}});
				device.hasMany(models.device_apn_configurations, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.hasMany(models.device_iridex_pin, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.hasMany(models.alert, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.hasOne(models.latest_cargo_status, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.hasMany(models.cargo_status, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.hasOne(models.cargo_setting, {foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsToMany(models.geofence, {through: "cargo_geofences", as: "CargoGeofences", foreignKey: {fieldName: "device_id", allowNull: false}});
				device.belongsTo(models.device_mode, {foreignKey: {fieldName: "mode", allowNull: false}});
			}
		},

		hooks: {
			afterCreate: function(device, options){
				return triggerLogic(device, "insert", options);
			},
			
			beforeDestroy: function(user, options){
				return triggerLogic(device, "delete", options);
			}
		}
	});
		
	return device; 
};

function triggerLogic(device, action, options){
	var timestamp = Math.round(new Date().getTime() / 1000);

	var desc = {
		"IMEI": device.imei,
		"device_type": device.type,
		"device_name": device.name,
		"device_mode": device.mode,
		"max_speed": device.max_speed,
		"min_speed": device.min_speed
	};

	var qryAdminLog = "INSERT INTO AdminLog (client_id, `name`, `time`, `event`, `table`, `action`, row_id, `desc`) " 
						+ "VALUES (?, ?, ?, ?, ?, ?, ?, ?)";                     
						
	return db.sequelize.query(qryAdminLog, { 
		replacements: [device.client_id, device.device_name, timestamp, "asset", "assets", action, device.id, JSON.stringify(desc)], 
		transaction: options.transaction
	});
}
