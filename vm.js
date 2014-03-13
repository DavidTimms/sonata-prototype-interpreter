var fs = require("fs");
var jit = require("./jit.js");
var jitFunction = jit.jitFunction;
var mori = require("mori");
var list = mori.list;
var conj = mori.conj;
var cons = mori.cons;
var isMori = mori.is_collection;
var isSeq = mori.is_seq;
var first = mori.first;
var rest = mori.rest;

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
	}
	out("returned", evl(code));
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

function arrayToList (arr) {
	var l = list();
	for (var i = arr.length - 1; i >= 0; i--) {
		l = cons(arr[i], l);
	}
	return l;
}

// return a function which returns each item of the collection
function iterate (collection) {
	return function () {
		var head = first(collection);
		collection = rest(collection);
		return head;
	}
}

// System message constructor
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

function listCompose (heads, tail) {
	if (!isSeq(tail)) {
		throw Error("tail of a list must be a list, but found " + tail);
	}
	var newList = tail;
	for (var i = heads.length - 1; i >= 0; i--) {
		newList = cons(heads[i], newList);
	}
	return newList;
}

function sonataAdd (a, b) {
	var res = a + b;
	return (typeof res === 'number' ? res : NaN);
}

var whileLoop = meta(function (condition, body) {
	var result = false;

	while (evl(condition)) {
		stack.push(new Scope());
		result = evl(body);
		if (result instanceof Message) {
			if (result.type === "break") {
				stack.pop();
				return result.data;
			}
			else if (result.type === "next") {
				result = result.data;
			}
			else if (result.type === "return") {
				stack.pop();
				return result;
			}
		}
		stack.pop();
	}
	return result;
});

var forLoop = meta(function (loopVar, collection, body) {
	var result;
	var results = [];
	var items = evl(collection);
	var nextVal = (typeof items === 'function' ? items : iterate(items));
	var indexName, valueName;
	var value;
	var index = 0;
	if (loopVar instanceof Array) {
		// index and value named
		indexName = loopVar[0];
		valueName = loopVar[1];
	}
	else {
		// just value named
		valueName = loopVar;
	}
	while ((value = nextVal()) !== stopIteration) {
		// create loop scope
		var loopScope = new Scope();
		stack.push(loopScope);
		loopScope[valueName] = value;
		if (indexName) {
			// set named array index
			loopScope[indexName] = index;
			index += 1;
		}
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
	}
	return arrayToList(results);
});

function equal (a, b) {
	if (isMori(a) && isMori(b)) {
		return mori.equals(a, b);
	}
	return a === b;
}

function notEqual (a, b) {
	if (isMori(a) && isMori(b)) {
		return !mori.equals(a, b);
	}
	return a !== b;
}

var stopIteration = null;

