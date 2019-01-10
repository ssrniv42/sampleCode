/* global db */
"use strict";
var bluebird = require("bluebird");
var _ = require("lodash");
var availableComms = [];

var allPossibleComms = Array.apply(null, {length: 32767}).map(Number.call, Number).reverse();
var locked = false;

module.exports = function (sequelize, DataTypes) {
	var comm = sequelize.define("comm", {
		id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false,
			primaryKey: true,
			autoIncrement: true,
			unique: true
		},
		row_id: {
			type: DataTypes.INTEGER(10).UNSIGNED,
			allowNull: false
		},
		table_name: {
			type: DataTypes.STRING(45),
			allowNull: false
		}
	}, {
		freezeTableName: true,
		classMethods: {
			associate: function (models) {				
				comm.belongsTo(models.device, { foreignKey: "row_id", constraints: false });
				comm.belongsTo(models.user, { foreignKey: "row_id", constraints: false });
				comm.belongsTo(models.group, { foreignKey: "row_id", constraints: false });
				comm.belongsTo(models.client, { foreignKey: "row_id", constraints: false });
			}
		},
		hooks: {
			beforeCreate: function (comm) {
				return getCommId()
				.then((commId)=>{
					if(commId == null) throw new Error("Could not allocate a new Comm ID.");
					comm.id= commId;
					return bluebird.resolve(comm);
				});
			}
		}
	});

	return comm;
};


function getCommId(){

	return getNextCommId()	
	.then(function() {
		return availableComms.pop();		
	});
}

function getNextCommId(){
	if(locked) return bluebird.delay(20).then(()=>{
		return getNextCommId();
	});

	if(availableComms.length === 0) {
		locked= true;
		return getAvailableIds()
		.then(()=>{
			locked= false;
		});
	} else {
		return bluebird.resolve();
	}
}

function getAvailableIds(){
	return db.comm.findAll()
	.then(function(comms) {
		var usedIds= _.map(comms, "id");
		//Must not issue any more 0's as comm id. Requirement from task 3372 on Plan.io
		_.pull(allPossibleComms, 0);
		availableComms= _.difference(allPossibleComms, usedIds);		
	});
}