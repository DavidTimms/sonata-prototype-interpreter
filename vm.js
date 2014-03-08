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
		return assignVariable(name, value, {declaration: true});
	}),
	"let": meta(function (name, value) {
		var evaluated = assignVariable(name, value, {
			declaration: true,
			immutable: true
		});
		return evaluated;
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
			var loopScope = new Scope();
			loopScope[valueName] = current.head;
			if (indexName) {
				// set named array index
				loopScope[indexName] = i;
				i += 1;
			}
			stack.push(loopScope);
			// push loop
			result = evl(body);
			if (result instanceof Message) {
				if (result.type === "break") {
					results.push(result.data);
					stack.pop();
					break;
				}
				else if (result.type === "return") {
					stack.pop();
					return result.data;
				}
				else if (result.type === "next") {
					result = result.data;
				}
			}
			results.push(result);
			stack.pop();
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
			var oldScopes = stack;
			var tcoCount = 0;
			do {
				//console.log("TCO Count:", tcoCount++);
				stack = func.closure;
				stack.push(new Scope());
				for (var i = 0; i < argNames.length; i++) {
					//console.log(argNames[i], "=", args[i]);
					assignVariable(argNames[i], args[i], {declaration: true, dontEval: true});
				}
				var result = evl(body, true);
				stack.pop();
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
			stack = oldScopes;
			currentFunction = callingFunction;
			return result;
		};
		func.closure = cloneArray(stack);
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
	ensure: meta(function (expression) {
		if (!evl(expression)) {
			throw Error("Check failed: " + lispify(expression));
		}
		return true;
	}),
	"throws": meta(function (expression) {
		try {
			evl(expression);
			return false;
		}
		catch (e) {
			return true;
		}
	}),
	show_stack: function () {
		out(JSON.stringify(stack));
	},
	timer: function () {
		var start = Date.now();
		return function () {
			return Date.now() - start;
		}
	}
};
// duplicate let to def
globalNS["def"] = globalNS["let"];

var stack = [globalNS];

function Scope () {
	// object to store immutability flags
	// for variables in this scope
	this.$immutable = {};
}

var currentFunction, tailCall = false;

function getVal (identifier) {
	for (var i = stack.length - 1; i >= 0; i--) {
		if (identifier in stack[i]) {
			return stack[i][identifier];
		}
	}
	throw Error("The variable '" + identifier + "' does not exist");
}

function setVal (identifier, val) {
	// move down the stack until the variable is found then assign to it
	for (var i = stack.length - 1; i >= 0; i--) {
		if (stack[i][identifier] !== undefined) {
			if (stack[i].$immutable[identifier]) {
				throw Error("The variable " + identifier + 
					" is immutable and cannot be assigned to");
			}
			stack[i][identifier] = val;
			return val;
		}
	}
	throw Error("the variable " + identifier + 
		" cannot be assigned to before it is defined");
}

function assignVariable (left, right, options) {
	options = options || {};
	var i, declaration = options.declaration;
	var result = (right === undefined  || options.dontEval) ? right : evl(right);
	var topScope = stack[stack.length - 1];

	// destructuring list assignment 
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
	// standard single variable assignment
	if (declaration) {
		if (options.immutable) {
			// set immutable flag in scope
			topScope.$immutable[left] = true;
		}
		if (topScope[left] !== undefined) {
			throw Error("The variable " + left + " is already declared in this scope");
		}
		return topScope[left] = result;
	}
	else {
		return setVal(left, result);
	}
}

// Generate functions for the basic arithmetic and logically operations
["+", "-", "*", "/", "%", "<", ">", ">=", "<="].forEach(function (op) {
	var body = "return a " + op + " b";
	globalNS[op] = new Function("a", "b", body);
});

function evl (exp, inTailPosition) {
	if (exp instanceof Array) {
		// evaluate block expressions in tern and return the last
		if (exp[0] === "do") {
			stack.push(new Scope());
			var result;
			// evaluate each expression in the block
			for (var i = 1; i < exp.length - 1; i++) {
				result = evl(exp[i]);
				if (result instanceof Message) {
					stack.pop();
					return result;
				}
			}
			result = evl(exp[i], inTailPosition);
			stack.pop();
			return result;
		}
		else {
			var args, func = evl(exp[0]);
			if (func.isMeta) {
				// special case for "if" to add tail position flag
				if(exp[0] === "if" && inTailPosition) {
					return func(exp[1], exp[2], exp[3], inTailPosition);
				}

				// apply the unevaluated arguments to the meta-function
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
				// evaluate the arguments and apply them to the function
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