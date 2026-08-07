const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

// 👇 PASTE YOUR AUTHORIZED ADMIN ROLE ID HERE ONCE 👇
const ADMIN_ROLE_ID = '1533611128284909608'; 

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

// 🔢 Formatter function updated to handle Billions (B) and Trillions (T)
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

client.once('ready', async () => {
    console.log('👑 Crown Empire Bot is officially online!');

    const priceCommand = {
        name: 'price',
        description: 'Check the Crown Empire 10% price index for an item',
        options: [{ name: 'item', description: 'The item you want to check', type: 3, required: true, autocomplete: true }]
    };

    const voteCommand = {
        name: 'voteprice',
        description: 'Propose new shop prices to the server (30 min vote)',
        options: [
            { name: 'item', description: 'The item to change', type: 3, required: true, autocomplete: true },
            { name: 'sell_price', description: 'Price YOU SELL to players', type: 4, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players', type: 4, required: true }
        ]
    };

    const priceChangeCommand = {
        name: 'pricechange',
        description: 'Forcefully change the price of an EXISTING item (Admin only)',
        options: [
            { name: 'item', description: 'The item name to update', type: 3, required: true, autocomplete: true },
            { name: 'sell_price', description: 'Price YOU SELL to players', type: 4, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players', type: 4, required: true }
        ]
    };

    // 🆕 Command to add a brand new item to the database
    const addItemCommand = {
        name: 'additem',
        description: 'Insert a brand new item into the database (Admin only)',
        options: [
            { name: 'item', description: 'The NEW item name', type: 3, required: true },
            { name: 'sell_price', description: 'Price YOU SELL to players', type: 4, required: true },
            { name: 'buy_price', description: 'Price YOU BUY from players', type: 4, required: true }
        ]
    };

    // 🆕 Command to rename an existing item
    const renameItemCommand = {
        name: 'renameitem',
        description: 'Change the name of an existing item in the database (Admin only)',
        options: [
            { name: 'old_name', description: 'The current item name', type: 3, required: true, autocomplete: true },
            { name: 'new_name', description: 'The new item name', type: 3, required: true }
        ]
    };

    await client.application.commands.set([priceCommand, voteCommand, priceChangeCommand, addItemCommand, renameItemCommand]);
    console.log('✅ All 5 Slash commands successfully registered!');
});

client.on('interactionCreate', async interaction => {
    
    // 🧠 --- AUTOCOMPLETE LOGIC ---
    if (interaction.isAutocomplete()) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const choices = Object.keys(priceIndex);
        const filtered = choices.filter(choice => choice.includes(focusedValue));
        
        const respondChoices = filtered.slice(0, 25).map(choice => ({
            name: choice,
            value: choice,
        }));

        await interaction.respond(respondChoices);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    // --- /PRICE COMMAND ---
    if (interaction.commandName === 'price') {
        const item = interaction.options.getString('item').toLowerCase().trim();

        if (priceIndex[item]) {
            const ownerSellPrice = priceIndex[item].buy; 
            const ownerBuyPrice = priceIndex[item].sell;
            
            const minSell = Math.floor(ownerSellPrice * 0.90);
            const maxSell = Math.ceil(ownerSellPrice * 1.10);
            const minBuy = Math.floor(ownerBuyPrice * 0.90);
            const maxBuy = Math.ceil(ownerBuyPrice * 1.10);

            await interaction.reply(
                `**${item.toUpperCase()}**\n` +
                `**🟢 SELLING (You sell to players)**\n> Base Price: **${formatPrice(ownerSellPrice)}**\n> 10% Range: **${formatPrice(minSell)}** - **${formatPrice(maxSell)}**\n\n` +
                `**🔴 BUYING (You buy from players)**\n> Base Price: **${formatPrice(ownerBuyPrice)}**\n> 10% Range: **${formatPrice(minBuy)}** - **${formatPrice(maxBuy)}**`
            );
        } else {
            await interaction.reply(`The Crown Empire has not set official prices for "${item}" yet.`);
        }
    }

    // --- /PRICECHANGE COMMAND ---
    if (interaction.commandName === 'pricechange') {
        if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to force-change prices.', ephemeral: true });
        }

        const item = interaction.options.getString('item').toLowerCase().trim();
        const newSell = interaction.options.getInteger('sell_price');
        const newBuy = interaction.options.getInteger('buy_price');

        if (!priceIndex[item]) {
            return interaction.reply({ content: `❌ **${item.toUpperCase()}** is not in the database yet. Use \`/additem\` instead!`, ephemeral: true });
        }

        priceIndex[item] = { buy: newSell, sell: newBuy };
        fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

        return interaction.reply({ content: `👑 **Admin Override:** **${item.toUpperCase()}** updated to **Selling:** ${formatPrice(newSell)} | **Buying:** ${formatPrice(newBuy)}.` });
    }

    // --- /ADDITEM COMMAND ---
    if (interaction.commandName === 'additem') {
        if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to add items.', ephemeral: true });
        }

        const item = interaction.options.getString('item').toLowerCase().trim();
        const newSell = interaction.options.getInteger('sell_price');
        const newBuy = interaction.options.getInteger('buy_price');

        if (priceIndex[item]) {
            return interaction.reply({ content: `❌ **${item.toUpperCase()}** already exists in the database! Use \`/pricechange\` to update it.`, ephemeral: true });
        }

        priceIndex[item] = { buy: newSell, sell: newBuy };
        fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

        return interaction.reply({ content: `✅ **Added New Item:** **${item.toUpperCase()}** was added to the database at **Selling:** ${formatPrice(newSell)} | **Buying:** ${formatPrice(newBuy)}.` });
    }

    // --- /RENAMEITEM COMMAND ---
    if (interaction.commandName === 'renameitem') {
        if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID)) {
            return interaction.reply({ content: '❌ You do not have permission to rename items.', ephemeral: true });
        }

        const oldName = interaction.options.getString('old_name').toLowerCase().trim();
        const newName = interaction.options.getString('new_name').toLowerCase().trim();

        if (!priceIndex[oldName]) {
            return interaction.reply({ content: `❌ **${oldName.toUpperCase()}** was not found in the database.`, ephemeral: true });
        }
        if (priceIndex[newName]) {
            return interaction.reply({ content: `❌ **${newName.toUpperCase()}** already exists! Choose a different name.`, ephemeral: true });
        }

        // Copy the old data to the new name, then delete the old name
        priceIndex[newName] = priceIndex[oldName];
        delete priceIndex[oldName];
        fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

        return interaction.reply({ content: `🔄 **Renamed Item:** **${oldName.toUpperCase()}** has been successfully renamed to **${newName.toUpperCase()}**.` });
    }

    // --- /VOTEPRICE COMMAND ---
    if (interaction.commandName === 'voteprice') {
        const item = interaction.options.getString('item').toLowerCase().trim();
        const newSell = interaction.options.getInteger('sell_price');
        const newBuy = interaction.options.getInteger('buy_price');

        const totalMembers = interaction.guild.memberCount;
        const requiredVotes = Math.ceil(totalMembers / 2);

        const voteButton = new ButtonBuilder()
            .setCustomId('vote_yes')
            .setLabel('Vote YES')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(voteButton);

        const responseMessage = await interaction.reply({
            content: `📢 **PRICE CHANGE PROPOSAL** 📢\n` +
                     `**Item:** ${item.toUpperCase()}\n` +
                     `**Proposed Selling Price:** ${formatPrice(newSell)} | **Proposed Buying Price:** ${formatPrice(newBuy)}\n\n` +
                     `*Requires **${requiredVotes}** votes (50% of server) to pass.*\n` +
                     `⏳ *Time remaining: 30 minutes.*`,
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

                await interaction.editReply({
                    content: `📢 **PRICE CHANGE PROPOSAL** 📢\n` +
                             `**Item:** ${item.toUpperCase()}\n` +
                             `**Proposed Selling Price:** ${formatPrice(newSell)} | **Proposed Buying Price:** ${formatPrice(newBuy)}\n\n` +
                             `*Requires **${requiredVotes}** votes (50% of server) to pass.*\n` +
                             `✅ **Current Votes:** ${votedUsers.size} / ${requiredVotes}\n` +
                             `⏳ *Time remaining: 30 minutes.*`
                });

                if (votedUsers.size >= requiredVotes) {
                    priceIndex[item] = { buy: newSell, sell: newBuy };
                    fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));
                    
                    await interaction.followUp(`🎉 **VOTE PASSED!** The official Crown Empire prices for **${item.toUpperCase()}** are now **Selling:** ${formatPrice(newSell)} | **Buying:** ${formatPrice(newBuy)}.`);
                    collector.stop('passed');
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            await interaction.editReply({ components: [] });

            if (reason !== 'passed') {
                await interaction.followUp(`❌ **VOTE FAILED!** The proposal for **${item.toUpperCase()}** only received ${votedUsers.size}/${requiredVotes} votes before time ran out.`);
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
// -------------------------

client.login(process.env.TOKEN);