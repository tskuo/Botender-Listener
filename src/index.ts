import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import fetch from "cross-fetch";

const VERCEL_API_URL = process.env.VERCEL_API_URL;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!VERCEL_API_URL || !DISCORD_TOKEN) {
  throw new Error("Missing VERCEL_API_URL or DISCORD_TOKEN in .env file");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // This is the crucial intent
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Listener is ready! Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from other bots to prevent loops
  if (message.author.bot) return;

  // Ignore messages from DM
  if (!message.guild) return;

  // Optional: Add logic here to only respond in certain channels
  // or if the bot is @mentioned. For now, it responds to everything.

  console.log(
    `[${message.guild.name}] #${(message.channel as any).name}: ${
      message.author.username
    } said "${message.content}"`
  );

  try {
    // Call your SvelteKit API on Vercel
    const response = await fetch(VERCEL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: message.guildId,
        channel: (message.channel as any).name ?? "unknown-channel",
        userMessage: message.content,
      }),
    });

    if (!response.ok) {
      console.error("API call to Vercel failed:", await response.text());
      return;
    }

    const { botResponse } = await response.json();

    console.log("botResponse: ", botResponse);

    // If the bot logic generated a response, send it to the channel
    if (botResponse && botResponse.trim() !== "") {
      await message.channel.send(botResponse);
    }
  } catch (error) {
    console.error("Failed to process message:", error);
  }
});

client.login(DISCORD_TOKEN);
