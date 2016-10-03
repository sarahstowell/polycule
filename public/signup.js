// Google maps autocomplete
var locationInput = document.getElementById('location');
var autocomplete = new google.maps.places.Autocomplete(locationInput, { types: ['(cities)'], region:'EU' });

// Photo copping tool
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

// Signup form validation
var validateForm = function(formtype) {

    var photoCoords = vanilla.get().points;
	document.getElementById("x1").value = photoCoords[0];
	document.getElementById("y1").value = photoCoords[1];
	document.getElementById("x2").value = photoCoords[2];
	document.getElementById("y2").value = photoCoords[3];
	
	/*
	vanilla.result('canvas').then(function(base64Image) {
    // do something with cropped base64 image here
        
    document.getElementById("croppedPhoto").value = base64Image;
        var blob = new Blob([base64Image], { type: "image/png,base64"});
        var fd = new FormData(document.forms[0]);
        fd.append("croppedPhoto", blob, 'image.png');
    });
    */
    
    
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