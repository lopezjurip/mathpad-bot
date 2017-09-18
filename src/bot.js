"use strict";

const path = require("path");
const bb = require("bot-brother");
const dedent = require("dedent");
const fs = require("mz/fs");
const _ = require("lodash");

module.exports = function createBot(options) {
  const { math, manager, config, info, logger } = options;
  const token = config.get("TELEGRAM:TOKEN");
  const COMMANDS_PATH = path.join(__dirname, "..", "docs", "commands.txt");

  const bot = bb({
    key: token,
    sessionManager: manager,
    webHook: {
      url: `${config.get("URL")}/bot${token}`,
      port: config.get("PORT"),
    },
  });

  bot.texts({
    start: dedent`
      :page_facing_up: *MathPad Bot* | powered by mathjs.org

      :crystal_ball: *Commands:*
      <% commands.forEach(command => { -%>
      /<%= command %>
      <% }); -%>

      :bulb: *Examples:*
      *>>>*  \`42 * 33 / (2 + 4)\`
      *>>>*  \`width = sin(45 deg) ^ 2\`
      *>>>*  \`sqrt(width) inch to cm\`
      *>>>*  \`profit = ((12 * 4 + 2) GBP in USD) + 30 USD\`
      *>>>*  \`wallet = (0.1 BTC + 4 ETH) in CLP\`
    `,
    about: {
      info: dedent`
        *<%= info.name %> (<%= info.version %>)*
        *License:* <%= info.license %>
        *Repository:* <%= info.repository.url %>

        :bust_in_silhouette: *Autor:*
        • <%= info.author.name %>
        • <%= info.author.email %>
        • <%= info.author.url %>
        • @<%= info.author.username %>
      `,
      donations: dedent`
        :pray: *Donations:*
        - PayPal:
          <%= info.author.paypal %>
        - Bitcoin:
          \`<%= info.author.btc %>\`
        - Ether:
          \`<%= info.author.eth %>\`
      `,
    },
    result: {
      input: dedent`
        *[*/<%= i %>*]:*  \`<%= expression %>\`
      `,
      output: dedent`
        <%= result %>
      `,
      missing: dedent`
        *Error:* There is not entry *[*/<%= i %>*]*.
        See /history.
      `,
    },
    clear: dedent`
      :sparkles: *Variables and history were reset.*
    `,
    variables: dedent`
      <% if (scope.length === 0) { %>
      No variables set.
      <% } else { %>
      :sparkle: *Current variables:*
      ===
      <% scope.forEach(([key, value]) => { -%>
      \`<%= key %> = <%= value %>\`
      <% }); -%>
      ===
      Use /clear to reset all of them.
      <% } %>
    `,
    history: dedent`
      <% if (pad.length === 0) { %>
      No history available.
      <% } else { %>
      :thought_balloon: *History:*
      ===
      <% pad.forEach((expression, i) => { -%>
      *[*/<%= i %>*]:*  \`<%= expression %>\`
      <% }); -%>
      ===
      Use /clear to reset it.
      <% } %>
    `,
    error: dedent`
      *Error:* <%= error.message %>
      Maybe you have something corrupted in /variables.
    `,
    cancel: dedent`
      OK, will cancel the current operation.
      Looking for /help?
    `,
  });

  bot.command(/.*/).use("before", async ctx => {
    // Ensure a scope
    try {
      ctx.session.scope = ctx.session.scope ? JSON.parse(ctx.session.scope, math.instance.json.reviver) : {};
    } catch (e) {
      ctx.session.scope = {};
    }
    ctx.session.pad = ctx.session.pad || [];

    const meta = {
      user: ctx.meta.user,
      command: ctx.command,
      answer: ctx.answer,
      callbackData: ctx.callbackData,
    };
    return logger.info("Message received", meta);
  });

  /**
   * /start
   * Init bot showing this first message.
   */
  bot.command(/^(start)/).invoke(async ctx => {
    const txt = await fs.readFile(COMMANDS_PATH, "utf8");

    ctx.data.user = ctx.meta.user;
    ctx.data.commands = txt
      .replace(new RegExp("_", "g"), String.raw`\_`) // Use String.raw to fix scape problem.
      .split("\n")
      .filter(Boolean);

    await ctx.sendMessage("start", { parse_mode: "Markdown" });
  });

  /**
   * /help
   * Help message, in this case we just redirect to /start
   */
  bot.command(/^(help)/).invoke(async ctx => {
    await ctx.go("start");
  });

  /**
   * /about
   * Show information from `package.json` like version, author and donation addresses.
   */
  bot.command(/^(about)/).invoke(async ctx => {
    ctx.data.info = info;
    await ctx.sendMessage("about.info", { parse_mode: "Markdown" });
    await ctx.sendMessage("about.donations", { parse_mode: "Markdown" });
  });

  /**
   * /cancelar
   * Stop current action. FYI: calling any other /(action) stops the current state.
   */
  bot.command(/^(cancel)/).invoke(async ctx => {
    ctx.hideKeyboard();
    await ctx.sendMessage("cancel", { parse_mode: "Markdown" });
  });

  bot.command(/^(clear|reset)/).invoke(async ctx => {
    ctx.session.scope = {};
    ctx.session.pad = [];
    await ctx.sendMessage("clear", { parse_mode: "Markdown" });
  });

  bot.command(/^(variables|vars)/).invoke(async ctx => {
    ctx.data.scope = Object.entries(ctx.session.scope).map(([name, value]) => [name, math.format(value)]);
    await ctx.sendMessage("variables", { parse_mode: "Markdown" });
  });

  bot.command(/^(history)/).invoke(async ctx => {
    ctx.data.pad = ctx.session.pad;
    await ctx.sendMessage("history", { parse_mode: "Markdown" });
  });

  bot.command(/^[0-9]*$/).invoke(async ctx => {
    if (ctx.command.type !== "invoke") {
      return;
    }

    const i = Number(ctx.command.name);
    const input = ctx.session.pad[i];
    if (!input) {
      ctx.data.i = i;
      return await ctx.sendMessage("result.missing", { parse_mode: "Markdown" });
    }

    // Display "typing..."
    await ctx.bot.api.sendChatAction(ctx.meta.chat.id, "typing"); // Unhandled promise

    try {
      const node = math.parse(input, ctx.session.scope);
      const expression = node.toString();
      ctx.session.pad[i] = expression;

      ctx.data.i = i;
      ctx.data.expression = expression;
      await ctx.sendMessage("result.input", { parse_mode: "Markdown" });

      const code = node.compile();
      const result = code.eval(ctx.session.scope);
      ctx.data.result = math.format(result);
      await ctx.sendMessage("result.output");
    } catch (err) {
      logger.error(err);
      ctx.data.error = err;
      await ctx.sendMessage("error", { parse_mode: "Markdown" });
    }
  });

  bot.command(/.*/).use("before", async ctx => {
    if (_.isEmpty(ctx.answer)) {
      return;
    }

    const lines = ctx.answer.split("\n").filter(Boolean);
    if (_.isEmpty(lines)) {
      return;
    }

    // Display "typing..."
    await ctx.bot.api.sendChatAction(ctx.meta.chat.id, "typing"); // Unhandled promise

    for (const line of lines) {
      try {
        const input = _.trimStart(line, [">>>", "»>"]);
        const node = math.parse(input, ctx.session.scope);
        const expression = node.toString();
        const length = ctx.session.pad.push(expression);

        ctx.data.i = length - 1;
        ctx.data.expression = expression;
        await ctx.sendMessage("result.input", { parse_mode: "Markdown" });

        const code = node.compile();
        const result = code.eval(ctx.session.scope);
        ctx.data.result = math.format(result);
        await ctx.sendMessage("result.output");
      } catch (err) {
        logger.error(err);
        ctx.data.error = err;
        await ctx.sendMessage("error", { parse_mode: "Markdown" });
      }
    }
  });

  bot.command(/.*/).use("after", async ctx => {
    ctx.session.scope = JSON.stringify(ctx.session.scope || {});
  });
};
