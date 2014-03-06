out = console.log.bind(console);

var List = (function () {
    function List () {
        if (arguments.length == 1) {
            this.empty = false;
            this.head = arguments[0];
            this.length = 1;
        }
        else if (arguments.length == 0) {
            this.empty = true;
            this.length = 0;
        }
        else {
            return List.fromArray(arguments);
        }
        return this;
    }
    List.prototype = {
        toString: function () {
            return "[" + this.toArray().join(" ") + "]";
        },
        toArray: function () {
            var l = this;
            var a = [l.head];
            while (l.tail) {
                l = l.tail;
                a.push(l.head);
            }
            return a;
        },
        get: function (i) {
            if (i >= this.length) return;
            return this.from(i).head;
        },
        from: function (i) {
            if (i >= this.length) return;
            var l = this;
            while (i > 0) {
                i --;
                l = l.tail;
            }
            return l;
        },
        add: function (val) {
            var newList = new List(val);
            newList.tail = (this.empty ? undefined : this);
            newList.length = this.length + 1;
            return newList;
        },
        concat: function (other) {
            var thisArr = this.toArray();
            var out = other;
            for (var i = thisArr.length - 1; i >= 0; i--) {
                out = out.add(thisArr[i]);
            }
            return out;
        }

    };
    List.equal = function (l1, l2) {
        if (l1.length !== l2.length) return false;
        while (l1) {
            if (l1.head !== l2.head) {
                return false;
            }
            l1 = l1.head;
            l2 = l2.head;
        }
        return true;
    };
    List.fromArray = function (arr) {
        var list;
        for (var i = arr.length - 1, len = 1; i >= 0; i--, len++) {
            var elem = new List(arr[i]);
            elem.length = len;
            elem.tail = list;
            list = elem;
        }
        return list || new List();
    }

    return List;
})();
/*
var xs = List(12, 34, 45);
out(JSON.stringify(xs));
out("list: " + xs);
out(xs.get(0), xs.get(2), xs.get(4));
out(xs.from(1).toString());
out(xs.add("new element").toString());
*/
if (typeof module !== "undefined") {
    module.exports = List;
}