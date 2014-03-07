var engine = require("./parse-engine.js");
var tokenize = require("./tokenize.js");
var buildTokenSet = require("./utils/build-token-set.js");
var mergeLines = require("./token-transformers/merge-lines.js");
var bundleBlocks = require("./token-transformers/bundle-blocks.js");
var type = require("./utils/type.js");
var rule = engine.rule;
var parse = engine.parse;
var rep0 = engine.rep0;
var rep1 = engine.rep1;

function printJSON (obj) {
	console.log(JSON.stringify(obj));
}

// PREDICATES

// binary operator predicate returns true if 
// str is a valid binary operator
var operators = ("^ ++ * / % + - >= <= == != > < && ||").split(" ");
var operator = (function () {
	var opSet = buildTokenSet(operators.join(" "));
	mergeLines.opSet = opSet;
	return function op (str) {
		return opSet[str] || false;
	};
})();

// unary operator predicate
var unaryOp = (function () {
	var unaryOpsStr = "! -";
	var unaryOpSet = buildTokenSet(unaryOpsStr);
	return function unaryOp (str) {
		return unaryOpSet[str] || false;
	};
})();

// assignment operator predicate
var mutateAssignOp = (function () {
	var mutateOpsStr = "+= -= *= /= ^= %= ++=";
	var mutateOpSet = buildTokenSet(mutateOpsStr);
	return function mutateAssignOp (str) {
		return mutateOpSet[str] || false;
	};
})();

// number predicate returns true 
// if str is a valid number
function num (str) {
	return (Number(str).toString() !== "NaN");
}

function stringLiteral (str) {
	return str[0] === "\"" || str[0] === "\'";
}

// build identifier predicate which
// returns true if str is a valid identifier 
var identifier = (function () {
	var identRegex = /^[$A-Z_][0-9A-Z_$]*$/i;
	var kw = "def if else try catch throw for while do var let in " +
			 "true false";
	var keyword = buildTokenSet(kw);
	return function (str) {
		return (type(str) === "string") && identRegex.test(str) && !keyword[str];
	};
})();

function isArray (obj) {
	return obj instanceof Array;
}

function notComma(token) {
	return token !== ",";
}

// GRAMMAR RULES

rule("sequence", [rep1(isArray)], function (lines) {
	return ["do"].concat(lines.map(function (line) {
		var parsed = parse.expression(line, 0);
		if (parsed && parsed.newPos === line.length) {
			//console.log("LINE:", parsed.result);
			return parsed.result;
		}
		throw SyntaxError("Unable to parse expression: " + line);
	}));
});

rule("expression", [rule("function")]);
rule("expression", [rule("binaryExpression")]);
rule("expression", [rule("declaration")]);
rule("expression", [rule("assignment")]);
rule("expression", [rule("ifExpression")]);
rule("expression", [rule("whileExpression")]);
rule("expression", [rule("forExpression")]);
rule("expression", [rule("doExpression")]);
rule("expression", [rule("atom")]);


rule("block", [rule("expression")], function (exp) {
	return ["do", exp[0]];
});
rule("block", [isArray], function (block) {
	//console.log(block[0]);
	var parsed = parse.sequence(block[0], 0);
	//console.log(parsed.result);
	if (!parsed) {
		throw SyntaxError("Unable to parse block: " + block);
	}
	return parsed.result;
});

rule("function", ["(", ")", "->", rule("block")], function (tokens) {
	return ["->", [], tokens[3]];
});
rule("function", [
		"(", 
		rep0(rule("assignable"), ","), 
		rule("assignable"),	
		")", 
		"->", 
		rule("block")
	], function (tokens) {
		//console.log(tokens[tokens.length - 1]);
		var args = tokens.slice(1, tokens.length - 3).filter(notComma);
		return ["->", args, tokens[tokens.length - 1]];
});
rule("function", ["->", rule("block")], function (tokens) {
	return ["->", [], tokens[1]];
});

rule("binaryExpression", [rep1(rule("atom"), operator), rule("atom")], 
	function (tokens) {
		// Top-down operator precedence associator
		operators.forEach(function (op) {
			for (var i = 0; i < tokens.length; i++) {
				if (tokens[i] === op) {
					tokens.splice(i - 1, 3, [op, tokens[i - 1], tokens[i + 1]]);
					i -= 1;
				}
			}
		});
		return tokens[0];
	});


// mutable variable declaration
rule("declaration", ["var", identifier, "=", rule("expression")], function (tokens) {
	return ["var", tokens[1], tokens[3]];
});
// Variable can be declared without an initial value, as it can be assigned to later
rule("declaration", ["var", identifier], function (tokens) {
	return [tokens[0], tokens[1]];
});
// immutable variable declaration
rule("declaration", ["let", identifier, "=", rule("expression")], function (tokens) {
	return ["let", tokens[1], tokens[3]];
});
// single function definition
rule("declaration", ["def", identifier, rule("function")], function (tokens) {
	return ["def", tokens[1], tokens[2]];
});
// single function definition
rule("declaration", ["def", identifier, ":", rule("patternBody")], function (tokens) {
	var patterns = tokens[3];
	// Verify that the pattern match functions are valid
	for (var i = 0; i < patterns.length; i++) {
		if (!(patterns[i] instanceof Array) || patterns[i][0] !== "->") {
			throw SyntaxError("pattern matched function declaration invalid");
		}
	}
	return ["def", tokens[1], patterns];
});

