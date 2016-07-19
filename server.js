var express = require('express');
var app = express();
var session = require('express-session');
//var http = require('http').Server(app);
//var io = require('socket.io');//(http);
var socketIO = require('socket.io');
var LEX = require('letsencrypt-express');//.testing();
var https = require('http2');
var fs = require('fs');// NEEDED??
var pgp = require("pg-promise")(/*options*/);
var db = pgp(process.env.POSTGRES_CONNECTION_STRING);
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
//var GoogleStrategy = require('passport-google-oauth').OAuthStrategy;
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var sharedsession = require("express-socket.io-session"); // NEEDED??
var jimp = require('jimp');
var bcrypt = require('bcrypt');
var path = require('path');
var multer = require('multer');
var crypto = require('crypto');
var helmet = require('helmet'); // Security
//var nodemailer = require('nodemailer'); INSTALL PACKAGE

app.use(helmet());

// Lets Encrypt
'use strict';

/* Note: using staging server url, remove .testing() for production
Using .testing() will overwrite the debug flag with true */ 


// Change these two lines!
var DOMAIN = 'polycule.co.uk';
var EMAIL = 'sarah@polycule.co.uk';

var lex = LEX.create({
  configDir: require('os').homedir() + '/letsencrypt/etc'
, approveRegistration: function (hostname, approve) { // leave `null` to disable automatic registration
    if (hostname === DOMAIN) { // Or check a database or list of allowed domains
      approve(null, {
        domains: [DOMAIN]
      , email: EMAIL
      , agreeTos: true
      });
    }
  }
});

var server = https.createServer(lex.httpsOptions, LEX.createAcmeResponder(lex, app));
server.listen(process.env.PORT);

var io = socketIO.listen(server);
//var server = https.createServer(lex.httpsOptions, LEX.createAcmeResponder(lex, app));
//server.listen(process.env.PORT);
// ----------------------

console.log(process.env.PORT);

app.set('view engine', 'pug');


var storage = multer.diskStorage({
  destination: './public/photos/original/',
  filename: function (req, file, cb) {
    crypto.pseudoRandomBytes(16, function (err, raw) {
      if (err) return cb(err)
      cb(null, raw.toString('hex') + path.extname(file.originalname))
    })
  }
})

var upload = multer({ storage: storage })



app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
})); 

// For Photo Editing ==================================
var profilePicEdit = function(photo, facebookid, x1, y1, x2, y2) {
console.log("Image coords: ("+x1+", "+y1+", "+x2+", "+y2+")");
	if (facebookid) {
		jimp.read(photo).then(function(image) {
			image.write('./public/photos/original/'+facebookid+".jpg");
			image.resize(225, 225).quality(100).write('./public/photos/final/'+facebookid+".jpg", function(err) { console.log(err); });
			console.log("Image read facebook");
		}).catch(function (err) {
			console.log(err);
		});
	} else {
		jimp.read("./public/photos/original/"+photo).then(function(image) {
			image.scaleToFit(540, 1000).crop(x1, y1, x2-x1, y2-y1).resize(225, 225).quality(100).write('./public/photos/final/'+photo, function(err) { console.log(err); });
			console.log("Image read other photo");
		}).catch(function (err) {
			console.log(err);
		});
	}
};


// LOCAL LOGIN STRATEGY ===============================
passport.use(new LocalStrategy(

  function(username, password, done) {

    return db.one("SELECT id, username, hash FROM settings WHERE username=$1", [username])
      .then(function(user) {
		
		bcrypt.compare(password, user.hash, function(err, comparison) {
            if (comparison) {
                return done(null, user);
            } else {
                return done(null, false, {message: "Incorrect password"});
            }
        });

      })
      .catch(function(err) {
        console.log(err);
        return done(null, false, {message:'Incorrect username'});
      });
}));


passport.serializeUser((user, done)=>{
    done(null, user.id);
  });

