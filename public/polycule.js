// Detect mobile user
if (/Android|webOS|iPhone|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent)) { // iPad removed
    var mobileUser = true;
} else {
    var mobileUser = false;
}


// Open websocket connection
var socket = io();

// Get width and height of SVG as displayed, so that force layout can use them
var width = document.getElementById('mainsvg').getBoundingClientRect().width;
var height = document.getElementById('mainsvg').getBoundingClientRect().height;

// function for searching datasets by id
function arrayObjectIndexOf(myArray, searchTerm, property) {
    for(var i = 0, len = myArray.length; i < len; i++) {
        if (myArray[i][property] === searchTerm) return i;
    }
    return -1;
}

// Request data from server
socket.emit('dataRequest'); 

// On receiving data from the server, build visualisation
socket.on('nodesAndLinks', function(dataPackage) { 

    // Node index of current user
    var loggedin = dataPackage.userid;
    
    var active_node = loggedin;	  // Set active node to the current user on login
    var active_link = null;
    var connect1 = null;
	
	var emails = dataPackage.emails;
	var settings = dataPackage.settings;
	var nodes = dataPackage.nodes;
	var links = dataPackage.links;
	
	// Function for sorting emails into threads and finding most recent message in the thread
	function emailThreader() {
	    // Create thread number
	    emails = emails.map(function(d) { 
	        if (d.recip === loggedin) { d.thread = d.sender;} else { d.thread = d.recip; }
	        if (nodes[arrayObjectIndexOf(nodes, d.thread, "id")]) { 
	            d.threadName = nodes[arrayObjectIndexOf(nodes, d.thread, "id")].name; 
	            d.threadUsername = nodes[arrayObjectIndexOf(nodes, d.thread, "id")].username; 
	        } else { 
	            d.threadName = "Old User";
	            d.threadUsername = ""; 
	        }
	        if (nodes[arrayObjectIndexOf(nodes, d.sender, "id")]) { 
	            d.senderName = nodes[arrayObjectIndexOf(nodes, d.sender, "id")].name;
	        } else {
	            d.senderName = "Old User";
	        }
	        d.fromServer = 1; // To flag messages that have reached server to distinguish from new ones written by user
	        return d;
	    }); 	    
	    // Create indicator for most recent message in thread
	    var threads = [];
		var i;
		for (i=emails.length-1; i>=0; i--) {			
			if (threads.indexOf(emails[i].thread) === -1) { 
				threads.push(emails[i].thread);
				emails[i].latest = 1;
				if (emails[i].read === 0 && emails[i].recip === loggedin) { emails[i].newFlag = 1; } else {emails[i].newFlag = 0; }
			} else { 
				emails[i].latest = 0;
				emails[i].newFlag = 0;
			}
		}
	}
	emailThreader();
	
    // Function for creating source and target variables in links dataset for use with force layout
    var getLinkSource = function() {
        for (i=0; i<links.length; i++) {
            links[i].source = arrayObjectIndexOf(nodes, links[i].sourceid, "id");
            links[i].target = arrayObjectIndexOf(nodes, links[i].targetid, "id");
        }
    }
    getLinkSource();
    
    // Get link requests from links dataset and check for links
    var getLinkRequests = function() {
        // Collect unconfirmed links which are not requested by current user, for link request folder
        linkRequests = links.filter(function(d) { return d.confirmed === 0 && d.requestor !== loggedin; });
        linkRequests.map(function(d) { d.requestorname = nodes[arrayObjectIndexOf(nodes, d.requestor, "id")].name; d.requestorusername = nodes[arrayObjectIndexOf(nodes, d.requestor, "id")].username;});        
        if (viewModel) { viewModel.linkRequests(linkRequests); }
    };
    getLinkRequests();
    // ===================================================================================
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var month = d3.select("#editStartMonth");
    var year = d3.select("#editStartYear");
    
	for (m=0; m<12; m++) {
		month.append("option")
			.text(months[m])
			.attr("value", m);
			//.attr("selected", function() { if (m === parseInt(links[linkIndex].startmonth)) { return "selected"; } else { return null; } });
	}
	
	var thisYear = new Date().getFullYear();
		
	for (y=thisYear; y>=1900; y--) {
		year.append("option")
			.text(y)
			.attr("value", y);
			//.attr("selected", function() { if (y === parseInt(links[linkIndex].startyear)) { return "selected"; } else { return null; } });
	}
	
	var locationInput = document.getElementById('editLocation');
    var autocomplete = new google.maps.places.Autocomplete(locationInput, { types: ['(cities)'], region:'EU' });
    
    var canvas = document.getElementById('canvas1');
	var ctx = canvas.getContext('2d');
	var img1 = document.createElement('img');
	var img2;
	var photoRemove = false;
	
	var emailContainer = document.getElementById("emailContainer");
	
	document.getElementById('photoSelect').value = null;
	
	var el = document.getElementById('photoArea');
	var vanilla = new Croppie(el, {
		viewport: { width: 225, height: 225 },
		boundary: { width: 300, height: 300 }
	});
	d3.select("#photoSelect").on("change", function() {
		var file1    = document.getElementById('photoSelect').files[0];
		var reader1  = new FileReader();
		if (file1) { reader1.readAsDataURL(file1); }
		reader1.addEventListener("load", function () { 
			imgsrc1 = reader1.result;
			vanilla.bind({
				url: imgsrc1
			});   
		});
	});
	
	d3.select("#photoTypeCustom").on("click", function() {
		d3.select("#photoArea").style("display", "inline");
		d3.select("#photoSelect").property("disabled", false);
		vanilla.bind();
	});

	d3.select("#photoTypeNone").on("click",  function() {
		d3.select("#photoArea").style("display", "none");
		d3.select("#photoSelect").property("disabled", true);
	});
	
	var resetPhotoEditor = function() {
		document.getElementById("photoSelect").value = null;
		document.getElementById("photoTypeCustom").checked = true;
		document.getElementById("photoSelect").disabled = false;
		d3.select("#photoArea").style("display", "block");
		document.getElementById("photoSelect").value = null;
		vanilla.bind({ url: null, points: null });
		img2 = null;
	};

    
    // Knockout view model ===============================================================
    function ViewModel(linkData, emailData, nodeData, loggedin, months) {
        var self = this;
        self.user = loggedin;
        self.links = ko.observableArray(links);
        // Link Requests
        self.linkRequests = ko.observableArray(linkData);
        self.confirmLink = function() { 
			socket.emit('linkConfirm', this.id);
		};
		self.denyLink = function() { 
			socket.emit('linkDelete', this.id);
		};
		// Emails
		self.emails = ko.observableArray(emailData);
		self.newEmails = ko.computed(function() {
		    return self.emails().filter(function(d) { return d.newFlag === 1; });
		});
		self.currentThread = ko.observable(0);
        self.currentFolderData = ko.computed(function() { 
            if (self.currentThread() === 0) { return self.emails().filter(function(d) { return d.latest === 1; }).reverse(); }
            else { return self.emails().filter(function(d){ return d.thread === self.currentThread(); }); }
        });
       self.currentThread.subscribe(function() {
           emailContainer.scrollTop = emailContainer.scrollHeight;
        });
        self.openThread = function(thread) {
            socket.emit('emailRead', loggedin, thread.thread);
            self.currentThread(thread.thread);
            emailContainer.scrollTop = emailContainer.scrollHeight;
        };
        self.sendMessage = function() {
            var content = document.getElementById("emailTypeBox").value;
            if (content) {
                var newEmail = {"recip": self.currentThread(), "sender": loggedin, "read": 0, "delrecip": 0, "delsender": 0, "content": content};
			    self.emails.push(newEmail);
			    socket.emit("newEmail", newEmail);
			    document.getElementById("emailTypeBox").value=null;
			    //document.getElementById("emailContainer").scrollTop = document.getElementById("emailContainer").scrollHeight - document.getElementById("emailContainer").innerHeight;
			}
        }
        // To be added: Thread delete option
        //socket.emit('threadDelete', loggedin, thread);
        
        // Settings
        self.settings = ko.observable(settings);
        self.settingsError = ko.observable();
        self.usernameEditing = ko.observable(false);
        self.usernameEditClick = function() {
            if (self.usernameEditing() === false) { 
                self.usernameEditing(true); 
            } else {
				socket.emit('usernameEdit', {"id": loggedin, "username": document.getElementById("newUsername").value});	
				self.settingsError("Saving...");
            }
        };
        self.emailEditing = ko.observable(false);
        self.emailEditClick = function() {
            if (self.emailEditing() === false) {
                self.emailEditing(true);
            } else {
   				var newSettings = settings;
   				newSettings.email = document.getElementById("newEmail").value;
			    socket.emit("settingsEdit", newSettings); 
				self.settingsError("Saving...");             
            }
        };
        self.passwordEditing = ko.observable(false);
        self.passwordEditClick = function() {
            if (self.passwordEditing() === false) {
                self.passwordEditing(true);
            } else {
				 if (!document.getElementById("oldPassword").value || !document.getElementById("newPassword").value || !document.getElementById("newPassword2").value ) {
					 self.settingsError("Please enter your current and new passwords")
				 } else if (document.getElementById("newPassword").value !== document.getElementById("newPassword2").value) {
					 self.settingsError("New passwords do not match");
				 } else {
					 socket.emit("newPassword", {"id": loggedin, "oldPassword": document.getElementById("oldPassword").value, "newPassword": document.getElementById("newPassword").value});
					 self.settingsError("Saving...");
				 }
            }
        };
        self.emailPrefClick = function() {
        		settings.messageemail = document.getElementById("emailOnMessage").checked;
        		settings.linkemail = document.getElementById("emailOnLink").checked;
				socket.emit('settingsEdit', settings);
		};
	
        // Nodes
        self.nodes = ko.observableArray(nodes);
        self.activeNode = ko.observable(active_node);
        self.linkedWithActiveNode = ko.computed(function() {
            var linkWithAN = self.links().filter(function(d) { return ((d.sourceid === self.activeNode() && d.targetid === self.user) || (d.targetid === self.activeNode() && d.sourceid === self.user)); });
            if (linkWithAN.length > 0) { return true; } else { return false; }
        });
        self.activeNodeData = ko.computed(function() {
            return self.nodes().filter(function(d) { return d.id === self.activeNode(); });
        });
        self.emailInviteError = ko.observable();
        self.inviteButtonClick = function() {
			var inviteEmail = document.getElementById("emailInviteEdit").value;
			if (!inviteEmail || inviteEmail.indexOf("@")<1 || inviteEmail.lastIndexOf(".")<inviteEmail.indexOf("@")+2 || inviteEmail.lastIndexOf(".")+2>=inviteEmail)
			{
				self.emailInviteError("Please enter a valid email address");
			} else {
				//nodes[arrayObjectIndexOf(nodes, node, "id")].invited = 1;
				socket.emit('nodeInvited', {"id": node, "email": document.getElementById("emailInviteEdit").value, "name": self.activeNodeData()[0].name, "from": nodeData[arrayObjectIndexOf(nodeData, self.user, "id")].name});	
			}
        };
        self.messageNode = function() {
            self.currentThread(self.activeNode());
            hideModules("email"); 
        };
        self.requestLink = function() {
			socket.emit('newLink', {"sourceid": self.user, "targetid": self.activeNode(), "confirmed": 0, "requestor": self.user});
		};
        self.editNode = function() {	  
	       // Draw database photo onto profile edit canvas
		   if (self.activeNodeData()[0].photo) {     
				img1.src="https://polycule.s3.amazonaws.com/final/"+self.activeNodeData()[0].photo+"?" + new Date().getTime();
				img1.onload = function () {
					ctx.drawImage(img1, x=0, y=0, width=225, height=225);
				}
			} else {
				ctx.font = "15px sans-serif";
				ctx.fillText("Add photo", 80, 120);
			}
            hideModules("nodeEdit");
        };
        self.cancelNodeEdit = function() {
            hideModules("node");
            resetPhotoEditor();
        };
        
        self.saveNodeEdit = function() {
  		
  			    var newName = document.getElementById("editName").value;
  			    var newLocation = document.getElementById("editLocation").value;
  			    var newDescription = document.getElementById("editDescription").value;
  		        var newNodeData = {"id": self.activeNode(), "name": newName, "location": newLocation, "description": newDescription};
  		        img2 = null;
  					
				self.nodeEditError("Saving...");

  			    // Send photo to server
  			    if (document.getElementById("photoTypeCustom").checked === true && document.getElementById("x1").value) {
					xhttp = new XMLHttpRequest();
					xhttp.onreadystatechange = function() {
						if (xhttp.readyState == 4 && xhttp.status == 200) {
						}
					};
					
					var data = new FormData();
					data.append('id', self.user);
					data.append('x1', document.getElementById("x1").value);
					data.append('y1', document.getElementById("y1").value);
					data.append('x2', document.getElementById("x2").value);
					data.append('y2', document.getElementById("y2").value);
					
					
					xhttp.addEventListener("load", function() {
					    socket.emit('nodeEdit', newNodeData);
						hideModules("node");
						self.nodeEditError(null);
						d3.select("#profilepic").attr("src", "https://polycule.s3.amazonaws.com/final/"+self.activeNodeData()[0].photo+"?" + new Date().getTime());
						restart();
					});
					
					data.append('photo', document.getElementById("photoSelect").files[0]);
			
					xhttp.open("POST", "/update/photo", true);
					xhttp.send(data); 

				 
				} else {
					if (photoRemove === true) { newNodeData.photoRemove = true; }
					socket.emit('nodeEdit', newNodeData);
					socket.on('nodeEditComplete', function() {
						hideModules("node");
						self.nodeEditError(null);
						restart();
					});	
				}

        };
        self.nodeEditError = ko.observable();
        self.openPhotoEdit = function() {
        /*
                if (self.activeNodeData()[0].photo && !(img2)) {
			        // Draw database photo onto photo edit area
				    imgsrc = "https://polycule.s3.amazonaws.com/original/"+self.activeNodeData()[0].photo+"?" + new Date().getTime();
				    coords = self.activeNodeData()[0].photocoords;
				    
				    vanilla.bind({
			            url: imgsrc,
			            points: [coords.x1, coords.y1, coords.x2, coords.y2]
		            });
		            
				} else {
				   vanilla.bind();
				}
				*/
				//vanilla.bind();
				
				d3.select("#photoEditWindow").style("display",  "block");
        };
        self.cancelPhotoEdit = function() {
			d3.select("#photoEditWindow").style("display",  "none");
			resetPhotoEditor();
			//document.getElementById("photoSelect").value = null;
			//document.getElementById("photoTypeCustom").checked = true;
			//document.getElementById("photoSelect").disabled = false;
			//d3.select("#photoArea").style("display", "block");
			//document.getElementById("photoSelect").value = null;
			//vanilla.bind({ url: null, points: null });
			//img2 = null;
        };
        self.savePhotoEdit = function() {
            // Save coordinates from cropping tool
                        
            var photoCoords = vanilla.get().points;
	        document.getElementById("x1").value = photoCoords[0];
	        document.getElementById("y1").value = photoCoords[1];
	        document.getElementById("x2").value = photoCoords[2];
	        document.getElementById("y2").value = photoCoords[3];
	        var swidth = photoCoords[2] - photoCoords[0];
			var sheight = photoCoords[3] - photoCoords[1];
            
            // If user has uploaded a new photo
        	if (document.getElementById("photoTypeCustom").checked === true && document.getElementById("photoSelect").files[0]) {
				var reader1 = new FileReader();
				reader1.readAsDataURL(document.getElementById("photoSelect").files[0]);
				reader1.onload = function (oFREvent) {				    
					img2 = new Image();
					img2.src = oFREvent.target.result;
					ctx.drawImage(img2,sx=photoCoords[0],sy=photoCoords[1],swidth=swidth,sheight=sheight,x=0,y=0,width=225,height=225);
				};		        
			// If user has adjusted the cropping of their existing photo
			/*
			} else if (document.getElementById("photoTypeCustom").checked === true && !(document.getElementById("photoSelect").files[0]) && document.getElementById("x1").value) {
				img2 = new Image();
				img2.src = "https://polycule.s3.amazonaws.com/original/"+self.activeNodeData[0].photo+"?" + new Date().getTime();
				ctx.drawImage(img2,sx=photoCoords[0],sy=photoCoords[1],swidth=swidth,sheight=sheight,x=0,y=0,width=225,height=225);
			// If user has removed their photo
			*/
			} else if (document.getElementById("photoTypeNone").checked === true) {
				ctx.clearRect(0,0,225,225);
				ctx.font = "15px sans-serif";
				ctx.fillText("Add photo", 80, 120);
				photoRemove = true;
				document.getElementById("photoSelect").value = null;
			}
						
			d3.select("#photoEditWindow").style("display",  "none");
        };
        
        // Links
        self.activeLink = ko.observable(active_link);
        self.months = months;
        self.activeLinkData = ko.computed(function() {
        	return self.links().filter(
        		function(d) {
        			return d.id === self.activeLink();
        		});
        });
        self.confirmLink = function() {
			socket.emit("linkConfirm", self.activeLink());
	   };
	   self.deleteLink = function() {
			socket.emit('linkDelete', self.activeLink());// Send link delete to server
  		    active_link = null;
  		    self.activeLink(null);
  		    hideModules();		// Clear side panel	
		    restart();
	   };
	   self.editLink = function() {
	       hideModules("linkEdit");
	   };
	   self.cancelLinkEdit = function() {
	       hideModules("linkInfo");
	   };
	   self.saveLinkEdit = function() {
	       if (document.getElementById("editLinkDescription").value) { var newLinkDescription = document.getElementById("editLinkDescription").value; } else { var newLinkDescription = null; }
  		   if (document.getElementById("editStartMonth").value) { var newStartMonth = document.getElementById("editStartMonth").value; } else { var newStartMonth = null; }
  		   if (document.getElementById("editStartYear").value) { var newStartYear = document.getElementById("editStartYear").value; } else { var newStartYear = null; }
  		    // Send updated info to server
  		   socket.emit('linkEdit', {"id": self.activeLink(), "startmonth": newStartMonth, "startyear": newStartYear, "description": newLinkDescription});
  		   hideModules("linkInfo");
	   };
	
    }
    
    var viewModel = new ViewModel(linkRequests, emails, nodes, loggedin, months);
    
    ko.applyBindings(viewModel);
    
    // Data Updates ======================================================================
    
    socket.on('callToUpdateEmail', function() {
	    socket.emit('emailRequest');
	});
	
	socket.on('emailUpdate', function(emailUpdate) { 
	    emails = emailUpdate; 
	    emailThreader();
	    viewModel.emails(emails);
	});
    
	socket.on('usernameEditOK', function(newSettings) {
		settings = newSettings;
		viewModel.settings(settings);
		viewModel.usernameEditing(false);
		viewModel.settingsError(null);
	});
	
	socket.on('settingsUpdate', function(settingsUpdate) {
		settings = settingsUpdate;
		viewModel.settings(settings);
		viewModel.emailEditing(false);
		viewModel.settingsError(null);	
	});
	
	socket.on('usernameTaken', function() {
		viewModel.settingsError('That username is already taken');
	});
	
    socket.on('passwordUpdated', function() {
		viewModel.passwordEditing(false);
		viewModel.settingsError(null);
	});
	 
	socket.on('incorrectPassword', function() {
		settingsError.text("Original password is incorrect");
	});	
    
    socket.on('callToUpdateLinks', function() {
        socket.emit('linksRequest');
    });
    
    // Update links 
    socket.on('linksUpdate', function(linksUpdate) {
	    links = linksUpdate;
	    //getLinkSource();
	    getLinkRequests();
	    restart();
	    viewModel.links(links);
	});
	
	socket.on('callToUpdateNodes', function() {
        socket.emit('nodesRequest');
    });
	
	socket.on('nodesUpdate', function(nodesUpdate) {
	    
		for (i=0; i<nodesUpdate.length; i++) {
		    i2 = arrayObjectIndexOf(nodes, nodesUpdate[i].id, "id");
		    if (i2 !== -1) {
	            nodesUpdate[i].fixed = nodes[i2].fixed;
	            nodesUpdate[i].x = nodes[i2].x;
	            nodesUpdate[i].y = nodes[i2].y;
	        }
	    } 
	    
	    nodes = nodesUpdate;
	    viewModel.nodes(nodes);
	    restart();
	});
	
	socket.on('callToUpdateNodesLinks', function() {
        socket.emit('nodesLinksRequest');
    });
	
	socket.on('nodesLinksUpdate', function(nodesLinksUpdate) {
	    nodesUpdate = nodesLinksUpdate.nodes;
	    
		for (i=0; i<nodesUpdate.length; i++) {
		    i2 = arrayObjectIndexOf(nodes, nodesUpdate[i].id, "id");
		    if (i2 !== -1) {
	            nodesUpdate[i].fixed = nodes[i2].fixed;
	            nodesUpdate[i].x = nodes[i2].x;
	            nodesUpdate[i].y = nodes[i2].y;
	        }
	    }    
	    
	    nodes = nodesUpdate;
	    viewModel.nodes(nodes);
	    
	    links = nodesLinksUpdate.links;
	    viewModel.links(links);
	    getLinkRequests();
	    
	    restart();
	});
	// ===================================================================================
	
	// Select sidepanel for later use
    var sidepanel = d3.select("#sidePanel");
    var linksModule = d3.select("#linksModule");
    var emailModule = d3.select("#emailModule");
    var settingsModule = d3.select("#settingsModule");
    var nodeModule = d3.select("#nodeModule");
    var nodeEditModule = d3.select("#nodeEditModule");
    var linkInfoModule = d3.select("#linkInfoModule");
    var linkEditModule = d3.select("#linkEditModule");
    var otherModule = d3.select("#otherModule");
    
    function hideModules(module) {
        if (module === "links") { linksModule.style("display", "block"); } else { linksModule.style("display", "none"); }
        if (module === "email") { emailModule.style("display", "block"); } else { emailModule.style("display", "none"); }
        if (module === "settings") { settingsModule.style("display", "block"); } else { settingsModule.style("display", "none"); }
        if (module === "node") { nodeModule.style("display", "block"); } else { nodeModule.style("display", "none"); }
        if (module === "nodeEdit") { nodeEditModule.style("display", "block"); } else { nodeEditModule.style("display", "none"); }
        if (module === "linkInfo") { linkInfoModule.style("display", "block"); } else { linkInfoModule.style("display", "none"); }
        if (module === "linkEdit") { linkEditModule.style("display", "block"); } else { linkEditModule.style("display", "none"); }
        if (module === "other") { otherModule.style("display", "block"); } else { otherModule.style("display", "none"); }
        
        
        if (sidepanel.style("display") === "none" && module) {
        
        // For possible animated transition of sidepanel
        /*
        sidepanel.transition()
	        .style("width", "0px")
	        .style("min-width", "0px")
	        .style("padding", "0px")
	        .style("border", "none")
	        .duration(500)
	      .transition()
	        .style("margin-left", "0px")
	        .duration(30)
	        .delay(470);
	    */
            sidepanel.style("display", "block");
	        resizeForceLayout();
	    } else if (sidepanel.style("display") === "block" && !module) {
	        sidepanel.style("display", "none");
	        resizeForceLayout();  
	    }
	    
    }
    
    d3.select("#linkButton").on("click", function() { hideModules("links"); });
	d3.select("#mailButton").on("click", function() { viewModel.currentThread(0); hideModules("email"); });
	d3.select("#settingsButton").on("click", function() { hideModules("settings"); });
  
    if (mobileUser) {
        sidepanel.style("display", "none");
        resizeForceLayout();
    } else {
        hideModules("node"); // Display user profile on startup
    }
    
    d3.select("#polyculeHeader").on("click", hideModules);
  
    // Data Visualisation ================================================================
    
    // Setup force layout
    var force = d3.layout.force()
        .size([width, height])
        .nodes(nodes)
        .links(links)
        .linkDistance(50)
        .charge(-200)
        .on("tick", tick);
        
    // Change size of force layout when window is resized
    var resizeForceLayout = function() {
        var width = document.getElementById('mainsvg').getBoundingClientRect().width;
        var height = document.getElementById('mainsvg').getBoundingClientRect().height;
	    force.size([width, height]);
	    restart();
	};
	
	if (mobileUser) {
        sidepanel.style("display", "none");
        //resizeForceLayout();
    } else {
        hideModules("node"); // Display user profile on startup
    }
    
    window.addEventListener('resize', resizeForceLayout, true);    

    // Set up zoom and pan facility
    var zoomguide = 1;

    var zoom = d3.behavior.zoom()
        .on("zoom", zoomed)
        .scaleExtent([0.2,2]);

    function zoomed() {
        container.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    }

    var svg = d3.select("#mainsvg")
        .on("mousedown touchstart", mouseDown)
        .on("mousemove touchmove", mousemove)
        .on("mouseup touchend", mouseup)
        .call(zoom);
    
    
    /* FOR MAKING ZOOM BUTTONS WORK
       function interpolateZoom (translate, scale) {
        var self = this;
        return d3.transition().duration(350).tween("zoom", function () {
            var iTranslate = d3.interpolate(zoom.translate(), translate),
                iScale = d3.interpolate(zoom.scale(), scale);
            return function (t) {
                zoom
                    .scale(iScale(t))
                    .translate(iTranslate(t));
                zoomed();
            };
        });
    }

    function zoomClick() {
        var clicked = d3.event.target,
            direction = 1,
            factor = 0.2,
            target_zoom = 1,
            center = [width / 2, height / 2],
            extent = zoom.scaleExtent(),
            translate = zoom.translate(),
            translate0 = [],
            l = [],
            view = {x: translate[0], y: translate[1], k: zoom.scale()};

        d3.event.preventDefault();
        direction = (this.id === 'zoomin') ? 1 : -1;
        target_zoom = zoom.scale() * (1 + factor * direction);

        if (target_zoom < extent[0] || target_zoom > extent[1]) { return false; }

        translate0 = [(center[0] - view.x) / view.k, (center[1] - view.y) / view.k];
        view.k = target_zoom;
        l = [translate0[0] * view.k + view.x, translate0[1] * view.k + view.y];

        view.x += center[0] - l[0];
        view.y += center[1] - l[1];

        interpolateZoom([view.x, view.y], view.k);
    }
    */

    /*d3.selectAll('zoomButton').on('click', zoomClick); */
    
     
    /*zoom1.event(zoomin);*/
    

    
    // Add container for use with zoom function
    var container = d3.select("#container")
        .attr("class", "container");
        
/*
	// Create zoom in/out buttons    
    var zoomin = d3.select("#zoomin")
    	.attr("transform", "translate(10,10)");

    zoomin.append("rect")
        .attr("id", "zoomin")
	    .attr("width", 25)
	    .attr("height", 25)
	    .attr("fill", "black")
	    .attr("fill-opacity", 0.5)
	    .attr("rx", 5)
	    .attr("ry", 5);
	    //.on("click", zoomClick);

    zoomin.append("polygon")
	    .attr("points", "5,10 10,10 10,5 15,5 15,10 20,10 20,15 15,15 15,20 10,20 10,15 5,15 5,10")
	    .attr("fill", "white");

    var zoomout = svg.append("g")
		.attr("transform", "translate(10,45)");
		
    zoomout.append("rect")
        .attr("id", "zoomout")
	    .attr("width", 25)
	    .attr("height", 25)
	    .attr("fill", "black")
	    .attr("fill-opacity", 0.5)
	    .attr("rx", 5)
	    .attr("ry", 5);
	    //.on("click", zoomClick);
	    //.call(zoomoutf);

    zoomout.append("rect")
	    .attr("x", 5)
        .attr("y", 10)
        .attr("width", 15)
        .attr("height", 5)
        .attr("fill", "white");
    */
        
        
    var nodes = force.nodes();
    var links = force.links();
    var node = container.selectAll(".node")
    var link = container.selectAll(".link");

     // Add line for connecting two nodes (initially hidden)
     var active_line = container.append("line")
         .attr("id", "connectorLine")
         .attr("visibility", "hidden");

    restart();

    // mouseDown function deselect node or link
    function mouseDown() {
        //if (d3.event.preventDefault) d3.event.preventDefault(); // prevent default browser ghosting effect
        d3.event.preventDefault();
        d3.event.stopPropagation();

        if (active_node !== null) {
            active_node = null;                 // Deselect active node
            viewModel.activeNode(null);		   
		    restart();                          // Restart force layout
	    }		
	    if (active_link !== null) {
		    active_link=null;					// Deselect active link
		    restart();                          // Restart force layout
	    }
	    hideModules(); // Clear sidepanel 
    }


    // mousemove for when user is drawing a connection
    function mousemove() {
        //if (d3.event.preventDefault) d3.event.preventDefault(); // prevent default browser ghosting effect
        d3.event.preventDefault();
        d3.event.stopPropagation();

	    if (active_node !== null & connect1 === 1) {

		    //nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=1; // Hold selected node in place
		
		    // Undo current zoom level
		    translatea=d3.transform(container.attr("transform")).translate;
		    scalea=d3.transform(container.attr("transform")).scale;
            
            // move temporary line            
		    active_line					
			    .attr("x2", (d3.mouse(this)[0]-translatea[0])/scalea[0])
			    .attr("y2", (d3.mouse(this)[1]-translatea[1])/scalea[1]);
				
	    }
    }

    function mouseup() {
    
        //if (d3.event.preventDefault) d3.event.preventDefault(); // prevent default browser ghosting effect
        d3.event.preventDefault();
        d3.event.stopPropagation();

	     // For when user is creating a new node
	    if (connect1===1) {

  		    var point = d3.mouse(this);		// Collect coordinates of current mouse location
  	
  		    var name = prompt("New person name:", "New Person");		// Prompt for new person name
  		
   		    // 	For when user cancels new node creation 		
		    if (name === null || name === '' /*&& isSafari && confirm('was that cancel?')*/) {

			    connect1=null;						 
			    active_line.attr("visibility", "hidden"); // Hide temporary line
			    nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=0; 		// Release selected node
			    restart();
  		
  		    } else {
  		    
			    new_node=nodes[nodes.length-1].id+1;	// Collect new node index number	
			    
			    nodes.push({"id": new_node, "name": name, "member": 0, "invited": 0, "x":point[0], "y": point[1]});	// Add new node to dataset
		
			    links.push({"sourceid": active_node, "targetid": new_node, "confirmed": 1, "id": links[links.length-1].id+1, "startmonth": null, "startyear": null});	// Add new link to dataset
  			
  			    nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=0; 		// Release selected node
  		
  			    var old_node = active_node;
  			    
  			    active_node = new_node;					// Clear active node
                viewModel.activeNode(active_node);

  			    hideModules("node");

  			    connect1=null;						// Cancel connector status
  			    active_line.attr("visibility", "hidden") // Hide connector line
  			
  			    restart();
  			    
  			    // Send new node data to server (server will also add link)
  			    socket.emit('newNode', {"name": name, "member": 0, "invited": 0, "sourceid": old_node});
  			
  		    }
  	    }
    }
	

    function tick() {

	    // To fix logged in user in centre:
        //nodes[loggedin].x = width / 2;
        //nodes[loggedin].y = height / 2;

        link.attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });

        node.attr("transform", function(d) { return "translate(" + d.x + ", " + d.y + ")"; });

    }


    // To start animation
    function restart() {

		getLinkSource();
		
		force.links(links);
		force.nodes(nodes);

  	    force.start();
  	
        link = link.data(links);//, function(d) { return d.id; });

        link.enter().insert("line", ".node");	// Add new line for any new links
		
        link
            .attr("class", "link")
            .classed("selectedLink", function(d) { if (d.id === active_link) { return true; } else { return false; } })
            .classed("unselectedLink", function(d) { if (d.id !== active_link) { return true; } else { return false; } })
            .classed("unconfirmedLink", function(d) { if (d.confirmed === 0) { return true; } else { return false; } }) 
            .on("mousedown", selectLink)
            .on("touchstart", selectLink);
    
        link.exit().remove(); 

        node = node.data(nodes);
  
        node.enter().insert("g", ".cursor")
            .attr("class", "node")
            .append("circle");
      
        node.select("circle")      
            //.call(force.drag)
            //.attr("r", 7)
            .attr("r", function() { if (mobileUser) { return 10; } else { return 7; }})
            .attr("class", function(d) { if (d.id === loggedin) { return "myNode"; } else if (d.member === 1) { return "userNode"; } else { return "nonUserNode"; } })
            .classed("selectedNode", function(d) { if (d.id === active_node) { return true; } else { return false; } })
            .on("mousedown", selectNode)
            .on("mouseup", joinNode)
            .on("touchstart", selectNode)
            .on("touchend", joinNode);   

        node.select("text").remove();       
        node.append("text")
            .attr("x", 10)
            .attr("y", 10)
            .text(function(d) { return d.name; });  
               
        node.exit().remove();
      

    
        // selectNode function for user selects existing node
        function selectNode() {
        
            if (d3.event.preventDefault) d3.event.preventDefault();  // Prevent default browser ghosting effect
            d3.event.stopPropagation(); // Prevent events on background objects
		
            if (active_node !== null) {
                nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=0;		// Release previously selected node  	
            }
		
		    if (active_link !== null) {
			      active_link=null;
		    }
				
            active_node = d3.select(this)[0][0].__data__.id;
            viewModel.activeNode(active_node);
		
            hideModules("node"); // Show node profile in side panel
		
            if (loggedin === active_node || nodes[arrayObjectIndexOf(nodes, active_node, "id")].member === 0) {
		
                connect1=1;
                nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=1; // Prevent node from moving while connecting is occuring
		
                // Initialise connector line
                active_line
                    .attr("visibility", "visible")
                    .attr("x1", d3.select(this)[0][0].__data__.x)
                    .attr("y1", d3.select(this)[0][0].__data__.y)
                    .attr("x2", d3.select(this)[0][0].__data__.x)
                    .attr("y2", d3.select(this)[0][0].__data__.y);

            }	
			
		    restart()
			
	    }
			
		// user joins two nodes
        function joinNode() {

            d3.event.stopPropagation();
				
            var new_node = d3.select(this)[0][0].__data__.id; // Get index of node user is joining to

            // User joins two nodes	
		    if (active_node !== new_node && (active_node === loggedin || (nodes[arrayObjectIndexOf(nodes, active_node, "id")].member === 0 && nodes[arrayObjectIndexOf(nodes, new_node, "id")].member === 0)) && connect1 === 1) {
			    if (nodes[arrayObjectIndexOf(nodes, active_node, "id")].member === 0 || nodes[arrayObjectIndexOf(nodes, new_node, "id")].member === 0) { confirm = 1; } else {confirm = 0}

			    links.push({"sourceid": active_node, "targetid": new_node, "confirmed": confirm, "requestor": loggedin, "id": links[links.length-1].id+1, "startmonth": null, "startyear": null});
				viewModel.links(links);

  			    // Send new link to server
  			    socket.emit('newLink', {"sourceid": active_node, "targetid": new_node, "confirmed": confirm, "requestor": loggedin});
  			    			
  			    active_line.attr("visibility", "hidden"); // Hide temporary line
  			    nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=0; 		// Release selected node
  			    active_node = null;
  			    viewModel.activeNode(null);					// 
  			    hideModules(); 						// Clear side panel
  
			    connect1=null;		// Cancel connector line	
  
  			    restart();
				
		    } else {
				
			    // Cancel connector line
			    connect1 = null;
			    active_line.attr("visibility", "hidden"); // Hide temporary line
			    nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed = 0; 		// Release selected node
		    }	
	    }
		
		// User selects a link	
        function selectLink() {
	
		    if (d3.event.preventDefault) d3.event.preventDefault(); // Prevent browser ghosting effect
		    d3.event.stopPropagation(); // Prevent events for background objects 
		
		    if (active_node !== null) {   
  			    nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=0;  // Release selected node		
  			    active_node = null;	
  			    viewModel.activeNode(null);
  			    connect1=null;
  		    }
  		
  		    active_link_data = d3.select(this)[0][0].__data__;		// Retrieve data for selected link
  		    active_link = active_link_data.id;						// Set active link number
  		    viewModel.activeLink(active_link);

		    hideModules("linkInfo"); // Display link info in side panel
  			
  		    restart();
	    }	

        force.start();
    }	

});