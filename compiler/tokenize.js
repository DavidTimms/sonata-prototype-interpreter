var fs = require("fs");
var buildTokenSet = require("./utils/build-token-set.js");
var print = console.log.bind(console);

function tokenize (str) {
	var input = str.split("");
	var lines = [[]];
	var tokens = lines[0];
	var token = "";

	var inString = false;
	var quoteChar;
	var quoteChars = buildTokenSet(tokenize.options.quoteChars);

	var indent = 0;

	var inOp = false;
	// build an object with every symbol and every
	// prefix of every symbol as a key mapped to true
	var partialOp = buildTokenSet(tokenize.options.multiCharSymbols, {prefixs: true});

	var lineCommentSymbol = tokenize.options.lineCommentSymbol;

	function pushToken () {
		if (token !== "") {
			if (token === lineCommentSymbol) {
				// Create a token list not in the output for the comment
				tokens = [];
			}
			tokens.push(token);
			token = "";
		}
	}

	for (var i = 0; i < input.length; i++) {
		var chr = input[i];
		// Whitespace Character
		if (!inString && chr.match(/\s/)) {
			if (inOp) {
				pushToken();
				inOp = false;
			}

			if (chr === "\n") {
				pushToken();
				tokens = [];
				lines.push(tokens);
				indent = 0;
			}
			else {
				if (indent !== null) {
					indent += 1;
				}
				else {
					pushToken();
				}
			}
		}
		else  {
			// Add indent width number to start of line
			if (indent !== null) {
				if (tokenize.options.serializable) {
					tokens.push(indent);
				}
				else {
					tokens.indent = indent;
				}
				indent = null;
			}

			// Quote Character
			if (quoteChars[chr]) {
				if (inString) {
					token += chr;
					if (chr === quoteChar) {
						pushToken();
						inString = false;
					}
				}
				else {
					pushToken();
					inOp = false;
					inString = true;
					quoteChar = chr;
					token += chr;
				}
			}
			// Symbol Character
			else if (!inString && chr.match(/\W/)) {
				if (!inOp) {
					pushToken();
					inOp = true;
				}
				if (!partialOp[token + chr]) {
					pushToken();
				}
				token += chr;
			}
			// Identifier / Number Character
			else {
				// Escape chars in strings following a backslash
				if (inString && chr === "\\") {
					token += chr;
					i = i + 1;
					chr = input[i];
				}

				// End operator token
				if (inOp) {
					pushToken();
					inOp = false;
				}

				// Start new token
				token += chr;
			}
		}
	}
	// flush the token buffer
	pushToken();

	if (tokenize.options.flattenLines) {
		return lines.reduce(function (l1, l2) {
			return l1.concat(l2);
		});
	}
	return lines;
}
tokenize.options = {
	quoteChars: "\" '",
	multiCharSymbols: "// /* */ == === != !== <= >= && || ++ -> += -= *= /= ^= %= ++=",
	lineCommentSymbol: "//",
	flattenLines: false,
	serializable: false
};

module.exports = tokenize;

/*
if (!process.argv[2]) {
	throw Error("No input file specified");
}
var source = fs.readFileSync(process.argv[2], "utf8");
tokenize(source).forEach(function (line) {
	print("'" + line.join("','") + "'");
});
*/