passport.deserializeUser((id, done)=>{
    db.one("SELECT id, username FROM settings WHERE id = $1", [id])
    .then(function(user) {
      done(null, user);
    })
    .catch(function(err) {
      console.log(err);
      done(new Error("User does not exist"));
    })
  });
 
 
// FACEBOOK LOGIN STRATEGY ===================================== 
passport.use('facebook', new FacebookStrategy({
		clientID        : process.env.FACEBOOK_ID,
		clientSecret    : process.env.FACEBOOK_SECRET,
		callbackURL     : 'https://polycule.co.uk/login/facebook/callback',
		profileFields	  : ['id', 'name', 'emails', 'location', 'picture.width(225)'],
		passReqToCallback: true
	},  

	// facebook will send back the tokens and profile
	function(req, access_token, refresh_token, profile, done) {
		// asynchronous
		process.nextTick(function() {
			// find the user in the database based on their facebook id
			db.one("SELECT id, facebookid FROM settings WHERE facebookid="+profile.id)
				.then(function(user) {
					return done(null, user);        		
				})
				.catch(function(err) {
					console.log(err);
				
					req.session.facebookid = profile.id;
					req.session.displayName = profile.name.givenName;
					req.session.email = profile.emails[0].value;
					req.session.location = profile.location;
					req.session.profilePic = profile.photos[0].value;
				
					return done(null, false, {message:'No facebook message'});
				});
    	});
	})
);
      


// SESSIONS ==========================================
app.use(cookieParser());
var sessionMiddleware = session({
    name: 'sessionId',
    secret: '1234567890QWERTY',
    resave: true,
    saveUninitialized: true
    });
    

io.use(function(socket, next) {
    sessionMiddleware(socket.request, socket.request.res, next);
});

app.use(sessionMiddleware);


app.use(passport.initialize());
app.use(passport.session());

app.use(express.static('public'));

// Send login page =====================================
app.get('/login', function(req, res){
  res.sendFile(__dirname+'/login.html'); 
});

// Login verification
app.post('/login', passport.authenticate('local', { failureRedirect: '/login'}),

    function(req, res){
        console.log("Username: "+req.body.username+" id: "+ req.session.passport.user);
        res.redirect('/');
});


// route for facebook authentication and login
// different scopes while logging in

app.get('/login/facebook', 
  passport.authenticate('facebook', { scope : ['email', 'user_location'] }
));


 
// handle the callback after facebook has authenticated the user
app.get('/login/facebook/callback',
  passport.authenticate('facebook', {
    successRedirect : '/',
    failureRedirect : '/signup/facebook'
  })
);


// Send signup screen
app.get('/signup', function(req, res) {
    res.render('signup', {googlemapsapi: process.env.GOOGLE_MAPS_URL, usernameBorderColor: "border: 1px solid gray", messageemail: "checked", linkemail: "checked"});
});

