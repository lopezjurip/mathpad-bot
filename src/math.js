const Rx = require("rxjs");
const axios = require("axios");
const core = require("mathjs/core");
const numeral = require("numeral");
const ms = require("millisecond");

const parseMoney = require("@cryptolw/money-parse");
const { APILayer } = require("@cryptolw/market-fiat");
const { CoinCap } = require("@cryptolw/market-crypto");

module.exports = function createMath(config) {
  const math = core.create({});

  math.import(require("mathjs/lib/type"));
  math.import(require("mathjs/lib/constants"));
  math.import(require("mathjs/lib/expression"));
  math.import(require("mathjs/lib/function"));
  math.import(require("mathjs/lib/json"));
  math.import(require("mathjs/lib/error"));

  math.import(require("numbers"), { wrap: true, silent: true });
  math.import(require("numeric"), { wrap: true, silent: true });

  const evaluate = math.eval;
  const createUnit = math.createUnit;
  const parse = math.parse;
  const unit = math.unit;
  const format = input => math.format(input, value => numeral(value).format(config.get("FORMAT")));

  const services = {
    crypto: new CoinCap(),
    fiat: new APILayer({ apiKey: config.get("CURRENCYLAYER:KEY") }),
  };

  function watchCryptos() {
    return Rx.Observable
      .fromPromise(services.crypto.getCurrencies())
      .mergeMap(cryptos => services.crypto.ticker$(cryptos, { interval: "3 min" }))
      .retryWhen(err => err.delay(ms("3 sec")));
  }

  function watchFiats() {
    return Rx.Observable
      .fromPromise(services.fiat.getCurrencies())
      .mergeMap(fiats => services.fiat.ticker$(fiats, { interval: "1 hr" }))
      .retryWhen(err => err.delay(ms("3 sec")));
  }

  function watchChile() {
    return Rx.Observable
      .interval(ms("1 hr"))
      .startWith(0)
      .mergeMap(() => axios.get("http://indicadoresdeldia.cl/webservice/indicadores.json"))
      .map(response =>
        ["uf", "utm"].map(key => ({
          code: key.toUpperCase(),
          rate: parseMoney(response.data["indicador"][key].replace(/\./, "").replace(/,/, "."), "CLP"),
        }))
      )
      .retryWhen(err => err.delay(ms("3 sec")));
  }

  // Create base unit
  createUnit("USD", { override: true });

  const sources = [watchFiats(), watchCryptos(), watchChile().delay(ms("3 sec"))];
  Rx.Observable.merge(...sources).subscribe(data => {
    for (const currency of data) {
      try {
        createUnit(currency.code, unit(currency.rate[0], currency.rate[1]), { override: true });
      } catch (e) {
        if (config.get("NODE_ENV") !== "production") {
          console.log("Can't create unit:", currency.code); // eslint-disable-line no-console
        }
      }
    }
  });

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

  return { instance: math, parse, evaluate, format };
};
