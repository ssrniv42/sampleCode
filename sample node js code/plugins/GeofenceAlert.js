const ol= require("openlayers");
const bluebird= require("bluebird");
const _= require("lodash");
const util= require("util");
const Alert= require("./Alert.js");
const geoLocationUtils= require("geolocation-utils");


class GeofenceAlert extends Alert{
	constructor(options){		
		super(options);
		this.options= options;
	}

	/**
	 * wrapper of processAlert method
	 * 
	 * @param {Object} data data corresponding to the action received
	 * @param {String} action type of event {"report" | "geofence"}
	 */
	processAlertWrapper(data, action){
		if(action == "report"){
			log.info("Processing geofence alert triggered by device report. ( Report ID: ", data.report_id, ")");
			return this.processAlertCausedByReport(data);
		}else if(action == "geofence"){
			log.info("Processing geofence alert triggered by gefence update. ( Geofence ID:", data.id, ")");
			return this.processAlertCausedByGeofence(data);
		}else{
			throw new Error("Action "+ action+ " is not recognized for Geofence Alert plugin.");
		}
	}

	/**
	 * calculates geo-fence alerts when a new report is received
	 * 
	 * @param {Object} report reprot information object 
	 */
	processAlertCausedByReport(report){		
		const $this= this;

		// get all geofences that the device could trigger
		return this.getDeviceTriggerGeofences(report.device_id)
		.then(function(geofences){
			return $this.processGeofenceViolation(geofences, report);
		});
	}

	
	/**
	 * processes gefence violation for a given list of geofences and device reprots
	 * 
	 * @param {Array | Object} geofences an array of geofence objects or an individual geofence object
	 * @param {Array | Object} reports an array of report objects or an individual report object
	 */
	processGeofenceViolation(geofences, reports){
		const $this= this;

		// converting arguments to array if they are not
		geofences= _.concat([], geofences);
		reports= _.concat([], reports);

		return bluebird.map(geofences, function(geofence){
			return bluebird.map(reports, function(report){
				const deviceId= report.device_id;
				const reportId= report.report_id;
				const now= utils.getTimestamp();	

				const managerOptions= {
					condition: { geofence_id: geofence.id },
					start: { 
						geofence_id: geofence.id, 
						geofence_title: geofence.title, 
						geofence_inclusive: geofence.inclusive,
						start_report_id: reportId,
						start_timestamp: now
					},
					finish: { end_report_id: reportId, end_timestamp: now }
				};

				const isViolated= geofence.active && $this.isViolated(geofence, report);
				
				return $this.processViolation(deviceId, isViolated, managerOptions);
			});
		});
	}
	
	/**
	 * checks whether the report violates the geofence
	 * 
	 * @param {Object} geofence geofence data object
	 * @param {Object} report report data object
	 * 
	 * @return {Boolean} true if violated and false otherwise
	 */
	isViolated (geofence, report){
		const location= { longitude: report.longitude, latitude: report.latitude };			
		
		// if the geo-fence is a path we calculate the violation in a different way				
		if (geofence.shape == "path"){
			const geometry= this.getGeometry(geofence);
			const point= this.getPoint(location);

			// getting closest point on the path
			const distObj= geometry.distanceTo(point, {details: true});		
			const point2= new ol.OpenLayers.Geometry.Point(distObj.x0, distObj.y0);
	
			// calculating the geodesic distance
			const line = new ol.OpenLayers.Geometry.LineString([point, point2]);
			const distance = line.getGeodesicLength(new ol.OpenLayers.Projection("EPSG:900913"));
				
			if (geofence.inclusive){
				// if the geo-fence is inclusive						
				return (distance > geofence.width/2);
			}else{ 
				// if the geo-fence is exclusive 
				return (distance < geofence.width/2);
			}		
		}
		else{
			let isInsideGeofence = false;
			
			if(geofence.shape == "polygon" || geofence.shape == "rectangle"){
				const polygon = this.getCoordinatesForPolygon(geofence);
				isInsideGeofence = geoLocationUtils.insidePolygon([location.latitude, location.longitude], polygon);
			}

			else if(geofence.shape == "circle"){
				//requirement for input of insideCircle function of getlocation-utils package
				const circleData = this.getDataForCircle(geofence);
				const deviceLocation = {lat: location.latitude, lon: location.longitude};
				isInsideGeofence = geoLocationUtils.insideCircle(deviceLocation, circleData.center, circleData.radius);
			}

			if (geofence.inclusive){
				//if the geo-fence is inclusive
				return !isInsideGeofence;							
			}else{
				//if the geo-fence is exclusive
				return isInsideGeofence;
			}
		}
	}

	getCoordinatesForPolygon(geofence){
		//const plainGeo = geofence.get({plain: true});
		let coordinates = [];
		_.each(geofence.coordinates, function(coordData){
			let coord = [coordData.latitude, coordData.longitude];
			coordinates.push(coord);
		});
		return coordinates;
	}

