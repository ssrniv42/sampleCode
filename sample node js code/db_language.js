var _= require("lodash");
var bluebird = require("bluebird");

/**
 * Returns full language set from Track24 DB
 * 
 * @method getLanguage
 * @memberof db_language
 * @return {object} - language data set from Track24 DB 
*/
var getLanguage = function(){
	return db.language.findAll({
		where: {name: {$in: ["English", "Spanish"]}}
	})
	.then(function(languages){
		var message="";
		if(!languages.length) {
			message= "Could not get the list of languages.";
		}else{
			message= "Get all languages successful.";
		}
		
		languages= _.keyBy(languages, "id");
		return bluebird.resolve({message: message, result: languages});
	});
};

/**
 * Returns language data for session user in the form of key value air of tag and translation.
 * if language chosen is English the value will be just the word (because english has no translations)
 * 
 * @method getLanguageData
 * @memberof db_language
 * @param {Object} user - obj containing info of the session user
 * @return {object} - language data for session user from Track24 DB 
*/
var getLanguageData = function(user){
	return db.user_setting.findOne({
		where: {user_id: user.user_id},
		attributes: ["language_id"]
	})
	.then(function(settings){
		return processAndGetLangData(settings.language_id);
	})
	.then(function(langDataObj){
		return bluebird.resolve({message: "Get all language data successful", result: langDataObj});
	});
};


/**
 * Processes and language data in the format required on the front end
 * 
 * @method processAndGetLangData
 * @memberof db_language
 * @param {Integer} languageId - id of the language chosen by the session users settings
 * @return {object} - language data object in the format required on the front end
*/
function processAndGetLangData(languageId){
	let langDataObj = {};
	return getDataFromLangSource(langDataObj)
	.then(function(){
		return getDataFromLangTranslation(languageId, langDataObj);
	})
	.then(function(){
		return bluebird.resolve(langDataObj);
	});
}


/**
 * Queries and gets language data from language source
 * 
 * @method getDataFromLangSource
 * @memberof db_language
 * @param {Obj} langDataObj - object that will be modified with data for the user
 * @return {object} - modified language data object in the format required on the front end
*/
function getDataFromLangSource(langDataObj){
	return db.language_source.findAll()
	.then(function(sourceData){
		_.map(sourceData, function(data){
			data = data.get({plain: true});
			langDataObj[data.tag] = data.word;
			return;
		});
		return bluebird.resolve(langDataObj);
	});
}

/**
 * Queries and gets language data from language translations
 * 
 * @method getDataFromLangTranslation
 * @memberof db_language
 * @param {Integer} languageId - id of the language chosen by the session users settings
 * @param {Obj} langDataObj - object that will be modified with data for the user
 * @return {object} - modified language data object in the format required on the front end
*/
function getDataFromLangTranslation(languageId, langDataObj){
	return db.language_translation.findAll({
		where: {client_id: null, language_id: languageId},
		include: [{
			model: db.language_source,
			required: true
		}]
	})
	.then(function(languageData){
		_.map(languageData, function(data){
			data = data.get({plain: true});
			langDataObj[data.language_source.tag] = data.translation;
			return;
		});

		return bluebird.resolve(langDataObj);
	});
}

module.exports= {
	getLanguage: getLanguage,
	getLanguageData: getLanguageData
};

