// index.js - Discord Moderation Bot for Railway Hosting (Updated /activitycheck)

// Import necessary modules
const {
    Client,
    Collection,
    Events,
    GatewayIntentBits,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    REST,
    Routes,
    ChannelType, // Needed for channel option
    version: djsVersion
} = require('discord.js');
const os = require('os');
// NOTE: Removed 'http' module - not needed for Railway

// --- Configuration (Loaded from Railway Environment Variables) ---
const BOT_TOKEN = process.env['DISCORD_TOKEN'];
const CLIENT_ID = process.env['CLIENT_ID'];
const GUILD_ID = process.env['GUILD_ID']; // Still needed for command registration scope
const REGISTER_COMMANDS = process.env['REGISTER_COMMANDS'] === 'true'; // Control registration via Env Vars

// --- Constants ---
const ROBLOX_SERVER_LINK = 'https://www.roblox.com/games/79626890965310/Squid-Game-Reborn-Ultimate-RP';
const ACTIVITY_CHECK_THRESHOLD_MINS = 45; // Threshold for successful shift
const ACTIVITY_CHECK_FETCH_LIMIT = 100; // How many messages to fetch per API call
const ACTIVITY_CHECK_MAX_MESSAGES = 1000; // Max messages to process to prevent excessive load/time

// Check if essential configuration is missing
if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("ERROR: Missing required environment variables (DISCORD_TOKEN, CLIENT_ID, GUILD_ID). Please set them in Railway Variables.");
    process.exit(1); // Stop the bot if config is missing
}

// --- Warning Storage (In-Memory - Lost on Restart!) ---
const warnings = new Map();
console.log("[Warning System] Initialized in-memory warning storage. Data will be lost on restart.");

