var parse = require("./parse.js");
var fs = require("fs");

var inputFile = process.argv[2] || "test-source.lang";
var outputFile = inputFile + ".json";

fs.readFile(inputFile, "utf8", function (err, source) {
	var start = Date.now();
	var compiled = parse(source);
	var duration = Date.now() - start;
	console.log("successfully compiled in " + duration + "ms");
	fs.writeFile(outputFile, JSON.stringify(compiled), function () {
	});
});