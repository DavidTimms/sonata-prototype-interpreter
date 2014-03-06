var fs = require("fs");
var List = require("./vm-utils/linked-list.js");

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
	out("returned " + evl(code));
	//out("returned " + evl(["print", ["List"]]));
});

function out (s) {
	console.log("VM: " + s);
	return s;
}

function cloneArray (arr) {
	var clone = [];
	for (var i = 0; i < arr.length; i++) {
		clone.push(arr[i]);
	}
	return clone;
}

var globalNS = {
	print: function (args) {
		var s = args.join(" ");
		console.log(s);
		return s;
	},
	"do": function (args, functionBody) {
		scopes.push({});
		// evaluate each expression in the block
		for (var i = 0; i < args.length - 1; i++) {
			evl(args[i]);
		}
		var last = evl(args[i], functionBody);
		scopes.pop();
		return last;
	},
	"var": function (args) {
		return assignVariable(args, "declaration");
	},
	"=": assignVariable,
	"==": function (args) {
		if (args[0] instanceof List && args[1] instanceof List) {
			return List.equal(args[0], args[1]);
		}
		return args[0] === args[1];
	},
	"!=": function (args) {
		if (args[0] instanceof List && args[1] instanceof List) {
			return !List.equal(args[0], args[1]);
		}
		return args[0] !== args[1];
	},
	"!": function (args) {
		return !args[0];
	},
	"^": function (args) {
		return Math.pow(args[0], args[1]);
	},
	"++": function (args) {
		if (args[0] instanceof List && args[1] instanceof List) {
			return args[0].concat(args[1]);
		}
		return ("" + args[0]) + args[1];
	},
	"if": function (args, inTailPosition) {
		if (evl(args[0])) {
			return evl(args[1], inTailPosition);
		}
		else if (args[2] !== undefined) {
			return evl(args[2], inTailPosition);
		}
		return false;
	},
	"while": function (args) {
		var result = false;
		while (evl(args[0])) {
			result = evl(args[1]);
		}
		return result;
	},
	"for": function (args) {
		var results = [];
		var current = list = evl(args[1]);
		var indexName, valueName;
		var i = 0;
		if (args[0] instanceof Array) {
			// index and value named
			indexName = args[0][0];
			valueName = args[0][1];
		}
		else {
			// just value named
			valueName = args[0];
		}
		while (current) {
			// create loop scope
			var loopScope = {};
			loopScope[valueName] = current.head;
			if (indexName) {
				// set named array index
				loopScope[indexName] = i;
				i += 1;
			}
			scopes.push(loopScope);
			// push loop
			results.push(evl(args[2]));
			scopes.pop();
			current = current.tail;
		}
		var resultList = List.fromArray(results);
		return resultList;
	},
	"->": function (funcDef) {
		var argNames = funcDef[0];
		var body = funcDef[1];
		var func = function (args) {
			var callingFunction = currentFunction;
			currentFunction = func;
			var oldScopes = scopes;
			do {
				tailCall = false;
				scopes = func.closure;
				scopes.push({});
				for (var i = 0; i < argNames.length; i++) {
					assignVariable([argNames[i], args[i]], "declaration", "don't eval");
				}
				var result = evl(body, true);
				scopes.pop();
				// for next iteration of TCO
				args = result;
			} while (tailCall);
			scopes = oldScopes;
			currentFunction = callingFunction;
			return result;
		};
		func.closure = cloneArray(scopes);
		return func;
	},
	List: function (args) {
		return List.fromArray(args);
	},
	"List:compose": function (args) {
		var heads = args[0];
		var list = evl(args[1]);
		if (!(list instanceof List)) {
			throw Error("tail of a list must be a list. Variable '" + args[1] + "' is not.");
		}
		for (var i = heads.length - 1; i >= 0; i--) {
			list = list.add(evl(heads[i]));
		}
		return list;
	},
	"//": function () {},
	head: function (args) {
		return args[0].head;
	},
	tail: function (args) {
		return args[0].tail;
	},
	length: function (args) {
		return args[0].length;
	},
	ensure: function (args) {
		for (var i = 0; i < args.length; i++) {
			if (!evl(args[i])) {
				throw Error("Check failed: " + args[i]);
			}
		}
		return true;
	},
	show_scopes: function () {
		out(JSON.stringify(scopes));
	},
	timer: function () {
		var start = Date.now();
		return function () {
			return Date.now() - start;
		}
	}
};