// --- Helper Function: Format Uptime ---
function formatUptime(uptimeSeconds) {
    const d = Math.floor(uptimeSeconds / (3600 * 24));
    const h = Math.floor(uptimeSeconds % (3600 * 24) / 3600);
    const m = Math.floor(uptimeSeconds % 3600 / 60);
    const s = Math.floor(uptimeSeconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

// --- Helper Function: Delay ---
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// --- Command Definitions ---
const commands = [
    // --- Moderation Commands ---
    // ... (kick, ban, clear, timeout, untimeout, warn, warnings, clearwarnings commands remain the same) ...
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks a member from the server.')
        .addUserOption(option => option.setName('target').setDescription('The member to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for kicking').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a member from the server.')
        .addUserOption(option => option.setName('target').setDescription('The member to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for banning').setRequired(false))
        .addIntegerOption(option => option.setName('delete_days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7).setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Deletes a specified number of messages (1-100).')
        .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to delete').setRequired(true).setMinValue(1).setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Times out a member for a specified duration.')
        .addUserOption(option => option.setName('target').setDescription('The member to timeout').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes (1-40320, max 28 days)').setRequired(true).setMinValue(1).setMaxValue(28 * 24 * 60))
        .addStringOption(option => option.setName('reason').setDescription('The reason for timeout').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Removes timeout from a member.')
        .addUserOption(option => option.setName('target').setDescription('The member to remove timeout from').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for removing timeout').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warns a member (warnings stored in memory, lost on restart).')
        .addUserOption(option => option.setName('target').setDescription('The member to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('The reason for the warning').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Displays warnings for a member (warnings stored in memory).')
        .addUserOption(option => option.setName('target').setDescription('The member whose warnings to show').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clears all warnings for a member (warnings stored in memory).')
        .addUserOption(option => option.setName('target').setDescription('The member whose warnings to clear').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false),

    // --- Utility/System Commands ---
    // ... (ping, serverinfo, userinfo, botinfo, help, avatar commands remain the same) ...
     new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Checks the bot\'s latency.'),

    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Displays information about the current server.')
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Displays information about a user or yourself.')
        .addUserOption(option => option.setName('target').setDescription('The user to get info about (optional)').setRequired(false))
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Displays information about the bot.'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands.'),

    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Displays a user\'s avatar.')
        .addUserOption(option => option.setName('target').setDescription('The user whose avatar to show (optional)').setRequired(false)),


    // --- Fun Commands ---
    // ... (roll command remains the same) ...
     new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Rolls a dice.')
        .addIntegerOption(option => option.setName('sides').setDescription('Number of sides on the dice (default 6)').setMinValue(2).setMaxValue(1000).setRequired(false)),

    // --- Event Announcement Commands ---
    // ... (workertryout, soldiertryout, games commands remain the same) ...
    new SlashCommandBuilder()
        .setName('workertryout')
        .setDescription('Announces a Worker Tryout event.')
        .addStringOption(option => option.setName('rank').setDescription('Your rank hosting the event').setRequired(true))
        .addStringOption(option => option.setName('ping').setDescription('Role or user to ping (e.g., @TryoutRole or <@UserID>)').setRequired(true))
        .addUserOption(option => option.setName('supervisor').setDescription('Supervisor overseeing the event (optional)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('soldiertryout')
        .setDescription('Announces a Soldier Tryout event.')
        .addStringOption(option => option.setName('rank').setDescription('Your rank hosting the event').setRequired(true))
        .addStringOption(option => option.setName('ping').setDescription('Role or user to ping (e.g., @TryoutRole or <@UserID>)').setRequired(true))
        .addUserOption(option => option.setName('supervisor').setDescription('Supervisor overseeing the event (optional)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
        .setDMPermission(false),

    new SlashCommandBuilder()
        .setName('games')
        .setDescription('Announces a Games event.')
        .addStringOption(option => option.setName('rank').setDescription('Your rank hosting the event').setRequired(true))
        .addStringOption(option => option.setName('ping').setDescription('Role or user to ping (e.g., @GamesRole or <@UserID>)').setRequired(true))
        .addUserOption(option => option.setName('supervisor').setDescription('Supervisor overseeing the event (optional)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
        .setDMPermission(false),

    // --- Activity Check Command ---
    new SlashCommandBuilder()
        .setName('activitycheck')
        .setDescription('Checks shift logs in a channel for activity.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel containing shift logs (e.g., #shift-logs)')
                .addChannelTypes(ChannelType.GuildText) // Only allow text channels
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription(`How many days back to check (default: 7, max: 90)`)
                .setMinValue(1)
                .setMaxValue(90) // Limit days to prevent excessive fetching
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers) // Permissions needed to run
        .setDMPermission(false),
];

// --- Bot Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, // Need this to read messages
        GatewayIntentBits.MessageContent // NEEDED to read message content for parsing
    ]
});

// Store commands in a Collection
client.commands = new Collection();
for (const command of commands) {
    client.commands.set(command.name, command);
}

// --- Command Registration ---
// ...(Command registration logic remains the same)...
if (REGISTER_COMMANDS) {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    (async () => {
        try {
            console.log(`[REGISTER] Started refreshing ${commands.length} application (/) commands for guild ${GUILD_ID}.`);
            const data = await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands.map(cmd => cmd.toJSON()) },
            );
            console.log(`[REGISTER] Successfully reloaded ${data.length} application (/) commands for guild ${GUILD_ID}.`);
            console.log("[REGISTER] IMPORTANT: Set REGISTER_COMMANDS to 'false' in Railway Variables after successful registration.");
        } catch (error) {
            console.error("[REGISTER] Error registering commands:", error);
        }
    })();
} else {
     console.log("[REGISTER] Skipping command registration (REGISTER_COMMANDS env var is not 'true').");
}


// --- Event Handler: Bot Ready ---
// ...(on_ready logic remains the same)...
client.on(Events.ClientReady, readyClient => {
    console.log(`--------------------------------------------------`);
    console.log(`Logged in as ${readyClient.user.tag} (${readyClient.user.id})`);
    console.log(`Ready and connected to ${readyClient.guilds.cache.size} server(s).`);
    console.log(`discord.js Version: ${djsVersion}`);
    console.log(`Node.js Version: ${process.version}`);
    console.log(`Hosted on: Railway`); // Indicate hosting platform
    console.log(`--------------------------------------------------`);
    readyClient.user.setActivity('over the server | /help', { type: 3 });
});


// --- Event Handler: Interaction Create (Slash Commands) ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    console.log(`[COMMAND] Received command: ${commandName} from ${interaction.user.tag} in #${interaction.channel?.name ?? 'DM'}`);

    // --- Command Execution Logic ---
    try {
        // --- KICK / BAN / CLEAR / TIMEOUT / UNTIMEOUT / WARN / WARNINGS / CLEARWARNINGS ---
        // --- PING / SERVERINFO / USERINFO / BOTINFO / HELP / AVATAR / ROLL ---
        // --- WORKERTRYOUT / SOLDIERTRYOUT / GAMES ---
        // ...(Keep all the previous command logic blocks here)...
        // --- KICK ---
        if (commandName === 'kick') {
            // ... (kick logic) ...
             const targetUser = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') ?? 'No reason provided';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
            if (!member.kickable) return interaction.reply({ content: 'I cannot kick this user (check permissions/roles).', ephemeral: true });

            const interactionMember = await interaction.guild.members.fetch(interaction.user.id);
             if (member.roles.highest.position >= interactionMember.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
                 return interaction.reply({ content: 'You cannot kick someone with an equal or higher role.', ephemeral: true });
             }

            await targetUser.send(`You were kicked from **${interaction.guild.name}** by ${interaction.user.tag} for: ${reason}`).catch(() => console.log("Could not DM user about kick."));
            await member.kick(`Kicked by ${interaction.user.tag}: ${reason}`);

            const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('User Kicked')
                .setDescription(`${targetUser.tag} (${targetUser.id}) was kicked.`)
                .addFields({ name: 'Kicked By', value: interaction.user.tag, inline: true }, { name: 'Reason', value: reason, inline: true })
                .setTimestamp().setFooter({ text: `User ID: ${targetUser.id}` });
            await interaction.reply({ embeds: [embed] });
            console.log(`[MOD ACTION] ${interaction.user.tag} kicked ${targetUser.tag}`);
        }
        // --- BAN ---
        else if (commandName === 'ban') {
            // ... (ban logic) ...
            const targetUser = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') ?? 'No reason provided';
            const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (member) {
                 if (!member.bannable) return interaction.reply({ content: 'I cannot ban this user (check permissions/roles).', ephemeral: true });
                 const interactionMember = await interaction.guild.members.fetch(interaction.user.id);
                 if (member.roles.highest.position >= interactionMember.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
                    return interaction.reply({ content: 'You cannot ban someone with an equal or higher role.', ephemeral: true });
                 }
            } else if (!interaction.appPermissions.has(PermissionFlagsBits.BanMembers)) {
                 return interaction.reply({ content: 'I lack the Ban Members permission.', ephemeral: true });
            }

            if (member) {
                await targetUser.send(`You were banned from **${interaction.guild.name}** by ${interaction.user.tag} for: ${reason}`).catch(() => console.log("Could not DM user about ban."));
            }
            await interaction.guild.bans.create(targetUser.id, {
                reason: `Banned by ${interaction.user.tag}: ${reason}`,
                deleteMessageSeconds: deleteDays > 0 ? deleteDays * 24 * 60 * 60 : 0
            });

            const embed = new EmbedBuilder().setColor(0xFF0000).setTitle('User Banned')
                .setDescription(`${targetUser.tag} (${targetUser.id}) was banned.`)
                .addFields(
                    { name: 'Banned By', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason, inline: true },
                    { name: 'Messages Deleted', value: `${deleteDays} day(s)`, inline: true }
                )
                .setTimestamp().setFooter({ text: `User ID: ${targetUser.id}` });
            await interaction.reply({ embeds: [embed] });
            console.log(`[MOD ACTION] ${interaction.user.tag} banned ${targetUser.tag}`);
        }
        // --- CLEAR ---
        else if (commandName === 'clear') {
            // ... (clear logic) ...
             const amount = interaction.options.getInteger('amount');
            if (!interaction.appPermissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: 'I need the "Manage Messages" permission.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            const messages = await interaction.channel.bulkDelete(amount, true).catch(async err => {
                console.error("Clear error:", err);
                await interaction.editReply({ content: `Failed to delete messages. Error: ${err.message}`, ephemeral: true });
                return null;
            });

            if (messages && messages.size > 0) {
                await interaction.editReply({ content: `✅ Successfully deleted ${messages.size} message(s).`, ephemeral: true });
                console.log(`[MOD ACTION] ${interaction.user.tag} cleared ${messages.size} messages in #${interaction.channel.name}`);
            } else if (messages) { // messages is defined but size is 0
                 await interaction.editReply({ content: `No messages were deleted (they might be older than 14 days).`, ephemeral: true });
            }
        }
        // --- TIMEOUT ---
        else if (commandName === 'timeout') {
            // ... (timeout logic) ...
            const targetUser = interaction.options.getUser('target');
            const durationMinutes = interaction.options.getInteger('duration');
            const reason = interaction.options.getString('reason') ?? 'No reason provided';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
            if (!interaction.appPermissions.has(PermissionFlagsBits.ModerateMembers)) {
                return interaction.reply({ content: 'I need the "Moderate Members" permission to timeout users.', ephemeral: true });
            }
            if (!member.moderatable) {
                return interaction.reply({ content: 'I cannot timeout this user (check my role position).', ephemeral: true });
            }

            const interactionMember = await interaction.guild.members.fetch(interaction.user.id);
             if (member.roles.highest.position >= interactionMember.roles.highest.position && interaction.guild.ownerId !== interaction.user.id) {
                 return interaction.reply({ content: 'You cannot timeout someone with an equal or higher role.', ephemeral: true });
             }

            const durationMs = durationMinutes * 60 * 1000;
            if (durationMs > 28 * 24 * 60 * 60 * 1000) {
                return interaction.reply({ content: 'Timeout duration cannot exceed 28 days.', ephemeral: true });
            }

            await member.timeout(durationMs, `Timed out by ${interaction.user.tag}: ${reason}`);
            await targetUser.send(`You were timed out in **${interaction.guild.name}** for ${durationMinutes} minute(s) by ${interaction.user.tag}. Reason: ${reason}`).catch(() => console.log("Could not DM user about timeout."));

            const embed = new EmbedBuilder().setColor(0xFFA500).setTitle('User Timed Out')
                .setDescription(`${targetUser.tag} (${targetUser.id}) was timed out for ${durationMinutes} minute(s).`)
                .addFields({ name: 'Timed Out By', value: interaction.user.tag, inline: true }, { name: 'Reason', value: reason, inline: true })
                .setTimestamp().setFooter({ text: `User ID: ${targetUser.id}` });
            await interaction.reply({ embeds: [embed] });
            console.log(`[MOD ACTION] ${interaction.user.tag} timed out ${targetUser.tag} for ${durationMinutes}m`);
        }
        // --- UNTIMEOUT ---
        else if (commandName === 'untimeout') {
            // ... (untimeout logic) ...
             const targetUser = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason') ?? 'Timeout removed';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
            if (!interaction.appPermissions.has(PermissionFlagsBits.ModerateMembers)) {
                return interaction.reply({ content: 'I need the "Moderate Members" permission.', ephemeral: true });
            }
             if (!member.moderatable) {
                return interaction.reply({ content: 'I cannot remove timeout for this user (check my role position).', ephemeral: true });
            }
            if (!member.isCommunicationDisabled()) {
                 return interaction.reply({ content: 'This user is not currently timed out.', ephemeral: true });
            }

            await member.timeout(null, `Timeout removed by ${interaction.user.tag}: ${reason}`);

            const embed = new EmbedBuilder().setColor(0x00FF00).setTitle('Timeout Removed')
                .setDescription(`Timeout removed for ${targetUser.tag} (${targetUser.id}).`)
                .addFields({ name: 'Action By', value: interaction.user.tag, inline: true }, { name: 'Reason', value: reason, inline: true })
                .setTimestamp().setFooter({ text: `User ID: ${targetUser.id}` });
            await interaction.reply({ embeds: [embed] });
            console.log(`[MOD ACTION] ${interaction.user.tag} removed timeout for ${targetUser.tag}`);
        }
        // --- WARN ---
        else if (commandName === 'warn') {
            // ... (warn logic) ...
            const targetUser = interaction.options.getUser('target');
            const reason = interaction.options.getString('reason');
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });

            if (!warnings.has(interaction.guildId)) warnings.set(interaction.guildId, new Map());
            const guildWarnings = warnings.get(interaction.guildId);
            if (!guildWarnings.has(targetUser.id)) guildWarnings.set(targetUser.id, { count: 0, reasons: [] });
            const userWarnings = guildWarnings.get(targetUser.id);

            userWarnings.count++;
            userWarnings.reasons.push(reason);

            await targetUser.send(`You received a warning in **${interaction.guild.name}** from ${interaction.user.tag}. Reason: ${reason}`).catch(() => console.log("Could not DM user about warning."));

            const embed = new EmbedBuilder().setColor(0xFFFF00).setTitle('User Warned')
                .setDescription(`${targetUser.tag} has been warned. They now have ${userWarnings.count} warning(s).`)
                .addFields({ name: 'Warned By', value: interaction.user.tag }, { name: 'Reason', value: reason })
                .setTimestamp().setFooter({ text: `User ID: ${targetUser.id}` });
            await interaction.reply({ embeds: [embed] });
            console.log(`[MOD ACTION] ${interaction.user.tag} warned ${targetUser.tag}. Total warnings: ${userWarnings.count}`);
        }
        // --- WARNINGS ---
        else if (commandName === 'warnings') {
            // ... (warnings logic) ...
            const targetUser = interaction.options.getUser('target');
            const guildWarnings = warnings.get(interaction.guildId);
            const userWarnings = guildWarnings?.get(targetUser.id);

            if (!userWarnings || userWarnings.count === 0) {
                return interaction.reply({ content: `${targetUser.tag} has no warnings recorded (in memory).`, ephemeral: true });
            }

            const embed = new EmbedBuilder().setColor(0xFFFF00).setTitle(`Warnings for ${targetUser.tag}`)
                .setDescription(`Total Warnings: ${userWarnings.count}`)
                .addFields(userWarnings.reasons.map((reason, index) => ({ name: `Warning ${index + 1}`, value: reason || 'No reason provided' })))
                .setTimestamp().setFooter({ text: `User ID: ${targetUser.id}` });
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        // --- CLEARWARNINGS ---
        else if (commandName === 'clearwarnings') {
            // ... (clearwarnings logic) ...
            const targetUser = interaction.options.getUser('target');
            const guildWarnings = warnings.get(interaction.guildId);

            if (!guildWarnings || !guildWarnings.has(targetUser.id)) {
                return interaction.reply({ content: `${targetUser.tag} has no warnings recorded to clear.`, ephemeral: true });
            }

            guildWarnings.delete(targetUser.id);

            const embed = new EmbedBuilder().setColor(0x00FF00).setTitle('Warnings Cleared')
                .setDescription(`All warnings for ${targetUser.tag} have been cleared from memory.`)
                .addFields({ name: 'Cleared By', value: interaction.user.tag })
                .setTimestamp().setFooter({ text: `User ID: ${targetUser.id}` });
            await interaction.reply({ embeds: [embed] });
            console.log(`[MOD ACTION] ${interaction.user.tag} cleared warnings for ${targetUser.tag}`);
        }
        // --- PING ---
        else if (commandName === 'ping') {
            // ... (ping logic) ...
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true, ephemeral: true });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);
            await interaction.editReply(`Pong! 🏓\nRoundtrip Latency: ${latency}ms\nAPI Latency: ${apiLatency}ms`);
        }
        // --- SERVERINFO ---
        else if (commandName === 'serverinfo') {
            // ... (serverinfo logic) ...
            const guild = interaction.guild;
            await guild.members.fetch();
            await guild.channels.fetch();

            const embed = new EmbedBuilder()
                .setColor(0x0099FF).setTitle(`Server Info: ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: '🆔 Server ID', value: guild.id, inline: true },
                    { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '📅 Created On', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
                    { name: '👥 Members', value: `Total: ${guild.memberCount}\nHumans: ${guild.members.cache.filter(m => !m.user.bot).size}\nBots: ${guild.members.cache.filter(m => m.user.bot).size}`, inline: true },
                    { name: '💬 Channels', value: `Text: ${guild.channels.cache.filter(c => c.type === 0).size}\nVoice: ${guild.channels.cache.filter(c => c.type === 2).size}\nCategories: ${guild.channels.cache.filter(c => c.type === 4).size}`, inline: true },
                    { name: '✨ Boost Level', value: `${guild.premiumTier} (Boosts: ${guild.premiumSubscriptionCount || 0})`, inline: true },
                    { name: '🔒 Verification Level', value: `${guild.verificationLevel}`, inline: true },
                    { name: '📜 Roles', value: `${guild.roles.cache.size}`, inline: true },
                    { name: '😃 Emojis', value: `${guild.emojis.cache.size}`, inline: true }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
        // --- USERINFO ---
        else if (commandName === 'userinfo') {
            // ... (userinfo logic) ...
             const targetUser = interaction.options.getUser('target') ?? interaction.user;
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            const embed = new EmbedBuilder()
                .setColor(member ? member.displayHexColor : 0x0099FF)
                .setTitle(`User Info: ${targetUser.tag}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '🆔 User ID', value: targetUser.id, inline: true },
                    { name: '🏷️ Tag', value: targetUser.tag, inline: true },
                    { name: '🤖 Is Bot?', value: targetUser.bot ? 'Yes' : 'No', inline: true },
                    { name: '📅 Account Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
                );

            if (member) {
                embed.addFields(
                    { name: '📌 Nickname', value: member.nickname || 'None', inline: true },
                    { name: '🗓️ Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: '🎨 Highest Role Color', value: member.displayHexColor, inline: true },
                    { name: '🎭 Roles', value: member.roles.cache.size > 1 ? member.roles.cache.filter(r => r.id !== interaction.guildId).map(r => r.toString()).join(', ') : 'None', inline: false },
                    { name: '⏳ Timed Out Until?', value: member.communicationDisabledUntilTimestamp ? `<t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>` : 'Not timed out', inline: true }
                );
            } else {
                 embed.addFields({ name: 'Server Status', value: 'Not currently in this server.', inline: false });
            }
            embed.setTimestamp().setFooter({ text: `Requested by ${interaction.user.tag}` });
            await interaction.reply({ embeds: [embed] });
        }
        // --- BOTINFO ---
        else if (commandName === 'botinfo') {
            // ... (botinfo logic) ...
            const uptimeSeconds = Math.floor(client.uptime / 1000);
            const memoryUsage = process.memoryUsage();

            const embed = new EmbedBuilder()
                .setColor(0x00FF00).setTitle('Bot Information')
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    { name: '🤖 Bot Name', value: client.user.tag, inline: true },
                    { name: '🆔 Bot ID', value: client.user.id, inline: true },
                    { name: '📅 Created On', value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:F>`, inline: true },
                    { name: '⏳ Uptime', value: formatUptime(uptimeSeconds), inline: true },
                    { name: '⚙️ discord.js Version', value: `v${djsVersion}`, inline: true },
                    { name: '🔩 Node.js Version', value: process.version, inline: true },
                    { name: '📊 Server Count', value: `${client.guilds.cache.size}`, inline: true },
                    { name: '🧠 Memory Usage', value: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB (RSS)\n${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB (Heap Used)`, inline: true },
                    { name: '💻 Host OS', value: `${os.type()} ${os.release()}`, inline: true }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }
        // --- HELP ---
        else if (commandName === 'help') {
            // ... (help logic) ...
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('Help - Available Commands')
                .setDescription('Here is a list of commands you can use:')
                .setTimestamp();

            client.commands.forEach(cmd => {
                embed.addFields({ name: `/${cmd.name}`, value: cmd.description || 'No description provided.' });
            });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        // --- AVATAR ---
        else if (commandName === 'avatar') {
            // ... (avatar logic) ...
            const targetUser = interaction.options.getUser('target') ?? interaction.user;
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`${targetUser.username}'s Avatar`)
                .setImage(targetUser.displayAvatarURL({ dynamic: true, size: 4096 }))
                .setFooter({ text: `Requested by ${interaction.user.tag}` });
            await interaction.reply({ embeds: [embed] });
        }
        // --- ROLL ---
        else if (commandName === 'roll') {
            // ... (roll logic) ...
            const sides = interaction.options.getInteger('sides') ?? 6;
            const result = Math.floor(Math.random() * sides) + 1;
            await interaction.reply(`🎲 You rolled a **${result}** on a d${sides}!`);
        }

        // --- EVENT ANNOUNCEMENTS ---
        else if (commandName === 'workertryout' || commandName === 'soldiertryout' || commandName === 'games') {
            // ... (event announcement logic) ...
            const host = interaction.user;
            const rank = interaction.options.getString('rank');
            const ping = interaction.options.getString('ping');
            const supervisor = interaction.options.getUser('supervisor');

            let eventName = '';
            let embedColor = 0xAAAAAA;

            if (commandName === 'workertryout') {
                eventName = 'Worker Tryout';
                embedColor = 0xFFA500; // Orange
            } else if (commandName === 'soldiertryout') {
                eventName = 'Soldier Tryout';
                embedColor = 0xFF0000; // Red
            } else if (commandName === 'games') {
                eventName = 'Games';
                embedColor = 0x00FF00; // Green
            }

            const eventEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎉 ${eventName} Starting! 🎉`)
                .addFields(
                    { name: 'Host', value: `${host.tag} (<@${host.id}>)`, inline: false },
                    { name: 'Rank', value: rank, inline: false },
                    // Supervisor added conditionally below
                    { name: 'Event', value: eventName, inline: false },
                    { name: 'Server Link', value: `[Click Here to Join](${ROBLOX_SERVER_LINK})`, inline: false },
                    { name: 'Ping', value: ping, inline: false },
                    { name: 'Notes', value: 'Wait in the player hall for further instructions.', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `Event hosted by ${host.username}`, iconURL: host.displayAvatarURL({ dynamic: true }) });

            if (supervisor) {
                eventEmbed.addFields({ name: 'Supervisor', value: `${supervisor.tag} (<@${supervisor.id}>)`, inline: false });
            }

            await interaction.reply({
                content: ping, // Actual ping happens here
                embeds: [eventEmbed],
                allowedMentions: { parse: ['roles', 'users'] }
            });

            console.log(`[EVENT] ${host.tag} announced ${eventName}. Ping: ${ping}`);
        }

        // --- ACTIVITY CHECK ---
        else if (commandName === 'activitycheck') {
            await interaction.deferReply(); // Defer reply as this can take time

            const channel = interaction.options.getChannel('channel');
            const days = interaction.options.getInteger('days') ?? 7; // Default to 7 days
            const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);

            // Check bot permissions
            if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ReadMessageHistory)) {
                return interaction.editReply({ content: `Error: I don't have permission to read message history in ${channel}.`, ephemeral: true });
            }
             if (!channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ViewChannel)) {
                 return interaction.editReply({ content: `Error: I don't have permission to view ${channel}.`, ephemeral: true });
            }


            const activityData = new Map(); // Map<userId, { successful: number, failed: number, userTag: string }>
            let processedMessages = 0;
            let lastMessageId = null;
            let fetchMore = true;

            console.log(`[ActivityCheck] Starting check in #${channel.name} for the last ${days} days.`);

            try {
                // Fetch messages iteratively
                while (fetchMore && processedMessages < ACTIVITY_CHECK_MAX_MESSAGES) {
                    const options = { limit: ACTIVITY_CHECK_FETCH_LIMIT };
                    if (lastMessageId) {
                        options.before = lastMessageId;
                    }

                    const messages = await channel.messages.fetch(options);

                    if (messages.size === 0) {
                        fetchMore = false; // No more messages to fetch
                        break;
                    }

                    console.log(`[ActivityCheck] Fetched ${messages.size} messages...`);

                    for (const message of messages.values()) {
                        processedMessages++;
                        lastMessageId = message.id; // Set for the next fetch iteration

                        // Stop if message is older than the start time
                        if (message.createdTimestamp < startTime) {
                            fetchMore = false;
                            break; // Stop processing this batch and fetching more
                        }

                        // --- New Parsing Logic ---
                        const logUser = message.author; // Use message author
                        const hasImage = message.attachments.size > 0 && message.attachments.first().contentType?.startsWith('image/');

                        // Regex to capture HH:MM-HH:MM followed by optional AM/PM
                        // Example: Time: 6:00-6:25PM GMT+2
                        // Groups:   1=(6) 2=(00) 3=(6) 4=(25) 5=(PM)
                        const timeRegex = /Time:\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)?/i;
                        const timeMatch = message.content.match(timeRegex);

                        // Optional: Regex to capture Rank
                        // const rankMatch = message.content.match(/Rank:\s*(.+)/i);
                        // const rank = rankMatch ? rankMatch[1].trim() : 'Unknown'; // Get rank if found

                        // Proceed only if user, image proof, and time range are found
                        if (logUser && !logUser.bot && hasImage && timeMatch) {
                            const userId = logUser.id;
                            const userTag = logUser.tag;

                            let duration = -1; // Default to invalid duration

                            try {
                                // Extract time components
                                let startHour = parseInt(timeMatch[1], 10);
                                const startMin = parseInt(timeMatch[2], 10);
                                let endHour = parseInt(timeMatch[3], 10);
                                const endMin = parseInt(timeMatch[4], 10);
                                const ampm = timeMatch[5] ? timeMatch[5].toUpperCase() : null; // AM/PM might not always be present

                                // Basic AM/PM conversion (doesn't handle 12 AM/PM perfectly for edge cases like 12:xx AM)
                                // Assumes PM adds 12 hours unless it's already 12 PM
                                if (ampm === 'PM' && startHour !== 12) startHour += 12;
                                if (ampm === 'PM' && endHour !== 12) endHour += 12;
                                // Note: This doesn't handle 12 AM correctly (which should be 0 hours), but might be okay for duration calc if consistent
                                // A more robust solution would use a date library if shifts cross noon/midnight often

                                // Calculate total minutes from midnight
                                const startTotalMinutes = startHour * 60 + startMin;
                                let endTotalMinutes = endHour * 60 + endMin;

                                // Basic check if end time is on the "next day" (e.g. 11 PM - 1 AM)
                                // This is a simplification and might not cover all edge cases.
                                if (endTotalMinutes < startTotalMinutes) {
                                     // Assumes shift crossed midnight, add 24 hours worth of minutes
                                     // This might misinterpret a log like "Time: 6:00 - 5:00PM" if AM/PM isn't specified/parsed correctly
                                     // endTotalMinutes += 24 * 60;
                                     console.warn(`[ActivityCheck] Potential multi-day shift detected or parse error for ${userTag} (Start: ${startTotalMinutes}m, End: ${endTotalMinutes}m). Duration calculation might be inaccurate.`);
                                     // For now, let's calculate based on the assumption it's within the same 24h block unless clearly crossing midnight
                                     if (ampm) { // If AM/PM was specified, assume it crossed midnight
                                         endTotalMinutes += 24 * 60;
                                     } else {
                                         // If no AM/PM, assume it's an error or same day short shift
                                         console.warn(`[ActivityCheck] Ambiguous time range for ${userTag} without AM/PM. Assuming same day.`);
                                     }
                                }

                                duration = endTotalMinutes - startTotalMinutes;

                            } catch (parseError) {
                                console.error(`[ActivityCheck] Error parsing time for message ${message.id}: ${parseError}`);
                                duration = -1; // Mark as invalid
                            }


                            // If duration calculation was successful
                            if (duration >= 0) {
                                // Initialize user data if not present
                                if (!activityData.has(userId)) {
                                    activityData.set(userId, { successful: 0, failed: 0, userTag: userTag });
                                }
                                const userData = activityData.get(userId);

                                // Classify shift
                                if (duration >= ACTIVITY_CHECK_THRESHOLD_MINS) {
                                    userData.successful++;
                                } else {
                                    userData.failed++;
                                }
                            } else {
                                 console.log(`[ActivityCheck] Skipping message ${message.id} due to invalid duration calculation.`);
                            }
                        }
                        // --- End New Parsing Logic ---

                         if (processedMessages >= ACTIVITY_CHECK_MAX_MESSAGES) {
                            console.log(`[ActivityCheck] Reached max message processing limit (${ACTIVITY_CHECK_MAX_MESSAGES}).`);
                            fetchMore = false;
                            break;
                        }
                    } // End message loop

                    if (fetchMore) {
                        await delay(500); // Small delay to avoid rate limits between fetches
                    }

                } // End while loop

                console.log(`[ActivityCheck] Finished processing ${processedMessages} messages.`);

                // --- Format Results ---
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`Activity Check Results (${days} Days)`)
                    .setDescription(`Summary of shifts logged in ${channel}:`)
                    .setTimestamp();

                if (activityData.size === 0) {
                    embed.addFields({ name: 'No Data', value: 'No valid shift logs found matching the criteria in the specified period.' });
                } else {
                    let descriptionLines = [];
                    // Sort users by successful shifts descending
                    const sortedActivity = [...activityData.entries()].sort(([,a], [,b]) => b.successful - a.successful);

                    sortedActivity.forEach(([userId, data]) => {
                        descriptionLines.push(`**${data.userTag}** (<@${userId}>):`);
                        descriptionLines.push(`  ✅ Successful: ${data.successful}`);
                        descriptionLines.push(`  ❌ Failed (<${ACTIVITY_CHECK_THRESHOLD_MINS}m): ${data.failed}`);
                    });

                    // Handle potential description length limits (Discord limit is 4096)
                    // Split into multiple fields if too long
                    let currentDescription = "";
                    let fieldCount = 0;
                    const MAX_FIELD_LENGTH = 1024; // Discord Embed Field Value Limit
                    const MAX_FIELDS = 5; // Limit number of fields to avoid huge embeds

                    for(const line of descriptionLines) {
                         // Check if adding the next line would exceed the limit
                        if (currentDescription.length + line.length + 1 > MAX_FIELD_LENGTH || fieldCount >= MAX_FIELDS) {
                             // Add the current field before starting a new one or if max fields reached
                             embed.addFields({ name: `Activity Summary ${fieldCount > 0 ? `(cont. ${fieldCount+1})` : ''}`, value: currentDescription || ' ' }); // Add space if empty
                             currentDescription = ""; // Reset description
                             fieldCount++;
                             if (fieldCount >= MAX_FIELDS) {
                                 currentDescription = "... (results truncated due to length)";
                                 break; // Stop adding more lines if max fields reached
                             }
                        }
                         currentDescription += line + "\n";
                    }
                    // Add the last remaining description part if not empty
                    if (currentDescription && fieldCount < MAX_FIELDS) {
                         embed.addFields({ name: `Activity Summary ${fieldCount > 0 ? `(cont. ${fieldCount+1})` : ''}`, value: currentDescription });
                    } else if (currentDescription) { // Add truncated message if needed
                         embed.addFields({ name: `Activity Summary (cont. ${fieldCount+1})`, value: currentDescription });
                    }


                }
                 if (processedMessages >= ACTIVITY_CHECK_MAX_MESSAGES) {
                    embed.setFooter({ text: `Note: Processed up to the limit of ${ACTIVITY_CHECK_MAX_MESSAGES} recent messages.` });
                }


                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error("[ActivityCheck] Error:", error);
                await interaction.editReply({ content: `An error occurred while checking activity: ${error.message}`, ephemeral: true });
            }
        }


        // --- Unknown Command ---
        else {
            console.log(`[WARNING] Unknown command executed: ${commandName}`);
            await interaction.reply({ content: 'Sorry, I don\'t recognize that command.', ephemeral: true });
        }

    } catch (error) {
        console.error(`[ERROR] Error executing command ${commandName}:`, error);
        const errorMessage = 'There was an error while executing this command!';
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(console.error);
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true }).catch(console.error);
        }
    }
});


// --- Login ---
console.log("Attempting to log in to Discord...");
client.login(BOT_TOKEN)
    .then(() => console.log("Discord login successful!"))
    .catch(error => {
        console.error("[LOGIN ERROR] Discord login failed:", error);
        if (error.code === 'TokenInvalid') {
            console.error("[LOGIN ERROR] Error: Invalid token provided. Check the DISCORD_TOKEN Environment Variable on Railway.");
        } else {
            console.error("[LOGIN ERROR] An unexpected error occurred during login:", error.message);
        }
        process.exit(1); // Exit if login fails
    });
