// index.js - Discord Moderation Bot for Render Hosting

// Import necessary modules from discord.js
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
    version: djsVersion // Get discord.js version
} = require('discord.js');
const os = require('os'); // For botinfo command
// NOTE: Removed 'http' module - no longer needed for Render Background Worker

// --- Configuration (Loaded from Render Environment Variables) ---
const BOT_TOKEN = process.env['DISCORD_TOKEN'];
const CLIENT_ID = process.env['CLIENT_ID'];
const GUILD_ID = process.env['GUILD_ID']; // Still needed for command registration scope
const REGISTER_COMMANDS = process.env['REGISTER_COMMANDS'] === 'true'; // Control registration via Env Vars

// --- Constants ---
const ROBLOX_SERVER_LINK = 'https://www.roblox.com/games/79626890965310/Squid-Game-Reborn-Ultimate-RP';

// Check if essential configuration is missing
if (!BOT_TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("ERROR: Missing required environment variables (DISCORD_TOKEN, CLIENT_ID, GUILD_ID). Please set them in Render Environment Variables.");
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

// --- Command Definitions ---
const commands = [
    // --- Moderation Commands ---
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
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Rolls a dice.')
        .addIntegerOption(option => option.setName('sides').setDescription('Number of sides on the dice (default 6)').setMinValue(2).setMaxValue(1000).setRequired(false)),

    // --- Event Announcement Commands ---
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
];

// --- Bot Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ]
});

// Store commands in a Collection
client.commands = new Collection();
for (const command of commands) {
    client.commands.set(command.name, command);
}

// --- Command Registration ---
// This logic remains the same, controlled by the REGISTER_COMMANDS env var
if (REGISTER_COMMANDS) {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    (async () => {
        try {
            console.log(`[REGISTER] Started refreshing ${commands.length} application (/) commands for guild ${GUILD_ID}.`);
            // Registering to a specific Guild ID is faster for testing.
            // For global commands (available in all servers the bot joins), use:
            // Routes.applicationCommands(CLIENT_ID)
            // Note: Global commands can take up to an hour to propagate.
            const data = await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands.map(cmd => cmd.toJSON()) },
            );
            console.log(`[REGISTER] Successfully reloaded ${data.length} application (/) commands for guild ${GUILD_ID}.`);
            console.log("[REGISTER] IMPORTANT: Set REGISTER_COMMANDS to 'false' in Render Environment Variables after successful registration to avoid re-registering on every deploy.");
        } catch (error) {
            console.error("[REGISTER] Error registering commands:", error);
        }
    })();
} else {
     console.log("[REGISTER] Skipping command registration (REGISTER_COMMANDS env var is not 'true').");
}


// --- Event Handler: Bot Ready ---
client.on(Events.ClientReady, readyClient => {
    console.log(`--------------------------------------------------`);
    console.log(`Logged in as ${readyClient.user.tag} (${readyClient.user.id})`);
    console.log(`Ready and connected to ${readyClient.guilds.cache.size} server(s).`);
    console.log(`discord.js Version: ${djsVersion}`);
    console.log(`Node.js Version: ${process.version}`);
    console.log(`Hosted on: Render`); // Indicate hosting platform
    console.log(`--------------------------------------------------`);
    readyClient.user.setActivity('over the server | /help', { type: 3 });
});


// --- Event Handler: Interaction Create (Slash Commands) ---
// ...(Interaction handling logic remains exactly the same as before)...
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    console.log(`[COMMAND] Received command: ${commandName} from ${interaction.user.tag} in #${interaction.channel?.name ?? 'DM'}`);

    // --- Command Execution Logic ---
    try {
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


// --- Web Server for Uptime (REMOVED) ---
// We removed the http server as it's generally not needed for Render Background Workers
// and simplifies the code. Render manages the process lifecycle.


// --- Login ---
console.log("Attempting to log in to Discord...");
client.login(BOT_TOKEN)
    .then(() => console.log("Discord login successful!"))
    .catch(error => {
        console.error("[LOGIN ERROR] Discord login failed:", error);
        if (error.code === 'TokenInvalid') {
            console.error("[LOGIN ERROR] Error: Invalid token provided. Check the DISCORD_TOKEN Environment Variable on Render.");
        } else {
            console.error("[LOGIN ERROR] An unexpected error occurred during login:", error.message);
        }
        process.exit(1); // Exit if login fails
    });
