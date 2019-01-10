/* global auditDb log */
"use strict";

var _= require("lodash");

module.exports = function (sequelize, DataTypes) {
	var poi = sequelize.define("poi", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			primaryKey: true,
			allowNull: false,
			autoIncrement: true
		},
		
		client_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		
		title: {
			type: DataTypes.STRING(45),
			allowNull: false
			/*validate:{ // check if poi title is unique within the client group
				isUniqueInClient: function(value, done){
					return db.poi.findOne({where: {title: value, client_id: this.client_id}})
					.then(function(poi){
						if(poi && poi.title == value){
							done("Poi title should be unique.");
						}else{
							done();
						}
					});
				}
			}*/
		},

		note: {
			type: DataTypes.STRING(255),
			allowNull: true,
			defaultValue: null
		},

		latitude: {
			type: DataTypes.DECIMAL(9, 5),
			allowNull: false,
			validate: {min: -90, max: 90, isDecimal: true},
			comment: "latitude in DegDec, EPSG:4326 format (min: -90, max: 90)"
		},

		longitude: {
			type: DataTypes.DECIMAL(9, 5),
			allowNull: false,
			validate: {min: -180, max: 180, isDecimal: true},
			comment: "longitude in DegDec, EPSG:4326 format (min: -180, max: 180)"
		},

		category_images_id: {
			type: DataTypes.INTEGER(10),
			allowNull: true,
			defaultValue: null
		},

		nato_code: {
			type: DataTypes.STRING(45),
			allowNull: true,
			defaultValue: null,
			comment: "12 Character NATO Code that determines characteristics of a symbol"
		},

		approved: {
			type: DataTypes.BOOLEAN,
			allowNull: false,
			defaultValue: true,
			comment: "If approved is true, the platform user has accepted the POI that a tactical has sent them."
		},

		creator_device_id: {
			type: DataTypes.INTEGER(10),
			allowNull: true,
			defaultValue: null,
			comment: "id of the tactical device that created the poi"
		},

		created_timestamp: {
			type: DataTypes.BIGINT(20),
			alloNull: true,
			defaultValue: null,
			comment: "Unix timestamp from when the POI was created"
		}
	}, {
		freezeTableName: true, // do not pluralize
		classMethods: {
			associate: function (models) {
				poi.belongsTo(models.client, { foreignKey: { fieldName: "client_id", allowNull: false } });
				poi.belongsToMany(models.device, {through: "poi_sync_devices", as: "SyncedDevices", foreignKey: {fieldName: "poi_id", allowNull: false}});
				poi.belongsTo(models.device, { foreignKey: {fieldName: "creator_device_id", allowNull: true } });
				poi.belongsTo(models.category_images, { foreignKey: {fieldName: "category_images_id", allowNull: true } });		
			}
		},
		hooks: {
			afterCreate: function(poi, options){				
				poi = poi.get({plain: true});         
				var poiAudit = new auditDb.ModuleMods({ object: "poi", modified_by: _.pick(options.user, ["client_id", "user_id", "device_id"]), action: "create", data: poi});
				return poiAudit.save()
				.then(function(){
					log.info("Operation 'create' stored in Audit DB. POI:", poi.id);
				});	
			},			
			afterUpdate: function(poi, options){
				// storing updated fields in the audit table               				
				var changedData= _.pick(poi, _.keys(poi._changed)); // stripping the poi object down to fields that has changed				
				var poiAudit = new auditDb.ModuleMods({ object: "poi", modified_by: _.pick(options.user, ["client_id", "user_id", "device_id"]), action: "update", data: changedData});
				return poiAudit.save().then(function(){
					log.info("Operation 'update' stored in Audit DB. POI:", poi.id);
				});
			},
			afterDestroy: function(poi, options){				
				var poiAudit = new auditDb.ModuleMods({ object: "poi", modified_by: _.pick(options.user, ["client_id", "user_id", "device_id"]), action: "delete", data: {}});
				return poiAudit.save().then(function(){
					log.info("Operation 'delete' stored in Audit DB. POI:", poi.id);
				});
			}
		}
	});
	return poi;
};