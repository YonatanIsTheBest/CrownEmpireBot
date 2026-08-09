// 👇 THE NETWORK FIX (Forces IPv4 to prevent the gateway hang) 👇
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

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

// --- MONGODB SCHEMA ---
const itemSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    ownerSellPrice: { type: Number, required: true },
    ownerBuyPrice: { type: Number, required: true }
});
const Item = mongoose.model('Item', itemSchema);

function toTitleCase(str) {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

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
    
    let multiplier = 1;
    let numberPart = cleanInput;

    if (cleanInput.endsWith('T')) { multiplier = 1000000000000; numberPart = cleanInput.slice(0, -1); }
    else if (cleanInput.endsWith('B')) { multiplier = 1000000000; numberPart = cleanInput.slice(0, -1); }
    else if (cleanInput.endsWith('M')) { multiplier = 1000000; numberPart = cleanInput.slice(0, -1); }
    else if (cleanInput.endsWith('K')) { multiplier = 1000; numberPart = cleanInput.slice(0, -1); }

    const number = parseFloat(numberPart);
    if (isNaN(number)) return null;
    return Math.floor(number * multiplier);
}

client.once('ready', async () => {
    console.log('👑 Crown Empire Bot is starting up...');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB Atlas permanently!');
        
        const count = await Item.countDocuments();
        if (count === 0 && fs.existsSync('./prices.json')) {
            console.log('📦 Database is empty! Migrating items from prices.json...');
            const priceIndex = JSON.parse(fs.readFileSync('./prices.json', 'utf8'));
            
            const itemsToInsert = [];
            for (const [itemName, prices] of Object.entries(priceIndex)) {
                itemsToInsert.push({ name: itemName, ownerSellPrice: prices.buy, ownerBuyPrice: prices.sell });
            }
            
            await Item.insertMany(itemsToInsert);
            console.log(`✅ Successfully migrated ${itemsToInsert.length} items to MongoDB cloud!`);
        }
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err);
    }

    const priceCommand = {
        name: 'price', description: 'Check official Crown Empire shop prices for an item',
        options: [{ name: 'item', description: 'The item you want to check', type: 3, required: true, autocomplete: true }]
    };
    const voteCommand = {
        name: 'voteprice', description: 'Propose new shop prices to the server (30 min vote)',
        options: [
            { name: 'item', description: 'The item to change', type: 3, required: true, autocomplete: true },
            { name: 'sell_price', description: 'Price YOU SELL to players (e.g. 4.5M)', type: 3, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players (e.g. 200k)', type: 3, required: true }
        ]
    };
    const priceChangeCommand = {
        name: 'pricechange', description: 'Forcefully change the price of an EXISTING item (Admin only)',
        options: [
            { name: 'item', description: 'The item name to update', type: 3, required: true, autocomplete: true },
            { name: 'sell_price', description: 'Price YOU SELL to players (e.g. 4.5M)', type: 3, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players (e.g. 200k)', type: 3, required: true }
        ]
    };
    const addItemCommand = {
        name: 'additem', description: 'Insert a brand new item into the database (Admin only)',
        options: [
            { name: 'item', description: 'The NEW item name', type: 3, required: true },
            { name: 'sell_price', description: 'Price YOU SELL to players (e.g. 4.5M)', type: 3, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players (e.g. 200k)', type: 3, required: true }
        ]
    };
    const renameItemCommand = {
        name: 'renameitem', description: 'Change the name of an existing item in the database (Admin only)',
        options: [
            { name: 'old_name', description: 'The current item name', type: 3, required: true, autocomplete: true },
            { name: 'new_name', description: 'The new item name', type: 3, required: true }
        ]
    };
    const removeItemCommand = {
        name: 'removeitem', description: 'Remove an item completely from the database (Admin only)',
        options: [
            { name: 'item', description: 'The item to remove', type: 3, required: true, autocomplete: true }
        ]
    };

    await client.application.commands.set([priceCommand, voteCommand, priceChangeCommand, addItemCommand, renameItemCommand, removeItemCommand]);
    console.log('✅ All 6 Slash commands successfully registered!');
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const choices = await Item.find({ name: new RegExp(focusedValue, 'i') }).limit(25);
        
        const respondChoices = choices.map(choice => ({ name: toTitleCase(choice.name), value: choice.name }));
        await interaction.respond(respondChoices);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const hasRole = interaction.member && interaction.member.roles && interaction.member.roles.cache.has(ADMIN_ROLE_ID);
    const isAdmin = hasRole || interaction.user.id === ADMIN_USER_ID;

   // ✨ GLOBAL UI ASSETS ✨
    const crownIcon = client.user.displayAvatarURL(); 
    const errorIcon = 'https://cdn-icons-png.flaticon.com/512/4201/4201973.png';
    const royalGold = '#FFB700';

    // --- /PRICE COMMAND ---
    if (interaction.commandName === 'price') {
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const itemData = await Item.findOne({ name: itemName });

        if (itemData) {
            const sellAfterTaxes = Math.floor(itemData.ownerSellPrice * 0.93);
            const buyAfterTaxes = Math.floor(itemData.ownerBuyPrice * 1.07);

            const priceEmbed = new EmbedBuilder()
                .setColor(royalGold) 
                .setAuthor({ name: 'Crown Empire Official Market', iconURL: crownIcon })
                .setTitle(`📦 ${toTitleCase(itemData.name)}`)
                .addFields(
                    { 
                        name: '📤 Shop Sells For', 
                        value: `\`\`\`💰 ${formatPrice(itemData.ownerSellPrice)}\`\`\`> *After Tax:* **${formatPrice(sellAfterTaxes)}**`, 
                        inline: true 
                    },
                    { 
                        name: '📥 Shop Buys For', 
                        value: `\`\`\`💰 ${formatPrice(itemData.ownerBuyPrice)}\`\`\`> *After Tax:* **${formatPrice(buyAfterTaxes)}**`, 
                        inline: true 
                    }
                )
                .setThumbnail(crownIcon)
                .setTimestamp()
                .setFooter({ 
                    text: `Requested by ${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL() 
                });

            await interaction.reply({ embeds: [priceEmbed] });
        } else {
            const partialMatches = await Item.find({ name: new RegExp(itemName, 'i') }).limit(10);
            
            if (partialMatches.length > 0) {
                const suggestionList = partialMatches.map(i => `> 🔸 **${toTitleCase(i.name)}**`).join('\n');
                const searchEmbed = new EmbedBuilder()
                    .setColor('#2B2D31') // Discord Dark Theme background color
                    .setAuthor({ name: 'Item Not Found', iconURL: errorIcon })
                    .setDescription(`We couldn't find an exact match for **"${toTitleCase(itemName)}"**.\n\n**Did you mean one of these?**\n${suggestionList}`)
                    .setFooter({ text: '💡 Tip: Click a name from the pop-up menu next time!' });
                
                await interaction.reply({ embeds: [searchEmbed], ephemeral: true });
            } else {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor('#FF4D4D') 
                    .setDescription(`❌ The Crown Empire has not set official prices for **"${toTitleCase(itemName)}"** yet.`);
                await interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
            }
        }
    }

    // --- /PRICECHANGE COMMAND ---
    if (interaction.commandName === 'pricechange') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price'));
        const newBuy = parsePrice(interaction.options.getString('buy_price'));

        if (newSell === null || newBuy === null) return interaction.reply({ content: '❌ Invalid price format!', ephemeral: true });
        const itemData = await Item.findOneAndUpdate({ name: itemName }, { ownerSellPrice: newSell, ownerBuyPrice: newBuy }, { new: true });
        if (!itemData) return interaction.reply({ content: `❌ Item not found. Use \`/additem\`.`, ephemeral: true });

        const adminEmbed = new EmbedBuilder()
            .setColor(royalGold)
            .setAuthor({ name: 'Admin Price Override', iconURL: crownIcon })
            .setTitle(`🔄 ${toTitleCase(itemData.name)}`)
            .addFields(
                { name: 'New Selling Price', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true },
                { name: 'New Buying Price', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true }
            )
            .setTimestamp();
            
        return interaction.reply({ embeds: [adminEmbed] });
    }

    // --- /ADDITEM COMMAND ---
    if (interaction.commandName === 'additem') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price'));
        const newBuy = parsePrice(interaction.options.getString('buy_price'));

        if (newSell === null || newBuy === null) return interaction.reply({ content: '❌ Invalid price format!', ephemeral: true });
        if (await Item.findOne({ name: itemName })) return interaction.reply({ content: `❌ Item already exists!`, ephemeral: true });

        await Item.create({ name: itemName, ownerSellPrice: newSell, ownerBuyPrice: newBuy });
        
        const addEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setAuthor({ name: 'Item Added to Cloud', iconURL: crownIcon })
            .setTitle(`✅ ${toTitleCase(itemName)}`)
            .addFields(
                { name: 'Selling Price', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true },
                { name: 'Buying Price', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true }
            )
            .setTimestamp();
            
        return interaction.reply({ embeds: [addEmbed] });
    }

    // --- /RENAMEITEM COMMAND ---
    if (interaction.commandName === 'renameitem') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const oldName = interaction.options.getString('old_name').toLowerCase().trim();
        const newName = interaction.options.getString('new_name').toLowerCase().trim();

        const oldItem = await Item.findOne({ name: oldName });
        if (!oldItem) return interaction.reply({ content: `❌ Item not found.`, ephemeral: true });
        if (await Item.findOne({ name: newName })) return interaction.reply({ content: `❌ New name already exists!`, ephemeral: true });

        oldItem.name = newName;
        await oldItem.save();
        
        const renameEmbed = new EmbedBuilder()
            .setColor('#3498DB')
            .setAuthor({ name: 'Item Renamed', iconURL: crownIcon })
            .setDescription(`Successfully changed **${toTitleCase(oldName)}** ➔ **${toTitleCase(newName)}**`);
            
        return interaction.reply({ embeds: [renameEmbed] });
    }

    // --- /REMOVEITEM COMMAND ---
    if (interaction.commandName === 'removeitem') {
        if (!isAdmin) return interaction.reply({ content: '❌ You do not have permission.', ephemeral: true });
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        if (!await Item.findOneAndDelete({ name: itemName })) return interaction.reply({ content: `❌ Item not found.`, ephemeral: true });

        const removeEmbed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setAuthor({ name: 'Item Deleted', iconURL: crownIcon })
            .setDescription(`Successfully purged **${toTitleCase(itemName)}** from the cloud database.`);
            
        return interaction.reply({ embeds: [removeEmbed] });
    }

    // --- /VOTEPRICE COMMAND ---
    if (interaction.commandName === 'voteprice') {
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price'));
        const newBuy = parsePrice(interaction.options.getString('buy_price'));

        if (newSell === null || newBuy === null) return interaction.reply({ content: '❌ Invalid price format!', ephemeral: true });

        const totalMembers = interaction.guild.memberCount || 2; 
        const requiredVotes = Math.ceil(totalMembers / 2);

        const voteEmbed = new EmbedBuilder()
            .setColor('#5865F2') 
            .setAuthor({ name: 'Community Governance', iconURL: crownIcon })
            .setTitle(`📢 Price Proposal: ${toTitleCase(itemName)}`)
            .addFields(
                { name: 'Proposed Selling', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true },
                { name: 'Proposed Buying', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true }
            )
            .setDescription(`📊 **Votes:** \`0 / ${requiredVotes}\` (Requires 50% of server)\n⏳ *Voting ends in 30 minutes.*`)
            .setTimestamp();

        const voteButton = new ButtonBuilder().setCustomId('vote_yes').setLabel('Vote YES').setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(voteButton);

        const responseMessage = await interaction.reply({ embeds: [voteEmbed], components: [row], fetchReply: true });

        const votedUsers = new Set();
        const collector = responseMessage.createMessageComponentCollector({ time: 30 * 60 * 1000 });

        collector.on('collect', async buttonInteraction => {
            if (buttonInteraction.customId === 'vote_yes') {
                if (votedUsers.has(buttonInteraction.user.id)) return buttonInteraction.reply({ content: 'You have already voted!', ephemeral: true });

                votedUsers.add(buttonInteraction.user.id);
                await buttonInteraction.reply({ content: 'Your vote has been counted!', ephemeral: true });

                const updatedVoteEmbed = EmbedBuilder.from(voteEmbed).setDescription(`📊 **Votes:** \`${votedUsers.size} / ${requiredVotes}\` (Requires 50% of server)\n⏳ *Voting ends in 30 minutes.*`);
                await interaction.editReply({ embeds: [updatedVoteEmbed] });

                if (votedUsers.size >= requiredVotes) {
                    const existingItem = await Item.findOne({ name: itemName });
                    if (existingItem) {
                        existingItem.ownerSellPrice = newSell;
                        existingItem.ownerBuyPrice = newBuy;
                        await existingItem.save();
                    } else {
                        await Item.create({ name: itemName, ownerSellPrice: newSell, ownerBuyPrice: newBuy });
                    }

                    const passedEmbed = new EmbedBuilder()
                        .setColor('#2ECC71')
                        .setAuthor({ name: 'Vote Passed', iconURL: crownIcon })
                        .setTitle(`🎉 Official Prices Updated: ${toTitleCase(itemName)}`)
                        .addFields(
                            { name: 'New Selling', value: `\`\`\`${formatPrice(newSell)}\`\`\``, inline: true },
                            { name: 'New Buying', value: `\`\`\`${formatPrice(newBuy)}\`\`\``, inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.followUp({ embeds: [passedEmbed] });
                    collector.stop('passed');
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            await interaction.editReply({ components: [] });
            if (reason !== 'passed') {
                const failedEmbed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setAuthor({ name: 'Vote Failed', iconURL: crownIcon })
                    .setDescription(`The proposal for **${toTitleCase(itemName)}** expired without enough votes.`);
                await interaction.followUp({ embeds: [failedEmbed] });
            }
        });
    }
});

process.on('unhandledRejection', (reason, promise) => console.error('Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));

console.log("🔍 System Check: Looking for Discord Token...");
if (!process.env.TOKEN) {
    console.log("❌ ERROR: The TOKEN is missing!");
} else {
    console.log("✅ Token found! Attempting to connect to Discord...");
    client.login(process.env.TOKEN).then(() => {
        console.log("✅ Connection request accepted by Discord!");
    }).catch(err => {
        console.error("❌ DISCORD REJECTED THE LOGIN:", err);
    });
}