	getDataForCircle(geofence){
		//const plainGeo = geofence.get({plain: true});
		let circleData = {
			center: {
				lat: geofence.coordinates[0].latitude,
				lon: geofence.coordinates[0].longitude
			},
			radius: geofence.width
		};
		return circleData;
	}

	/**
	 * gets the list of geo-fences that a device can trigger 
	 * 
	 * @param {Number} deviceId device ID
	 * @return {Array} an array of geo-fence objects
	 */
	getDeviceTriggerGeofences(deviceId){
		return db.device.findOne({ 
			where: { id: deviceId },
			include: [{
				model: db.geofence,
				as: "DeviceTriggers",
				required: true,
				where: {active: true},
				include: [{		
					model: db.geofence_coordinate,
					as: "coordinates"
				}]
			}]
		})
		.bind({})
		.then(function(device){
			// list of geofences that are assinged to the device directly
			this.DeviceTriggers= (device && device.DeviceTriggers) || [];
			return db.device.findOne({ 
				where: { id: deviceId },
				include: [{
					model: db.group,
					include: [{
						model: db.geofence,
						as: "GroupTriggers",						
						required: true,
						where: {active: true},
						include: [{				
							model: db.geofence_coordinate,
							as: "coordinates"
						}]
					}]
				}]
			});
		})
		.then(function(device){
			// list of geofences that are assgined ot a group that device is in
			let GroupTriggers= device && _.flatten(_.map(device.groups, function(group){
				return group.GroupTriggers;
			}));

			GroupTriggers= GroupTriggers || [];

			// concatenating the two arrays of geofences
			let deviceGeofences= _.concat(this.DeviceTriggers, GroupTriggers);

			// making sure geofence list has only unique itmes
			deviceGeofences= _.uniqBy(deviceGeofences, "id");

			return deviceGeofences;

		});
	}


	/**
	 * calculates geo-fence alerts when a geofence update is occurred
	 * 
	 * @param {Object} geofence geo-fence object
	 */
	processAlertCausedByGeofence(geofence){
		const $this= this;
		let triggerAlerts= null;
		return $this.getGeofenceTiggerReports(geofence)
		.bind({})
		.then(function(reports){
			this.reports= reports;
			return $this.processGeofenceViolation(geofence, reports); 
		})
		.then(function(alerts){
			triggerAlerts= alerts;
			const geofenceTriggerDeviceIds= _.map(this.reports, "device_id");
			return $this.removeUntrackedGeofenceAlerts(geofence, geofenceTriggerDeviceIds);
		})
		.then(untrackAlerts => {			
			return bluebird.resolve(_.concat(triggerAlerts, untrackAlerts));
		});	
	}


	/**
	 * removes geofence alerts of a geofence for all devices that have been removed 
	 * from the geofence trigger list
	 * 
	 * @param {object} geofence Geo-fence object being updated
	 * @param {Array} geofenceTriggerDeviceIds Device IDs of Geo-Fence triggers
	 * 
	 * @return {Boolean} true if any Geo-fence alert is removed, and false otherwise
	 */
	removeUntrackedGeofenceAlerts(geofence, geofenceTriggerDeviceIds){		
		const $this= this;		
		
		// gets all ongoing alerts for the geofence
		return db.alert.findAll({			
			where: {end_timestamp: { $eq: null }},
			include: [{
				as: "GeofenceAlertManager",
				model: db.geofence_alert_manager,
				where: {geofence_id: geofence.id}				
			}, {				
				model: db.device,
				required: true,
				attributes: ["id"],
				include: [{
					attributes: ["report_id"],
					model: db.latest_report,
					required: true
				}]
			}]
		})
		.bind({})
		.then(function(alerts){
			const untrackedAlerts= _.filter(alerts, function(alert){
				return _.indexOf(geofenceTriggerDeviceIds, alert.device_id) < 0;
			});
			
			return bluebird.map(untrackedAlerts, function(alert){					
				log.info(util.format("Device %d is no longer a trigger of geofence '%s' ( Geofence ID: %d )", alert.device_id, geofence.title, geofence.id));
				const reportId= alert.device.latest_report.report_id;
				const now= utils.getTimestamp();
				return $this.finishAlert(alert, { end_report_id: reportId, end_timestamp: now });
			});
		});
	}


