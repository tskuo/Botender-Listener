import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  Guild,
} from "discord.js";
import fetch from "cross-fetch";

const VERCEL_URL = process.env.VERCEL_URL;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!VERCEL_URL || !DISCORD_TOKEN) {
  throw new Error("Missing VERCEL_URL or DISCORD_TOKEN in .env file");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Listener is ready! Logged in as ${c.user.tag}`);
});

client.on(Events.GuildCreate, async (guild) => {
  console.log(`Joined a new server: ${guild.name} (ID: ${guild.id})`);

  const channelName = "botender";
  const communityTone = `A Discord server where people come together with something in common. The community includes both newcomers and long-time members. The tone is generally friendly and collaborative, though discussions can sometimes become heated. Members aim to foster a welcoming and engaged environment. This is not necessarily a gaming community, but a shared space for people with a common interest or connection.`;
  // Check if the channel already exists
  const existingChannel = guild.channels.cache.find(
    (channel) =>
      channel.name === channelName && channel.type === ChannelType.GuildText
  );

  if (!existingChannel) {
    console.log(
      `Channel #${channelName} not found in ${guild.name}, creating it...`
    );
    try {
      const me = guild.members.me;
      if (!me) {
        // This should not happen, but good to be safe
        console.error(
          `Could not find my own member object in guild ${guild.name}`
        );
        return;
      }

      // Find all roles with Administrator permission
      const adminRoles = guild.roles.cache.filter((role) =>
        role.permissions.has("Administrator")
      );

      const permissionOverwrites = [
        // Deny @everyone to view this channel
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        // Allow the bot to view and send messages
        {
          id: me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.CreatePrivateThreads,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        // Allow all admin roles to view, send, and manage messages
        ...adminRoles.map((role) => ({
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.SendMessagesInThreads,
            PermissionFlagsBits.ManageMessages,
          ],
        })),
      ];

      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: "A dedicated channel for all things Botender.",
        permissionOverwrites,
      });
      console.log(
        `Channel #${channelName} created successfully in ${guild.name}.`
      );

      // Send a welcome message to the new channel
      try {
        const welcomeMessage = `👋 Hey there! I'm Botender, your friendly AI assistant!

🙂 **Who I Am:**
- I'm an AI bot here to reply user messages on Discord servers.
- I'm super customizable! You get to decide when and how I respond, based on what works best for your community.
- By default, just say "hello to botender" in this channel and I'll reply! Give it a try!

🔮 **How I Work:**
- Behind the scenes, I'm set up with a default \`task\` called Hello Botender, consisting of a \`trigger\` (what activates me) and an \`aciton\` (what you want me to do).
- You and your team can easily view, propose, edit, and deploy tasks through my website (${VERCEL_URL}). Whenever there are updates, like new proposals or task changes, I'll let you know right here!
- Please note: I can only read and process one message at a time, so I respond based on individual messages, not full conversations... yet! This might change in the future, so stay tuned!

🔐 **Permissions:**
- Right now, only server admins (and me!) can access this channel. Anyone with access here can also use the website to change my tasks. If you'd like, you can invite more people to this channel.
- I'll only reply to messages in this channel for now. If you want me to help out in other places, just make sure I have the \`View Channel\`, \`Send Messages\`, and \`Read Message History\` permissions in those channels.
- And don't forget—if you want me to do something new in another channel, just start a proposal to create a new task so I know what to do there!

I'm excited to be here and can't wait to help your community however I can!`;

        await newChannel.send(welcomeMessage);
      } catch (messageError) {
        console.error(
          `Failed to send welcome message to #${channelName} in ${guild.name}:`,
          messageError
        );
      }
    } catch (error) {
      console.error(
        `Failed to create #${channelName} in ${guild.name}:`,
        error
      );
      // Try to inform the server owner if channel creation fails
      try {
        const owner = await guild.fetchOwner();
        await owner.send(
          `Hello! I tried to create a \`#${channelName}\` channel in your server, "${guild.name}", but I seem to be missing the 'Manage Channels' permission. Please grant me this permission to get the most out of me!`
        );
      } catch (dmError) {
        console.error(`Failed to DM the owner of ${guild.name}.`, dmError);
      }
    }
  } else {
    console.log(`Channel #${channelName} already exists in ${guild.name}.`);
  }

  const response = await fetch(`${VERCEL_URL}/api/guilds/${guild.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      channels: [channelName],
      community_tone: communityTone,
    }),
  });
});

client.on(Events.MessageCreate, async (message) => {
  // Ignore messages from other bots to prevent loops
  if (message.author.bot) return;

  // Ignore messages from DM
  if (!message.guild) return;

  try {
    // Fetch allowed channels from your API
    const guildId = message.guild.id;
    const guildInfoResponse = await fetch(
      `${VERCEL_URL}/api/guilds/${guildId}`
    );

    if (!guildInfoResponse.ok) {
      console.error(
        `Failed to fetch guild info for ${guildId}:`,
        await guildInfoResponse.text()
      );
      return; // Don't proceed if we can't get guild info
    }

    const guildInfo = await guildInfoResponse.json();
    // Assuming the API returns a `channel` array with the names of allowed channels
    const allowedChannels = guildInfo.channels || [];
    const currentChannelName = (message.channel as any).name;

    // Check if the bot should listen to this channel
    if (!allowedChannels.includes(currentChannelName)) {
      return; // Not an allowed channel, so ignore the message
    }

    console.log(
      `[${message.guild.name}] #${currentChannelName}: ${message.author.username} said "${message.content}"`
    );

    // Call your SvelteKit API on Vercel
    const response = await fetch(`${VERCEL_URL}/api/discordBot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guildId: message.guildId,
        channel: currentChannelName ?? "unknown-channel",
        userMessage: message.content,
      }),
    });

    if (!response.ok) {
      console.error("API call to Vercel failed:", await response.text());
      return;
    }

    const { taskId, taskName, botResponse } = await response.json();

    console.log(
      `[${message.guild.name}] #${
        (message.channel as any).name
      }: Bot responded "${botResponse}" (Task: ${taskName})`
    );

    // If the bot logic generated a response, reply to the original message
    if (botResponse && botResponse.trim() !== "") {
      let replyContent = botResponse;
      if (taskName && taskName.trim() !== "") {
        // Append task information with less prominent styling
        replyContent += `\n\n> Task triggered: ${taskName}`;
      }
      await message.reply(replyContent);
    }
  } catch (error) {
    console.error("Failed to process message:", error);
  }
});

/**
 * Retrieves a list of all text channels in a guild where the bot has permission to view and send messages.
 * @param {Guild} guild The guild to check for accessible channels.
 * @returns {string[]} An array of channel names.
 */
function getAccessibleTextChannels(guild: Guild): string[] {
  const me = guild.members.me;
  if (!me) {
    console.error(`Could not find my own member object in guild ${guild.name}`);
    return [];
  }
  return guild.channels.cache
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        channel.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel) &&
        channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages)
    )
    .map((channel) => channel.name);
}

/**
 * Sends a PATCH request to the Vercel API to update the list of accessible channels for a guild.
 * @param {Guild} guild The guild to update.
 */
async function updateGuildChannels(guild: Guild) {
  const accessibleChannels = getAccessibleTextChannels(guild);
  console.log(
    `Updating accessible channels for ${guild.name}:`,
    accessibleChannels
  );
  try {
    const response = await fetch(`${VERCEL_URL}/api/guilds/${guild.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channels: accessibleChannels }),
    });
    if (!response.ok) {
      console.error(
        `API call to PATCH guild ${guild.id} failed:`,
        await response.text()
      );
    } else {
      console.log(`Successfully updated channels for guild ${guild.name}.`);
    }
  } catch (error) {
    console.error(
      `Failed to PATCH accessible channels for guild ${guild.name}:`,
      error
    );
  }
}

// --- Event Listeners for Permission Changes ---

client.on(Events.ChannelCreate, (channel) => {
  if (channel.guild) {
    console.log(
      `Channel created in ${channel.guild.name}, updating channels...`
    );
    updateGuildChannels(channel.guild);
  }
});

client.on(Events.ChannelDelete, (channel) => {
  if ("guild" in channel && channel.guild) {
    console.log(
      `Channel deleted in ${channel.guild.name}, updating channels...`
    );
    updateGuildChannels(channel.guild);
  }
});

client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
  if ("guild" in newChannel && newChannel.guild) {
    console.log(
      `Channel updated in ${newChannel.guild.name}, updating channels...`
    );
    updateGuildChannels(newChannel.guild);
  }
});

client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  console.log(`Role updated in ${newRole.guild.name}, updating channels...`);
  updateGuildChannels(newRole.guild);
});

client.login(DISCORD_TOKEN);