[
	"var",
	"=",
	"if",
	"while",
	"for",
	"->",
	"List:compose",
	"ensure",
	"//",
	"do"
].forEach(function (command) {
	globalNS[command].dontEval = true;
});
globalNS["let"] = globalNS["var"];
globalNS["def"] = globalNS["var"];

var scopes = [globalNS];
var currentFunction, tailCall = false;

function getVal (identifier) {
	for (var i = scopes.length - 1; i >= 0; i--) {
		if (identifier in scopes[i]) {
			return scopes[i][identifier];
		}
	}
	throw Error("The variable '" + identifier + "' does not exist");
}

function setVal (identifier, val) {
	for (var i = scopes.length - 1; i >= 0; i--) {
		if (scopes[i][identifier] !== undefined) {
			scopes[i][identifier] = val;
			return val;
		}
	}
	scopes[scopes.length - 1][identifier] = val;
	return val;
}

function assignVariable (args, declaration, dontEval) {
	var i;
	var left = args[0];
	var result = ((args[1] === undefined  || dontEval) ? args[1] : evl(args[1]));
	var topScope = scopes[scopes.length - 1];
	if (left instanceof Array) {
		var current = result;
		if (left[0] === "List") {
			for (i = 1; i < left.length; i++) {
				if (declaration) {
					// declaring new variables
					if (current) {
						topScope[left[i]] = current.head;
						current = current.tail;
					}
					else {
						topScope[left[i]] = undefined;
					}
				}
				else {
					// assigning existing variables
					getVal(left[i]);
					if (current) {
						setVal(left[i], current.head);
						current = current.tail;
					}
					else {
						setVal(left[i], undefined);
					}
				}
			}
		}
		else if (left[0] === "List:compose") {
			var heads = left[1];
			for (i = 0; i < heads.length; i++) {
				if (declaration) {
					// declaring new variables
					if (current) {
						topScope[heads[i]] = current.head;
						current = current.tail;
					}
					else {
						topScope[heads[i]] = undefined;
					}
				}
				else {
					// assigning existing variables
					getVal(heads[i]);
					if (current) {
						setVal(heads[i], current.head);
						current = current.tail;
					}
					else {
						setVal(heads[i], undefined);
					}
				}
			}
			if (declaration) {
				topScope[left[2]] = current;
			}
			else {
				setVal(left[2], current);
			}
		}
		else {
			throw Error("invalid left side in assignment");
		}
		return result;
	}
	if (declaration) {
		return topScope[left] = result;
	}
	else {
		getVal(left);
		return setVal(left, result);
	}
}

["+", "-", "*", "/", "%", "<", ">", ">=", "<=", "&&", "||"].forEach(function (op) {
	var body = "return args[0] " + op + " args[1]";
	globalNS[op] = new Function("args", body);
});

function evl (exp, inTailPosition) {
	if (exp instanceof Array) {
		var args, func = evl(exp[0]);
		if (func.dontEval) {
			args = exp.slice(1);
			// call the function
			return func(args, inTailPosition);
		}
		else {
			// evaluate each argument
			args = [];
			for (var i = 1; i < exp.length; i++) {
				args.push(evl(exp[i]));
			}
			if (inTailPosition && false) { // DISABLED TCO
				// return arguments for tail call
				if (func == currentFunction) {
					tailCall = true;
					return args;
				}
				else if (exp[0] = "if") {
					return func(args, inTailPosition);
				}
			}
			// call the function
			if (typeof func !== 'function') {
				console.log("not a function: ", func);
				console.log("in expression: ", exp);
				process.exit();
			}
			return func(args);
		}
	}
	// boolean literals
	else if (exp === true || exp === false) {
		return exp;
	}
	// number literals
	else if (typeof exp === "number") {
			return exp;
	}
	// string literals
	else if (exp.charAt(0) === "'") {
		return exp.substr(1, exp.length - 2);
	}
	// dereference variables
	else {
		return getVal(exp);
	}
}