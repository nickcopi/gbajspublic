const mongo = require('mongodb');
const sha256 = require('js-sha256');
const settings = require('./settings');
let MongoClient = require('mongodb').MongoClient;
let url = "mongodb://localhost:27017/gba";
const gba = 'gba'

module.exports.init = ()=>{
	MongoClient.connect(url, function(err, db) {
 		let dbo = db.db(gba);
		
		//dbo.collection('users').deleteMany({},(err,res)=>{});
		dbo.createCollection('users', function(err, res) {
			if (err) throw err;
				console.log("Collection created!");
			db.close();
		});
		dbo.collection('users').find({}).toArray((err,res)=>{
			console.log(res);
			db.close();
		});
	});
};

module.exports.passMatch = (username,password,callback)=>{
	MongoClient.connect(url, function(err, db) {
 		let dbo = db.db(gba);
		dbo.collection('users').find({username}).toArray((err,res)=>{
			db.close();
			if(!res[0]) {
				callback(false);
				return;
			}
			callback(res[0].password === password,res[0]);
			return;
		});	
	});
};

module.exports.changePass = (user,callback)=>{//figure out how to use this 
	MongoClient.connect(url, function(err, db) {
 		let dbo = db.db(gba);
		dbo.collection('users').update({username:user.username},user,(err,res)=>{
			db.close();
			callback();
			return;
		});
	});
};


let addSession = (user,callback)=>{
	MongoClient.connect(url, function(err, db) {
 		let dbo = db.db(gba);
		dbo.collection('users').update({username:user.username},user,(err,res)=>{
			db.close();
			callback();
			return;
		});
	});

};

module.exports.login = (username,password,callback)=>{
	MongoClient.connect(url, function(err, db) {
 		let dbo = db.db(gba);
		dbo.collection('users').find({username}).toArray((err,res)=>{
			if(res.length < 1){
				db.close();
				callback({success:false});
				return
			}
			if(res[0].password == password){
				db.close();
				let sessionID = sha256(String(Math.random()*Math.random()));
				res[0].sessions.push(sessionID);
				res[0].sessionTimes.push(Date.now() + settings.tokenTimeout);
				addSession(res[0],()=>{
					callback({
						success: true,
						sessionID 
					});
					return;
				});
			} else {
				db.close();
				callback(false);
				return;
			}
		});
	});
};

module.exports.userExists = (username,callback)=>{
	MongoClient.connect(url, function(err, db) {
 		let dbo = db.db(gba);
		dbo.collection('users').find({username}).toArray((err,res)=>{
			db.close();
			callback(res.length !== 0);
			return;
		});	
	});
};

module.exports.validSession = (username,sessionID,callback)=>{
	MongoClient.connect(url, function(err, db) {
 		let dbo = db.db(gba);
		dbo.collection('users').find({username}).toArray((err,res)=>{
			db.close();
			if(res.length < 1){
				callback(false);
				return;
			}
			//console.log(`wow ${JSON.stringify(res)} ok so heres ${res.sessions}`);
			let sessionIndex = res[0].sessions.indexOf(sessionID)
			if(sessionIndex === -1){
				callback(false);
				return;
			}
			if(res[0].sessionTimes[sessionIndex] < Date.now()){
				res[0].sessions.splice(sessionIndex,1);
				res[0].sessionTimes.splice(sessionIndex,1);
				addSession(res[0], ()=>{
					callback(false);
					return;
				});
			} else {
				callback(res[0].sessions.includes(sessionID));
				return;
			}
		});	
	})

};
module.exports.addUser = (user)=> {MongoClient.connect(url, function(err, db) {
	if (err) throw err;
 	let dbo = db.db(gba);
	dbo.collection("users").insertOne(user, function(err, res) {
		if (err) throw err;
		db.close();
	});
	/*dbo.collection('users').find({username:'aaa'}).toArray((err,res)=>{
		console.log(res);
		db.close();
	});*/
	
})};
