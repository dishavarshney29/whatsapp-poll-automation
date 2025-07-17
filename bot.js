const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

class WhatsAppPollBot {
    constructor() {
        this.client = null;
        this.targetGroupName = 'C-502 Cook Talks';
        this.authDir = path.join(__dirname, '.wwebjs_auth');
        this.sessionFile = path.join(__dirname, 'session.json');
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
    }

    async initialize() {
        console.log('🚀 Starting WhatsApp Poll Bot...');
        
        // Ensure auth directory exists
        if (!fs.existsSync(this.authDir)) {
            fs.mkdirSync(this.authDir, { recursive: true });
        }

        // Initialize client with persistent session
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'poll-bot',
                dataPath: this.authDir
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        this.setupEventHandlers();
        
        try {
            await this.client.initialize();
            console.log('✅ WhatsApp client initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize WhatsApp client:', error);
            throw error;
        }
    }

    setupEventHandlers() {
        this.client.on('qr', (qr) => {
            console.log('📱 QR Code received. Please scan with WhatsApp:');
            qrcode.generate(qr, { small: true });
            
            // Save QR code for GitHub Actions (if running in CI)
            if (process.env.GITHUB_ACTIONS) {
                console.log('🔗 QR Code for GitHub Actions setup:');
                console.log(qr);
            }
        });

        this.client.on('authenticated', (session) => {
            console.log('🔐 WhatsApp authenticated successfully');
            
            // Save session info for debugging
            if (session) {
                fs.writeFileSync(this.sessionFile, JSON.stringify(session, null, 2));
                console.log('💾 Session saved to file');
            }
        });

        this.client.on('auth_failure', (msg) => {
            console.error('❌ Authentication failed:', msg);
        });

        this.client.on('ready', () => {
            console.log('🎉 WhatsApp client is ready!');
            this.logClientInfo();
        });

        this.client.on('disconnected', (reason) => {
            console.log('🔌 WhatsApp client disconnected:', reason);
        });

        this.client.on('message', async (message) => {
            // Log incoming messages for debugging
            if (message.from.includes(this.targetGroupName.toLowerCase().replace(/\s+/g, ''))) {
                console.log(`📨 Message from ${this.targetGroupName}:`, message.body);
            }
        });
    }

    async logClientInfo() {
        try {
            const chats = await this.client.getChats();
            console.log(`📊 Total chats: ${chats.length}`);
            
            // Find and log target group info
            const targetGroup = chats.find(chat => 
                chat.isGroup && chat.name === this.targetGroupName
            );
            
            if (targetGroup) {
                console.log(`🎯 Target group found: ${targetGroup.name} (${targetGroup.id._serialized})`);
                console.log(`👥 Group participants: ${targetGroup.participants.length}`);
            } else {
                console.log(`⚠️  Target group "${this.targetGroupName}" not found`);
                console.log('Available groups:');
                chats.filter(chat => chat.isGroup).forEach(group => {
                    console.log(`  - ${group.name}`);
                });
            }
        } catch (error) {
            console.error('❌ Error getting client info:', error);
        }
    }

    async findTargetGroup() {
        try {
            const chats = await this.client.getChats();
            const targetGroup = chats.find(chat => 
                chat.isGroup && chat.name === this.targetGroupName
            );
            
            if (!targetGroup) {
                throw new Error(`Group "${this.targetGroupName}" not found`);
            }
            
            return targetGroup;
        } catch (error) {
            console.error('❌ Error finding target group:', error);
            throw error;
        }
    }

    async sendPoll(pollData) {
        let attempts = 0;
        
        while (attempts < this.maxRetries) {
            try {
                attempts++;
                console.log(`📤 Sending poll (attempt ${attempts}/${this.maxRetries}): ${pollData.question}`);
                
                const targetGroup = await this.findTargetGroup();
                
                // Create poll
                const poll = new Poll(pollData.question, pollData.options);
                
                // Send poll to group
                await targetGroup.sendMessage(poll);
                
                console.log('✅ Poll sent successfully!');
                console.log(`📊 Poll: ${pollData.question}`);
                console.log(`🗳️  Options: ${pollData.options.join(', ')}`);
                
                return true;
                
            } catch (error) {
                console.error(`❌ Attempt ${attempts} failed:`, error.message);
                
                if (attempts < this.maxRetries) {
                    console.log(`⏳ Retrying in ${this.retryDelay / 1000} seconds...`);
                    await this.sleep(this.retryDelay);
                } else {
                    console.error('❌ All retry attempts failed');
                    throw error;
                }
            }
        }
        
        return false;
    }

    async sendDinnerPoll() {
        const pollData = {
            question: "Dinner today?",
            options: ["Yes", "No"]
        };
        
        return await this.sendPoll(pollData);
    }

    async sendBreakfastPoll() {
        const pollData = {
            question: "Breakfast tomorrow?",
            options: ["Yes", "No"]
        };
        
        return await this.sendPoll(pollData);
    }

    async cleanup() {
        if (this.client) {
            console.log('🧹 Cleaning up WhatsApp client...');
            await this.client.destroy();
            console.log('✅ Client cleanup completed');
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getCurrentIST() {
        return new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

// Main execution function
async function main() {
    const bot = new WhatsAppPollBot();
    const pollType = process.argv[2]; // 'dinner' or 'breakfast'
    
    if (!pollType || !['dinner', 'breakfast'].includes(pollType)) {
        console.error('❌ Usage: node bot.js [dinner|breakfast]');
        process.exit(1);
    }
    
    console.log(`🕐 Current IST time: ${bot.getCurrentIST()}`);
    console.log(`🎯 Poll type: ${pollType}`);
    
    try {
        await bot.initialize();
        
        // Wait for client to be ready
        await new Promise((resolve) => {
            if (bot.client.info) {
                resolve();
            } else {
                bot.client.on('ready', resolve);
            }
        });
        
        // Send appropriate poll
        let success = false;
        if (pollType === 'dinner') {
            success = await bot.sendDinnerPoll();
        } else if (pollType === 'breakfast') {
            success = await bot.sendBreakfastPoll();
        }
        
        if (success) {
            console.log('🎉 Poll automation completed successfully!');
        } else {
            console.error('❌ Poll automation failed');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    } finally {
        await bot.cleanup();
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Run the bot
if (require.main === module) {
    main().catch(console.error);
}

module.exports = WhatsAppPollBot;
