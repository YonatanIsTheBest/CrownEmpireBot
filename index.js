const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const mongoose = require('mongoose');

// 👇 AUTHORIZED ADMIN IDS 👇
const ADMIN_ROLE_ID = '1533611128284909608'; 
const ADMIN_USER_ID = '1512980123727429798';

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// --- MONGODB SCHEMAS ---
const itemSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    ownerSellPrice: { type: Number, required: true },
    ownerBuyPrice: { type: Number, required: true }
});
const Item = mongoose.model('Item', itemSchema);

const vouchSchema = new mongoose.Schema({
    receiverId: { type: String, required: true },
    giverId: { type: String, required: true },
    giverName: String,
    type: { type: String, required: true }, // 'vouch' or 'scam'
    item: String,
    details: String, // ✨ Changed from quantity to details
    timestamp: { type: Date, default: Date.now }
});
const Vouch = mongoose.model('Vouch', vouchSchema);

const banSchema = new mongoose.Schema({ userId: { type: String, required: true, unique: true } });
const VouchBan = mongoose.model('VouchBan', banSchema);

// --- EXPRESS WEB SERVER (VOUCH PORTAL) ---
app.get('/', (req, res) => res.send('Bot is alive!'));

app.get('/vouches/:userId', async (req, res) => {
    try {
        const vouches = await Vouch.find({ receiverId: req.params.userId }).sort({ timestamp: -1 });
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Crown Empire | Reputation Profile</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #1E1F22; color: #DBDEE1; margin: 0; padding: 40px; }
                .container { max-width: 1000px; margin: 0 auto; background: #2B2D31; padding: 30px; border-radius: 12px; box-shadow: 0 8px 16px rgba(0,0,0,0.5); }
                h1 { color: #FFB700; border-bottom: 2px solid #FFB700; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #313338; border-radius: 8px; overflow: hidden; }
                th, td { padding: 15px; text-align: left; border-bottom: 1px solid #1E1F22; }
                th { background-color: #111214; color: #FFB700; font-weight: bold; }
                tr:hover { background-color: #383A40; }
                .badge-vouch { background: rgba(46, 204, 113, 0.2); color: #2ECC71; padding: 5px 10px; border-radius: 4px; font-weight: bold; }
                .badge-scam { background: rgba(231, 76, 60, 0.2); color: #E74C3C; padding: 5px 10px; border-radius: 4px; font-weight: bold; }
                .admin-id { font-size: 0.8em; color: #80848E; font-family: monospace; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📜 Public Trade Ledger</h1>
                <p>Displaying records for Discord ID: <strong>${req.params.userId}</strong></p>
                ${vouches.length === 0 ? '<p><i>No trade records found for this user.</i></p>' : `
                <table>
                    <tr><th>Vouch ID (For Admins)</th><th>Date</th><th>Type</th><th>Item Traded</th><th>Details</th><th>Reporter</th></tr>
                    ${vouches.map(v => `
                    <tr>
                        <td class="admin-id">${v._id}</td>
                        <td>${v.timestamp.toLocaleDateString()}</td>
                        <td><span class="${v.type === 'vouch' ? 'badge-vouch' : 'badge-scam'}">${v.type === 'vouch' ? '✅ Vouch' : '🚨 Scam'}</span></td>
                        <td>${v.item}</td>
                        <td>${v.details}</td>
                        <td>${v.giverName}</td>
                    </tr>
                    `).join('')}
                </table>`}
            </div>
        </body>
        </html>`;
        res.send(html);
    } catch (err) {
        res.status(500).send("Error loading reputation data.");
    }
});

app.listen(port, () => console.log(`Web server listening on port ${port}`));

// --- HELPER FUNCTIONS ---
function toTitleCase(str) { return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '); }
function formatPrice(num) {
    if (num === 0) return "0";
    if (num >= 1000000000000) return parseFloat((num / 1000000000000).toFixed(2)) + 'T';
    if (num >= 1000000000) return parseFloat((num / 1000000000).toFixed(2)) + 'B';
    if (num >= 1000000) return parseFloat((num / 1000000).toFixed(2)) + 'M';
    if (num >= 1000) return parseFloat((num / 1000).toFixed(2)) + 'k';
    return num.toLocaleString(); 
}
function parsePrice(input) {
    if (!input) return null;
    const cleanInput = input.toString().trim().toUpperCase();
    let multiplier = 1, numberPart = cleanInput;
    if (cleanInput.endsWith('T')) { multiplier = 1000000000000; numberPart = cleanInput.slice(0, -1); }
    else if (cleanInput.endsWith('B')) { multiplier = 1000000000; numberPart = cleanInput.slice(0, -1); }
    else if (cleanInput.endsWith('M')) { multiplier = 1000000; numberPart = cleanInput.slice(0, -1); }
    else if (cleanInput.endsWith('K')) { multiplier = 1000; numberPart = cleanInput.slice(0, -1); }
    const number = parseFloat(numberPart);
    if (isNaN(number)) return null;
    return Math.floor(number * multiplier);
}

const vouchCooldowns = new Map(); // Anti-spam memory

client.once('ready', async () => {
    console.log('👑 Crown Empire Bot is starting up...');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB Atlas permanently!');
    } catch (err) { console.error('❌ MongoDB Connection Error:', err); }

    const commands = [
        { name: 'price', description: 'Check official prices', options: [{ name: 'item', description: 'Item name', type: 3, required: true, autocomplete: true }] },
        { name: 'voteprice', description: 'Propose new shop prices', options: [{ name: 'item', description: 'Item', type: 3, required: true, autocomplete: true }, { name: 'sell_price', description: 'Sell', type: 3, required: true }, { name: 'buy_price', description: 'Buy', type: 3, required: true }] },
        { name: 'pricechange', description: 'Force price change (Admin)', options: [{ name: 'item', description: 'Item', type: 3, required: true, autocomplete: true }, { name: 'sell_price', description: 'Sell', type: 3, required: true }, { name: 'buy_price', description: 'Buy', type: 3, required: true }] },
        { name: 'additem', description: 'Insert new item (Admin)', options: [{ name: 'item', description: 'Item', type: 3, required: true }, { name: 'sell_price', description: 'Sell', type: 3, required: true }, { name: 'buy_price', description: 'Buy', type: 3, required: true }] },
        { name: 'renameitem', description: 'Rename item (Admin)', options: [{ name: 'old_name', description: 'Old', type: 3, required: true, autocomplete: true }, { name: 'new_name', description: 'New', type: 3, required: true }] },
        { name: 'removeitem', description: 'Remove item (Admin)', options: [{ name: 'item', description: 'Item', type: 3, required: true, autocomplete: true }] },
        
        // ✨ NEW VOUCH COMMANDS ✨
        { name: 'vouch', description: 'Check a user\'s reputation and trade history', options: [{ name: 'user', description: 'The user to investigate', type: 6, required: true }] },
        { 
            name: 'givevouch', description: 'Submit a formal trade report (Vouch or Scam)', 
            options: [
                { name: 'user', description: 'The user you traded with', type: 6, required: true },
                { name: 'type', description: 'Was it a legit trade or a scam?', type: 3, required: true, choices: [{name:'✅ Legit Vouch', value:'vouch'}, {name:'🚨 Scam Report', value:'scam'}] },
                { name: 'item', description: 'What item was traded?', type: 3, required: true },
                { name: 'details', description: 'Details of the trade (e.g. 500k, 2 stacks, specific agreements)', type: 3, required: true }
            ] 
        },
        { 
            name: 'removevouch', description: 'Remove a specific vouch from a user (Admin)', 
            options: [
                { name: 'vouch_id', description: 'The exact Vouch ID (Copy this from the web portal)', type: 3, required: true }
            ] 
        },
        { name: 'vouchban', description: 'Ban an abuser and wipe all their given vouches (Admin)', options: [{ name: 'user', description: 'The abuser to ban', type: 6, required: true }] }
    ];

    await client.application.commands.set(commands);
    console.log('✅ All Slash commands registered!');
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const choices = await Item.find({ name: new RegExp(focusedValue, 'i') }).limit(25);
        await interaction.respond(choices.map(choice => ({ name: toTitleCase(choice.name), value: choice.name })));
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const hasRole = interaction.member && interaction.member.roles && interaction.member.roles.cache.has(ADMIN_ROLE_ID);
    const isAdmin = hasRole || interaction.user.id === ADMIN_USER_ID;

    const crownIcon = client.user.displayAvatarURL(); 
    const errorIcon = 'https://cdn-icons-png.flaticon.com/512/4201/4201973.png';
    const royalGold = '#FFB700';
    const MARKET_CHANNEL_ID = '1536121142908293180'; 

    async function sendMarketAlert(itemName, newSell, newBuy, isVote = false, commandInteraction) {
        try {
            const channel = await client.channels.fetch(MARKET_CHANNEL_ID);
            if (!channel) return await commandInteraction.followUp({ content: `⚠️ **Error:** Cannot see market channel!`, ephemeral: true });
            const alertEmbed = new EmbedBuilder().setColor(isVote ? '#2ECC71' : royalGold).setAuthor({ name: isVote ? 'Community Market Update' : 'Official Market Update', iconURL: crownIcon }).setTitle(`📈 ${toTitleCase(itemName)}`).addFields({ name: 'New Selling Price', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true }, { name: 'New Buying Price', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true }).setTimestamp();
            await channel.send({ embeds: [alertEmbed] });
        } catch (error) { await commandInteraction.followUp({ content: `⚠️ **Warning:** Could not send to market channel. Check permissions.`, ephemeral: true }); }
    }

    // ✨ VOUCH SYSTEM LOGIC ✨

    if (interaction.commandName === 'givevouch') {
        const targetUser = interaction.options.getUser('user');
        const type = interaction.options.getString('type');
        const item = interaction.options.getString('item');
        const details = interaction.options.getString('details');
        
        // Anti-Abuse 1: Check if banned
        const isBanned = await VouchBan.findOne({ userId: interaction.user.id });
        if (isBanned) return interaction.reply({ content: '🚫 You are permanently banned from using the reputation system.', ephemeral: true });

        // Anti-Abuse 2: No self-vouching
        if (targetUser.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot vouch for yourself.', ephemeral: true });
        if (targetUser.bot) return interaction.reply({ content: '❌ You cannot vouch a bot.', ephemeral: true });

        

        // Anti-Abuse 4: Cooldown (15 minutes per user)
        const cooldownKey = interaction.user.id;
        if (vouchCooldowns.has(cooldownKey)) {
            const expiration = vouchCooldowns.get(cooldownKey) + (1000 * 60 * 15); // 15 minutes
            if (Date.now() < expiration) {
                const timeLeft = Math.round((expiration - Date.now()) / 60000);
                return interaction.reply({ content: `⏳ Please wait **${timeLeft} minutes** before submitting another vouch.`, ephemeral: true });
            }
        }

        await Vouch.create({
            receiverId: targetUser.id,
            giverId: interaction.user.id,
            giverName: interaction.user.username,
            type: type,
            item: item,
            details: details
        });

        vouchCooldowns.set(cooldownKey, Date.now()); // Start cooldown

        const replyEmbed = new EmbedBuilder()
            .setColor(type === 'vouch' ? '#2ECC71' : '#E74C3C')
            .setAuthor({ name: 'Trade Report Submitted', iconURL: crownIcon })
            .setDescription(`Successfully recorded a **${type.toUpperCase()}** for <@${targetUser.id}>.\n\n**Item:** ${item}\n**Details:** ${details}`)
            .setTimestamp();

        return interaction.reply({ embeds: [replyEmbed] });
    }

    if (interaction.commandName === 'vouch') {
        const targetUser = interaction.options.getUser('user');
        
        const received = await Vouch.find({ receiverId: targetUser.id });
        const given = await Vouch.countDocuments({ giverId: targetUser.id });

        const totalVouches = received.filter(v => v.type === 'vouch').length;
        const totalScams = received.filter(v => v.type === 'scam').length;

        // Generate the web server URL
        const portalLink = `https://crownempirebot.onrender.com/vouches/${targetUser.id}`;

        const statsEmbed = new EmbedBuilder()
            .setColor(royalGold)
            .setAuthor({ name: `${targetUser.username}'s Reputation`, iconURL: targetUser.displayAvatarURL() || crownIcon })
            .addFields(
                { name: '✅ Legit Vouches', value: `\`\`\`${totalVouches}\`\`\``, inline: true },
                { name: '🚨 Scam Reports', value: `\`\`\`${totalScams}\`\`\``, inline: true },
                { name: '📤 Vouches Given', value: `\`\`\`${given}\`\`\``, inline: true }
            )
            .setDescription(`**[📋 Click here to view their complete Trade Ledger](${portalLink})**\n*Opens a detailed table of every trade, item, and details.*`)
            .setTimestamp();

        return interaction.reply({ embeds: [statsEmbed] });
    }

    if (interaction.commandName === 'removevouch') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const vouchId = interaction.options.getString('vouch_id').trim();

        try {
            const deletedVouch = await Vouch.findByIdAndDelete(vouchId);
            
            if (!deletedVouch) return interaction.reply({ content: `❌ Could not find a vouch with ID **${vouchId}**. Please copy the exact ID from the web portal.`, ephemeral: true });

            const removeEmbed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setAuthor({ name: 'Vouch Removed (Admin)', iconURL: crownIcon })
                .setDescription(`Successfully deleted a **${deletedVouch.type.toUpperCase()}** report.\n\n**Removed from:** <@${deletedVouch.receiverId}>\n**Originally given by:** ${deletedVouch.giverName}`);
                
            return interaction.reply({ embeds: [removeEmbed] });
        } catch (err) {
            return interaction.reply({ content: `❌ Invalid ID format. Make sure you are copying the long ID from the far-left column of the web portal.`, ephemeral: true });
        }
    }

    if (interaction.commandName === 'vouchban') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const targetUser = interaction.options.getUser('user');

        await VouchBan.findOneAndUpdate({ userId: targetUser.id }, { userId: targetUser.id }, { upsert: true });
        
        // The nuke: Erase every vouch this user ever gave
        const deleteResult = await Vouch.deleteMany({ giverId: targetUser.id });

        const banEmbed = new EmbedBuilder()
            .setColor('#992D22') 
            .setTitle('🔨 Reputation System Ban')
            .setDescription(`<@${targetUser.id}> has been permanently blacklisted from the vouch system.`)
            .addFields({ name: 'Purge Complete', value: `Deleted **${deleteResult.deletedCount}** fake/abusive vouches they had previously given.` });

        return interaction.reply({ embeds: [banEmbed] });
    }

    // --- EXISTING MARKET COMMANDS (Condensed to save space) ---
    if (interaction.commandName === 'price') {
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const itemData = await Item.findOne({ name: itemName });
        if (itemData) {
            const sellAfterTaxes = Math.floor(itemData.ownerSellPrice * 0.93), buyAfterTaxes = Math.floor(itemData.ownerBuyPrice * 1.07);
            const priceEmbed = new EmbedBuilder().setColor(royalGold).setAuthor({ name: 'Crown Empire Official Market', iconURL: crownIcon }).setTitle(`📦 ${toTitleCase(itemData.name)}`).addFields({ name: '📤 Shop Sells For', value: `\`\`\`💰 ${formatPrice(itemData.ownerSellPrice)}\`\`\`> *After Tax:* **${formatPrice(sellAfterTaxes)}**`, inline: true }, { name: '📥 Shop Buys For', value: `\`\`\`💰 ${formatPrice(itemData.ownerBuyPrice)}\`\`\`> *After Tax:* **${formatPrice(buyAfterTaxes)}**`, inline: true }).setThumbnail(crownIcon).setTimestamp();
            await interaction.reply({ embeds: [priceEmbed] });
        } else {
            const partialMatches = await Item.find({ name: new RegExp(itemName, 'i') }).limit(10);
            if (partialMatches.length > 0) {
                const suggestionList = partialMatches.map(i => `> 🔸 **${toTitleCase(i.name)}**`).join('\n');
                await interaction.reply({ embeds: [new EmbedBuilder().setColor('#2B2D31').setAuthor({ name: 'Item Not Found', iconURL: errorIcon }).setDescription(`Did you mean one of these?\n${suggestionList}`)], ephemeral: true });
            } else await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FF4D4D').setDescription(`❌ No prices set for **"${toTitleCase(itemName)}"** yet.`)], ephemeral: true });
        }
    }
    if (interaction.commandName === 'pricechange') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price')), newBuy = parsePrice(interaction.options.getString('buy_price'));
        if (newSell === null || newBuy === null) return interaction.reply({ content: '❌ Invalid price!', ephemeral: true });
        const itemData = await Item.findOneAndUpdate({ name: itemName }, { ownerSellPrice: newSell, ownerBuyPrice: newBuy }, { returnDocument: 'after' });
        if (!itemData) return interaction.reply({ content: `❌ Item not found. Use \`/additem\`.`, ephemeral: true });
        const adminEmbed = new EmbedBuilder().setColor(royalGold).setAuthor({ name: 'Admin Price Override', iconURL: crownIcon }).setTitle(`🔄 ${toTitleCase(itemData.name)}`).addFields({ name: 'New Selling Price', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true }, { name: 'New Buying Price', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true }).setTimestamp();
        await interaction.reply({ embeds: [adminEmbed] });
        await sendMarketAlert(itemData.name, newSell, newBuy, false, interaction);
    }
    if (interaction.commandName === 'additem') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price')), newBuy = parsePrice(interaction.options.getString('buy_price'));
        if (newSell === null || newBuy === null) return interaction.reply({ content: '❌ Invalid format!', ephemeral: true });
        if (await Item.findOne({ name: itemName })) return interaction.reply({ content: `❌ Item exists!`, ephemeral: true });
        await Item.create({ name: itemName, ownerSellPrice: newSell, ownerBuyPrice: newBuy });
        const addEmbed = new EmbedBuilder().setColor('#2ECC71').setAuthor({ name: 'Item Added', iconURL: crownIcon }).setTitle(`✅ ${toTitleCase(itemName)}`).addFields({ name: 'Selling', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true }, { name: 'Buying', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true });
        await interaction.reply({ embeds: [addEmbed] });
        await sendMarketAlert(itemName, newSell, newBuy, false, interaction);
    }
    if (interaction.commandName === 'renameitem') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const oldName = interaction.options.getString('old_name').toLowerCase().trim(), newName = interaction.options.getString('new_name').toLowerCase().trim();
        const oldItem = await Item.findOne({ name: oldName });
        if (!oldItem) return interaction.reply({ content: `❌ Item not found.`, ephemeral: true });
        if (await Item.findOne({ name: newName })) return interaction.reply({ content: `❌ New name exists!`, ephemeral: true });
        oldItem.name = newName; await oldItem.save();
        await interaction.reply({ embeds: [new EmbedBuilder().setColor('#3498DB').setDescription(`Changed **${toTitleCase(oldName)}** ➔ **${toTitleCase(newName)}**`)] });
    }
    if (interaction.commandName === 'removeitem') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        if (!await Item.findOneAndDelete({ name: itemName })) return interaction.reply({ content: `❌ Item not found.`, ephemeral: true });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor('#E74C3C').setDescription(`Purged **${toTitleCase(itemName)}**.`)] });
    }
    if (interaction.commandName === 'voteprice') {
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price')), newBuy = parsePrice(interaction.options.getString('buy_price'));
        if (newSell === null || newBuy === null) return interaction.reply({ content: '❌ Invalid price format!', ephemeral: true });
        const requiredVotes = Math.ceil((interaction.guild.memberCount || 2) / 2);
        const voteEmbed = new EmbedBuilder().setColor('#5865F2').setAuthor({ name: 'Community Governance', iconURL: crownIcon }).setTitle(`📢 Price Proposal: ${toTitleCase(itemName)}`).addFields({ name: 'Proposed Selling', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true }, { name: 'Proposed Buying', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true }).setDescription(`📊 **Votes:** \`0 / ${requiredVotes}\`\n⏳ *Voting ends in 30 minutes.*`).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('vote_yes').setLabel('Vote YES').setStyle(ButtonStyle.Success));
        const responseMessage = await interaction.reply({ embeds: [voteEmbed], components: [row], fetchReply: true });
        const votedUsers = new Set();
        const collector = responseMessage.createMessageComponentCollector({ time: 30 * 60 * 1000 });
        collector.on('collect', async buttonInteraction => {
            if (buttonInteraction.customId === 'vote_yes') {
                if (votedUsers.has(buttonInteraction.user.id)) return buttonInteraction.reply({ content: 'Already voted!', ephemeral: true });
                votedUsers.add(buttonInteraction.user.id);
                await buttonInteraction.reply({ content: 'Vote counted!', ephemeral: true });
                await interaction.editReply({ embeds: [EmbedBuilder.from(voteEmbed).setDescription(`📊 **Votes:** \`${votedUsers.size} / ${requiredVotes}\`\n⏳ *Voting ends in 30 minutes.*`)] });
                if (votedUsers.size >= requiredVotes) {
                    const existingItem = await Item.findOne({ name: itemName });
                    if (existingItem) { existingItem.ownerSellPrice = newSell; existingItem.ownerBuyPrice = newBuy; await existingItem.save(); }
                    else { await Item.create({ name: itemName, ownerSellPrice: newSell, ownerBuyPrice: newBuy }); }
                    await interaction.followUp({ embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle(`🎉 Prices Updated: ${toTitleCase(itemName)}`).addFields({ name: 'New Selling', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true }, { name: 'New Buying', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true })] });
                    await sendMarketAlert(itemName, newSell, newBuy, true, interaction);
                    collector.stop('passed');
                }
            }
        });
        collector.on('end', async (collected, reason) => {
            await interaction.editReply({ components: [] });
            if (reason !== 'passed') await interaction.followUp({ embeds: [new EmbedBuilder().setColor('#E74C3C').setDescription(`Proposal for **${toTitleCase(itemName)}** expired without enough votes.`)] });
        });
    }
});

process.on('unhandledRejection', (reason, promise) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

client.login(process.env.TOKEN);