rule("patternBody", [isArray], function (block) {
	return block[0].map(function (pattern) {
		var parsed = parse.patternFunc(pattern);
		if (!parsed) {
			throw SyntaxError("Unable to parse pattern function: " + pattern);
		}
		return parsed.result;
	});
});

rule("patternFunc", ["(", rep0(rule("atom"), ","), rule("atom"), ")", "->", rule("block")], 
	function (tokens) {
		//console.log(tokens[tokens.length - 1]);
		var args = tokens.slice(1, tokens.length - 3).filter(notComma);
		return ["->", args, tokens[tokens.length - 1]];
});

// standard variable assignment (x = 5)
// and list decomposing assignment ([head | tail] = [1, 2, 3])
rule("assignment", [rule("assignable"), "=", rule("expression")], function (tokens) {
	return ["=", tokens[0], tokens[2]];
});
// mutating assignment (+=, *=, -= ...)
rule("assignment", [identifier, mutateAssignOp, rule("expression")], function (tokens) {
	var op = tokens[1];
	var subOp = op.substring(0, op.length - 1);
	return ["=", tokens[0], [subOp, tokens[0], tokens[2]]];
});

// variable
rule("assignable", [identifier]);
// list
rule("assignable", ["[", rep0(identifier, ","), identifier, "]"], function (tokens) {
	var members = tokens.slice(1, tokens.length - 1).filter(notComma);
	return ["List"].concat(members);
});
// head | tail list
rule("assignable", ["[", rep0(identifier, ","), identifier, "|", identifier, "]"], 
	function (tokens) {
		var head = tokens.slice(1, tokens.length - 3).filter(notComma);
		var tail = tokens[tokens.length - 2];
		return ["List:compose", head, tail];
});


rule("ifExpression", [
		"if", 
		rule("expression"), 
		":", 
		rule("block"),
		"else",
		":",
		rule("block")
	], function (tokens) {
		return ["if", tokens[1], tokens[3], tokens[6]];
});
rule("ifExpression", [
		"if", 
		rule("expression"), 
		":", 
		rule("block")
	], function (tokens) {
		return ["if", tokens[1], tokens[3]];
});

rule("whileExpression", [
		"while", 
		rule("expression"), 
		":", 
		rule("block")
	], function (tokens) {
		return ["while", tokens[1], tokens[3]];
});

rule("forExpression", ["for", identifier, "in", rule("expression"),	":", rule("block")], 
	function (tokens) {
		return ["for", tokens[1], tokens[3], tokens[5]];
});

rule("forExpression", [
		"for", 
		identifier, 
		":",
		identifier, 
		"in",
		rule("expression"),
		":", 
		rule("block")
	], function (tokens) {
		return ["for", [tokens[1], tokens[3]], tokens[5], tokens[7]];
});

rule("doExpression", ["do", ":", rule("block")], function (tokens) {
	return ["do", tokens[2]];
});

rule("atom", [rule("number")]);
rule("atom", [rule("string")]);
rule("atom", [rule("list")]);
rule("atom", [rule("boolean")]);
rule("atom", [rule("functionCall")]);
rule("atom", [rule("callable")]);
rule("atom", [rule("unaryExpression")]);

rule("boolean", ["true"], function () {return true});
rule("boolean", ["false"], function () {return false});

rule("callable", [identifier]);
rule("callable", ["(", rule("expression"), ")"], 1);

rule("number", [num, ".", num], function (tokens) {
	return Number(tokens.join(""));
});
rule("number", [num], Number);

rule("string", [stringLiteral], function (tokens) {
	return "'" + eval(tokens[0]) + "'";
});

rule("functionCall", [rule("callable"), "(", ")"], function (tokens) {
	return [tokens[0]];
});
rule("functionCall", [
		rule("callable"), 
		"(", 
		rep0(rule("expression"), ","), 
		rule("expression"),
		")"
	], function (tokens) {
		var args = tokens.slice(2, tokens.length - 1).filter(notComma);
		return [tokens[0]].concat(args);
});

rule("list", ["[", "]"], function () {return ["List"]});
rule("list", ["[", rep0(rule("expression"), ","), rule("expression"), "]"], 
	function (tokens) {
		var items = tokens.slice(1, tokens.length - 1).filter(notComma);
		return ["List"].concat(items);
});
// list composition
rule("list", [
	"[", 
	rep0(rule("expression"), ","), 
	rule("expression"), 
	"|", 
	rule("expression"), 
	"]"], 
	function (tokens) {
		var head = tokens.slice(1, tokens.length - 3).filter(notComma);
		var tail = tokens[tokens.length - 2];
		return ["List:compose", head, tail];
});

rule("unaryExpression", [unaryOp, rule("atom")], function (tokens) {
	if (tokens[0] === "-") {
		if (type(tokens[1]) !== "number") {
			throw SyntaxError("the - unary operator can only be used on numbers");
		}
		return tokens[1] * -1;
	}
	return tokens;
});

module.exports = function (source) {
	var tokenized = tokenize(source);
	var bundleOpStr1 = operators.join(" ") + " . ,";
	var merged1 = mergeLines(tokenized, bundleOpStr1, bundleOpStr1);
	var bundled = bundleBlocks(merged1);
	var merged2 = mergeLines(bundled, "} ) ]", "{ ( [");
	return parse.sequence(merged2).result;
};