// Process signup request
app.post('/signup', upload.single('profilePic'), function (req, res, next) {

	if (req.body.photoType === 'custom' && req.file) { 
		profilePicEdit(req.file.filename, facebookid=null, x1=parseInt(req.body.x1), y1=parseInt(req.body.y1), x2=parseInt(req.body.x2), y2=parseInt(req.body.y2));
		var photourl = req.file.filename; 
	} else {
		var photourl = null;
	}

	bcrypt.hash(req.body.password, 10, function(err, hash) {

		if (req.body.messageemail == "on") { var messageemail = true; } else { var messageemail = false; }
		if (req.body.linkemail == "on") { var linkemail = true; } else { var linkemail = false; }
		var newNode = {"username": req.body.username, "name": req.body.displayName, "location": req.body.location, "description": req.body.description, "photo": photourl, "photocoords": {"x1": parseInt(req.body.x1), "y1": parseInt(req.body.y1), "x2": parseInt(req.body.x2), "y2": parseInt(req.body.y2)}, "member": 1, "email": req.body.email, "messageemail": messageemail, "linkemail": linkemail, "hash": hash};
		db.one("INSERT INTO nodes (name, username, location, description, photo, photocoords, member) VALUES (${name}, ${username}, ${location}, ${description}, ${photo}, ${photocoords}, ${member}) returning id ", newNode)
			.then(function(user) {
				newNode.id = user.id;
				db.one("INSERT INTO settings (id, username, email, messageemail, linkemail, hash) VALUES (${id}, ${username}, ${email}, ${messageemail}, ${linkemail}, ${hash}) returning id", newNode)
				.then(function(user) {
					//updateNodes(); SORT THIS OUT!!!
					// Log user in after signup
					req.login(user, function (err) {
						if ( ! err ){
							res.redirect('/');
						} else {
							console.log(err);//handle error
						}
					})	
				})
				.catch(function(err) {
					if (err.code === '23505') {
						res.render('signup', { error: "That username is already taken", username: req.body.username, displayName: req.body.displayName, email: req.body.email, location: req.body.location, description: req.body.description, messageemail: req.body.messageemail, linkemail: req.body.linkemail, profilePic: req.session.profilePic, usernameBorderColor: "border: 1px solid red"});
					} else {
					    console.log(err);					
					}
				}); 				
			})
			.catch(function(err) {
				if (err.code === '23505') {
					res.render('signup', { error: "That username is already taken", username: req.body.username, displayName: req.body.displayName, email: req.body.email, location: req.body.location, description: req.body.description,  messageemail: req.body.messageemail, linkemail: req.body.linkemail, profilePic: req.session.profilePic, usernameBorderColor: "border: 1px solid red"});
				} else {
				    console.log(err);
				}
			});
	});
});



// Facebook Signup
app.get('/signup/facebook', function(req, res) {
    res.render('facebookSignup', { facebookid: req.session.facebookid, username: req.session.username, displayName: req.session.displayName, email: req.session.email, location: req.session.location, messageemail: "checked", linkemail: "checked", profilePic: req.session.profilePic});
});

// Process facebook signup request
app.post('/signup/facebook', upload.single('profilePic'), function (req, res, next) {

	if (req.body.photoType === 'facebook') {
		profilePicEdit(req.session.profilePic, facebookid=req.session.facebookid);
		var photourl = req.session.facebookid+".jpg";
	} else if (req.body.photoType === 'custom' && req.file) { 
		profilePicEdit(req.file.filename, x1=parseInt(req.body.x1), y1=parseInt(req.body.y1), x2=parseInt(req.body.x2), y2=parseInt(req.body.y2));
		var photourl = req.file.filename; 
	} else {
		var photourl = null;
	}

	if (req.body.messageemail == "on") { var messageemail = true; } else { var messageemail = false; }
	if (req.body.linkemail == "on") { var linkemail = true; } else { var linkemail = false; }
	var newNode = {"username": req.body.username, "name": req.body.displayName, "location": req.body.location, "description": req.body.description, "photo": photourl, "photocoords": {"x1": parseInt(req.body.x1), "y1": parseInt(req.body.y1), "x2": parseInt(req.body.x2), "y2": parseInt(req.body.y2)}, "member": 1, "email": req.body.email, "messageemail": messageemail, "linkemail": linkemail, "facebookid": req.session.facebookid};
	db.one("INSERT INTO nodes (name, username, location, description, photo, photocoords, member) VALUES (${name}, ${username}, ${location}, ${description}, ${photo}, ${photocoords}, ${member}) returning id ", newNode)
		.then(function(user) {
			newNode.id = user.id;
			db.one("INSERT INTO settings (id, username, email, messageemail, linkemail, facebookid) VALUES (${id}, ${username}, ${email}, ${messageemail}, ${linkemail}, ${facebookid}) returning id", newNode)
			.then(function(user) {
				//updateNodes(); SORT THIS OUT!!!
				// Log user in after signup
				req.login(user, function (err) {
					if ( ! err ){
						res.redirect('/');
					} else {
						console.log(err);//handle error
					}
				})	
			})
			.catch(function(err) {
				if (err.code === '23505') {
					res.render('facebookSignup', { error: "That username is already taken", facebookid: req.session.facebookid, username: req.body.username, displayName: req.body.displayName, email: req.body.email, location: req.body.location1, description: req.body.description, messageemail: req.body.messageemail, linkemail: req.body.linkemail, profilePic: req.session.profilePic});
				} else {
				    console.log(err);
				}
			}); 				
		})
		.catch(function(err) {
			if (err.code === '23505') {
				res.render('facebookSignup', { error: "That username is already taken", facebookid: req.session.facebookid, username: req.body.username, displayName: req.body.displayName, email: req.body.email, location: req.body.location, description: req.body.description, messageemail: req.body.messageemail, linkemail: req.body.linkemail, profilePic: req.session.profilePic});
			} else {
			    console.log(err);
			}
		});
});



