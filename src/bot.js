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
      *>>>*  \`profit = (12 * 4 + 2)GBP in USD + 30USD\`
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
        *>>>*  \`<%= expression %>\`
      `,
      output: dedent`
        <%= result %>
      `,
    },
    clear: dedent`
      :sparkles: *Variables were reset.*
    `,
    scope: dedent`
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
    error: dedent`
      *Error:* <%= error.message %>
    `,
    cancel: dedent`
      OK, will cancel the current operation.
      Looking for /help?
    `,
  });

  bot.command(/.*/).use("before", async ctx => {
    // Ensure a scope
    ctx.session.scope = ctx.session.scope || {};

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
    ctx.data.scope = Object.entries(ctx.session.scope);
    ctx.session.scope = {};
    await ctx.sendMessage("clear", { parse_mode: "Markdown" });
  });

  bot.command(/^(vars|variables|scope)/).invoke(async ctx => {
    ctx.data.scope = Object.entries(ctx.session.scope);
    await ctx.sendMessage("scope", { parse_mode: "Markdown" });
  });

  bot.command(/.*/).use("before", async ctx => {
    ctx.data.scope = Object.entries(ctx.session.scope);

    for (const line of (ctx.answer || "").split("\n").filter(Boolean)) {
      try {
        const input = _.trimStart(line, [">>>", "»>"]);
        const node = math.parse(input, ctx.session.scope);
        ctx.data.expression = node.toString();
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
};