	/**
	 * gets the report information of all trigger devices of a given geofence 
	 * 
	 * @param {Object} geofence geo-fence object
	 * @return {Array} array of device reprot information object
	 */
	getGeofenceTiggerReports(geofence){
		
		// getting all individual device triggers	
		return db.geofence.findOne({		 
			where: {id: geofence.id},
			include: [{
				model: db.device,
				as: "DeviceTriggers",
				required: false,
				include: [{
					model: db.latest_report,
					required: true
				}]
			}]
		})
		.bind({})
		.then(function(geo){				
			this.DeviceTriggers= [];
			if(!geo){
				log.debug(util.format("No device trigger is set for geo-fence %s (ID: %d)", geofence.title, geofence.id));
				return bluebird.resolve();
			}

			this.DeviceTriggers= _.map(geo.DeviceTriggers, function(dt){
				return dt.latest_report;
			});

			return bluebird.resolve();
		})
		// getting device group triggers
		.then(function(){
			return db.geofence.findOne({		 
				where: {id: geofence.id},
				include: [{
					model: db.group,
					as: "GroupTriggers",
					attributes: ["id"],
					required: false,
					include: [{
						model: db.device,
						include: [{
							model: db.latest_report,
							required: true
						}]
					}]
				}]
			});		
		})
		.then(function(geo){
			this.GroupTriggers= [];
			if(!geo){
				log.debug(util.format("No group trigger is set for geo-fence %s (ID: %d)", geofence.title, geofence.id));
				return bluebird.resolve();
			}

			this.GroupTriggers= _.flatten(_.map(geo.GroupTriggers, function(gt){			
				return _.map(gt.devices, function(device){
					return device.latest_report;
				});			
			}));

			return bluebird.resolve();		
		})
		.then(function(){
			return _.concat(this.DeviceTriggers, this.GroupTriggers);		
		});
	}


	/**
	 * builds the OpenLayers geometry object from the geofence object
	 * 
	 * @param {Object} geofence Geofence object
	 * @return {Object} OpenLayers.Geometry object
	 */
	getGeometry(geofence){
		const $this= this;
		// converting points to OpenLayers Point class with map projection 
		const points = _.map(geofence.coordinates, function(coord){
			const point= $this.getPoint(coord);		
			return point;
		});

		// creating the shape geometry object
		let geometry= null;
		if(geofence.shape == "path"){
			geometry = new ol.OpenLayers.Geometry.LineString(points);
		}else if(geofence.shape == "circle"){
			// Circles are not supported by OpenLayers 2.
			// Therefore, cricles are shown with a regular polygon with 30 sides 
			geometry = ol.OpenLayers.Geometry.Polygon.createGeodesicPolygon(points[0], geofence.width, 30, 0, new ol.OpenLayers.Projection("EPSG:900913"));
		}else{
			//console.log("#### | getGeometry", points);
			const ring = new ol.OpenLayers.Geometry.LinearRing(points);
			geometry = new ol.OpenLayers.Geometry.Polygon([ring]);
		}

		return geometry;
	}

	/**
	 * builds the OpenLayers Point object from the given coordinates
	 * 
	 * @param {Object} location coordinates object {longitude: Number, latitude: Number}
	 * @return {Object} OpenLayers.Geometry.Point object
	 */
	getPoint(location){
		const point= new ol.OpenLayers.Geometry.Point(location.longitude, location.latitude);
		point.transform(new ol.OpenLayers.Projection("EPSG:4326"), new ol.OpenLayers.Projection("EPSG:900913"));
		return point;
	}

	sendAlertNotification(alert, options){
		let inStr = "IN";
		if (options.geofence_inclusive){
			inStr = "OUT";
		}	

		const message = {
			regular: inStr + " Geo" + " <" + options.geofence_title + ">",
			sms: "Geo " + inStr + " " + options.geofence_title
		};

		super.sendAlertNotification(alert, options, message);
	}
}

/**
 * 
 * Create a regular polygon around a radius. Useful for creating circles
 * and the like.
 *
 * 
 * @param {OpenLayers.Geometry.Point} origin -  center of polygon.
 * @param {Float} radius - distance to vertex, in map units.
 * @param {Integer} sides - Number of sides. 20 approximates a circle.
 * @param {Float} rotation - original angle of rotation, in degrees.
 * @param {OpenLayers.Projection} projection - the map's projection
 */
ol.OpenLayers.Geometry.Polygon.createGeodesicPolygon = function(origin, radius, sides, rotation, projection){
	
	if (projection.getCode() !== "EPSG:4326") {
		origin.transform(projection, new ol.OpenLayers.Projection("EPSG:4326"));
	}
	const latlon = new ol.OpenLayers.LonLat(origin.x, origin.y);

	let angle= null;
	let newLonlat= null;
	let geomPoint= null;
	const points = [];

	for (let i = 0; i < sides; i++) {
		angle = (i * 360 / sides) + rotation;
		newLonlat = ol.OpenLayers.Util.destinationVincenty(latlon, angle, radius);
		newLonlat.transform(new ol.OpenLayers.Projection("EPSG:4326"), projection);
		geomPoint = new ol.OpenLayers.Geometry.Point(newLonlat.lon, newLonlat.lat);
		points.push(geomPoint);
	}
	const ring = new ol.OpenLayers.Geometry.LinearRing(points);
	return new ol.OpenLayers.Geometry.Polygon([ring]);
};

module.exports= new GeofenceAlert({
	alertName: "Geofence",
	managerTable: "geofence_alert_manager"	
});



