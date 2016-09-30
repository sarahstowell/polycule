// Google maps autocomplete
var locationInput = document.getElementById('location');
var autocomplete = new google.maps.places.Autocomplete(locationInput, { types: ['(cities)'], region:'EU' });

d3.select("#photoSelect")
	.on("change", photoSelect);

function photoSelect() {

  var imgsrc = null;
  var file    = document.getElementById('photoSelect').files[0];
  var reader  = new FileReader();

  reader.addEventListener("load", function () {
    
    imgsrc = reader.result;

	var width=null, height=null, minsize = null;
	var maxwidth = 540, maxheight = 1000;
		
	var img = new Image();

	img.onload = function() {
	
		var width = this.width;
		var height = this.height;
	
		if (width > maxwidth) {
		
			height = Math.round(height/(width/maxwidth));
			minsize = Math.round(225/(width/maxwidth));
			width = maxwidth;
			
		} 
		
		if (height > maxheight) {

			width = Math.round(width/(height/maxheight));
			minsize = Math.round(225/(height/maxheight));
			height = maxheight;
		
		} 
		
		d3.select("#photoArea").html("");
		
		var photoEditor = d3.select("#photoArea").append("svg")
			.attr("width", width)
			.attr("height", height)
			.style("background", "url("+imgsrc+")")
			.style("background-size", "100% 100%");
			
		var path1 = photoEditor.append("path")
			.attr("fill", "gray")
			.attr("fill-opacity", 0.6);
		
		var rect1 = photoEditor.append("rect")
			.attr("stroke-width", 5)
			.attr("stroke", "red")
			.attr("fill-opacity", 0);
			
		var circle1 = photoEditor.append("circle")
			.attr("r", 7)
			.attr("fill", "red");
			
		var circle2 = photoEditor.append("circle")
			.attr("r", 7)
			.attr("fill", "red");
			
		var x1 = 50;
		var x2 = 275; 
		var y1 = 50;
		var y2 = 275;		
		
		var locationUpdate = function() {
			
			path1
				//.attr("d", "M0 0 L225 0 L225 225 L0 225z M10 10 L10 50 L50 50 L50 10 L10 10z");
				.attr("d", "M0 0 L"+width+" 0 L"+width+" "+height+" L0 "+height+" L0 0z M"+x1+" "+y1+" L"+x1+" "+y2+" L"+x2+" "+y2+" L"+x2+" "+y1+" L"+x1+" "+y1+"Z");
			
			rect1	
				.attr("x", Math.min(x1, x2))
				.attr("y", Math.min(y1, y2))
				.attr("width", Math.abs(x2-x1))
				.attr("height", Math.abs(y2-y1))
			
			circle1	
				.attr("cx", x1)
				.attr("cy", y1)

			circle2			
				.attr("cx", x2)
				.attr("cy", y2)
								
			document.getElementById("x1").value = x1;
			document.getElementById("y1").value = y1;
			document.getElementById("x2").value = x2;
			document.getElementById("y2").value = y2;
			
		}
		
		locationUpdate();
	
		var circle1Drag = d3.behavior.drag()
			.on("drag", function() {
			
				x1 = Math.min(Math.max(x2-Math.max(x2-d3.event.x, y2-d3.event.y), 0, x2-y2), x2-minsize);
				y1 = Math.min(Math.max(y2-Math.max(x2-d3.event.x, y2-d3.event.y), 0, y2-x2), y2-minsize);
				
				locationUpdate();
			
			});
			
		var circle2Drag = d3.behavior.drag()
			.on("drag", function() {
			
				x2 = Math.max(Math.min(x1+Math.max(d3.event.x-x1, d3.event.y-y1), width, x1+height-y1), x1+minsize);
				y2 = Math.max(Math.min(y1+Math.max(d3.event.x-x1, d3.event.y-y1), height, y1+width-x1), y1+minsize);
				
				locationUpdate();
			
			});
			
		var rectDrag = d3.behavior.drag()
			.on("drag", function() {
			
				recWidth = Math.abs(x2-x1);
			
				x1 = Math.max(Math.min(x1+d3.event.dx, width-recWidth), 0);
				y1 = Math.max(Math.min(y1+d3.event.dy, height-recWidth), 0);
				x2 = Math.max(Math.min(x2+d3.event.dx, width), recWidth);
				y2 = Math.max(Math.min(y2+d3.event.dy, height), recWidth); 
				
				locationUpdate();
			
			});
			
		rect1.call(rectDrag);
		circle1.call(circle1Drag);
		circle2.call(circle2Drag);
		
	}
	

		
	img.src = imgsrc;
		  }, false);

  if (file) { reader.readAsDataURL(file); }
}