var globalNS = {
	read_file: function (filename, encoding) {
		return fs.readFileSync(filename, encoding || "utf8");
	},
	read_file_async: function (filename, encoding, callback) {
		if (typeof encoding === 'function') {
			callback = encoding;
			encoding = "utf8";
		}
		return fs.readFile(filename, encoding, callback);
	},
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
	"==": equal,
	"!=": notEqual,
	"+": sonataAdd,
	is_list: mori.is_list,
	is_seq: mori.is_seq,
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
	"&": function (a, b) {
		return ("" + a) + b;
	},
	"++": function (a, b) {
		if (!isSeq(a)) {
			a = list(a);
		}
		if (!isSeq(b)) {
			b = list(b);
		}
		return mori.concat(a, b);
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
	"while": whileLoop,
	"for": forLoop,
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
					assignVariable(argNames[i], args[i], {
						declaration: true, 
						dontEval: true,
						immutable: true
					});
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
		func.argNames = argNames;
		func.bodyExpression = body;
		return func;
	}),
	"List": list,
	"List:compose": listCompose,
	first: mori.first,
	rest: mori.rest,
	length: mori.count,
	range: function (from, to) {
		if (to === undefined) {
			to = from;
			from = 0;
		}
		to = Math.floor(to);
		var step = (from < to ? 1 : -1);
		var curr = Math.floor(from) - step;
		return function () {
			return ((curr += step) === to ? null : curr); 
		}
	},
	"Dict": function () {
		var dict = {};
		var dictFunc = function (key, value) {
			if (arguments.length === 2) {
				dict[key] = value;
				return dictFunc;
			}
			else {
				return dict[key];
			}
		};
		dictFunc.toJSON = function () {
			return JSON.stringify(dict);
		}
		return dictFunc;
	},
	"to_json": function (dict) {
		return dict.toJSON();
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
	jit_function: function (baseFunc) {
		try {
			var funcSource = jitFunction(baseFunc);
			if (!funcSource) return baseFunc;
			//console.log(funcSource);
			var jittedFunc = eval(funcSource);
			jittedFunc.closure = baseFunc.closure;
			return jittedFunc;
		}
		catch (e) {
			console.log(e);
			console.log("failed to evaluate jit function source");
			return baseFunc;
		}
	},
	print_stack: function () {
		console.log("MEMORY STACK");
		for (var i = stack.length - 1; i >= 0; i--) {
			var scope = stack[i];
			for (var key in scope) {
				if (key === "$immutable") continue;
				var immutability = (scope.$immutable[key] ? "(imm)" : "(mut)");
				if (typeof scope[key] === 'function') {
					console.log(immutability, key + ": " + "function/" + scope[key].length);
				}
				else {
					console.log(immutability, key + ": " + scope[key]);
				}
			}
			console.log("----------");
		};
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

// Generate functions for the basic arithmetic and logically operations
["-", "*", "/", "%", "<", ">", ">=", "<="].forEach(function (op) {
	var body = "return a " + op + " b";
	globalNS[op] = new Function("a", "b", body);
});

(function () {
	for (var key in globalNS) {
		if (globalNS[key].isMeta) {
			jit.registerMetaFunction(key);
		}
	}
})();

// create initial stack
var topLevel = new Scope();
for (var prop in globalNS) {
	topLevel[prop] = globalNS[prop];
	topLevel.$immutable[prop] = true;
}
var stack = [topLevel];

function Scope () {
	// object to store immutability flags
	// for variables in this scope
	this.$immutable = {};
}

function throwError(msg) {

}

var currentFunction, tailCall = false;

function getVal (identifier) {
	for (var i = stack.length - 1; i >= 0; i--) {
//		if (stack[i].hasOwnProperty(identifier)) {
		if (stack[i][identifier] !== undefined) {
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

function decomposeList (lefts, rights, options) {
	options.dontEval = true;
	if (rights !== null) {
		for (i = 0; i < lefts.length; i++) {
			assignVariable(lefts[i], first(rights), options);
			rights = rest(rights) || list();
		}
	}
	else {
		for (i = 0; i < lefts.length; i++) {
			assignVariable(lefts[i], null, options);
		}
	}
	return rights;
}

function assignVariable (left, right, options) {
	options = options || {};
	var i, declaration = options.declaration;
	var topScope = stack[stack.length - 1];
	var result = null;
	if (right !== undefined) {
		result = (options.dontEval ? right : evl(right));
	}

	// destructuring list assignment 
	if (left instanceof Array) {
		if (left[0] === "List") {
			decomposeList(left.slice(1), result, options);
			return result;
		}
		else if (left[0] === "List:compose") {
			// decompose the head of the list then carry on to
			// assign the tail in the normal way
			result = decomposeList(left[1], result, options);
			left = left[2];
		}
		else {
			throw Error("invalid left side in assignment");
		}
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

// Main function for evaluating an expression
function evl (exp, inTailPosition) {
	switch (typeof exp) {
		case "object":
			//out("evaluating " + lispify(exp));
			// evaluate block expressions in tern and return the last
			if (exp[0] === "do") {
				var result;
				// evaluate each expression in the block
				for (var i = 1; i < exp.length - 1; i++) {
					result = evl(exp[i]);
					if (result instanceof Message) {
						return result;
					}
				}
				result = evl(exp[i], inTailPosition);
				return result;
			}
			else {
				var func = evl(exp[0]);
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
							var args = [];
							// evaluate each argument
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
						default: return func.apply(null, exp.slice(1).map(function (ex) {
							return evl(ex);
						}));
					}
				}
			}
		case "string":
			// string literals
			if (exp.charAt(0) === "'") {
				return exp.substr(1, exp.length - 2);
			}
			// dereference variables
			else {
				return getVal(exp);
			}
		default:
			// number or boolean literal remains unchanged
			return exp;
	}
}

