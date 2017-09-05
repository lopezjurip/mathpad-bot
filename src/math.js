const core = require("mathjs/core");

module.exports = function createMath() {
  const math = core.create();

  math.import(require("mathjs/lib/type"));
  math.import(require("mathjs/lib/constants"));
  math.import(require("mathjs/lib/expression"));
  math.import(require("mathjs/lib/function"));
  math.import(require("mathjs/lib/json"));
  math.import(require("mathjs/lib/error"));

  math.import(require("numbers"), { wrap: true, silent: true });
  math.import(require("numeric"), { wrap: true, silent: true });

  const evaluate = math.eval;
  const parse = math.parse;

  math.import(
    {
      import: function() {
        throw new Error("Function import is disabled");
      },
      createUnit: function() {
        throw new Error("Function createUnit is disabled");
      },
      eval: function() {
        throw new Error("Function eval is disabled");
      },
      parse: function() {
        throw new Error("Function parse is disabled");
      },
      simplify: function() {
        throw new Error("Function simplify is disabled");
      },
      derivative: function() {
        throw new Error("Function derivative is disabled");
      },
    },
    { override: true }
  );

  return { instance: math, parse, evaluate };
};
