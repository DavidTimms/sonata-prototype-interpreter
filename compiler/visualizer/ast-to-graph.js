function astToGraph (ast) {
	var root = walkAst(ast);
	root.y = -4;
	Node.assignXs();
	return {
		nodes: Node.all(),
		edges: Edge.all()
	}
}

function walkAst (node, parent) {
	var graphNode;
	var level = (parent ? parent.y : 0);
	if (node instanceof Array) {
		graphNode = (parent ? parent.child() : Node.root());
		node.forEach(function (childNode) {
			walkAst(childNode, graphNode);
		});
	}
	else {
		graphNode = (parent ? parent.child(node) : Node.root(node));
	}
	return graphNode;
}

var Node = (function () {
	var idGen = 0;
	var levels = [];
	var typeColor = {
		string: "#992277",
		number: "#779922"
	};

	function Node (label, level) {
		this.id = "node" + idGen++;
		if (label !== undefined) {
			this.color = "rgba(0,0,0,0)"; //typeColor[typeof label];
			this.label = label + "";
		}
		this.y = level;
		this.size = 0.5;
		this.children = [];
		levels[level] = levels[level] || [];
		levels[level].push(this);
	}
	Node.prototype.child = function (label) {
		var child = new Node(label, this.y + 1);
		new Edge(this, child);
		this.children.push(child);
		return child;
	};
	Node.root = function (label) {
		return new Node(label, 0);
	};
	Node.assignXs = function () {
		var currentX = 0;
		function assignNode(node) {
			var startX = currentX;
			if (node.children.length) {
				node.children.forEach(assignNode);
				var endX = currentX;
				node.x = (endX + startX - 1) / 2;
			}
			else {
				node.x = currentX;
				currentX += 1;
			}
		}
		assignNode(levels[0][0]);
	};
	Node.all = function () {
		return levels.reduce(function (a, b) {
			return a.concat(b);
		});
	};
	return Node;
})();

var Edge = (function () {
	var idGen = 0;
	var edges = [];
	function Edge (source, target) {
		this.id = "edge" + idGen++;
		this.source = source.id;
		this.target = target.id;
		edges.push(this);
	}
	Edge.all = function () {
		return edges;
	};
	return Edge;
})();

sigma.canvas.labels.def = function(node, context, settings) {
	var fontSize,
		prefix = settings('prefix') || '',
		size = node[prefix + 'size'];

	if (size < settings('labelThreshold'))
		return;

	if (typeof node.label !== 'string')
		return;

	fontSize = (settings('labelSize') === 'fixed') ?
		settings('defaultLabelSize') :
		settings('labelSizeRatio') * size;

	context.font = (settings('fontStyle') ? settings('fontStyle') + ' ' : '') +
		fontSize + 'px ' + settings('font');
	context.fillStyle = (settings('labelColor') === 'node') ?
		(node.color || settings('defaultNodeColor')) :
		settings('defaultLabelColor');

	var width = context.measureText(node.label).width;
	context.fillText(
		node.label,
		Math.round(node[prefix + 'x'] - width / 2),
		Math.round(node[prefix + 'y'] + size)
	);
};