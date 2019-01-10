/* global __dirname */

"use strict";

var fs = require("fs");
var path = require("path");
var Sequelize = require("sequelize");
var _ = require("lodash");

module.exports = function (){
	var sequelize;
	if (config.models) {
		sequelize = config;
		_.extend(config.options.define, { timestamps: false });
	} else {
		if (!_.has(config, "db.database") && !_.has(config, "db.user") && !_.has(config, "db.pass") && !_.has(config, "db.host")) {
			throw new Error("Invalid configuration provided to Sequelize initialization");
		}

		sequelize = new Sequelize(config.db.database, config.db.user, config.db.pass, 
			{ host: config.db.host, logging: false, define: { timestamps: false }, pool: {maxConnections: config.db.maxConnections} });
	}
	var db = {};

	fs
	.readdirSync(__dirname)
	.filter(function (file) {
		return (file.indexOf(".") !== 0) && (file !== "index.js");
	})
	.forEach(function (file) {
		var model = sequelize["import"](path.join(__dirname, file));
		db[model.name] = model;
	});

	Object.keys(db).forEach(function (modelName) {
		if ("associate" in db[modelName]) {
			db[modelName].associate(db);
		}
	});

	db.sequelize = sequelize;
	db.Sequelize = Sequelize;

	Sequelize.Validator.isLongitude = function(longitude){		
		if(longitude < -180 || longitude > 180){
			new Error("Longitude is out of range");
		} else {
			return false;
		}
	};

	return db;
};