var objToStr = function(x){ return Object.prototype.toString.call(x); };

var mixins = module.exports = function makeMixinFunction(rules, _opts){
    var opts = _opts || {};
    if (!opts.unknownFunction) {
        opts.unknownFunction = mixins.ONCE;
    }

    if (!opts.nonFunctionProperty) {
        opts.nonFunctionProperty = function(left, right, key){
            if (left !== undefined && right !== undefined) {
                var getTypeName = function(obj){
                    if (obj && obj.constructor && obj.constructor.name) {
                        return obj.constructor.name;
                    }
                    else {
                        return objToStr(obj).slice(8, -1);
                    }
                };
                throw new TypeError('Cannot mixin key ' + key + ' because it is provided by multiple sources, '
                        + 'and the types are ' + getTypeName(left) + ' and ' + getTypeName(right));
            }
        };
    }

    // TODO: improve
    var thrower = function(error){
        throw error;
    };

    return function applyMixin(source, mixin){
        Object.keys(mixin).forEach(function(key){
            var left = source[key], right = mixin[key], rule = rules[key];

            // this is just a weird case where the key was defined, but there's no value
            // behave like the key wasn't defined
            if (left === undefined && right === undefined) return;

            var wrapIfFunction = function(thing){
                return typeof thing !== "function" ? thing 
                : function(){
                    thing.call(this, arguments, thrower);
                };
            };

            // do we have a rule for this key?
            if (rule) {
                // may throw here
                var fn = rule(left, right, key);
                source[key] = wrapIfFunction(fn);
                return;
            }

            var leftIsFn = typeof left === "function";
            var rightIsFn = typeof right === "function";
            
            // check to see if they're some combination of functions or undefined
            // we already know there's no rule, so use the unknown function behavior
            if (leftIsFn && right === undefined
             || rightIsFn && left === undefined
             || leftIsFn && rightIsFn) {
                // may throw, the default is ONCE so if both are functions
                // the default is to throw
                source[key] = wrapIfFunction(opts.unknownFunction(left, right, key));
                return;
            }

            // we have no rule for them, one may be a function but one or both aren't
            // our default is MANY_MERGED_LOOSE which will merge objects, concat arrays
            // and throw if there's a type mismatch or both are primitives (how do you merge 3, and "foo"?)
            source[key] = opts.nonFunctionProperty(left, right, key);
        });    
    };
};

// define our built-in mixin types
mixins.ONCE = function(left, right, key){
    if (left && right) {
        throw new TypeError('Cannot mixin ' + key + ' because it has a unique constraint.');
    }
    
    var fn = left || right;

    return function(args){
        return fn.apply(this, args);
    };
};

mixins.MANY = function(left, right, key){
    return function(args){
        if (right) right.apply(this, args);
        return left ? left.apply(this, args) : undefined;
    };
};

mixins.MANY_MERGED = function(left, right, key){
    return function(args, thrower){
        var res1 = right && right.apply(this, args);
        var res2 = left && left.apply(this, args);
        if (res1 && res2) {
            var assertObject = function(obj, obj2){
                var type = objToStr(obj);
                if (type !== '[object Object]') {
                    var displayType = obj.constructor ? obj.constructor.name : 'Unknown';
                    var displayType2 = obj2.constructor ? obj2.constructor.name : 'Unknown';
                    thrower('cannot merge returned value of type ' + displayType + ' with an ' + displayType2);
                }
            };
            assertObject(res1, res2);
            assertObject(res2, res1);

            var result = {};
            Object.keys(res1).forEach(function(k){
                if (Object.prototype.hasOwnProperty.call(res2, k)) {
                    thrower('cannot merge returns because both have the ' + JSON.stringify(k) + ' key');
                }
                result[k] = res1[k];
            });

            Object.keys(res2).forEach(function(k){
                // we can skip the conflict check because all conflicts would already be found
                result[k] = res2[k];
            });
            return result;
        }
        return res2 || res1;
    };
};


mixins.REDUCE_LEFT = function(_left, _right, key){
    var left = _left || function(){ return x };
    var right = _right || function(x){ return x };
    return function(args){
        return right.call(this, left.apply(this, args));
    };
};

mixins.REDUCE_RIGHT = function(_left, _right, key){
    var left = _left || function(){ return x };
    var right = _right || function(x){ return x };
    return function(args){
        return left.call(this, right.apply(this, args));
    };
};

