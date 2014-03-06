function bundleBlocks (lines) {
	return bundleIndentLevel(lines, 0).sequence;
}

function bundleIndentLevel(lines, i) {
	var level = lines[i].indent;
	var sequence = [];
	var lastWasBlock = false;

	while (i < lines.length && lines[i].indent >= level) {
		if (lines[i][0] === "else") {
			var prev = sequence[sequence.length - 1];
			prev.push.apply(prev, lines[i]);
			lastWasBlock = false;
			i += 1;
		}
		else if (lines[i].indent > level) {
			if (lastWasBlock) {
				throw SyntaxError("Unexpected indentation level at line: "
					+ lines[i].join(" "));
			}
			var block = bundleIndentLevel(lines, i);
			sequence[sequence.length - 1].push(block.sequence);
			lastWasBlock = true;
			i = block.lineNum;
		}
		else {
			sequence.push(lines[i]);
			lastWasBlock = false;
			i += 1;
		}
	}
	return {sequence: sequence, lineNum: i};
}

module.exports = bundleBlocks;