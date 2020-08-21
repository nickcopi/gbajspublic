const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const basicAuth = require('express-basic-auth');
const cookieParser = require('cookie-parser'); //express is featureless
const hbs = require('hbs');
const sha256 = require('js-sha256');

const settings = require('./settings');
const db = require('./db');
const regex = require('./xss');
const port = process.env.PORT || 3020;
let app = express();
db.init();
const guestPages = ['/login','/register','/resources/main.css'];
const userPages = ['/userdata/'];
hbs.registerPartials(`${__dirname}/views/partials`);
app.set('viewEngine','hbs');

app.use(cookieParser());
app.use((req,res,next)=>{
	//next();
	//return;
	if(guestPages.includes(req._parsedUrl.path)){
		next();
		return;
	}
	if(req.cookies.sessionID){
		db.validSession(req.cookies.username,req.cookies.sessionID,(valid)=>{
			if(valid) {
				next();
				return;
			} else {
				res.redirect('/login');
			}
		});
	} else {
		res.redirect('/login');
	}
});
app.use((req,res,next)=>{
	if(req._parsedUrl.path.indexOf('/userdata') > -1){
		let user = req._parsedUrl.path.substring(10,10+req.cookies.username.length);
		db.validSession(user,req.cookies.sessionID,(valid)=>{
			if(!valid) return;
			next();
		});
	//	console.log(req._parsedUrl.path.substring(10,10+req.cookies.username.length-1));
	} else {
		next();
	}
});
app.use(bodyParser.json({limit: '5mb'}));
app.use(bodyParser.urlencoded({extended:true}));
app.use((req,res,next)=>{
	let now = new Date().toString();
	let log = `${now} ${req.url} ${req.method} by ${req.headers['x-forwarded-for'] || req.connection.remoteAddress}`;
	fs.appendFile('server.log',log + '\n', (err)=>{
		if(err){
			console.log('Unable to append to file!');
		}
	});
	next();
});
app.use(express.static(`${__dirname}/public`));
app.listen(port,()=>{
	  console.log(`Listening on port ${port}`);
});

app.get('/',(err,res)=>{
	res.render('index.hbs');
});
app.post('/saves',(req,res)=>{
	if(!req.body) return;
	req.body.slot = Math.round(req.body.slot);
	if(isNaN(req.body.slot) || req.body.slot > 9 || req.body.slot < -1){
		res.send({error:'Bad slot!'});
		return;
	}
	fs.readdir('public/games', (err,files)=>{
		if(!files.includes(req.body.game)){
			res.send({error:'Bad game!'});
			return;
		}
		fs.stat(`public/userdata/${req.cookies.username}/saves/${req.body.game}`,(err,stats)=>{
			if(err) fs.mkdirSync(`public/userdata/${req.cookies.username}/saves/${req.body.game}`);
			fs.writeFile(`public/userdata/${req.cookies.username}/saves/${req.body.game}/${req.body.slot}`,req.body.data,(err)=>{
				if(err){
					res.send({error:'File write failed!'});
					return;
				}
				res.send({success:true});
			});
		});
	});
	
});
app.get('/gamelist',(req,res)=>{ //dynamically generate list of games
	fs.readdir('public/games', (err,files)=>{
		res.send(files);
	});
});
app.get('/change_password',(req,res)=>{
	res.render('changepassword.hbs',{
		display:"none",
	});

});
app.post('/change_password',(req,res)=>{
	if(!req.body.pass1 || !req.body.pass2 || req.body.pass1 !== req.body.pass2){
		res.render('changepassword.hbs',{
			display:"block",
			error:"New passwords don't match!",
			password:req.body.password,
		});
		return;
	}
	db.passMatch(req.cookies.username,sha256(req.body.password),(match,user)=>{
		//hey so add a thing in the db file that does this 
		if(!match){
			res.render('changepassword.hbs',{
				display:"block",
				error:"Current password wrong!",
				pass1:req.body.pass1,
				pass2:req.body.pass2
			});
			return;
		}
		user.password = sha256(req.body.pass1);
		db.changePass(user,()=>{
			res.render('changepassword.hbs',{
				display:"block",
				error:"Password updated!",
			});
			return;

		});
		//now add the new password
		console.log(match);
	});
});
app.get('/login',(req,res)=>{
	res.render('login.hbs',{
		display:"none",
	});

});

app.post('/login',(req,res)=>{
	if(req.body.username && req.body.password){
		db.login(req.body.username, sha256(req.body.password),(result)=>{
			if(!result.success){
				res.render('login.hbs',{
					display:"block",
					error:"Invalid username or password!"
				});
			} else {
				res.cookie('username',req.body.username,{ maxAge: Number.MAX_SAFE_INTEGER });
				res.cookie('sessionID',result.sessionID,{ maxAge: Number.MAX_SAFE_INTEGER });
				res.redirect('/');
			}
		});
	} else {
		res.render('login.hbs',{
			display:"block",
			error:"Enter a username and password!"
		});
	}
});
app.get('/register',(req,res)=>{
	res.render('register.hbs',{
		display:"none",
	});
});
app.post('/register',(req,res)=>{
	if(settings.registerLock){
		res.render('register.hbs',{
			display:"block",
			error:"Registration disabled!"
		});
		return;
	}
	if(!req.body.pass1 || !req.body.pass2 || req.body.pass1 !== req.body.pass2){
		res.render('register.hbs',{
			display:"block",
			error:"Passwords don't match!",
			username:req.body.username,
			email:req.body.email
		});
		return;
	}
	if(!req.body.email || !regex.email.test(req.body.email)){
		res.render('register.hbs',{
			display:"block",
			error:"Invalid Email!",
			pass1:req.body.pass1,
			pass2:req.body.pass2,
			username:req.body.username
		});
		return;
	}
	if(!req.body.username || regex.xss.test(req.body.username)){
		res.render('register.hbs',{
			display:"block",
			error:"Invalid Username!",
			pass1:req.body.pass1,
			pass2:req.body.pass2,
			email:req.body.email
		});
		return;
	}
	db.userExists(req.body.username,(exists)=>{
		if(exists) {
			res.render('register.hbs',{
				display:"block",
				error:"Username Taken!",
				pass1:req.body.pass1,
				pass2:req.body.pass2,
				email:req.body.email
			});
			return;
		}
		let sessionID = sha256(String(Math.random()*Math.random()));
		db.addUser({
			username:req.body.username,
			password:sha256(req.body.pass1),
			email: req.body.email,
			sessions:[sessionID],
			sessionTimes:[Date.now() + settings.tokenTimeout]
		});

		fs.mkdirSync(`public/userdata/${req.body.username}`);
		fs.mkdirSync(`public/userdata/${req.body.username}/saves`);
		res.cookie('username',req.body.username,{ maxAge: Number.MAX_SAFE_INTEGER });
		res.cookie('sessionID',sessionID,{ maxAge: Number.MAX_SAFE_INTEGER });
		res.redirect('/');
	});
});
app.get('/savelist',(req,res)=>{ //dynamically generate list of saves
	fs.readdir('public/games', (err,files)=>{
		if(!files.includes(req.query.game)){
			res.send([]);
			console.log('hax');
			return;
		}
		fs.readdir(`public/userdata/${req.cookies.username}/saves/${req.query.game}`, (err,saves)=>{
			if(err) {
				res.send([]);
				return;
			}
			res.send(saves);
		});
	});
	
});