app.get('/', function (req, res) {

   if (req.isAuthenticated()) {
       res.sendFile(__dirname+'/index.html');
   } else {
       res.redirect('/login');
		// I love you hunny beast
   }
});

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

io.sockets.on('connection', function(socket){
  console.log('a user connected');
   
   // Initial data request (WORKING)
   socket.on('dataRequest', function() {
       console.log("Data Request received");
	   db.any("SELECT * FROM nodes ORDER BY id", [true]).then(function(nodes) { 
		   db.any("SELECT * FROM links WHERE confirmed = 1 OR sourceid = "+socket.request.session.passport.user+" OR targetid = "+socket.request.session.passport.user+" ORDER BY id", [true]).then(function(links) { //filter unconfirmed links which are not relevant to current user
			  db.any("SELECT * FROM emails WHERE (recip = "+socket.request.session.passport.user+" AND delrecip = 0) OR (sender = "+socket.request.session.passport.user+" AND delsender = 0) ORDER BY id", [true]).then(function(emails) { 
				 db.one("SELECT id, username, email, messageemail, linkemail, facebookid FROM settings WHERE id = "+socket.request.session.passport.user, [true]).then(function(settings) { 		  
						var nodesAndLinks = {"nodes": nodes, "links": links, "emails": emails, "settings": settings, "userid": socket.request.session.passport.user};
						io.emit('nodesAndLinks', nodesAndLinks);
				
					}).catch(function (error) {  console.log("ERROR:", error); });
				}).catch(function (error) {  console.log("ERROR:", error); });
			}).catch(function (error1) {  console.log("ERROR:", error1); });
		}).catch(function (error2) {  console.log("ERROR:", error2); });
  	
  	});
  	
  	function updateLinks() {
  	    db.any("SELECT * FROM links WHERE confirmed = 1 OR sourceid = "+socket.request.session.passport.user+" OR targetid = "+socket.request.session.passport.user+" ORDER BY id", [true]).then(function(links) { //filter unconfirmed links which are not relevant to current user
			io.emit('linksUpdate', links);
			console.log("Updated link data sent");		
	    }).catch(function (error) {  console.log("ERROR:", error); });
	}
	
	function updateNodes() {
  	    db.any("SELECT * FROM nodes ORDER BY id", [true]).then(function(nodes) { 
			io.emit('nodesUpdate', nodes);
			console.log("Updated node data sent");		
	    }).catch(function (error) {  console.log("ERROR:", error); });
	}
	
	function updateNodesLinks() {
	    db.any("SELECT * FROM nodes ORDER BY id", [true]).then(function(nodes) { 
		   db.any("SELECT * FROM links WHERE confirmed = 1 OR sourceid = "+socket.request.session.passport.user+" OR targetid = "+socket.request.session.passport.user+" ORDER BY id", [true]).then(function(links) { //filter unconfirmed links which are not relevant to current user
		  
				var nodesLinksUpdate = {"nodes": nodes, "links": links};
				io.emit('nodesLinksUpdate', nodesLinksUpdate);
				
			}).catch(function (error) {  console.log("ERROR:", error); });
		}).catch(function (error) {  console.log("ERROR:", error); });
	}
	
	function updateSettings() {
		db.one("SELECT id, username, email, messageemail, linkemail, facebookid FROM settings WHERE id = "+socket.request.session.passport.user, [true]).then(function(settings) { 

			io.emit('settingsUpdate', settings);
				
		}).catch(function (error) {  console.log("ERROR:", error); });
	}
	
	function updateEmails() {  
	  
	  db.any("SELECT * FROM emails WHERE (recip = "+socket.request.session.passport.user+" AND delrecip = 0) OR (sender = "+socket.request.session.passport.user+" AND delsender = 0) ORDER BY id", [true]).then(function(emailUpdate) { 

			io.emit('emailUpdate', emailUpdate);
	
		}).catch(function (error) {  console.log("ERROR:", error); });
		
	}
	
	/*
	function blankNodes() {
	
		   db.any("SELECT id FROM nodes ORDER BY id", [true]).then(function(nodes) { 
		       db.any("SELECT id, sourceid, targetid FROM links WHERE confirmed = 1 ORDER BY id", [true]).then(function(links) {
		       
		       	     var blankNodes = {"nodes": nodes, "links": links};
				     io.emit('blankNodes', blankNodes);
				
			   }).catch(function (error) {  console.log("ERROR:", error); });
		   }).catch(function (error) {  console.log("ERROR:", error); });
		   
	}
	*/
  	
  	// New email received
  	 socket.on('newEmail', function(newEmail) {
  	
  	      console.log("Email received");
  	    
  	      db.query("INSERT INTO emails (id, recip, sender, read, delrecip, delsender, content) VALUES (DEFAULT, ${recip}, ${sender}, ${read}, ${delrecip}, ${delsender}, ${content}) returning id, recip, sender", newEmail)
			.then(function(email) {
                console.log("Email added to database");
                
                // Emit updated email data
                if (socket.request.session.passport.user == email[0].recip || socket.request.session.passport.user == email[0].sender) {
                    updateEmails();
                }

            })
            .catch(function (error) {
                console.log(error);
            });
  	    
  	      
  	
  	});
  	
  	// Email read
  	socket.on('emailRead', function(recip, sender) {
  	
  	  	// Update database
  	    db.query("UPDATE emails SET read = 1 WHERE recip = "+recip+" AND sender = "+sender+" returning id, recip, sender")
  	      	.then(function (updatedEmail) {
                console.log("Email updated as read");
                
                // Emit updated email data
                if (socket.request.session.passport.user == updatedEmail[0].recip || socket.request.session.passport.user == updatedEmail[0].sender) {
                    updateEmails();
                }

            })
            .catch(function (error) {
                 console.log(error);
            });
  	
  	});
  	
  	// Email deleted
  	socket.on('threadDelete', function(user1, user2) {
  	  	  	
  	  	// Update database
  	    db.query("UPDATE emails SET delrecip = 1 WHERE recip = "+user1+" AND sender = "+user2)
  	      	.then(function () {
                console.log("Email set deleted by recip");
                
					db.query("UPDATE emails SET delsender = 1 WHERE recip = "+user2+" AND sender = "+user1)
						.then(function () {
							console.log("Email set deleted by sender");
							
							if (socket.request.session.passport.user === user1 || socket.request.session.passport.user === user2) {
							    updateEmails();
							}
							
						})
						.catch(function (error) {
							console.log(error);
						});
                
            })
            .catch(function (error) {
                console.log(error);
            });
  	});
  	
  	// Link Confirmed
  	socket.on("linkConfirm", function(id) {
  	
  	    console.log("Link confirmation received");
  	
  	    // Update database
  	    db.query("UPDATE links SET confirmed = 1 WHERE id = "+id)
  	      	.then(function () {
                console.log("Link confirmed");
                updateLinks(); // Transmit updated data
            })
            .catch(function (error) {
                 console.log(error);
            });
  	
  	});
  	
  	// Link Deleted / Confirmation denied
	socket.on("linkDelete", function(id) {
  	
  	    console.log("Link delete received");
  	    
  	    //var linkSource = ???
  	
  	    // Update database
  	    db.query("DELETE from links WHERE id = "+id)
  	      	.then(function () {
                console.log("Link deleted");
                
                // TO BE ADDED - Delete group 0 nodes with no links
                
                
                updateLinks();  // Transmit updated data
                
            })
            .catch(function (error) {
                 console.log(error);
            });
            
  	});
  	
  	// Link added
  	socket.on("newLink", function(newLink) {
  	
  	    console.log("New link received");
  	
  	    // Update database
  	    db.query("INSERT INTO links (sourceid, targetid, confirmed, requestor) VALUES (${sourceid}, ${targetid}, ${confirmed}, ${requestor}) returning id, sourceid, targetid, confirmed", newLink)
  	      	.then(function (id) {
                console.log("New link added to database. Id: "+id);
                if (id[0].confirmed === 1 || id[0].sourceid === socket.request.session.passport.user || id[0].targetid === socket.request.session.passport.user) {
                    updateLinks(); // Transmit updated data
                }
            })
            .catch(function (error) {
                 console.log(error);
            });
  	
  	});
  	
  	// Link details updated
  	socket.on('linkEdit', function(linkEdits) {
  	
  	  // Update database
  	    db.query('UPDATE links SET (startmonth, startyear) = (${startmonth}, ${startyear}) WHERE id = ${id}', linkEdits)
  	      	.then(function () {
                console.log("Link updated");
                updateLinks();
            })
            .catch(function (error) {
                 console.log(error);
            });
  	
  	});
  	
  	// Node deleted (NOT TESTED)
  	socket.on("nodeDelete", function() {
  	
  	    console.log("Node delete received");
  	
  	    db.query("DELETE FROM links WHERE sourceid = "+socket.request.session.passport.user+" OR targetid = "+socket.request.session.passport.user)
  	        .then(function () {

				db.query("DELETE from nodes WHERE id = "+socket.request.session.passport.user)
					.then(function () {

						db.query("DELETE from settings WHERE id = "+socket.request.session.passport.user)
							.then(function () {
                                console.log("Member deleted");
                                updateNodesLinks();
                                
                                // REMOVE ANY FLOATING NON-USER NODES

							})
							.catch(function (error) {
								 console.log(error);
							});
					})
					.catch(function (error) {
						 console.log(error);
					});
            })
            .catch(function (error) {
                 console.log(error);
            });
  	});

  	
  	// Node added
  	socket.on('newNode', function(newNode) {
  	
		console.log("New node received");
		console.log(JSON.stringify(newNode));
  	
  	    // Update database with new node
  	    db.query("INSERT INTO nodes (name, member, invited) VALUES (${name}, ${member}, ${invited}) returning id", newNode)
  	      	.then(function (id) {
                console.log("Node added to database: "+id[0].id);
                
                newLink = {"sourceid": newNode.sourceid, "targetid": id[0].id, "confirmed": 1};
                
                // Update database with new link
                db.query("INSERT INTO links (sourceid, targetid, confirmed) VALUES (${sourceid}, ${targetid}, ${confirmed}) returning id", newLink)
  	      	        .then(function (id) {
                        console.log("New link added to database. Id: "+id);
						updateNodesLinks();
                        
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
                
            })
            .catch(function (error) {
                 console.log(error);
            });
  	
  	});
  	
  	// Node info updated
  	socket.on('nodeEdit', function(nodeEdits) {
  	  	db.query('UPDATE nodes SET (name, location, description) = (${name}, ${location}, ${description}) WHERE id = ${id}', nodeEdits)
  	      	.then(function () {
                console.log("Node updated");
                updateNodes();
            })
            .catch(function (error) {
                 console.log(error);
            });
  	    
  	
  	});
  	
  	// Node invited
  	socket.on('nodeInvited', function(node) {
  	
  	    console.log("Node invite update received");
  	
  	    // Update database
  	    db.query("UPDATE nodes SET invited = 1 WHERE id = "+node.id)
  	      	.then(function () {
  	      	  	db.query("INSERT INTO invited (id, email) VALUES (${id}, ${email})", node)
  	      	        .then(function () {
                         console.log("Node invite updated");
                         updateNodes();
					})
					.catch(function (error) {
						 console.log(error);
					});
            })
            .catch(function (error) {
                 console.log(error);
            });
  	
  	});
  	
  	// Settings updated
  	socket.on('settingsEdit', function(settings) {
  	
  	    console.log('Updated settings received');
  	    
  	    // Update database
  	    db.query("UPDATE settings SET (email, messageemail, linkemail) = (${email}, ${messageemail}, ${linkemail}) WHERE id = ${id} returning id", settings)
  	      	.then(function (id) {
                console.log("Settings updated");
                if (id[0].id === socket.request.session.passport.user) { updateSettings(); }
            })
            .catch(function (error) {
                 console.log(error);
            });
  	
  	});
  	
  	// Password changed
  	socket.on('newPassword', function(passwords) {
  	
  	    console.log("Password change request received");
  	
  	    // Check old password
  	    return db.one("SELECT id, username, hash FROM settings WHERE id=$1", [passwords.id])
         .then(function(user) {
		
		        bcrypt.compare(passwords.oldPassword, user.hash, function(err, comparison) {
                    if (comparison) {
                        // Create password hash and save to database
                        bcrypt.hash(passwords.newPassword, 10, function(err, hash) {
                            db.query("UPDATE settings SET (hash) = (${hash}) WHERE id=${id} returning id", {"hash":hash, "id":passwords.id})
                                .then(function(user) {
                                    console.log("password updated");
                                  	socket.emit('passwordUpdated');    
                                })
                                .catch(function(err) {
                                    console.log(err);
                                });
                        });

                    } else {
                        socket.emit('incorrectPassword');//What to do if old password is incorrect?
                    }
                });
		  })
		  .catch(function(err) {
			console.log(err);
		  });
  	});
  	
  	socket.on('usernameEdit', function(newUsername) {
  	    console.log('Username change requested received');
  	    db.query("UPDATE settings SET (username) = (${username}) WHERE id = ${id} returning *", newUsername)
  	        .then(function(user) {
  	          	db.query("UPDATE nodes SET (username) = (${username}) WHERE id = ${id} returning *", user[0])
  	                 .then(function(user1) {
  	                     socket.emit('usernameEditOK', user[0]);
  	                     updateNodes();
  	                     console.log('Username updated');
  	                 })
  	                 .catch(function(err) {
  	                     console.log(err);
  	                 });

  	        })
  	        .catch( function(err) {
  	            console.log(err);
  	            if (err.code === '23505') {
  	                socket.emit('usernameTaken');// Let user know username is taken
  	            }
  	        });
  	});
  	
  	
    socket.on('disconnect', function(){
        console.log("User disconnected");	
        //req.logout();
        //var xhr = new XMLHttpRequest();      
        //xhr.open("GET", "/logout");
        //xhr.send();
        //user.logout();
    });

});


//http.listen(process.env.PORT, function(){
//  console.log('listening on *:' + process.env.PORT);
//});

//lex.listen([80], [443, 5001], function () {
//  console.log("ENCRYPT __ALL__ THE DOMAINS!");
//});
