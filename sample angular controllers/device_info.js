
const template = require("./device_info.html");
const deviceCargoInfoTemplate= require("./cargo_info.html");
require("./device_info.scss");

angular
.module("myApp")
.directive("sccDeviceInfo", function() {
	return {
		restrict: "EA",
		replace: true,
		scope: {
			deviceId: "@?",
			deviceTemplate: "@"
		},
		template: template,
			
		link: function ($scope) {
			
			//log.info("Peter deviceId", $scope.deviceId);
			const Device= require("sccDevice");
			$scope.Language= require("sccLanguage");
			$scope.UserSetting= require("sccUserSetting");			
			$scope.AlertMenu = require("sccAlertMenu");
			$scope.Device = Device;
			
			$scope.TimeUtils = require("sccTimeUtils");
			$scope.GuiUtils = require("sccGuiUtils");
			$scope.Clock = require("sccClock");
			$scope.OlMap = require("sccOlMapNew");
			
			$scope.$watch("deviceId", function(){
				$scope.device= Device.get($scope.deviceId);
			});
			
		} 
	};
})
.directive("sccDeviceCargoInfo", function() {
	return {
		restrict: "E",
		replace: true,
		template: deviceCargoInfoTemplate
	};
});