const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');

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

// Formatter function to convert long numbers into M and k
function formatPrice(num) {
    if (num === 0) return "0";
    if (num >= 1000000) {
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
        options: [
            {
                name: 'item',
                description: 'The item you want to check',
                type: 3, 
                required: true,
                autocomplete: true // 👈 Enables the dropdown menu
            }
        ]
    };

    const voteCommand = {
        name: 'voteprice',
        description: 'Propose new shop prices to the server (30 min vote)',
        options: [
            {
                name: 'item',
                description: 'The item to change (e.g., copper ingot)',
                type: 3,
                required: true,
                autocomplete: true // 👈 Enables the dropdown menu
            },
            {
                name: 'sell_price',
                description: 'Price YOU SELL to players (e.g. 200000)',
                type: 4, 
                required: true,
            },
            {
                name: 'buy_price',
                description: 'Price YOU BUY from players (e.g. 80000)',
                type: 4,
                required: true,
            }
        ]
    };

    const priceChangeCommand = {
        name: 'pricechange',
        description: 'Forcefully change the price of an item without a vote (Admin only)',
        options: [
            {
                name: 'item',
                description: 'The item name to update',
                type: 3,
                required: true,
                autocomplete: true // 👈 Enables the dropdown menu
            },
            {
                name: 'sell_price',
                description: 'Price YOU SELL to players (e.g. 200000)',
                type: 4,
                required: true,
            },
            {
                name: 'buy_price',
                description: 'Price YOU BUY from players (e.g. 80000)',
                type: 4,
                required: true,
            }
        ]
    };

    await client.application.commands.set([priceCommand, voteCommand, priceChangeCommand]);
    console.log('✅ Slash commands with autocomplete successfully registered!');
});

client.on('interactionCreate', async interaction => {
    
    // 🧠 --- AUTOCOMPLETE LOGIC ---
    if (interaction.isAutocomplete()) {
        // Get whatever the user has typed so far
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        // Grab all the item names from our database
        const choices = Object.keys(priceIndex);
        
        // Filter the list to only include items that match what they typed
        const filtered = choices.filter(choice => choice.includes(focusedValue));
        
        // Discord only allows a maximum of 25 items in a dropdown at once
        const respondChoices = filtered.slice(0, 25).map(choice => ({
            name: choice,
            value: choice,
        }));

        await interaction.respond(respondChoices);
        return; // Stop here so it doesn't try to run it as a command yet
    }

    // If it's not a slash command, stop here
    if (!interaction.isChatInputCommand()) return;

    // --- /PRICE COMMAND LOGIC ---
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

    // --- /PRICECHANGE COMMAND LOGIC (ADMIN OVERRIDE) ---
    if (interaction.commandName === 'pricechange') {
        // 👇 PASTE YOUR AUTHORIZED ROLE ID HERE INSIDE THE QUOTES 👇
        const requiredRoleId = '1533611128284909608'; 

        if (!interaction.member.roles.cache.has(requiredRoleId)) {
            return interaction.reply({ 
                content: '❌ You do not have permission to force-change prices.', 
                ephemeral: true 
            });
        }

        const item = interaction.options.getString('item').toLowerCase().trim();
        const newSell = interaction.options.getInteger('sell_price');
        const newBuy = interaction.options.getInteger('buy_price');

        priceIndex[item] = { buy: newSell, sell: newBuy };
        fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));

        return interaction.reply({ 
            content: `👑 **Admin Override:** The official prices for **${item.toUpperCase()}** have been instantly updated to **Selling:** ${formatPrice(newSell)} | **Buying:** ${formatPrice(newBuy)}.` 
        });
    }

    // --- /VOTEPRICE COMMAND LOGIC ---
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