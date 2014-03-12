function jitFunction (baseFunc, context) {
	var argNames = baseFunc.argNames;
	var preBody = "var _argOpts = {declaration: true, dontEval: true, immutable: true};\n"
		+ "var _oldStack = stack;\n"
		+ "var _returnValue;\n"
		+ "stack = _optimisedFunction.closure;\n"
		+ "stack.push(new Scope());\n";
	for (var i = 0; i < argNames.length; i++) {
		// check that all argument names are simple identifiers (not lists)
		if (typeof argNames[i] !== "string") {
			console.log("jit failed. Parameters must not be lists");
			return false;
		}
		// assign arguments to the sonata call stack
		preBody += "assignVariable('" + argNames[i] + "', " + argNames[i] + 
			", _argOpts);\n";
	}
	// substitute do function for special case function body compiler 
	var bodyExp = ["function body"].concat(baseFunc.bodyExpression.slice(1));
	var body = safelyEval(bodyExp);
	if (body === false) {
		console.log("jit failed");
		return false;
	}
	var funcSource = "(function _optimisedFunction "
		+ "(" + argNames.join(", ") + ") {\n"
		+ preBody + body
		+ "stack.pop();\n"
		+ "stack = _oldStack;\n"
		+ "return _returnValue; });";

	return funcSource;
}

function safelyEval (exp) {
	try {
		return jitEval(exp);
	}
	catch (e) {
		return false;
	}
}

function jitEval (exp) {
	switch (typeof exp) {
		case "object":
			var func = jitExpression[exp[0]];
			var args = [];
			// evaluate each argument
			for (var i = 1; i < exp.length; i++) {
				// choose the correct format for the arguments to the 
				// jit compiler function: JS list, JSON string, or JIT string
				var arg;
				if (func === "meta function") {
					arg = JSON.stringify(exp[i]);
				}
				else if (func && func.isMeta) {
					arg = exp[i];
				}
				else {
					arg = jitEval(exp[i]);
					if (arg  === false) {
						return false;
					}
				}
				args.push(arg);
			}

			if (func && func !== "meta function") {
				if (exp[0] === "while") {
					return safelyEval(exp) || "whileLoop(" + args.map(function (arg) {
						return JSON.stringify(arg);
					}).join(", ") + ")";
				}
				// evaluate the arguments and apply them to the function
				return func.apply(null, args);
			}
			else {
				// decompile to a normal function call
				var funcStr = jitEval(exp[0]);
				if (funcStr === false) {
					return false;
				}
				return funcStr + "(" + args.join(", ") + ")";
			}
		case "string":
			// string literals
			if (exp.charAt(0) === "'") {
				return exp.replace("\n", "\\n");
			}
			// dereference variables
			else {
				return "getVal('" + exp + "')";
			}
		default:
			// number or boolean literal remains unchanged
			return exp + "";
	}
}

var jitExpression = {
	"function body": function () {
		var body = "";
		// evaluate each expression in the block
		for (var i = 0; i < arguments.length - 1; i++) {
			body += arguments[i] + ";\n";
			// TODO: implement breakout messages
		}
		body += "_returnValue = " + arguments[i] + ";\n";
		return body;
	},
	"do": function (first) {
		var body = "";
		if (arguments.length === 1) {
			return first;
		}
		// evaluate each expression in the block
		for (var i = 0; i < arguments.length - 1; i++) {
			body += arguments[i] + ";\n";
			// TODO: implement breakout messages
		}
		body += "return " + arguments[i] + ";\n";
		return "(function() {\n" + body + "}())";
	},
	"if": function (condition, ifBody, elseBody) {
		return "(" + jitEval(condition) + " ? " + jitEval(ifBody) + " : " 
			+ (elseBody ? jitEval(elseBody) + ")" : "false)");
	},
	// alternative if for when not used as an expression
	/// this is currently not used
	"if statement": function (condition, ifBody, elseBody) {
		return "if (" + condition + ") {\n" + ifBody + "}\n" 
			+ (elseBody ? "else {\n" + elseBody + "}\n" : "");
	},
	"return": fail,
	"break": fail,
	"continue": fail,
	"while": function (condition, body) {
		var loop = "(function () {\nvar _returnValue = false;\n"
			+ "while (" + jitEval(condition) + ") {\n"
			+ "stack.push(new Scope());\n";
		for (var i = 1; i < body.length - 1; i++) {
			loop += jitEval(body[i]) + ";\n";
			// TODO: implement breakout messages
		}
		loop += "_returnValue = " + jitEval(body[i]) + ";\n";
		loop += "stack.pop();\n"
			+ "}\nreturn _returnValue;\n}())";
		return loop;
	},
	"for": alias("forLoop"),
	"=": function (identifier, val) {
		return "assignVariable(" + JSON.stringify(identifier)
			+ ", " + jitEval(val) + ", {dontEval: true})";
	},
	"+": function (a, b) {
		return "sonataAdd(" + a + ", " + b + ")";
	},
	"List": alias("list"),
	"List:compose": alias("listCompose")
};

var ops = ["-", "*", "/", "%", "<", ">", ">=", "<=", "&&", "||"];
ops.forEach(function (op) {
	jitExpression[op] = function (a, b) {
		return "(" + a + " " + op + " " + b + ")";
	};
});

function fail () {
	throw "unable to optimise function";
	return false;
}

function alias (functionName) {
	return function () {
		var argString = ([]).join.call(arguments, ", ");
		return functionName + "(" + argString + ")";
	};
}

function registerMetaFunction (name) {
	if (jitExpression[name]) {
		jitExpression[name].isMeta = true;
	}
	else {
		jitExpression[name] = "meta function";
	}
}

jitFunction.dummy = function () {};
jitFunction.dummy.argNames = ["a", "b"];
jitFunction.dummy.bodyExpression = 
	["do", 
		["+", ["+", "a", 45], "'Dave\n'"], 
		["*", 35, 67],
		["if", ["<", "a", 92], 
			["do", "'yes'"], 
		["do", 
			["List", "'bad'", 12, "'carrot'"], 
			"'no'"]]];

var simple = {
	argNames: [],
	bodyExpression: ["do", ["if" , true, ["do", 45]]]
};

//console.log(jitFunction(jitFunction.dummy).toString());

module.exports = {
	jitFunction: jitFunction,
	registerMetaFunction: registerMetaFunction
}