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

// 🔠 Formatter: Converts "steel ingot" to "Steel Ingot"
function toTitleCase(str) {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// 🔢 Formatter: Converts long numbers into text (e.g. 4500000 -> 4.5M)
function formatPrice(num) {
    if (num === 0) return "0";
    if (num >= 1000000000000) {
        return parseFloat((num / 1000000000000).toFixed(2)) + 'T';
    } else if (num >= 1000000000) {
        return parseFloat((num / 1000000000).toFixed(2)) + 'B';
    } else if (num >= 1000000) {
        return parseFloat((num / 1000000).toFixed(2)) + 'M';
    } else if (num >= 1000) {
        return parseFloat((num / 1000).toFixed(2)) + 'k';
    }
    return num.toLocaleString(); 
}

// 🧮 Parser: Converts text back into raw numbers (e.g. "4.5M" -> 4500000)
function parsePrice(input) {
    if (!input) return null;
    const cleanInput = input.toString().trim().toUpperCase();
    
    let multiplier = 1;
    let numberPart = cleanInput;

    if (cleanInput.endsWith('T')) {
        multiplier = 1000000000000;
        numberPart = cleanInput.slice(0, -1);
    } else if (cleanInput.endsWith('B')) {
        multiplier = 1000000000;
        numberPart = cleanInput.slice(0, -1);
    } else if (cleanInput.endsWith('M')) {
        multiplier = 1000000;
        numberPart = cleanInput.slice(0, -1);
    } else if (cleanInput.endsWith('K')) {
        multiplier = 1000;
        numberPart = cleanInput.slice(0, -1);
    }

    const number = parseFloat(numberPart);
    if (isNaN(number)) return null;

    return Math.floor(number * multiplier);
}

client.once('ready', async () => {
    console.log('👑 Crown Empire Bot is starting up...');

    // --- CONNECT TO DATABASE & MIGRATE DATA ---
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB Atlas permanently!');
        
        // Auto-migration
        const count = await Item.countDocuments();
        if (count === 0 && fs.existsSync('./prices.json')) {
            console.log('📦 Database is empty! Migrating items from prices.json...');
            const priceIndex = JSON.parse(fs.readFileSync('./prices.json', 'utf8'));
            
            const itemsToInsert = [];
            for (const [itemName, prices] of Object.entries(priceIndex)) {
                itemsToInsert.push({
                    name: itemName,
                    ownerSellPrice: prices.buy, 
                    ownerBuyPrice: prices.sell
                });
            }
            
            await Item.insertMany(itemsToInsert);
            console.log(`✅ Successfully migrated ${itemsToInsert.length} items to MongoDB cloud!`);
        }
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err);
    }

    const priceCommand = {
        name: 'price',
        description: 'Check official Crown Empire shop prices for an item',
        options: [{ name: 'item', description: 'The item you want to check', type: 3, required: true, autocomplete: true }]
    };

    const voteCommand = {
        name: 'voteprice',
        description: 'Propose new shop prices to the server (30 min vote)',
        options: [
            { name: 'item', description: 'The item to change', type: 3, required: true, autocomplete: true },
            { name: 'sell_price', description: 'Price YOU SELL to players (e.g. 4.5M)', type: 3, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players (e.g. 200k)', type: 3, required: true }
        ]
    };

    const priceChangeCommand = {
        name: 'pricechange',
        description: 'Forcefully change the price of an EXISTING item (Admin only)',
        options: [
            { name: 'item', description: 'The item name to update', type: 3, required: true, autocomplete: true },
            { name: 'sell_price', description: 'Price YOU SELL to players (e.g. 4.5M)', type: 3, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players (e.g. 200k)', type: 3, required: true }
        ]
    };

    const addItemCommand = {
        name: 'additem',
        description: 'Insert a brand new item into the database (Admin only)',
        options: [
            { name: 'item', description: 'The NEW item name', type: 3, required: true },
            { name: 'sell_price', description: 'Price YOU SELL to players (e.g. 4.5M)', type: 3, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players (e.g. 200k)', type: 3, required: true }
        ]
    };

    const renameItemCommand = {
        name: 'renameitem',
        description: 'Change the name of an existing item in the database (Admin only)',
        options: [
            { name: 'old_name', description: 'The current item name', type: 3, required: true, autocomplete: true },
            { name: 'new_name', description: 'The new item name', type: 3, required: true }
        ]
    };

    const removeItemCommand = {
        name: 'removeitem',
        description: 'Remove an item completely from the database (Admin only)',
        options: [
            { name: 'item', description: 'The item to remove', type: 3, required: true, autocomplete: true }
        ]
    };

    await client.application.commands.set([priceCommand, voteCommand, priceChangeCommand, addItemCommand, renameItemCommand, removeItemCommand]);
    console.log('✅ All 6 Slash commands successfully registered!');
});

client.on('interactionCreate', async interaction => {
    
    // 🧠 AUTOCOMPLETE LOGIC
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const choices = await Item.find({ name: new RegExp(focusedValue, 'i') }).limit(25);
        
        const respondChoices = choices.map(choice => ({
            name: toTitleCase(choice.name), 
            value: choice.name,             
        }));

        await interaction.respond(respondChoices);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    // 🛡️ Admin Check
    const hasRole = interaction.member && interaction.member.roles && interaction.member.roles.cache.has(ADMIN_ROLE_ID);
    const isAdmin = hasRole || interaction.user.id === ADMIN_USER_ID;

    // --- /PRICE COMMAND ---
    if (interaction.commandName === 'price') {
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        
        // 1. First, try to find the exact item
        const itemData = await Item.findOne({ name: itemName });

        if (itemData) {
            // 🧮 CALCULATE 7% VENDING TAX
            const sellAfterTaxes = Math.floor(itemData.ownerSellPrice * 0.93);
            const buyAfterTaxes = Math.floor(itemData.ownerBuyPrice * 1.07);

            const priceEmbed = new EmbedBuilder()
                .setColor('#8A2BE2') 
                .setTitle('Price Results')
                .setDescription(
                    `### ${toTitleCase(itemData.name)}\n\n` +
                    `🟢 **Selling price:** **${formatPrice(itemData.ownerSellPrice)}**\n` +
                    `*(After 7% Vending Tax: ${formatPrice(sellAfterTaxes)})*\n\n` +
                    `🔴 **Buying price:** **${formatPrice(itemData.ownerBuyPrice)}**\n` +
                    `*(After 7% Vending Tax: ${formatPrice(buyAfterTaxes)})*`
                )
                .setFooter({ text: 'Crown Empire Economy' });

            await interaction.reply({ embeds: [priceEmbed] });
        } else {
            // 2. SMART SEARCH: Find ANY matching items
            const partialMatches = await Item.find({ name: new RegExp(itemName, 'i') }).limit(10);
            
            if (partialMatches.length > 0) {
                const suggestionList = partialMatches.map(i => `• **${toTitleCase(i.name)}**`).join('\n');
                
                const searchEmbed = new EmbedBuilder()
                    .setColor('#FF9900') 
                    .setTitle('🔍 Multiple Items Found')
                    .setDescription(
                        `We couldn't find an exact match for **"${toTitleCase(itemName)}"**, but we found these similar items in the database:\n\n` +
                        `${suggestionList}\n\n` +
                        `*Tip: Try using the command again and click one of these names from the pop-up menu!*`
                    );
                
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
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to force-change prices.', ephemeral: true });
        }

        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price'));
        const newBuy = parsePrice(interaction.options.getString('buy_price'));

        if (newSell === null || newBuy === null) {
            return interaction.reply({ content: '❌ Invalid price format! Use numbers like `450000` or `4.5M`.', ephemeral: true });
        }

        const itemData = await Item.findOneAndUpdate(
            { name: itemName }, 
            { ownerSellPrice: newSell, ownerBuyPrice: newBuy },
            { new: true }
        );

        if (!itemData) {
            return interaction.reply({ content: `❌ **${toTitleCase(itemName)}** is not in the database yet. Use \`/additem\` instead!`, ephemeral: true });
        }

        const adminEmbed = new EmbedBuilder()
            .setColor('#FFD700') 
            .setTitle('👑 Admin Price Override')
            .setDescription(
                `### ${toTitleCase(itemData.name)}\n\n` +
                `🟢 **New Selling price:** **${formatPrice(newSell)}**\n` +
                `🔴 **New Buying price:** **${formatPrice(newBuy)}**`
            )
            .setFooter({ text: 'Crown Empire Admin Panel' });

        return interaction.reply({ embeds: [adminEmbed] });
    }

    // --- /ADDITEM COMMAND ---
    if (interaction.commandName === 'additem') {
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to add items.', ephemeral: true });
        }

        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price'));
        const newBuy = parsePrice(interaction.options.getString('buy_price'));

        if (newSell === null || newBuy === null) {
            return interaction.reply({ content: '❌ Invalid price format! Use numbers like `450000` or `4.5M`.', ephemeral: true });
        }

        const existingItem = await Item.findOne({ name: itemName });
        if (existingItem) {
            return interaction.reply({ content: `❌ **${toTitleCase(itemName)}** already exists! Use \`/pricechange\` to update it.`, ephemeral: true });
        }

        await Item.create({ name: itemName, ownerSellPrice: newSell, ownerBuyPrice: newBuy });

        const addEmbed = new EmbedBuilder()
            .setColor('#00FF7F')
            .setTitle('✅ Item Added')
            .setDescription(
                `### ${toTitleCase(itemName)}\n\n` +
                `🟢 **Selling price:** **${formatPrice(newSell)}**\n` +
                `🔴 **Buying price:** **${formatPrice(newBuy)}**`
            );

        return interaction.reply({ embeds: [addEmbed] });
    }

    // --- /RENAMEITEM COMMAND ---
    if (interaction.commandName === 'renameitem') {
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to rename items.', ephemeral: true });
        }

        const oldName = interaction.options.getString('old_name').toLowerCase().trim();
        const newName = interaction.options.getString('new_name').toLowerCase().trim();

        const oldItem = await Item.findOne({ name: oldName });
        if (!oldItem) {
            return interaction.reply({ content: `❌ **${toTitleCase(oldName)}** was not found in the database.`, ephemeral: true });
        }

        const newItemExists = await Item.findOne({ name: newName });
        if (newItemExists) {
            return interaction.reply({ content: `❌ **${toTitleCase(newName)}** already exists! Choose a different name.`, ephemeral: true });
        }

        oldItem.name = newName;
        await oldItem.save();

        const renameEmbed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🔄 Item Renamed')
            .setDescription(`Successfully changed **${toTitleCase(oldName)}** ➔ **${toTitleCase(newName)}**`);

        return interaction.reply({ embeds: [renameEmbed] });
    }

    // --- /REMOVEITEM COMMAND ---
    if (interaction.commandName === 'removeitem') {
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to remove items.', ephemeral: true });
        }

        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const deletedItem = await Item.findOneAndDelete({ name: itemName });

        if (!deletedItem) {
            return interaction.reply({ content: `❌ **${toTitleCase(itemName)}** was not found in the database.`, ephemeral: true });
        }

        const removeEmbed = new EmbedBuilder()
            .setColor('#E74C3C') 
            .setTitle('🗑️ Item Removed')
            .setDescription(`Successfully deleted **${toTitleCase(itemName)}** from the cloud database.`);

        return interaction.reply({ embeds: [removeEmbed] });
    }

    // --- /VOTEPRICE COMMAND ---
    if (interaction.commandName === 'voteprice') {
        const itemName = interaction.options.getString('item').toLowerCase().trim();
        const newSell = parsePrice(interaction.options.getString('sell_price'));
        const newBuy = parsePrice(interaction.options.getString('buy_price'));

        if (newSell === null || newBuy === null) {
            return interaction.reply({ content: '❌ Invalid price format! Use numbers like `450000` or `4.5M`.', ephemeral: true });
        }

        const totalMembers = interaction.guild.memberCount || 2; 
        const requiredVotes = Math.ceil(totalMembers / 2);

        const voteEmbed = new EmbedBuilder()
            .setColor('#5865F2') 
            .setTitle('📢 Price Change Proposal')
            .setDescription(
                `### ${toTitleCase(itemName)}\n\n` +
                `🟢 **Proposed Selling:** **${formatPrice(newSell)}**\n` +
                `🔴 **Proposed Buying:** **${formatPrice(newBuy)}**\n\n` +
                `📊 **Votes:** \`0 / ${requiredVotes}\` (Requires 50% of server)\n` +
                `⏳ *Voting ends in 30 minutes.*`
            )
            .setFooter({ text: 'Crown Empire Community Governance' });

        const voteButton = new ButtonBuilder()
            .setCustomId('vote_yes')
            .setLabel('Vote YES')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(voteButton);

        const responseMessage = await interaction.reply({
            embeds: [voteEmbed],
            components: [row],
            fetchReply: true 
        });

        const votedUsers = new Set();
        const collector = responseMessage.createMessageComponentCollector({ time: 30 * 60 * 1000 });

        collector.on('collect', async buttonInteraction => {
            if (buttonInteraction.customId === 'vote_yes') {
                if (votedUsers.has(buttonInteraction.user.id)) {
                    return buttonInteraction.reply({ content: 'You have already voted on this proposal!', ephemeral: true });
                }

                votedUsers.add(buttonInteraction.user.id);
                await buttonInteraction.reply({ content: 'Your vote has been counted!', ephemeral: true });

                const updatedVoteEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('📢 Price Change Proposal')
                    .setDescription(
                        `### ${toTitleCase(itemName)}\n\n` +
                        `🟢 **Proposed Selling:** **${formatPrice(newSell)}**\n` +
                        `🔴 **Proposed Buying:** **${formatPrice(newBuy)}**\n\n` +
                        `📊 **Votes:** \`${votedUsers.size} / ${requiredVotes}\` (Requires 50% of server)\n` +
                        `⏳ *Voting ends in 30 minutes.*`
                    )
                    .setFooter({ text: 'Crown Empire Community Governance' });

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
                        .setTitle('🎉 Vote Passed!')
                        .setDescription(
                            `Official prices for **${toTitleCase(itemName)}** have been saved to the cloud!\n\n` +
                            `🟢 **Selling:** **${formatPrice(newSell)}**\n` +
                            `🔴 **Buying:** **${formatPrice(newBuy)}**`
                        );
                    
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
                    .setTitle('❌ Vote Failed')
                    .setDescription(`The proposal for **${toTitleCase(itemName)}** expired without reaching enough votes.`);

                await interaction.followUp({ embeds: [failedEmbed] });
            }
        });
    }
});

// --- ANTI-CRASH SYSTEM ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.error('Uncaught Exception Monitor:', err, origin);
});

// THE MOST IMPORTANT LINE (Tells the bot to log in!)
// --- DIAGNOSTIC TRACKER ---
console.log("🔍 System Check: Looking for Discord Token...");

if (!process.env.TOKEN) {
    console.log("❌ ERROR: The TOKEN is missing or Render can't read it!");
} else {
    console.log("✅ Token found! Attempting to connect to Discord...");
    
    client.login(process.env.TOKEN)
        .then(() => {
            console.log("✅ Connection request accepted by Discord!");
        })
        .catch(err => {
            console.error("❌ DISCORD REJECTED THE LOGIN:", err);
        });
}