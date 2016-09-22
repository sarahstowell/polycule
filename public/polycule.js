// Open websocket connection
var socket = io();

// Request data from server
socket.emit('dataRequest'); 

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
	
	function emailThreader() {
	    // Create thread number
	    emails = emails.map(function(d) { 
	        if (d.recip === loggedin) { d.thread = d.sender;} else { d.thread = d.recip; }
	        return d;
	    }); 	    
	    // Create indicator for most recent message in thread
	    var threads = [];
		var i;
		for (i=emails.length-1; i>=0; i--) {			
			if (threads.indexOf(emails[i].thread) === -1) { 
				threads.push(emails[i].thread);
				emails[i].latest = 1;
			} else { 
				emails[i].latest = 0;
			}
		}
	}
	emailThreader();
	
	socket.on('callToUpdateEmail', function() {
	    socket.emit('emailRequest');
	});
	
	socket.on('emailUpdate', function(emailUpdate) { 
	    emails = emailUpdate; 
	    checkEmails();
	    emailThreader();
	    viewModel.emails(emails);
	});
  
    // Function for creating source and target variables in links dataset for use with force layout
    var getLinkSource = function() {
        for (i=0; i<links.length; i++) {
            links[i].source = arrayObjectIndexOf(nodes, links[i].sourceid, "id");
            links[i].target = arrayObjectIndexOf(nodes, links[i].targetid, "id");
        }
    }
    
    // Create source and target variables on startup
    getLinkSource();
    
    // Get link requests from links dataset and check for links
    var getLinkRequests = function() {
        // Collect unconfirmed links which are not requested by current user, for link request folder
        linkRequests = links.filter(function(d) { return d.confirmed === 0 && d.requestor !== loggedin; });
        linkRequests.map(function(d) { d.requestorname = nodes[arrayObjectIndexOf(nodes, d.requestor, "id")].name; d.requestorusername = nodes[arrayObjectIndexOf(nodes, d.requestor, "id")].username;});        
        if (viewModel) { viewModel.linkRequests(linkRequests); }
    };
    
    getLinkRequests();
    
    // Knockout view model
    function ViewModel(linkData, emailData, loggedin) {
        var self = this;
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
		self.currentThread = ko.observable(0);
        self.currentFolderData = ko.computed(function() { 
            if (self.currentThread() === 0) { return self.emails().filter(function(d) { return d.latest === 1; }).reverse(); }
            else { return self.emails().filter(function(d){ return d.thread === self.currentThread(); }); }
        });
        self.openThread = function(data) {
            self.currentThread(data.thread);
        };
        self.sendMessage = function() {
            var content = document.getElementById("emailTypeBox").value;
            if (content) {
                var newEmail = {"recip": self.currentThread(), "sender": loggedin, "read": 0, "delrecip": 0, "delsender": 0, "content": content};
			    socket.emit("newEmail", newEmail);
			    document.getElementById("emailTypeBox").value=null;
			    document.getElementById("emailContainer").scrollTop = document.getElementById("emailContainer").scrollHeight - document.getElementById("emailContainer").innerHeight;
			}
        }
    }
    
    var viewModel = new ViewModel(linkRequests, emails, loggedin);
    
    ko.applyBindings(viewModel);
    // -------------------------
    
    socket.on('callToUpdateLinks', function() {
        socket.emit('linksRequest');
    });
    
    // Update links 
    socket.on('linksUpdate', function(linksUpdate) {
	    links = linksUpdate;
	    //getLinkSource();
	    getLinkRequests();
	    restart();
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
	    
	    links = nodesLinksUpdate.links;
	    getLinkRequests();
	    
	    restart();
	});
  
    // Setup force layout
    var force = d3.layout.force()
        .size([width, height])
        .nodes(nodes)
        .links(links)
        .linkDistance(50)
        .charge(-200)
        .on("tick", tick);
        
    // Change size of force layout when window is resized
    window.addEventListener('resize', function() {

        var width = document.getElementById('mainsvg').getBoundingClientRect().width;
        var height = document.getElementById('mainsvg').getBoundingClientRect().height;
	
	    force.size([width, height]);
	
	    restart();

    } , true);    
	
    var emailColor = d3.scale.ordinal()
	    .range(["lightgray", "white"])
	    .domain([0,1]);

    // Set up zoom and pan facility
    var zoomguide = 1;

    var zoom = d3.behavior.zoom()
        .on("zoom", zoomed)
        .scaleExtent([0.2,2]);

    function zoomed() {
        container.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
    }

    var svg = d3.select("#mainsvg")
        .on("mousedown", mouseDown)
        .on("mousemove", mousemove)
        .on("mouseup", mouseup)
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
    
    // Select sidepanel for later use
    var sidepanel = d3.select("#sidePanel");
    var linksModule = d3.select("#linksModule");
    var emailModule = d3.select("#emailModule");
    var otherModule = d3.select("#otherModule");
    
    function hideModules(module) {
        if (module === "links") { linksModule.style("display", "block"); } else { linksModule.style("display", "none"); }
        if (module === "email") { emailModule.style("display", "block"); } else { emailModule.style("display", "none"); }
        if (module === "other") { otherModule.style("display", "block"); } else { otherModule.style("display", "none"); }
    }
    
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

    displayInfo(active_node);    // On startup, display current user info in side panel

    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    // mouseDown function deselect node or link
    function mouseDown() {

        if (d3.event.preventDefault) d3.event.preventDefault(); // prevent default browser ghosting effect

        if (active_node !== null) {
            active_node = null;                 // Deselect active node
		    hideModules();						// Clear sidepanel
		    restart();                          // Restart force layout
	    }		
	
	    if (active_link !== null) {
		    active_link=null;					// Deselect active link
		    hideModules();						// Clear sidepanel
		    restart();                          // Restart force layout
	    }
    }


    // mousemove for when user is drawing a connection
    function mousemove() {

	    if (active_node !== null & connect1 === 1) {

		    //nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=1; // Hold selected node in place
		
		    // Undo current zoom level
		    translatea=d3.transform(container.attr("transform")).translate;
		    scalea=d3.transform(container.attr("transform")).scale;
            // move temporary line
            
            //sidepanel.html(JSON.stringify(d3.mouse(this))); TEST CODE
            
		    active_line					
			    .attr("x2", (d3.mouse(this)[0]-translatea[0])/scalea[0])
			    .attr("y2", (d3.mouse(this)[1]-translatea[1])/scalea[1]);
				
	    }
    }

    function mouseup() {

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

  			    displayInfo(active_node);

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

    // Display user info
    function displayInfo(node) {
    
        hideModules("other");
        
        otherModule.html("");
        
        displayNodeData = nodes[arrayObjectIndexOf(nodes, node, "id")]

        otherModule.html("");
	
        // Add Name
        otherModule.append("h2")
            .attr("class", "name")
            .text(displayNodeData.name);
		
        // Display user info for members
        if (displayNodeData.member === 1) {
        
            otherModule.append("p")
                .attr("class", "username")
                .text("("+displayNodeData.username+")");
            
            // Add user photo if one is provided
            if (displayNodeData.photo !== null) {
                otherModule.append("img")
                    .attr("class", "profilepic")
                    .attr("id", "profilepic")
                    .attr("src", "https://polycule.s3.amazonaws.com/final/"+displayNodeData.photo+"?" + new Date().getTime());
            }

            // Add user location
            otherModule.append("p")
                .attr("class", "town")
                .text(displayNodeData.location);

            // Add user description	
            otherModule.append("p")
                .attr("class", "description")
                .text(displayNodeData.description);
	
            if (node === loggedin) {
	
                otherModule.append("button")
                    .attr("id", "editnodebutton")
                    .text("Edit")
                    .attr("class", "standardButton")
                    .on("click", function() { editNode(node); });
	
            } else {
            
                otherModule.append("button")
                    .attr("id", "sendMessageButton")
                    .attr("class", "standardButton")
                    .text("Message")
                    .on("click", function() { 
                        viewModel.currentThread(node);
                        hideModules("email");
                    });

                
                var currentLink = links.filter(function(d) { return ((d.sourceid === loggedin && d.targetid === node) || (d.targetid === loggedin && d.sourceid === node)); });
                
                if (currentLink.length === 0) {
                
                	d3.select("#sendMessageButton")
                	    .style("left", "75px");
                
					otherModule.append("button")
						.attr("id", "requestLinkButton")
						.attr("class", "standardButton")
						.text("Request Link")
						.on("click", function() {
							links.push({"sourceid": loggedin, "targetid": node, "confirmed": 0, "requestor": loggedin, "id": links[links.length-1].id+1, "startmonth": null, "startyear": null});
							restart();
							// Send new link to server
							socket.emit('newLink', {"sourceid": loggedin, "targetid": node, "confirmed": 0, "requestor": loggedin});
							displayInfo(node);
						});
                }
                
            }

	    } else {
	
		    if (displayNodeData.invited === 0) {
	
                otherModule.append("p")
			        .attr("class", "description")
			        .text(displayNodeData.name+" is not yet a member of Polycule. Enter an email address to invite them:");
		
				var centerDiv = otherModule.append("div")
				    .attr("class", "centerDiv");
				    
				centerDiv.append("p")
				    .attr("id", "emailInviteError");
		
               centerDiv.append("input")
                    .attr("id", "emailInviteEdit")
			        .attr("type", "email");
		
               centerDiv.append("input")
			        .attr("type", "submit")
			        .attr("value", "Invite")
			        .attr("id", "emailInviteButton")
			        .attr("class", "standardButton")
			        .on("click", function() { 
			        
			            var inviteEmail = document.getElementById("emailInviteEdit").value;
			            
			            if (!inviteEmail || inviteEmail.indexOf("@")<1 || inviteEmail.lastIndexOf(".")<inviteEmail.indexOf("@")+2 || inviteEmail.lastIndexOf(".")+2>=inviteEmail)
		                {
		                    d3.select("#emailInviteEdit").style("border", "1px solid red");
		                    d3.select("#emailInviteError").text("Please enter a valid email address");
		                } else {
				            nodes[arrayObjectIndexOf(nodes, node, "id")].invited = 1;
				        
				            socket.emit('nodeInvited', {"id": node, "email": document.getElementById("emailInviteEdit").value, "name": nodes[arrayObjectIndexOf(nodes, node, "id")].name, "from": nodes[arrayObjectIndexOf(nodes, loggedin, "id")].name});	
		                    
				            otherModule.html("");

				            otherModule.append("h2")
					            .text(displayNodeData.name);
				
				            otherModule.append("p")
					            .text(displayNodeData.name+" has been invited to join Polycule")
					            .attr("id", "invitedText");
					    }

			        });
	
		    } else if (displayNodeData.invited === 1) {
	
			    otherModule.html("");

			    otherModule.append("h2")
				    .text(displayNodeData.name);
				
			    otherModule.append("p")
				    .text(displayNodeData.name+" has been invited to join Polycule")
				    .attr("id", "invitedText");
	
		    }
	    }
    }

    function editNode(node) {
  	
	    hideModules("other");
	    
	    otherModule.html("");
	
	    centerdiv = otherModule.append("div")
	        .style("text-align", "center");
	
	    // Add Name
	    centerdiv.append("input")
            .attr("id", "editName")
            .attr("class", "editable")
            .attr("type", "text")
            .attr("maxlength", 10)
            .attr("placeholder", "Display Name")
	        .property("defaultValue", nodes[arrayObjectIndexOf(nodes, node, "id")].name);
	    
	    
	    centerdiv.append("p")
            .attr("class", "username")
            .style("margin-top", "5px")
            .text("("+displayNodeData.username+")");
	    
	    /*
	    centerdiv.append("input")
            .attr("id", "editUsername")
            .attr("class", "editable")
            .attr("type", "text")
            .attr("maxlength", 20)
            .attr("placeholder", "Unique Username")
	        .property("defaultValue", nodes[arrayObjectIndexOf(nodes, node, "id")].username);
		*/	
		
		var photoRemove = false;
		var img2;
		
	    // Add user photo
		centerdiv.append("canvas")
			.attr("id", "canvas1")
			.attr("width", 225)
			.attr("height", 225)
			.style("cursor", "pointer")
			.on("click", function() {
                if (nodes[arrayObjectIndexOf(nodes, node, "id")].photo !== null && !(img2)) {
			        // Draw database photo onto photo edit area
				    imgsrc = "https://polycule.s3.amazonaws.com/original/"+nodes[arrayObjectIndexOf(nodes, node, "id")].photo+"?" + new Date().getTime();
				    coords = nodes[arrayObjectIndexOf(nodes, node, "id")].photocoords;
				    addPhotoEdit(imgsrc, coords.x1, coords.y1, coords.x2, coords.y2);
				}
				d3.select("#photoEditWindow").style("display",  "block");
			}); 
			
		var canvas = document.getElementById('canvas1');
		var ctx = canvas.getContext('2d');	  
	        
	   // Draw database photo onto profile edit canvas     
	   if (nodes[arrayObjectIndexOf(nodes, loggedin, "id")].photo !== null) {     
			var img1=document.createElement('img');
			img1.src="https://polycule.s3.amazonaws.com/final/"+nodes[arrayObjectIndexOf(nodes, node, "id")].photo+"?" + new Date().getTime();
			img1.onload = function () {
				ctx.drawImage(img1, x=0, y=0, width=225, height=225);
			}
		
		} else {
		    ctx.font = "15px sans-serif";
		    ctx.fillText("Add photo", 80, 120);
		}
		
	    d3.select("#closePhotoEdit")
	    	.attr("class", "standardButton")
		    .on("click", function() {
    		    d3.select("#photoEditWindow").style("display",  "none");
    		    document.getElementById("photoSelect").value = null;
    		    document.getElementById("photoTypeCustom").checked = true;
    		    document.getElementById("photoSelect").disabled = false;
    		    d3.select("#photoArea").style("display", "block");
    		    d3.select("#photoArea").html("");
		    });
		    
		d3.select("#savePhotoEdit")
			.attr("class", "standardButton")
		    .on("click", function() {
		        if (document.getElementById("photoTypeCustom").checked === true && document.getElementById("photoSelect").files[0]) {
				    var reader1 = new FileReader();
					reader1.readAsDataURL(document.getElementById("photoSelect").files[0]);
					reader1.onload = function (oFREvent) {
						img2 = new Image();
						img2.src = oFREvent.target.result;
						if (img2.width > 540 || img2.height > 1000) { var ratio1 = Math.max(img2.width/540, img2.height/1000); } else { var ratio1 = 1; }
						var sx = Math.round(document.getElementById("x1").value*ratio1);
						var sy = Math.round(document.getElementById("y1").value*ratio1);
						var swidth = Math.round((document.getElementById("x2").value-document.getElementById("x1").value)*ratio1);
						var sheight = Math.round((document.getElementById("y2").value-document.getElementById("y1").value)*ratio1);
						ctx.drawImage(img2,sx=sx,sy=sy,swidth=swidth,sheight=sheight,x=0,y=0,width=225,height=225);
				    };		        
				} else if (document.getElementById("photoTypeCustom").checked === true && !(document.getElementById("photoSelect").files[0]) && document.getElementById("x1").value) {
					img2 = new Image();
					img2.src = "https://polycule.s3.amazonaws.com/original/"+nodes[arrayObjectIndexOf(nodes, node, "id")].photo+"?" + new Date().getTime();
					if (img2.width > 540 || img2.height > 1000) { var ratio1 = Math.max(img2.width/540, img2.height/1000); } else { var ratio1 = 1; }
					var sx = Math.round(document.getElementById("x1").value*ratio1);
					var sy = Math.round(document.getElementById("y1").value*ratio1);
					var swidth = Math.round((document.getElementById("x2").value-document.getElementById("x1").value)*ratio1);
					var sheight = Math.round((document.getElementById("y2").value-document.getElementById("y1").value)*ratio1);
					ctx.drawImage(img2,sx=sx,sy=sy,swidth=swidth,sheight=sheight,x=0,y=0,width=225,height=225);
				} else if (document.getElementById("photoTypeNone").checked === true) {
				    ctx.clearRect(0,0,225,225);
				    ctx.font = "15px sans-serif";
		            ctx.fillText("Add photo", 80, 120);
		            photoRemove = true;
		            document.getElementById("photoSelect").value = null;
				}
						    
    		    d3.select("#photoEditWindow").style("display",  "none");
		    });
		
        /*
	    window.onclick = function(event) {
            if (event.target == photoEditWindow) {
                photoEditWindow.style.display("none");
            }
        }
        */

	    centerdiv.append("br");
	
	    var editLocation = centerdiv.append("input")
            .attr("id", "editLocation")
		    .attr("class", "editable")
		    .attr("type", "text")
		    .attr("placeholder", "Location")
		    .property("defaultValue", nodes[arrayObjectIndexOf(nodes, node, "id")].location);
		    
		// Google town/city autocomplete
		var locationInput = document.getElementById('editLocation');
        var autocomplete = new google.maps.places.Autocomplete(locationInput, { types: ['(cities)'], region:'EU' });
				
	    var editDescription = centerdiv.append("textarea")
		    .attr("id", "editDescription")
		    .attr("class", "editable")
		    .property("defaultValue", nodes[arrayObjectIndexOf(nodes, node, "id")].description);

  	    otherModule.append("button")
  	    	.attr("class", "standardButton")
  	    	.attr("id", "cancelNodeEdit")
  		    .text("Cancel")
  		    .on("click", function() {
  		        document.getElementById("photoSelect").value = null;
    		    document.getElementById("photoTypeCustom").checked = true;
    		    document.getElementById("photoSelect").disabled = false;
    		    img2 = null; 
  		        displayInfo(node); 
  		    });
  			
  	    otherModule.append("button")
  	    	.attr("class", "standardButton")
  	    	.attr("id", "saveNodeEdit")
  		    .text("Save")
  		    .on("click", function() {
  		
  			    var newName = document.getElementById("editName").value;
  			    var newLocation = document.getElementById("editLocation").value;
  			    var newDescription = document.getElementById("editDescription").value;
  			
                nodes[arrayObjectIndexOf(nodes, node, "id")].name = newName;
  			    nodes[arrayObjectIndexOf(nodes, node, "id")].location = newLocation;
  			    nodes[arrayObjectIndexOf(nodes, node, "id")].description = newDescription;
  		        
  		        img2 = null;
  				
  				centerdiv.append("p")
				    .style("color", "red")
				    .text("Saving...");	
				    		    
  			    var newNodeData = {"id": node, "name": newName, "location": newLocation, "description": newDescription};
  			    
  			    // Send photo to server
  			    if (document.getElementById("photoTypeCustom").checked === true /*&& document.getElementById("photoSelect").files[0]*/ && document.getElementById("x1").value) {
					xhttp = new XMLHttpRequest();
					xhttp.onreadystatechange = function() {
						if (xhttp.readyState == 4 && xhttp.status == 200) {
						}
					};
					
					var data = new FormData();
					data.append('id', node);
					data.append('x1', document.getElementById("x1").value);
					data.append('y1', document.getElementById("y1").value);
					data.append('x2', document.getElementById("x2").value);
					data.append('y2', document.getElementById("y2").value);
					
					
					xhttp.addEventListener("load", function() {
					    socket.emit('nodeEdit', newNodeData);
					    //socket.on('nodeEditComplete', function() {
						    displayInfo(node);
						    d3.select("#profilepic").attr("src", "https://polycule.s3.amazonaws.com/final/"+displayNodeData.photo+"?" + new Date().getTime());
						    restart();
					    //});	
					});
					
					if (document.getElementById("photoSelect").files[0]) {
						data.append('photo', document.getElementById("photoSelect").files[0]);
				
						xhttp.open("POST", "/update/photo", true);
						xhttp.send(data); 
					} else {
						data.append('filename', nodes[arrayObjectIndexOf(nodes, node, "id")].photo);
					
						xhttp.open("POST", "/update/photocoords", true);
						xhttp.send(data); 
					}
					
					
										 
				} else {
				/*
				    if (document.getElementById("photoTypeCustom").checked === true && !(document.getElementById("photoSelect").files[0]) && document.getElementById("x1").value) {
				        newNodeData.photocoords = {"x1": document.getElementById("x1").value, "y1": document.getElementById("y1").value, "x2": document.getElementById("x2").value, "y2": document.getElementById("y2").value};
				    }
				    */
					if (photoRemove === true) { newNodeData.photoRemove = true; }
					socket.emit('nodeEdit', newNodeData);
					socket.on('nodeEditComplete', function() {
						displayInfo(node);
						restart();
					});	
				
				}		    
  		    
  		    });
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
            .on("mousedown", selectLink);
    
        link.exit().remove(); 

        node = node.data(nodes);
  
        node.enter().insert("g", ".cursor")
            .attr("class", "node")
            .append("circle");
      
        node.select("circle")      
            //.call(force.drag)
            .attr("r", 7)
            .attr("class", function(d) { if (d.id === loggedin) { return "myNode"; } else if (d.member === 1) { return "userNode"; } else { return "nonUserNode"; } })
            .classed("selectedNode", function(d) { if (d.id === active_node) { return true; } else { return false; } })
            .on("mousedown", selectNode)
            .on("mouseup", joinNode);      

        node.select("text").remove();       
        node.append("text")
            .attr("x", 10)
            .attr("y", 10)
            .text(function(d) { return d.name; });  
               
        node.exit().remove();
      

    
        // selectNode function for user selects existing node
        function selectNode() {
        
            if (d3.event.preventDefault) d3.event.preventDefault();  // Prevent default browser ghosting effect
		
            d3.event.stopPropagation();
		
            if (active_node !== null) {
                nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=0;		// Release previously selected node  	
            }
		
		    if (active_link !== null) {
			      active_link=null;
		    }
				
            active_node = d3.select(this)[0][0].__data__.id;
		
            displayInfo(active_node);		// Display user info in side panel
		
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

  			    // Send new link to server
  			    socket.emit('newLink', {"sourceid": active_node, "targetid": new_node, "confirmed": confirm, "requestor": loggedin});
  			    			
  			    active_line.attr("visibility", "hidden"); // Hide temporary line
  			    nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=0; 		// Release selected node
  			    active_node = null;					// 
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
			
        function selectLink() {
	
		    if (d3.event.preventDefault) d3.event.preventDefault();
		
		    d3.event.stopPropagation();
		
		    if (active_node !== null) {
  			    nodes[arrayObjectIndexOf(nodes, active_node, "id")].fixed=0; 		// Release selected node
  			    active_node = null;	
  			    connect1=null;
  		    }
  		
  		    // Retrieve data for selected link
  		    active_link_data = d3.select(this)[0][0].__data__;
  		
  		    // Set active link number
  		    active_link = active_link_data.id;
  		
		    // Display link info in side panel
		    displayLinkInfo(active_link);
  			
  		    restart();
	    }	
	
	    function displayLinkInfo(link) { 
	    
		    var linkData = links[arrayObjectIndexOf(links, link, "id")];
  		
  		    hideModules("other");
  		    
  		    otherModule.html("");
  		
  		    otherModule.append("h2")
  			    .text(linkData.source.name+" & "+linkData.target.name);
  			
  		    if ((linkData.startmonth !== null && linkData.startmonth !== undefined) || (linkData.startyear !== null && linkData.startyear !== undefined)) {
  			    otherModule.append("p")
  				    .attr("class", "linkDates")
  				    .text("Together since "+months[linkData.startmonth]+" "+linkData.startyear);
  		    }
  		
  		    if (linkData.description !== null) {
  			    otherModule.append("p")
  				    .attr("class", "linkDescription")
  				    .text(linkData.description);
            }
  			
  		    if (linkData.confirmed === 0) {
  			    otherModule.append("p")
  				    .attr("id", "linkConfirmation")
  				    .text("This link is awaiting confirmation");
  		    }
  		    
  		    var centerDiv = otherModule.append("div")
  		        .attr("class", "centerDiv");
  		
  		    if (linkData.source.id === loggedin || linkData.target.id === loggedin) {
  		
  	  		    centerDiv.append("input")
  				    .attr("type", "button")
  				    .attr("value", "Edit Details")
  				    .attr("class", "standardButton")
  				    .attr("id", "editLinkButton")
  				    .on("click", editLink);
  		    }	
  		
  		    if (linkData.confirmed === 0 && linkData.requestor !== loggedin) {
  			
  			    centerDiv.append("button")
				    .text("Confirm")
				    .attr("class", "standardButton")
				    .attr("id", "confirmLinkButton")
				    .on("click", function() { 
		
					    links[arrayObjectIndexOf(links, link, "id")].confirmed = 1;
					    socket.emit("linkConfirm", linkData.id);
					
					    linkind = arrayObjectIndexOf(linkRequests, linkData.id, "id");
			
					    linkRequests.splice(linkind, 1);		// Add link to confirmed link data
			
					    displayLinkInfo(link);
					    
					    
		
				    });
  		    }
  		
  			
  		    if (linkData.sourceid === loggedin || linkData.targetid === loggedin || nodes[arrayObjectIndexOf(nodes, linkData.sourceid, "id")].member === 0 && nodes[arrayObjectIndexOf(nodes, linkData.targetid, "id")].member === 0 ) {
  			    centerDiv.append("input")
  				    .attr("type", "button")
  				    .attr("value", function(d) { if (linkData.confirmed === 1) { return "Delete Link"; } else if ( linkData.requestor === loggedin) { return "Cancel Link request"; } else { return "Deny"; }})
  				    .attr("class", "standardButton")
  				    .attr("id", "deleteLinkButton")
  				    .on("click", deleteLink);
  			}
  	
  	    }	

  	    function deleteLink() {
  		
  		    var deleteLinkIndex = arrayObjectIndexOf(links, active_link, "id");
  		
  		    if (deleteLinkIndex >= 0) {
  			    links.splice(deleteLinkIndex, 1);
  		    }
  		    
  		    var linkToDelete = active_link;
  		
  		    active_link = null;
  		    hideModules();		// Clear side panel	
		    restart();
		    
		    // Send link delete to server
			socket.emit('linkDelete', linkToDelete);  			
  	    }
  	
  	    function editLink() {
  	
  		    var linkIndex = arrayObjectIndexOf(links, active_link, "id");

  		    hideModules("other");
  		    
  		    otherModule.html("");
  		
  		    centerdiv = otherModule.append("div")
	            .style("text-align", "center");
  		
  		    centerdiv.append("h2")
  			    .text(links[linkIndex].source.name+" & "+links[linkIndex].target.name);
  			
  		    centerdiv.append("span")
  			    .text("Together since ");
  		
  		    var month = centerdiv.append("select")
  			    .attr("id", "editStartMonth")
  			    .attr("class", "editable");
  		
  		    month.append("option")
  			    .attr("value", null)
  			    .text("");
  		
  		    for (m=0; m<12; m++) {
  			    month.append("option")
  				    .text(months[m])
  				    .attr("value", m)
  				    .attr("selected", function() { if (m === parseInt(links[linkIndex].startmonth)) { return "selected"; } else { return null; } });
		    }
		
		    var year = centerdiv.append("select")
			    .attr("id", "editStartYear")
			    .attr("class", "editable");
		
		    year.append("option")
		  	    .attr("value", null)
			    .text("");
		
		    var thisYear = new Date().getFullYear();
		
		    for (y=thisYear; y>=1900; y--) {
  			    year.append("option")
  				    .text(y)
  				    .attr("value", y)
  				    .attr("selected", function() { if (y === parseInt(links[linkIndex].startyear)) { return "selected"; } else { return null; } });
		    }
  		
  		    centerdiv.append("br");
  		
  		    centerdiv.append("input")
  			    .attr("id", "editLinkDescription")
  			    .attr("class", "editable")
  			    .attr("type", "text")
  			    .attr("placeholder", "Description")
  			    .property("defaultValue", links[linkIndex].description);

  		
  		    otherModule.append("button")
  			    .text("Cancel")
  			    .attr("class", "standardButton")
  			    .attr("id", "cancelLinkEdit")
  			    .on("click", function() { displayLinkInfo(active_link); });
  			
  		    otherModule.append("button")
  			    .text("Save")
  			    .attr("id", "saveLinkEdit")
  			    .attr("class", "standardButton")
  			    .on("click", function() { 
  				
  				    if (document.getElementById("editLinkDescription").value) { var newLinkDescription = document.getElementById("editLinkDescription").value; } else { var newLinkDescription = null; }
  				    if (document.getElementById("editStartMonth").value) { var newStartMonth = document.getElementById("editStartMonth").value; } else { var newStartMonth = null; }
  				    if (document.getElementById("editStartYear").value) { var newStartYear = document.getElementById("editStartYear").value; } else { var newStartYear = null; }
  				
  				    // Update links dataset
  				    links[linkIndex].description = newLinkDescription;
  				    links[linkIndex].startmonth = newStartMonth;
  				    links[linkIndex].startyear = newStartYear;
  				
  				    displayLinkInfo(active_link);
  				    
  				    // Send updated info to server
  				    socket.emit('linkEdit', {"id": active_link, "startmonth": newStartMonth, "startyear": newStartYear, "description": newLinkDescription});

  			    });
  			
        }
  	
        force.start();
    }
    
    


    // ===== Link Requests =====
    d3.select("#linkButton").on("click", openLinkRequests);
	
    function openLinkRequests() { 
	    hideModules("links");
    }

    // ===== Email facility ======

	// For checking if there are any unread messages and if so, highlight mail symbol red
	var checkEmails = function () {

		d3.select("#mailButton")
			.on("click", function() { openEmails("Inbox"); })
			.attr("fill", function(d) { 
				newEmails = emails.filter(function(d) { if (d.recip === loggedin && d.read === 0) { return true; } else { return false; }});
				if (newEmails.length > 0) { return "red"; } else { return "black"; } 
			});
	}

	// check for unread mails on loading
	checkEmails();

	// For opening inbox or sent box
	var openEmails = function (box) {
/*
		if (active_node !== null || active_link !== null) {
			active_node = null;
			active_link = null;
			restart();
		}
*/
        viewModel.currentThread(0);
        hideModules("email");
/*
		emailModule.html("");

		emailModule.append("h2")
			.text("Messages");
	
		var inboxButton = emailModule.append("button")
			.attr("class", "menubutton")
			.text("Inbox")
			.on("click", function() { openEmails("Inbox"); });
	
		var sentButton = emailModule.append("button")
			.attr("class", "menubutton")
			.text("Sent")
			.on("click", function() { openEmails("Sent"); });
	
		if (box === "Inbox") {

			inboxButton.attr("class", "menubuttonSelected");

			myEmails = emails.filter(function(d) { if (d.recip === loggedin){ return true; } else { return false; }});	// Get emails for current user only NEEDS TO BE MADE SECURE

			myEmails2 = [];

			for (i=0; i<myEmails.length; i++) {

				var arr1 = arrayObjectIndexOf(myEmails2, myEmails[i].sender, "sender");
		
				if (arr1 === -1) { 
					myEmails2.push(myEmails[i]);
				} else { 
					myEmails2[arr1] = myEmails[i]; 
				}

			}

		} else if (box === "Sent") {

			sentButton.attr("class", "menubuttonSelected");

			myEmails = emails.filter(function(d) { if (d.sender === loggedin){ return true; } else { return false; }});	
	
			myEmails2 = [];

			for (i=0; i<myEmails.length; i++) {

				var arr1 = arrayObjectIndexOf(myEmails2, myEmails[i].recip, "recip");

				if (arr1 === -1) { 
					myEmails2.push(myEmails[i]);
				} else { 
					myEmails2[arr1] = myEmails[i]; 
				}
			}
		}

		var emailContainer = emailModule.append("div")
			.attr("class", "emailContainer");

		var emailLine = emailContainer.selectAll("div")
			.data(myEmails2)
		.enter().insert("div", ":first-child")
			.attr("class", "email")
			.style("background-color", function(d) { if (box === "Inbox" && d.read === 0) { return "lightgray"; } else { return null; }})
		.on("click", function(d) { if (box === "Inbox") { openThread(d.sender); } else if (box === "Sent") { openThread(d.recip); }});

		if (box === "Inbox") {
			emailLine.append("h3")
				.text(function(d) { if (arrayObjectIndexOf(nodes, d.sender, "id") !== -1) { return nodes[arrayObjectIndexOf(nodes, d.sender, "id")].name; } else { return "Old User"; } });
			emailLine.append("span")
				.text(function(d) { if (arrayObjectIndexOf(nodes, d.sender, "id") !== -1) { return " ("+nodes[arrayObjectIndexOf(nodes, d.sender, "id")].username+")"; } else { return ""; } });
		} else if (box === "Sent") {
			emailLine.append("h3")
				.text(function(d) { if (arrayObjectIndexOf(nodes, d.recip, "id") !== -1) { return nodes[arrayObjectIndexOf(nodes, d.recip, "id")].name; } else { return "Old User"; } });
			emailLine.append("span")
				.text(function(d) { if (arrayObjectIndexOf(nodes, d.recip, "id") !== -1) { return " ("+nodes[arrayObjectIndexOf(nodes, d.recip, "id")].username+")"; } else { return ""; } });
		}
	
		emailLine.append("p")
			.text(function(d) { return d.content; });
*/
	}

	// ===== Opening selected email thread =====
	/*
	var openThread = function(thread) {

		var threadEmails  = emails.filter(function(d) { if ((d.sender === thread && d.recip === loggedin) || (d.sender === loggedin && d.recip === thread)) { return true; } else { return false; } });
		
		// Update read status of emails on database
		socket.emit('emailRead', loggedin, thread);

		hideModules("other");
		
		otherModule.html("");
	
		otherModule.append("h2")
			.text("Messages");
	
		otherModule.append("button")
			.attr("class", "menubutton")
			.text("Inbox")
			.on("click", function() { openEmails("Inbox"); });
	
		otherModule.append("button")
			.attr("class", "menubutton")
			.text("Sent")
			.on("click", function() { openEmails("Sent"); });
	
		var emailContainer = otherModule.append("div")
			.attr("class", "emailContainer");

		var emailLine = emailContainer.selectAll("div")
			.data(threadEmails)
		.enter().insert("div", ":first-child")
			.attr("class", "fullEmail");

		emailLine.append("h3")
			.text(function(d) { if (arrayObjectIndexOf(nodes, d.sender, "id") !== -1) { return nodes[arrayObjectIndexOf(nodes, d.sender, "id")].name; } else { return "Old User"; } } );
	
		emailLine.append("p")
			.text(function(d) { return d.content; });

        if (arrayObjectIndexOf(nodes, thread, "id") !== -1) {
			otherModule.append("button")
				.attr("id", "replyButton")
				.text("Reply")
				.attr("class", "standardButton")
				.on("click", function() { writeEmail(thread); });
		}

		otherModule.append("button")
			.attr("id", "deleteButton")
			.text("Delete thread")
			.attr("class", "standardButton")
			.on("click", function() {
				for (i=0; i<threadEmails.length; i++) {
					emails.splice(arrayObjectIndexOf(emails, threadEmails[i].id, "id"), 1);
				}
				socket.emit('threadDelete', loggedin, thread);
				openEmails("Inbox");
	
			});
	
	}

	// ====== Write email =====
	var writeEmail = function (recipient) {
	
	    hideModules("other");

		otherModule.html("");
	
		otherModule.append("h2")
			.text("Messages");
	
		otherModule.append("button")
			.attr("class", "menubutton")
			.text("Inbox")
			.on("click", function() { openEmails("Inbox"); });
	
		otherModule.append("button")
			.attr("class", "menubutton")
			.text("Sent")
			.on("click", function() { openEmails("Sent"); });
			
		otherModule.append("br");
		otherModule.append("br");
	
		otherModule.append("h3")
			.attr("id", "newEmailRecipName")
			.text(nodes[arrayObjectIndexOf(nodes, recipient, "id")].name);
		
		otherModule.append("span")
			.attr("id", "newEmailRecipUsername")
			.text(" ("+nodes[arrayObjectIndexOf(nodes, recipient, "id")].username+")");
		
		otherModule.append("textarea")
			.attr("id", "newEmailContent");

		otherModule.append("button")
			.text("Cancel")
			.attr("class", "standardButton")
			.on("click", function(d) {
				if (active_node !== null) { displayInfo(active_node); } else { openEmails("Inbox"); }
			});
	
		otherModule.append("button")
			.text("Send")
			.attr("class", "standardButton")
			.on("click", function() {
				
				// Add new email to local emails database
				//emails.push({"id": emails[emails.length-1].id+1, "recip": recipient, "sender": loggedin, "read": 0, "delrecip": 0, "delsender": 0, "content": document.getElementById("newEmailContent").value});
	
				// Send new email to server
				var newEmail = {"recip": recipient, "sender": loggedin, "read": 0, "delrecip": 0, "delsender": 0, "content": document.getElementById("newEmailContent").value};
				socket.emit("newEmail", newEmail);
				
				// After sending, open inbox or go back to active node
				//if (active_node !== null) { displayInfo(active_node); } else { openEmails("Inbox"); }
				openEmails("Inbox");
	
			});
	};
	*/

    // ====== Settings ======
 
	d3.select("#settingsButton").on("click", openSettings); 		

	function openSettings() {
	
	    hideModules("other");

		otherModule.html("");

		otherModule.append("h2")
			.text("Settings");
			
		var settingsError = otherModule.append("p")
		    .attr("id", "settingsError");
		
		var changeUsername = otherModule.append("div")
			.attr("class", "settingsLine");
		
		changeUsername.append("h3")
			.text("Unique Username");
		
		changeUsername.append("html")
			.text(settings.username);
		
		changeUsername.append("input")
			.attr("class", "changeButton")
			.attr("type", "button")
			.attr("value", "Edit")
			.on("click", function() {
		
				changeUsername.html("");
		
				changeUsername.append("h3")
					.text("Unique Username");
		
				changeUsername.append("input")
					.attr("id", "newUsername")
					.attr("type", "text")
					.attr("placeholder", "New username")
					.property("defaultValue", settings.username);
		
				changeUsername.append("input")
					.attr("class", "changeButton")
					.attr("type", "button")
					.attr("value", "Save")
					.on("click", function() {
				
						//settings.username = document.getElementById("newUsername").value;
						socket.emit('usernameEdit', {"id": loggedin, "username": document.getElementById("newUsername").value});
						
						settingsError.text("Saving...");
						
						socket.on('usernameEditOK', function(newSettings) {
							settings = newSettings;
							openSettings();
						});
						
						socket.on('usernameTaken', function() {
						    settingsError.text('That username is already taken');
						});				
					});
				
			});
	
		var changeEmail = otherModule.append("div")
			.attr("class", "settingsLine");
		
		changeEmail.append("h3")
			.text("Contact Email");
		
		changeEmail.append("html")
			.text(settings.email);
		
		changeEmail.append("input")
			.attr("class", "changeButton")
			.attr("type", "button")
			.attr("value", "Edit")
			.on("click", function() {
		
				changeEmail.html("");
		
				changeEmail.append("h3")
					.text("Contact Email");
		
				changeEmail.append("input")
					.attr("type", "email")
					.property("defaultValue", settings.email)
					.attr("id", "newEmail");
		
				changeEmail.append("input")
					.attr("class", "changeButton")
					.attr("type", "button")
					.attr("value", "Save")
					.on("click", function() {
					    
					    var newSettings = settings;
					    newSettings.email = document.getElementById("newEmail").value;
					    
					    socket.emit("settingsEdit", newSettings);
					    
					    settingsError.text("Saving...");
					    
						socket.on('settingsUpdate', function(settingsUpdate) {
							settings = settingsUpdate;
							openSettings();	
						});
						
					});
		
			});	
	
		var changePassword = otherModule.append("div")
			.attr("class", "settingsLine");
		
		changePassword.append("h3")
			.text("Password");
		
		changePassword.append("html")
			.text("**********");
		
		changePassword.append("input")
			.attr("class", "changeButton")
			.attr("type", "button")
			.attr("value", "Edit")
			.on("click", function() {
		
				changePassword.html("");
		
				changePassword.append("h3")
					.text("Password");
				
				changePassword.append("input")
					.attr("placeholder", "Old password")
					.attr("type", "password")
					.attr("id", "oldPassword")
					.attr("name", "oldPassword");
				
				changePassword.append("br");
				
				changePassword.append("input")
					.attr("placeholder", "New password")
					.attr("type", "password")
					.attr("id", "newPassword")
					.attr("name", "newPassword");
				
				changePassword.append("br");
				
				changePassword.append("input")
					.attr("placeholder", "Re-enter new password")
					.attr("type", "password")
					.attr("id", "newPassword2")
					.attr("name", "newPassword2");
				
				changePassword.append("input")
					.attr("class", "changeButton")
					.attr("type", "button")
					.attr("value", "Save")
					.on("click", function() {
						 // TO BE ADDED - send new password to server
						 if (!document.getElementById("oldPassword").value || !document.getElementById("newPassword").value || !document.getElementById("newPassword2").value ) {
						     settingsError.text("Please enter your current  and new passwords")
						 } else if (document.getElementById("newPassword").value !== document.getElementById("newPassword2").value) {
						     settingsError.text("New passwords do not match");
						 } else {
						     socket.emit("newPassword", {"id": loggedin, "oldPassword": document.getElementById("oldPassword").value, "newPassword": document.getElementById("newPassword").value});
						     
						     settingsError.text("Saving...");
						     
						     socket.on('passwordUpdated', function() {
						        openSettings();
						     });
						     
						     socket.on('incorrectPassword', function() {
						         settingsError.text("Original password is incorrect");
						     });
						
						 }
					});
			});
	
		var changeContactPrefs = otherModule.append("div")
			.attr("class", "settingsLine");
		
		changeContactPrefs.append("h3")
			.text("Contact Preferences");
		
		changeContactPrefs.append("input")
			.attr("type", "checkbox")
			.property("checked", settings.messageemail)
			.attr("id", "emailOnMessage")
			.on("change", function() { 
				settings.messageemail = document.getElementById("emailOnMessage").checked;
				socket.emit('settingsEdit', settings);
			});
		
		changeContactPrefs.append("span")
			.text("Send email when message received");
		
		changeContactPrefs.append("br");	
		
		changeContactPrefs.append("input")
			.attr("type", "checkbox")
			.property("checked", settings.linkemail)
			.attr("id", "emailOnLink")
			.on("change", function() { 
				settings.linkemail = document.getElementById("emailOnLink").checked;
				socket.emit('settingsEdit', settings);
			});
		
		changeContactPrefs.append("span")
			.text("Send email when link requested");
			
		otherModule.append("input")
			.attr("type", "button")
			.attr("id", "deleteAccount")
			.attr("value", "Delete account")
			.attr("class", "standardButton")
			.on("click", function() {
				if (window.confirm("Are you sure you want to delete your account? This action cannot be reversed.")) {
				    //socket.emit('nodeDelete');
				    window.location = '/delete';
				}
			});
			
		otherModule.append("input")
			.attr("type", "button")
			.attr("id", "logout")
			.attr("value", "Sign out")
			.attr("class", "standardButton")
			.on("click", function() {
			    window.location = '/logout';
			});
			
			
	}	
	
	

/* ===== Help Facility ===== */
/*
    d3.select("#helpButton").on("click", openContact); 

    function openContact() {
    
    	sidepanel.html("");

        sidepanel.append("h2")
    	    .text("Help");
    	
        sidepanel.append("textarea")
        	.attr("width", "100%");
        	
        sidepanel.append("br");
    
        sidepanel.append("input")
    	    .attr("type", "button")
    	    .attr("value", "Send");    	

    }
*/

});


