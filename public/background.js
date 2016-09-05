window.alert("file read");

var width = window.innerWidth-50;
var height = window.innerHeight-50;

var viewbox="0 0 "+width+" "+height;

var color = d3.scale.category20();

var force = d3.layout.force()
	.charge(-120)
	.linkDistance(30)
	.size([width, height]);

var svg = d3.select("#backsvg")
	.attr("width", width)
	.attr("height", height)
	.attr("viexBox", viewbox);

function arrayObjectIndexOf(myArray, searchTerm, property) {
	for(var i = 0, len = myArray.length; i < len; i++) {
		if (myArray[i][property] === searchTerm) return i;
	}
	return -1;
}

d3.json("exampleData.json", function(error, graph) {
	if (error) throw error;

	var links = graph.links;
	var nodes = graph.nodes;

	for (i=0; i<links.length; i++) {
		links[i].source = arrayObjectIndexOf(nodes, links[i].sourceId, "id");
		links[i].target = arrayObjectIndexOf(nodes, links[i].targetId, "id");
	}

	force
		.nodes(nodes)
		.links(links)
		.start();

	var link = svg.selectAll(".link")
		.data(links)
	.enter().append("line")
		.attr("class", "link");

	var node = svg.selectAll(".node")
		.data(nodes)
	.enter().append("circle")
		.attr("class", "node")
		.attr("r", 5)
		.style("fill", "black")
		.style("stroke", "white")
		.call(force.drag);

	node.append("title")
		.text(function(d) { return d.name; });

	force.on("tick", function() {
		link.attr("x1", function(d) { return d.source.x; })
			.attr("y1", function(d) { return d.source.y; })
			.attr("x2", function(d) { return d.target.x; })
			.attr("y2", function(d) { return d.target.y; });

		node.attr("cx", function(d) { return d.x; })
			.attr("cy", function(d) { return d.y; });
	});
});

function reSize() {
	var svg = d3.select("#backsvg")
		.attr("width", window.innerWidth-50)
		.attr("height", window.innerHeight-50);
}