// Signup form validation
var validateForm = function(formtype) {
    
	d3.selectAll(".inputBox").style("border", "1px solid gray");
	d3.select("#errorMessage").text("");		
	
	if (!document.getElementById("username").value) {
		d3.select("#errorMessage").text("Please enter a username");
		d3.select("#username").style("border", "1px solid red");
		return false;
		}
	else if (!document.getElementById("displayName").value) {
		d3.select("#errorMessage").text("Please enter a display name");
		d3.select("#displayName").style("border", "1px solid red");
		return false;
		}
	else if (!document.getElementById("email").value) {
		d3.select("#errorMessage").text("Please enter an email address");
		d3.select("#email").style("border", "1px solid red");
		return false;
		}
	else if (document.getElementById("email").value.indexOf("@")<1 || document.getElementById("email").value.lastIndexOf(".")<document.getElementById("email").value.indexOf("@")+2 || document.getElementById("email").value.lastIndexOf(".")+2>=document.getElementById("email").value.length) {
		d3.select("#errorMessage").text("Please enter a valid email address");
		d3.select("#email").style("border", "1px solid red");
		return false;
    }
	else if (formtype === 2 && !document.getElementById("password").value) {
		d3.select("#errorMessage").text("Please enter a password");
		d3.select("#password").style("border", "1px solid red");
		d3.select("#password2").style("border", "1px solid red");
		return false;
		}
	else if (formtype === 2 && document.getElementById("password").value !== document.getElementById("password2").value) {
		d3.select("#errorMessage").text("Passwords do not match");
		d3.select("#password").style("border", "1px solid red");
		d3.select("#password2").style("border", "1px solid red");
		return false;
		}
    else if (!document.getElementById("location").value) {
		d3.select("#errorMessage").text("Please enter a town or city");
		d3.select("#location").style("border", "1px solid red");
		return false;
		}
	else { return true; }
};


// Photo Select
var photoTypeFacebook = function() {
	d3.select("#photoAreaFacebook").style("display", "inline");
	d3.select("#photoArea").style("display", "none");
	d3.select("#photoSelect").property("disabled", true);
}

var photoTypeCustom = function() {
	d3.select("#photoAreaFacebook").style("display", "none");
	d3.select("#photoArea").style("display", "inline");
	d3.select("#photoSelect").property("disabled", false);
}

var photoTypeNone = function() {
	d3.select("#photoAreaFacebook").style("display", "none");
	d3.select("#photoArea").style("display", "none");
	d3.select("#photoSelect").property("disabled", true);
}

d3.select("#photoTypeFacebook").on("click", photoTypeFacebook);
d3.select("#photoTypeCustom").on("click", photoTypeCustom);
d3.select("#photoTypeNone").on("click", photoTypeNone);

var file1    = document.getElementById('photoSelect').files[0];
var reader1  = new FileReader();
if (file1) { reader.readAsDataURL(file); }
reader.addEventListener("load", function () { 
    imgsrc1 = reader.result;
});


var el = document.getElementById('photoDisplay');
var vanilla = new Croppie(el, {
    viewport: { width: 225, height: 225 },
    boundary: { width: 300, height: 300 }
});
vanilla.bind({
    url: imgsrc1
});
//on button click
//vanilla.result('canvas').then(function(base64Image) {
    // do something with cropped base64 image here
//});