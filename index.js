const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs'); // 👈 New requirement to read/write files


const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

// 👑 Dynamically load the Crown Empire Price Index from the JSON file
let priceIndex = JSON.parse(fs.readFileSync('./prices.json', 'utf8'));

client.once('ready', async () => {
    console.log('👑 Crown Empire Bot is officially online!');

    // 1. The Standard Price Command
    const priceCommand = {
        name: 'price',
        description: 'Check the Crown Empire 10% price index for an item',
        options: [
            {
                name: 'item',
                description: 'The item you want to check',
                type: 3, 
                required: true,
            }
        ]
    };

    // 2. The New Vote Command
    const voteCommand = {
        name: 'voteprice',
        description: 'Propose a new base buy and sell price to the server (30 min vote)',
        options: [
            {
                name: 'item',
                description: 'The item to change (e.g., copper)',
                type: 3,
                required: true,
            },
            {
                name: 'new_buy',
                description: 'The proposed base BUY price',
                type: 4, // Type 4 is an Integer (whole number)
                required: true,
            },
            {
                name: 'new_sell',
                description: 'The proposed base SELL price',
                type: 4,
                required: true,
            }
        ]
    };

    // Register both commands
    await client.application.commands.set([priceCommand, voteCommand]);
    console.log('✅ Slash commands /price and /voteprice successfully registered!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // --- /PRICE COMMAND LOGIC ---
    if (interaction.commandName === 'price') {
        const item = interaction.options.getString('item').toLowerCase().trim();

        if (priceIndex[item]) {
            const baseBuy = priceIndex[item].buy;
            const baseSell = priceIndex[item].sell;
            
            const minBuy = Math.floor(baseBuy * 0.90);
            const maxBuy = Math.ceil(baseBuy * 1.10);
            const minSell = Math.floor(baseSell * 0.90);
            const maxSell = Math.ceil(baseSell * 1.10);

            await interaction.reply(
                `**${item.toUpperCase()}**\n` +
                `**🟢 SELLING**\n> Base Buy: **${baseBuy}**\n> 10% Range: **${minBuy}** - **${maxBuy}**\n\n` +
                `**🔴 BUYING**\n> Base Sell: **${baseSell}**\n> 10% Range: **${minSell}** - **${maxSell}**`
            );
        } else {
            await interaction.reply(`The Crown Empire has not set official buy/sell prices for "${item}" yet.`);
        }
    }

    // --- /VOTEPRICE COMMAND LOGIC ---
    if (interaction.commandName === 'voteprice') {
        const item = interaction.options.getString('item').toLowerCase().trim();
        const newBuy = interaction.options.getInteger('new_buy');
        const newSell = interaction.options.getInteger('new_sell');

        // Calculate required votes (50% of the server)
        // Temporarily hardcoded to 1 for testing purposes
// Calculate required votes (50% of the server)
const totalMembers = interaction.guild.memberCount;
const requiredVotes = Math.ceil(totalMembers / 2);

        // Build the physical vote button
        const voteButton = new ButtonBuilder()
            .setCustomId('vote_yes')
            .setLabel('Vote YES')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(voteButton);

        // Send the initial proposal message
        const responseMessage = await interaction.reply({
            content: `📢 **PRICE CHANGE PROPOSAL** 📢\n` +
                     `**Item:** ${item.toUpperCase()}\n` +
                     `**Proposed Buy:** ${newBuy} | **Proposed Sell:** ${newSell}\n\n` +
                     `*Requires **${requiredVotes}** votes (50% of server) to pass.*\n` +
                     `⏳ *Time remaining: 30 minutes.*`,
            components: [row],
            fetchReply: true // Allows us to attach the collector to this specific message
        });

        // Set up the tracker
        const votedUsers = new Set();
        
        // Create a 30-minute timer (30 minutes * 60 seconds * 1000 milliseconds)
        const collector = responseMessage.createMessageComponentCollector({ time: 30 * 60 * 1000 });

        collector.on('collect', async buttonInteraction => {
            // Check if they only clicked our YES button
            if (buttonInteraction.customId === 'vote_yes') {
                
                // Prevent double voting
                if (votedUsers.has(buttonInteraction.user.id)) {
                    return buttonInteraction.reply({ content: 'You have already voted on this proposal!', ephemeral: true });
                }

                // Add their ID to the set and confirm their vote
                votedUsers.add(buttonInteraction.user.id);
                await buttonInteraction.reply({ content: 'Your vote has been counted!', ephemeral: true });

                // Update the main message to show live vote counts
                await interaction.editReply({
                    content: `📢 **PRICE CHANGE PROPOSAL** 📢\n` +
                             `**Item:** ${item.toUpperCase()}\n` +
                             `**Proposed Buy:** ${newBuy} | **Proposed Sell:** ${newSell}\n\n` +
                             `*Requires **${requiredVotes}** votes (50% of server) to pass.*\n` +
                             `✅ **Current Votes:** ${votedUsers.size} / ${requiredVotes}\n` +
                             `⏳ *Time remaining: 30 minutes.*`
                });

                // Check if the threshold is met
                // Check if the threshold is met
if (votedUsers.size >= requiredVotes) {
    // Update the live memory
    priceIndex[item] = { buy: newBuy, sell: newSell };
    
    // 💾 NEW: Save the updated memory directly to the JSON file permanently
    fs.writeFileSync('./prices.json', JSON.stringify(priceIndex, null, 4));
    
    // Announce the success and kill the timer
    await interaction.followUp(`🎉 **VOTE PASSED!** The official Crown Empire base prices for **${item.toUpperCase()}** are now Buy: ${newBuy} | Sell: ${newSell}.`);
    collector.stop('passed');
}
            }
        });

        collector.on('end', async (collected, reason) => {
            // Remove the button from the message when the timer ends
            await interaction.editReply({ components: [] });

            // If it ended because time ran out (not because it passed)
            if (reason !== 'passed') {
                await interaction.followUp(`❌ **VOTE FAILED!** The proposal for **${item.toUpperCase()}** only received ${votedUsers.size}/${requiredVotes} votes before time ran out.`);
            }
        });
    }
});

// Log in with your secret token
client.login(process.env.TOKEN);