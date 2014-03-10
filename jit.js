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
			return baseFunc;
		}
		// assign arguments to the sonata call stack
		preBody += "assignVariable('" + argNames[i] + "', " + argNames[i] + 
			", _argOpts);\n";
	}
	var body = jitEval(baseFunc.bodyExpression);
	if (body === false) {
		console.log("jit failed");
		return baseFunc;
	}
	var funcSource = "(function _optimisedFunction "
		+ "(" + argNames.join(", ") + ") {\n"
		+ preBody + body
		+ "stack.pop();\n"
		+ "stack = _oldStack;\n"
		+ "return _returnValue; });";

	return funcSource;
}

function jitEval (exp) {
	switch (typeof exp) {
		case "object":
			var func = jitExpression[exp[0]];
			var args = [];
			// evaluate each argument
			for (var i = 1; i < exp.length; i++) {
				var arg = jitEval(exp[i]);
				if (arg  === false) {
					return false;
				}
				args.push(arg);
			}

			if (func) {
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
	"do": function () {
		var body = "";
		var result;
		// evaluate each expression in the block
		for (var i = 0; i < arguments.length - 1; i++) {
			body += arguments[i] + ";\n";
			// TODO: implement breakout messages
		}
		body += "_returnValue = " + arguments[i] + ";\n";
		return body;
	},
	// alternative if for when not used as an expression
	/// this is currently not used
	"StatementIf": function (condition, ifBody, elseBody) {
		return "if (" + condition + ") {\n" + ifBody + "}\n" 
			+ (elseBody ? "else {\n" + elseBody + "}\n" : "");
	},
	"if": function (condition, ifBody, elseBody) {
		return "(" + condition + ") ? (function() {\n" + ifBody + "})()\n: " 
			+ (elseBody ? "(function() {\n" + elseBody + "})();\n" : "false");
	}
}

var ops = ["+", "-", "*", "/", "%", "<", ">", ">=", "<=", "&&", "||"];
ops.forEach(function (op) {
	jitExpression[op] = function (a, b) {
		return "(" + a + " " + op + " " + b + ")";
	};
});

jitFunction.dummy = function () {};
jitFunction.dummy.argNames = ["a", "b"];
jitFunction.dummy.bodyExpression = 
	["do", 
		["+", ["+", "a", 45], "'Dave\n'"], 
		["*", 35, 67]
	];

var simple = {
	argNames: [],
	bodyExpression: ["do", ["if" , true, ["do", 45]]]
}

console.log(jitFunction(simple).toString());

module.exports = jitFunction;