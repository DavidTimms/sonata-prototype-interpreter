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
		throw Error("input must be JSON");
		//var parser = require("./lang.js");
		//code = parser.parse(source);
	}
	out("returned ", evl(code));
	//out("returned " + evl(["print", ["List"]]));
});

function out () {
	var args = Array.prototype.slice.call(arguments);
	console.log.apply(console, ["VM:"].concat(args));
}

function lispify (exp) {
	if (exp instanceof Array) {
		return "(" + exp.map(lispify).join(" ") + ")";
	}
	return "" + exp;
}

function cloneArray (arr) {
	var clone = [];
	for (var i = 0; i < arr.length; i++) {
		clone.push(arr[i]);
	}
	return clone;
}

function Message (type, data) {
	this.type = type;
	this.data = data;
}

// mark a function as a meta-function meaning its 
// arguments are not evaluated before it is called
function meta (func) {
	func.isMeta = true;
	return func;
}

var globalNS = {
	print: function () {
		var s = ([]).join.call(arguments, " ");
		console.log(s);
		return s;
	},
	"var": meta(function (name, value) {
		return assignVariable(name, value, "declaration");
	}),
	"=": meta(assignVariable),
	"==": function (a, b) {
		if (a instanceof List && b instanceof List) {
			return List.equal(a, b);
		}
		return a === b;
	},
	"!=": function (a, b) {
		if (a instanceof List && b instanceof List) {
			return !List.equal(a, b);
		}
		return a !== b;
	},
	"!": function (a) {
		return !a;
	},
	"||": meta(function (a, b) {
		return evl(a) || evl(b);
	}),
	"&&": meta(function (a, b) {
		return evl(a) && evl(b);
	}),
	"^": function (a, b) {
		return Math.pow(a, b);
	},
	"++": function (a, b) {
		if (a instanceof List && b instanceof List) {
			return a.concat(b);
		}
		return ("" + a) + b;
	},
	"if": meta(function (condition, ifBody, elseBody, inTailPosition) {
		if (evl(condition)) {
			return evl(ifBody, inTailPosition);
		}
		else if (elseBody !== undefined) {
			return evl(elseBody, inTailPosition);
		}
		return false;
	}),
	"while": meta(function (condition, body) {
		var result = false;
		while (evl(condition)) {
			result = evl(body);
			if (result instanceof Message) {
				if (result.type === "break") {
					return result.data;
				}
				else if (result.type === "next") {
					result = result.data;
				}
				else if (result.type === "return") {
					return result;
				}
			}
		}
		return result;
	}),
	"for": meta(function (loopVar, collection, body) {
		var result;
		var results = [];
		var current = list = evl(collection);
		var indexName, valueName;
		var i = 0;
		if (loopVar instanceof Array) {
			// index and value named
			indexName = loopVar[0];
			valueName = loopVar[1];
		}
		else {
			// just value named
			valueName = loopVar;
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
			result = evl(body);
			if (result instanceof Message) {
				if (result.type === "break") {
					results.push(result.data);
					scopes.pop();
					break;
				}
				else if (result.type === "return") {
					scopes.pop();
					return result.data;
				}
				else if (result.type === "next") {
					result = result.data;
				}
			}
			results.push(result);
			scopes.pop();
			current = current.tail;
		}
		var resultList = List.fromArray(results);
		return resultList;
	}),
	"break": function (value) {
		return new Message("break", value);
	},
	"return": function (value) {
		return new Message("return", value);
	},
	"next": function (value) {
		return new Message("next", value);
	},
	"->": meta(function (argNames, body) {
		var func = function () {
			var args = arguments;
			var callingFunction = currentFunction;
			currentFunction = func;
			// save calling scope to return to after the function call
			var oldScopes = scopes;
			var tcoCount = 0;
			do {
				//console.log("TCO Count:", tcoCount++);
				scopes = func.closure;
				scopes.push({});
				for (var i = 0; i < argNames.length; i++) {
					//console.log(argNames[i], "=", args[i]);
					assignVariable(argNames[i], args[i], "declaration", "don't eval");
				}
				var result = evl(body, true);
				scopes.pop();
				// for next iteration of TCO
				if (result instanceof Message) {
					if (result.type === "tailCall") {
						args = result.data;
						continue;
					}
					if (result.type === "return") {
						result = result.data;
					}
				}
				break;
			} while (true);
			scopes = oldScopes;
			currentFunction = callingFunction;
			return result;
		};
		func.closure = cloneArray(scopes);
		return func;
	}),
	"List": function () {
		return List.fromArray(arguments);
	},
	"List:compose": meta(function (heads, tail) {
		var list = evl(tail);
		if (!(list instanceof List)) {
			throw Error("tail of a list must be a list. Variable '" + tail + "' is not.");
		}
		for (var i = heads.length - 1; i >= 0; i--) {
			list = list.add(evl(heads[i]));
		}
		return list;
	}),
	head: function (list) {
		return list.head;
	},
	tail: function (list) {
		return list.tail;
	},
	length: function (list) {
		return list.length;
	},
	ensure: meta(function () {
		for (var i = 0; i < arguments.length; i++) {
			if (!evl(arguments[i])) {
				if (arguments[i] === "==") {
					console.log(lispify(arguments[i][1]) + " => " + evl(arguments[i][1]));
					console.log(lispify(arguments[i][2]) + " => " + evl(arguments[i][2]));
				}
				throw Error("Check failed: " + lispify(arguments[i]));
			}
		}
		return true;
	}),
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
// duplicate var to let and def
// they will behave differently later
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

function assignVariable (left, right, declaration, dontEval) {
	var i;
	var result = ((right === undefined  || dontEval) ? right : evl(right));
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

["+", "-", "*", "/", "%", "<", ">", ">=", "<="].forEach(function (op) {
	var body = "return a " + op + " b";
	globalNS[op] = new Function("a", "b", body);
});

function evl (exp, inTailPosition) {
	if (exp instanceof Array) {
		// evaluate block expressions in tern and return the last
		if (exp[0] === "do") {
			scopes.push({});
			var result;
			// evaluate each expression in the block
			for (var i = 1; i < exp.length - 1; i++) {
				result = evl(exp[i]);
				if (result instanceof Message) {
					scopes.pop();
					return result;
				}
			}
			result = evl(exp[i], inTailPosition);
			scopes.pop();
			return result;
		}
		else {
			var args, func = evl(exp[0]);
			if (func.isMeta) {
				// special case for "if" to add tail position flag
				if(exp[0] === "if" && inTailPosition) {
					return func(exp[1], exp[2], exp[3], inTailPosition);
				}

				// Call the function to evaluate the expression
				switch (exp.length) {
					case 1:  return func();
					case 2:  return func(exp[1]);
					case 3:  return func(exp[1], exp[2]);
					case 4:  return func(exp[1], exp[2], exp[3]);
					case 5:  return func(exp[1], exp[2], exp[3], exp[4]);
					case 6:  return func(exp[1], exp[2], exp[3], exp[4], exp[6]);
					default: return func.apply(null, exp.slice(1));
				}
			}
			else {
				if (inTailPosition) {
					// return arguments for tail call
					if (func === currentFunction) {
						// evaluate each argument
						args = [];
						for (var i = 1; i < exp.length; i++) {
							args.push(evl(exp[i]));
						}
						return new Message("tailCall", args);
					}
				}
				// call the function
				if (typeof func !== 'function') {
					console.log("not a function: ", func);
					console.log("in expression: ", exp);
					process.exit();
				}
				switch (exp.length) {
					case 1:  return func();
					case 2:  return func(evl(exp[1]));
					case 3:  return func(evl(exp[1]), evl(exp[2]));
					case 4:  return func(evl(exp[1]), evl(exp[2]), 
						evl(exp[3]));
					case 5:  return func(evl(exp[1]), evl(exp[2]), 
						evl(exp[3]), evl(exp[4]));
					case 6:  return func(evl(exp[1]), evl(exp[2]), 
						evl(exp[3]), evl(exp[4]), evl(exp[5]));
					default: return func.apply(null, exp.slice(1));
				}
			}
				
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