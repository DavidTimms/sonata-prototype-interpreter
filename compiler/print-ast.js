var fs = require("fs");

function printAST(exp, indent) {
	indent = indent || "";
	if (exp instanceof Array) {
		for (var i = 0; i < exp.length; i++) {
			printAST(exp[i], indent + "  ");
			if (i > 0 && exp[0] === "do") {
				console.log(indent + "    ----");
			}
		}
	}
	else {
		console.log(indent + exp);
	}
}

// if run directly
if (require.main === module) {
	var inputFile = process.argv[2] || "test-output.json";
	var inputIsAST = !! inputFile.match(/.json$/);
	fs.readFile(inputFile, "utf8", function (err, source) {
		if (err) throw err;
		var code;
		if (inputIsAST) {
			code = JSON.parse(source);
		}
		else {
			var parser = require("./lang.js");
			code = parser.parse(source);
		}
		printAST(code);
	});
}
// if in a module
else {
	module.exports = printAST;
}