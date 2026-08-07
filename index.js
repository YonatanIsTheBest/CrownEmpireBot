const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const fs = require('fs');

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

// 👑 Dynamically load the Crown Empire Price Index
let priceIndex = JSON.parse(fs.readFileSync('./prices.json', 'utf8'));

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
    console.log('👑 Crown Empire Bot is officially online!');

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

    // 🆕 Command to delete an item entirely
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
    
    // 🧠 AUTOCOMPLETE LOGIC (Now formatted in Title Case)
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const choices = Object.keys(priceIndex);
        const filtered = choices.filter(choice => choice.includes(focusedValue));
        
        const respondChoices = filtered.slice(0, 25).map(choice => ({
            name: toTitleCase(choice), 
            value: choice,             
        }));

        await interaction.respond(respondChoices);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    // 🛡️ Bulletproof Admin Check
    const hasRole = interaction.member && interaction.member.roles && interaction.member.roles.cache.has(ADMIN_ROLE_ID);
    const isAdmin = hasRole || interaction.user.id === ADMIN_USER_ID;

    // --- /PRICE COMMAND ---
    if (interaction.commandName === 'price') {
        const item = interaction.options.getString('item').toLowerCase().trim();

        if (priceIndex[item]) {
            const ownerSellPrice = priceIndex[item].buy; 
            const ownerBuyPrice = priceIndex[item].sell;

            const priceEmbed = new EmbedBuilder()
                .setColor('#8A2BE2') 
                .setTitle('Price Results')
                .setDescription(
                    `### ${toTitleCase(item)}\n\n` +
                    `🟢 **Selling price:** **${formatPrice(ownerSellPrice)}**\n` +
                    `🔴 **Buying price:** **${formatPrice(ownerBuyPrice)}**`
                )
                .setFooter({ text: 'Crown Empire Economy' });

            await interaction.reply({ embeds: [priceEmbed] });
        } else {
            const notFoundEmbed = new EmbedBuilder()
                .setColor('#FF4D4D')
                .setDescription(`❌ The Crown Empire has not set official prices for **"${toTitleCase(item)}"** yet.`);
            
            await interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
        }
    }

    // --- /PRICECHANGE COMMAND ---
    if (interaction.commandName === 'pricechange') {
        if (!isAdmin) {
            return interaction.reply({ content: '❌ You do not have permission to force-change prices.', ephemeral: true });
        }

        const item = interaction.options.getString('item').toLowerCase().trim();
        const rawSell = interaction.options.getString('sell_price');
        const rawBuy = interaction.options.getString('buy_price');
        
        const newSell = parsePrice(rawSell);
        const newBuy = parsePrice(rawBuy);

        if (newSell === null || newBuy === null) {
            return interaction.reply({ content: '❌ Invalid price format! Please use numbers like `450000` or abbreviations like `4.5M`, `200k`, `1.5B`.', ephemeral: true });
        }

        if (!priceIndex[item]) {
            return interaction.reply({ content: `❌ **${toTitleCase(item)}** is not in the database yet. Use \`/additem\` instead!`, ephemeral: true });
        }

        priceIndex[item] = { buy: newSell, sell: newBuy };
        fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

        const adminEmbed = new EmbedBuilder()
            .setColor('#FFD700') 
            .setTitle('👑 Admin Price Override')
            .setDescription(
                `### ${toTitleCase(item)}\n\n` +
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

        const item = interaction.options.getString('item').toLowerCase().trim();
        const rawSell = interaction.options.getString('sell_price');
        const rawBuy = interaction.options.getString('buy_price');
        
        const newSell = parsePrice(rawSell);
        const newBuy = parsePrice(rawBuy);

        if (newSell === null || newBuy === null) {
            return interaction.reply({ content: '❌ Invalid price format! Please use numbers like `450000` or abbreviations like `4.5M`, `200k`, `1.5B`.', ephemeral: true });
        }

        if (priceIndex[item]) {
            return interaction.reply({ content: `❌ **${toTitleCase(item)}** already exists! Use \`/pricechange\` to update it.`, ephemeral: true });
        }

        priceIndex[item] = { buy: newSell, sell: newBuy };
        fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

        const addEmbed = new EmbedBuilder()
            .setColor('#00FF7F')
            .setTitle('✅ Item Added')
            .setDescription(
                `### ${toTitleCase(item)}\n\n` +
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

        if (!priceIndex[oldName]) {
            return interaction.reply({ content: `❌ **${toTitleCase(oldName)}** was not found in the database.`, ephemeral: true });
        }
        if (priceIndex[newName]) {
            return interaction.reply({ content: `❌ **${toTitleCase(newName)}** already exists! Choose a different name.`, ephemeral: true });
        }

        priceIndex[newName] = priceIndex[oldName];
        delete priceIndex[oldName];
        fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

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

        const item = interaction.options.getString('item').toLowerCase().trim();

        if (!priceIndex[item]) {
            return interaction.reply({ content: `❌ **${toTitleCase(item)}** was not found in the database.`, ephemeral: true });
        }

        // Delete the item from the object and save
        delete priceIndex[item];
        fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

        const removeEmbed = new EmbedBuilder()
            .setColor('#E74C3C') // Red styling for deletion
            .setTitle('🗑️ Item Removed')
            .setDescription(`Successfully deleted **${toTitleCase(item)}** from the database.`);

        return interaction.reply({ embeds: [removeEmbed] });
    }

    // --- /VOTEPRICE COMMAND ---
    if (interaction.commandName === 'voteprice') {
        const item = interaction.options.getString('item').toLowerCase().trim();
        const rawSell = interaction.options.getString('sell_price');
        const rawBuy = interaction.options.getString('buy_price');
        
        const newSell = parsePrice(rawSell);
        const newBuy = parsePrice(rawBuy);

        if (newSell === null || newBuy === null) {
            return interaction.reply({ content: '❌ Invalid price format! Please use numbers like `450000` or abbreviations like `4.5M`, `200k`, `1.5B`.', ephemeral: true });
        }

        const totalMembers = interaction.guild.memberCount || 2; 
        const requiredVotes = Math.ceil(totalMembers / 2);

        const voteEmbed = new EmbedBuilder()
            .setColor('#5865F2') 
            .setTitle('📢 Price Change Proposal')
            .setDescription(
                `### ${toTitleCase(item)}\n\n` +
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
                        `### ${toTitleCase(item)}\n\n` +
                        `🟢 **Proposed Selling:** **${formatPrice(newSell)}**\n` +
                        `🔴 **Proposed Buying:** **${formatPrice(newBuy)}**\n\n` +
                        `📊 **Votes:** \`${votedUsers.size} / ${requiredVotes}\` (Requires 50% of server)\n` +
                        `⏳ *Voting ends in 30 minutes.*`
                    )
                    .setFooter({ text: 'Crown Empire Community Governance' });

                await interaction.editReply({ embeds: [updatedVoteEmbed] });

                if (votedUsers.size >= requiredVotes) {
                    priceIndex[item] = { buy: newSell, sell: newBuy };
                    fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

                    const passedEmbed = new EmbedBuilder()
                        .setColor('#2ECC71')
                        .setTitle('🎉 Vote Passed!')
                        .setDescription(
                            `Official prices for **${toTitleCase(item)}** have been updated!\n\n` +
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
                    .setDescription(`The proposal for **${toTitleCase(item)}** expired without reaching enough votes.`);

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

client.login(process.env.TOKEN);