const { SlashCommandBuilder } = require('discord.js');
// IMPORTANT: Make sure this path points to your actual Mongoose model file!
const Price = require('../models/Price'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pricechange')
        .setDescription('Forcefully change the price of an item without a vote.')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('The name of the item to update')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('price')
                .setDescription('The new price')
                .setRequired(true)),
                
    async execute(interaction) {
        // 1. The Role Check
        const requiredRoleId = '1533611128284909608'; 

        if (!interaction.member.roles.cache.has(requiredRoleId)) {
            return interaction.reply({ 
                content: '❌ You do not have permission to force-change prices.', 
                ephemeral: true // Only the user sees this rejection message
            });
        }

        // 2. Grab the inputs
        const itemName = interaction.options.getString('item');
        const newPrice = interaction.options.getNumber('price');

        try {
            // 3. Directly update the MongoDB database
            // (Make sure { item: itemName } matches exactly how your Schema is set up)
            await Price.findOneAndUpdate(
                { item: itemName }, 
                { price: newPrice }, 
                { upsert: true, new: true } // upsert: true means it creates the item if it doesn't exist yet
            );

            return interaction.reply({ 
                content: `👑 **Admin Override:** The price of **${itemName}** has been instantly updated to **${newPrice}**.` 
            });

        } catch (error) {
            console.error('Database Error:', error);
            return interaction.reply({ 
                content: 'There was an error saving this to the database.', 
                ephemeral: true 
            });
        }
    },
};