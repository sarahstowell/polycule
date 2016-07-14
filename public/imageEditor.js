
var addPhotoEdit = function(imgsrc, x1, y1, x2, y2) {

	var width=null, height=null, minsize = null;
	var maxwidth = 540;
	var maxheight = 1000;
	
	var img = new Image();
	
	img.src = imgsrc;
	
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

        document.getElementById("width").value = width;
		document.getElementById("height").value = height;

   
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
	
		var locationUpdate = function() {
		
			path1
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
}

d3.select("#photoSelect")
	.on("change", photoSelect);

function photoSelect() {

  var imgsrc  = null;
  var file    = document.getElementById('photoSelect').files[0];
  var reader  = new FileReader();

  reader.addEventListener("load", function () {
    
    imgsrc = reader.result;

	addPhotoEdit(imgsrc, 50, 50, 275, 275);	
	
	//img.src = imgsrc;
  }, false);

  if (file) { reader.readAsDataURL(file); }
}


