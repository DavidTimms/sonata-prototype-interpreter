var buildTokenSet = require("../utils/build-token-set.js");
var type = require("../utils/type.js");

function mergeLines (linesIn, starts, ends) {
	var partialStarts = buildTokenSet(starts);
	var partialEnds = buildTokenSet(ends);
	var lines = linesIn.slice();
	for (var i = 0; i < lines.length; i++) {
		var line = recursivelyMerge(lines[i], starts, ends);
			nextLine = lines[i + 1], 
			lineEnd = line[line.length - 1];
		if (nextLine && (isOp(lineEnd) || partialEnds[lineEnd] ||
			isOp(nextLine[0]) || partialStarts[nextLine[0]])) {
			// merge lines
			var indent = line.indent;
			nextLine = recursivelyMerge(nextLine, starts, ends);
			lines[i + 1] = line.concat(nextLine);
			lines[i + 1].indent = indent;
			lines[i] = [];
		}
	}
	return lines.filter(function (line) {
		return line.length > 0;
	});
}

function recursivelyMerge (line, starts, ends) {
	for (var i = 0; i < line.length; i++) {
		if (type(line[i]) === "Array" && type(line[i][0]) === "Array") {
			line[i] = mergeLines(line[i], starts, ends);
		}
	}
	return line;
}

// REMOVE
function isOp (token) {
	return false;
	return mergeLines.opSet[token] || false;
}

module.exports = mergeLines;