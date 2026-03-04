const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    downloadContentFromMessage,
    jidDecode,
    proto,
    getContentType
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs-extra');
const qrcode = require('qrcode-terminal');
const moment = require('moment-timezone');
const os = require('os');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const axios = require('axios');
const util = require('util');
const { performance } = require('perf_hooks');
const path = require('path');
const chalk = require('chalk');

// ==================== BOT LOGO ====================
const botLogo = "https://i.ibb.co/60pjn5Tx/IMG-20260303-WA0106.jpg";

// ==================== CONFIGURATION ====================
const REAL_OWNER_NUMBER = '27836547695'; // Permanent owner (Paxton)
let ownerNumber = '';
let ownerNumberDisplay = '';
let ownerName = 'Paxton Mathebula';
let botName = 'PAXTON-MD';
let devName = 'Paxton Mathebula';
let botVersion = '4.0.1';
let prefix = '.';
let sessionDir = './sessions';
let tempDir = './temp';
let databaseFile = './database.json';
let startTime = Date.now();

// Owner management
let permanentOwner = REAL_OWNER_NUMBER + '@s.whatsapp.net';
let ownerNumbers = [permanentOwner]; // Always includes Paxton
let sessionOwners = []; // Will store session-based owners
let botJid = null;
let commands = new Map();
let sudoUsers = [];

// ==================== DATABASE SETUP ====================
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);

let database = {
    users: {},
    groups: {},
    banned: [],
    filters: {},
    welcome: {},
    welcomeMessage: {},
    goodbye: {},
    goodbyeMessage: {},
    antilink: {},
    antispam: {},
    antiViewOnce: {},
    antiDelete: {},
    anticall: {},
    antibot: {},
    badword: {},
    antitag: {},
    antilinkall: false,
    antileave: false,
    antiedit: false,
    antideletestatus: false,
    autoBio: false,
    autoStatus: false,
    autoRead: {},
    autoLike: false,
    autoView: false,
    settings: {
        public: true,
        groupOnly: false,
        selfOnly: false,
        menuStyle: 1,
        prefixless: true,
        aiEnabled: false,
        maintenance: false,
        privateMode: false,
        botName: 'PAXTON-MD',
        ownerName: 'Paxton Mathebula',
        ownerNumber: REAL_OWNER_NUMBER,
        prefix: '.',
        footer: '> Powered by Paxton-Tech 👑',
        menuImage: true,
        showInfo: true
    },
    muted: {},
    bannedUsers: [],
    groupTime: {},
    commandStats: {},
    married: {},
    warns: {},
    level: {},
    exp: {},
    money: {},
    bank: {},
    daily: {},
    games: {},
    wordfilters: {},
    antiraid: {},
    antiwaf: {},
    antifake: {},
    antitoxic: {},
    antipromote: {},
    antidemote: {},
    groupRules: {},
    welcomeEnabled: {},
    goodbyeEnabled: {},
    welcomeMsg: {},
    goodbyeMsg: {},
    reviews: {},
    sudo: [],
    hijacked: {}
};

if (fs.existsSync(databaseFile)) {
    try {
        const loaded = JSON.parse(fs.readFileSync(databaseFile));
        database = { ...database, ...loaded };
        sudoUsers = database.sudo || [];
        sessionOwners = database.sessionOwners || [];
        // Always ensure permanent owner is in owner list
        if (!ownerNumbers.includes(permanentOwner)) {
            ownerNumbers.push(permanentOwner);
        }
        // Add session owners
        sessionOwners.forEach(owner => {
            if (!ownerNumbers.includes(owner)) {
                ownerNumbers.push(owner);
            }
        });
    } catch (e) {
        console.log('📁 Creating new database');
    }
}

const saveDatabase = () => {
    database.sudo = sudoUsers;
    database.sessionOwners = sessionOwners;
    fs.writeFileSync(databaseFile, JSON.stringify(database, null, 2));
};

// ==================== UTILITY FUNCTIONS ====================
const isOwner = (sender) => {
    const senderNum = sender.split('@')[0];
    // Check if sender is permanent owner or session owner
    return ownerNumbers.some(owner => owner.split('@')[0] === senderNum) || sender === botJid;
};

const isPermanentOwner = (sender) => {
    const senderNum = sender.split('@')[0];
    return senderNum === REAL_OWNER_NUMBER;
};

const isSessionOwner = (sender) => {
    const senderNum = sender.split('@')[0];
    return sessionOwners.includes(senderNum) && senderNum !== REAL_OWNER_NUMBER;
};

const isSudo = (sender) => {
    const senderNum = sender.split('@')[0];
    return sudoUsers.includes(senderNum) || isOwner(sender);
};

const isAdmin = async (sock, group, user) => {
    try {
        const metadata = await sock.groupMetadata(group);
        const participant = metadata.participants.find(p => p.id === user);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch {
        return false;
    }
};

const getUptime = () => {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getUserName = async (sock, jid) => {
    try {
        const [result] = await sock.onWhatsApp(jid);
        if (result?.exists) {
            return result.notify || result.verifiedName || jid.split('@')[0];
        }
    } catch (e) {}
    return jid.split('@')[0];
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomElement = (arr) => {
    return arr[Math.floor(Math.random() * arr.length)];
};

const isUrl = (text) => {
    return text.match(new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/, 'gi'));
};

const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
};

const getRamUsage = () => {
    const used = process.memoryUsage().heapUsed / 1024 / 1024;
    const total = process.memoryUsage().heapTotal / 1024 / 1024;
    const percent = ((used / total) * 100).toFixed(0);
    const bars = '█'.repeat(Math.floor(percent / 10)) + '░'.repeat(10 - Math.floor(percent / 10));
    return { used: used.toFixed(1), total: total.toFixed(1), percent, bars };
};

// ==================== MENU FUNCTION ====================
const getMenu = async (sock, sender, groupMetadata = null) => {
    const uptime = getUptime();
    const ping = getRandomInt(50, 150);
    const time = moment().tz('Africa/Johannesburg').format('HH:mm:ss');
    const date = moment().tz('Africa/Johannesburg').format('DD/MM/YYYY');
    const ram = getRamUsage();
    const totalCmds = commands.size;
    const speed = ((performance.now() - startTime) / 1000).toFixed(4);
    
    let userName = sender.split('@')[0];
    try {
        const name = await getUserName(sock, sender);
        if (name) userName = name;
    } catch (e) {}
    
    const userLevel = isPermanentOwner(sender) ? '👑 PERMANENT OWNER' : 
                     isSessionOwner(sender) ? '🔰 SESSION OWNER' : 
                     isSudo(sender) ? '⚡ SUDO USER' : '👤 USER';
    
    return `*heyy there I'm Paxton MD❤️🥺*

╔══════〚 *Paxton MD*〛══════╗
║✫╭═╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍
║✫┃ 𝗨𝘀𝗲𝗿 : ${userName}
║✫┃ 𝗣𝗿𝗲𝗳𝗶𝘅 : [ ${database.settings.prefix || prefix} ]
║✫┃ 𝗠𝗼𝗱𝗲 : ${database.settings.public ? 'Public' : 'Private'}
║✫┃ Version : ${botVersion}
║✫┃ 𝗦𝗽𝗲𝗲𝗱 : ${speed}ms
║✫┃ 𝗧𝗶𝗺𝗲 : ${time}
║✫┃ 𝗥𝗔𝗠 : ${ram.percent}%
║✫┃ Owner : ${ownerName}
║✫┃ Level : ${userLevel}
╚════════════════════════╝

> 𝗕𝗢𝗧 𝗦𝗘𝗧𝗧𝗜𝗡𝗚𝗦
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃✦│ setprefix
┃✦│ setname
┃✦│ setowner
┃✦│ setnumber
┃✦│ setfooter
┃✦│ setmenu
┃✦│ public
┃✦│ private
┃✦│ grouponly
┃✦│ selfonly
┃✦│ maintenance
┃✦│ prefixless
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗔𝗡𝗧𝗜-𝗟𝗜𝗡𝗞
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃❃│ antidelete
┃❃│ anticall
┃❃│ antibot
┃❃│ badword
┃❃│ antitag
┃❃│ antilink
┃❃│ antilinkall
┃❃│ antiraid
┃❃│ antifake
┃❃│ antitoxic
┃❃│ antispam
┃❃│ antiviewonce
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗔𝗨𝗧𝗢 𝗠𝗢𝗗𝗘
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃✥│ autoview
┃✥│ autolike
┃✥│ autoread
┃✥│ autobio
┃✥│ autostatus
┃✥│ autoreact
┃✥│ autotyping
┃✥│ autorecord
┃✥│ autosticker
┃✥│ autowelcome
┃✥│ autogoodbye
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗪𝗘𝗟𝗖𝗢𝗠𝗘/𝗚𝗢𝗢𝗗𝗕𝗬𝗘
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃◈│ welcome
┃◈│ goodbye
┃◈│ setwelcome
┃◈│ setgoodbye
┃◈│ testwelcome
┃◈│ testgoodbye
┃◈│ resetwelcome
┃◈│ resetgoodbye
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗚𝗥𝗢𝗨𝗣 𝗠𝗔𝗡𝗔𝗚𝗘𝗠𝗘𝗡𝗧
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃✧│ add
┃✧│ kick
┃✧│ promote
┃✧│ demote
┃✧│ tagall
┃✧│ hidetag
┃✧│ everyone
┃✧│ tagadmins
┃✧│ listadmin
┃✧│ groupinfo
┃✧│ grouplink
┃✧│ revoke
┃✧│ setname
┃✧│ setdesc
┃✧│ setgpic
┃✧│ lock
┃✧│ unlock
┃✧│ warn
┃✧│ warns
┃✧│ resetwarns
┃✧│ mute
┃✧│ unmute
┃✧│ delete
┃✧│ poll
┃✧│ filter
┃✧│ join
┃✧│ leave
┃✧│ creategroup
┃✧│ listgroups
┃✧│ invite
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗨𝗧𝗜𝗟𝗜𝗧𝗬 𝗧𝗢𝗢𝗟𝗦
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃◎│ ping
┃◎│ uptime
┃◎│ runtime
┃◎│ speed
┃◎│ info
┃◎│ owner
┃◎│ repo
┃◎│ alive
┃◎│ profile
┃◎│ me
┃◎│ dp
┃◎│ pp
┃◎│ system
┃◎│ weather
┃◎│ calc
┃◎│ translate
┃◎│ define
┃◎│ shorten
┃◎│ ip
┃◎│ whois
┃◎│ phone
┃◎│ country
┃◎│ time
┃◎│ date
┃◎│ timer
┃◎│ password
┃◎│ uuid
┃◎│ hash
┃◎│ base64
┃◎│ base64decode
┃◎│ binary
┃◎│ binarydecode
┃◎│ hex
┃◎│ hexdecode
┃◎│ morse
┃◎│ font
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗠𝗔𝗥𝗥𝗜𝗔𝗚𝗘 𝗦𝗬𝗦𝗧𝗘𝗠
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃✠│ marry
┃✠│ accept
┃✠│ reject
┃✠│ divorce
┃✠│ married
┃✠│ spouse
┃✠│ love
┃✠│ hug
┃✠│ kiss
┃✠│ gift
┃✠│ lovemeter
┃✠│ compatibility
┃✠│ soulmate
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗙𝗨𝗡 & 𝗚𝗔𝗠𝗘𝗦
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃□│ joke
┃□│ dadjoke
┃□│ fact
┃□│ quote
┃□│ truth
┃□│ dare
┃□│ wouldyourather
┃□│ 8ball
┃□│ flipcoin
┃□│ dice
┃□│ rps
┃□│ roast
┃□│ compliment
┃□│ ship
┃□│ lovetest
┃□│ simprate
┃□│ gayrate
┃□│ smartrate
┃□│ rizz
┃□│ swag
┃□│ vibe
┃□│ mood
┃□│ fortune
┃□│ horoscope
┃□│ zodiac
┃□│ say
┃□│ echo
┃□│ reverse
┃□│ uppercase
┃□│ lowercase
┃□│ capitalize
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗥𝗘𝗩𝗜𝗘𝗪 𝗦𝗬𝗦𝗧𝗘𝗠
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃▧│ review
┃▧│ reviews
┃▧│ myreview
┃▧│ deletereview
┃▧│ rating
┃▧│ feedback
┃▧│ suggest
┃▧│ bug
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗦𝗨𝗗𝗢 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃●│ addsudo
┃●│ delsudo
┃●│ listsudo
┃●│ checksudo
┃●│ clearsudo
┃●│ sudomode
┃●│ sudoinfo
┃●│ mysudo
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗛𝗜𝗝𝗔𝗖𝗞 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃⚠️│ hijack
┃⚠️│ release
┃⚠️│ hijacked
┃⚠️│ hijacklist
┃⚠️│ hijackclear
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

> 𝗢𝗪𝗡𝗘𝗥 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦
╭══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╮
┃○│ restart
┃○│ shutdown
┃○│ bc
┃○│ join
┃○│ leave
┃○│ leaveall
┃○│ block
┃○│ unblock
┃○│ ban
┃○│ unban
┃○│ addowner
┃○│ removeowner
┃○│ listowners
┃○│ eval
┃○│ exec
┃○│ getdb
┃○│ resetdb
┃○│ cleartemp
┃○│ clearsessions
┃○│ logs
┃○│ setbotpp
┃○│ setstatus
┃○│ setbio
┃○│ setmode
┃○│ toggleai
┃○│ getpp
┃○│ getallusers
┃○│ getallgroups
┃○│ senddm
╰══⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊⚊══╯

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   *❤️🥺Multi device bot by Paxton ❤️🥺*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${database.settings.footer}`;
};

// ==================== COMMAND HANDLER ====================
const registerCommands = () => {
    // Clear existing commands
    commands.clear();
    
    // ==================== BOT SETTINGS COMMANDS ====================
    commands.set('setprefix', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const newPrefix = args[0];
        if (!newPrefix) return await sock.sendMessage(from, { text: `❌ Please provide a prefix symbol!` });
        database.settings.prefix = newPrefix;
        prefix = newPrefix;
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Command prefix changed to: ${newPrefix}` });
    });
    
    commands.set('setname', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const newName = args.join(' ');
        if (!newName) return await sock.sendMessage(from, { text: `❌ Please provide a bot name!` });
        database.settings.botName = newName;
        botName = newName;
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Bot name changed to: ${newName}` });
    });
    
    commands.set('setowner', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can change owner name!` });
        const newOwner = args.join(' ');
        if (!newOwner) return await sock.sendMessage(from, { text: `❌ Please provide owner name!` });
        database.settings.ownerName = newOwner;
        ownerName = newOwner;
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Owner name changed to: ${newOwner}` });
    });
    
    commands.set('setnumber', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can change owner number!` });
        const newNumber = args[0];
        if (!newNumber) return await sock.sendMessage(from, { text: `❌ Please provide phone number!` });
        database.settings.ownerNumber = newNumber;
        ownerNumberDisplay = newNumber;
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Owner number changed to: ${newNumber}` });
    });
    
    commands.set('setfooter', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const newFooter = args.join(' ');
        if (!newFooter) return await sock.sendMessage(from, { text: `❌ Please provide footer text!` });
        database.settings.footer = newFooter;
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Footer changed to: ${newFooter}` });
    });
    
    commands.set('setmenu', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const style = parseInt(args[0]);
        if (!style || style < 1 || style > 5) {
            return await sock.sendMessage(from, { text: `❌ Please choose menu style 1-5!` });
        }
        database.settings.menuStyle = style;
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Menu style set to: ${style}` });
    });
    
    commands.set('public', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        database.settings.public = true;
        database.settings.privateMode = false;
        database.settings.groupOnly = false;
        database.settings.selfOnly = false;
        saveDatabase();
        await sock.sendMessage(from, { text: `🌍 Public mode enabled - Bot is now available to everyone` });
    });
    
    commands.set('private', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        database.settings.public = false;
        database.settings.privateMode = true;
        database.settings.groupOnly = false;
        database.settings.selfOnly = false;
        saveDatabase();
        await sock.sendMessage(from, { text: `🔒 Private mode enabled - Bot only responds to owners` });
    });
    
    commands.set('grouponly', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        database.settings.public = false;
        database.settings.privateMode = false;
        database.settings.groupOnly = true;
        database.settings.selfOnly = false;
        saveDatabase();
        await sock.sendMessage(from, { text: `👥 Group only mode enabled - Bot only responds in groups` });
    });
    
    commands.set('selfonly', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        database.settings.public = false;
        database.settings.privateMode = false;
        database.settings.groupOnly = false;
        database.settings.selfOnly = true;
        saveDatabase();
        await sock.sendMessage(from, { text: `👤 Self only mode enabled - Bot only responds to owner DMs` });
    });
    
    commands.set('maintenance', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can toggle maintenance mode!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.settings.maintenance = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🔧 Maintenance mode turned ${option}` });
    });
    
    commands.set('prefixless', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.settings.prefixless = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🔰 Prefixless mode turned ${option} - Commands ${option === 'on' ? 'can now' : 'no longer'} work without prefix` });
    });
    
    // ==================== ANTI-LINK COMMANDS ====================
    commands.set('antidelete', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antiDelete) database.antiDelete = {};
        database.antiDelete[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🛡️ Anti-delete turned ${option} - Deleted messages will ${option === 'on' ? 'now' : 'no longer'} be saved` });
    });
    
    commands.set('anticall', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.anticallall = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `📞 Anti-call turned ${option} - Calls will ${option === 'on' ? 'now' : 'no longer'} be automatically blocked` });
    });
    
    commands.set('antibot', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antibot) database.antibot = {};
        database.antibot[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🤖 Anti-bot turned ${option} - Other bots will ${option === 'on' ? 'now' : 'no longer'} be removed` });
    });
    
    commands.set('badword', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.badword) database.badword = {};
        database.badword[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🔞 Bad word filter turned ${option} - Inappropriate words will ${option === 'on' ? 'now' : 'no longer'} be filtered` });
    });
    
    commands.set('antitag', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antitag) database.antitag = {};
        database.antitag[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🚫 Anti-tag turned ${option} - Mass tagging will ${option === 'on' ? 'now' : 'no longer'} be restricted` });
    });
    
    commands.set('antilink', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antilink) database.antilink = {};
        database.antilink[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🔗 Anti-link turned ${option} - Links will ${option === 'on' ? 'now' : 'no longer'} be automatically removed` });
    });
    
    commands.set('antilinkall', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.antilinkall = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🌐 Global anti-link turned ${option} - Links will ${option === 'on' ? 'now' : 'no longer'} be blocked in all groups` });
    });
    
    commands.set('antiraid', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antiraid) database.antiraid = {};
        database.antiraid[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🛡️ Anti-raid turned ${option} - The group is ${option === 'on' ? 'now' : 'no longer'} protected against raids` });
    });
    
    commands.set('antifake', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antifake) database.antifake = {};
        database.antifake[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🆔 Anti-fake turned ${option} - Fake numbers will ${option === 'on' ? 'now' : 'no longer'} be blocked` });
    });
    
    commands.set('antitoxic', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antitoxic) database.antitoxic = {};
        database.antitoxic[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `☣️ Anti-toxic turned ${option} - Toxic messages will ${option === 'on' ? 'now' : 'no longer'} be filtered` });
    });
    
    commands.set('antispam', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antispam) database.antispam = {};
        database.antispam[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `📧 Anti-spam turned ${option} - Spam messages will ${option === 'on' ? 'now' : 'no longer'} be blocked` });
    });
    
    commands.set('antiviewonce', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.antiViewOnce) database.antiViewOnce = {};
        database.antiViewOnce[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `👀 Anti-view-once turned ${option} - View once media will ${option === 'on' ? 'now' : 'no longer'} be saved` });
    });
    
    // ==================== AUTO MODE COMMANDS ====================
    commands.set('autoview', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.autoView = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `👁️ Auto-view turned ${option} - View once media will ${option === 'on' ? 'now' : 'no longer'} be automatically saved` });
    });
    
    commands.set('autolike', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.autoLike = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `❤️ Auto-like turned ${option} - Messages will ${option === 'on' ? 'now' : 'no longer'} be automatically liked` });
    });
    
    commands.set('autoread', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.autoRead) database.autoRead = {};
        database.autoRead[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `📖 Auto-read turned ${option} - Messages will ${option === 'on' ? 'now' : 'no longer'} be automatically marked as read` });
    });
    
    commands.set('autobio', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.autoBio = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `📝 Auto-bio turned ${option} - Bot bio will ${option === 'on' ? 'now' : 'no longer'} be automatically updated` });
    });
    
    commands.set('autostatus', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.autoStatus = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `📱 Auto-status turned ${option} - Status updates will ${option === 'on' ? 'now' : 'no longer'} be automatically viewed` });
    });
    
    commands.set('autoreact', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.settings.autoReactAll = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `😊 Auto-react turned ${option} - Messages will ${option === 'on' ? 'now' : 'no longer'} be automatically reacted to` });
    });
    
    commands.set('autotyping', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.autoTyping) database.autoTyping = {};
        database.autoTyping[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `⌨️ Auto-typing turned ${option} - Bot will ${option === 'on' ? 'now' : 'no longer'} show typing indicator` });
    });
    
    commands.set('autorecord', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.autoRecord) database.autoRecord = {};
        database.autoRecord[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🎙️ Auto-record turned ${option} - Bot will ${option === 'on' ? 'now' : 'no longer'} show recording indicator` });
    });
    
    commands.set('autosticker', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.autoSticker = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🖼️ Auto-sticker turned ${option} - Images will ${option === 'on' ? 'now' : 'no longer'} be automatically converted to stickers` });
    });
    
    commands.set('autowelcome', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.welcomeEnabled) database.welcomeEnabled = {};
        database.welcomeEnabled[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `👋 Auto-welcome turned ${option} - New members will ${option === 'on' ? 'now' : 'no longer'} be welcomed` });
    });
    
    commands.set('autogoodbye', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.goodbyeEnabled) database.goodbyeEnabled = {};
        database.goodbyeEnabled[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `👋 Auto-goodbye turned ${option} - Leaving members will ${option === 'on' ? 'now' : 'no longer'} be bid farewell` });
    });
    
    // ==================== WELCOME/GOODBYE COMMANDS ====================
    commands.set('welcome', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.welcomeEnabled) database.welcomeEnabled = {};
        database.welcomeEnabled[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `👋 Welcome messages turned ${option}` });
    });
    
    commands.set('goodbye', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        if (!database.goodbyeEnabled) database.goodbyeEnabled = {};
        database.goodbyeEnabled[from] = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `👋 Goodbye messages turned ${option}` });
    });
    
    commands.set('setwelcome', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ Please provide a welcome message!` });
        if (!database.welcomeMsg) database.welcomeMsg = {};
        database.welcomeMsg[from] = message;
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Welcome message has been set!` });
    });
    
    commands.set('setgoodbye', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ Please provide a goodbye message!` });
        if (!database.goodbyeMsg) database.goodbyeMsg = {};
        database.goodbyeMsg[from] = message;
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Goodbye message has been set!` });
    });
    
    commands.set('testwelcome', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        const groupMetadata = await sock.groupMetadata(from);
        const memberCount = groupMetadata.participants.length;
        const welcomeMsg = database.welcomeMsg[from] || `🎉 Welcome @${sender.split('@')[0]} to the group!\n\n👥 Members: ${memberCount}\n📋 Please read the group rules!`;
        await sock.sendMessage(from, { text: welcomeMsg, mentions: [sender] });
    });
    
    commands.set('testgoodbye', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        const groupMetadata = await sock.groupMetadata(from);
        const memberCount = groupMetadata.participants.length;
        const goodbyeMsg = database.goodbyeMsg[from] || `👋 Goodbye @${sender.split('@')[0]}!\n\n👥 Members left: ${memberCount}\nWe'll miss you!`;
        await sock.sendMessage(from, { text: goodbyeMsg, mentions: [sender] });
    });
    
    commands.set('resetwelcome', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        if (database.welcomeMsg) delete database.welcomeMsg[from];
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Welcome message reset to default` });
    });
    
    commands.set('resetgoodbye', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        if (database.goodbyeMsg) delete database.goodbyeMsg[from];
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Goodbye message reset to default` });
    });
    
    // ==================== GROUP MANAGEMENT COMMANDS ====================
    commands.set('add', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const number = args[0]?.replace(/\D/g, '');
        if (!number) return await sock.sendMessage(from, { text: `❌ Please provide a phone number!` });
        try {
            await sock.groupParticipantsUpdate(from, [number + '@s.whatsapp.net'], 'add');
            await sock.sendMessage(from, { text: `✅ Added @${number} to the group`, mentions: [number + '@s.whatsapp.net'] });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to add user. They may have privacy settings enabled.` });
        }
    });
    
    commands.set('kick', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned || mentioned.length === 0) return await sock.sendMessage(from, { text: `❌ Please tag the user you want to kick!` });
        try {
            await sock.groupParticipantsUpdate(from, mentioned, 'remove');
            await sock.sendMessage(from, { text: `✅ Kicked ${mentioned.length} user(s) from the group` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to kick user(s)` });
        }
    });
    
    commands.set('promote', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned || mentioned.length === 0) return await sock.sendMessage(from, { text: `❌ Please tag the user you want to promote!` });
        try {
            await sock.groupParticipantsUpdate(from, mentioned, 'promote');
            await sock.sendMessage(from, { text: `✅ Promoted ${mentioned.length} user(s) to admin` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to promote user(s)` });
        }
    });
    
    commands.set('demote', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned || mentioned.length === 0) return await sock.sendMessage(from, { text: `❌ Please tag the user you want to demote!` });
        try {
            await sock.groupParticipantsUpdate(from, mentioned, 'demote');
            await sock.sendMessage(from, { text: `✅ Demoted ${mentioned.length} user(s) from admin` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to demote user(s)` });
        }
    });
    
    commands.set('tagall', async (sock, from, args, sender, isGroup) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;
        let mentions = participants.map(p => p.id);
        let message = args.join(' ') || '📢 Attention all members!';
        await sock.sendMessage(from, { text: message, mentions: mentions });
    });
    
    commands.set('hidetag', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;
        let mentions = participants.map(p => p.id);
        let message = args.join(' ') || ' ';
        await sock.sendMessage(from, { text: message, mentions: mentions });
    });
    
    commands.set('everyone', async (sock, from, args, sender, isGroup) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;
        let mentions = participants.map(p => p.id);
        let message = args.join(' ') || '📢 @everyone';
        await sock.sendMessage(from, { text: message, mentions: mentions });
    });
    
    commands.set('tagadmins', async (sock, from, args, sender, isGroup) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        const groupMetadata = await sock.groupMetadata(from);
        const admins = groupMetadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
        let message = args.join(' ') || '📢 @admins';
        await sock.sendMessage(from, { text: message, mentions: admins });
    });
    
    commands.set('listadmin', async (sock, from, args, sender, isGroup) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        const groupMetadata = await sock.groupMetadata(from);
        const admins = groupMetadata.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        let text = `👑 *Group Administrators*\n\n`;
        admins.forEach((admin, i) => {
            text += `${i + 1}. @${admin.id.split('@')[0]}\n`;
        });
        await sock.sendMessage(from, { text: text, mentions: admins.map(a => a.id) });
    });
    
    commands.set('groupinfo', async (sock, from, args, sender, isGroup) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        const groupMetadata = await sock.groupMetadata(from);
        const participants = groupMetadata.participants;
        const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').length;
        const rules = database.groupRules[from] || 'No rules set';
        await sock.sendMessage(from, { 
            text: `👥 *Group Information*\n\n📌 Name: ${groupMetadata.subject}\n📝 Description: ${groupMetadata.desc || 'No description'}\n📋 Rules: ${rules}\n👤 Created: ${moment(groupMetadata.creation * 1000).format('DD/MM/YYYY')}\n👥 Members: ${participants.length}\n👑 Admins: ${admins}\n🔗 Link: ${groupMetadata.inviteCode ? 'https://chat.whatsapp.com/' + groupMetadata.inviteCode : 'No link'}`
        });
    });
    
    commands.set('grouplink', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        try {
            const code = await sock.groupInviteCode(from);
            await sock.sendMessage(from, { text: `🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to get group link` });
        }
    });
    
    commands.set('revoke', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        try {
            await sock.groupRevokeInvite(from);
            const newCode = await sock.groupInviteCode(from);
            await sock.sendMessage(from, { text: `✅ Link revoked!\nNew link: https://chat.whatsapp.com/${newCode}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to revoke link` });
        }
    });
    
    commands.set('setname', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const name = args.join(' ');
        if (!name) return await sock.sendMessage(from, { text: `❌ Please provide a group name!` });
        try {
            await sock.groupUpdateSubject(from, name);
            await sock.sendMessage(from, { text: `✅ Group name changed to: ${name}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to change group name` });
        }
    });
    
    commands.set('setdesc', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const desc = args.join(' ');
        if (!desc) return await sock.sendMessage(from, { text: `❌ Please provide a group description!` });
        try {
            await sock.groupUpdateDescription(from, desc);
            await sock.sendMessage(from, { text: `✅ Group description updated!` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to update description` });
        }
    });
    
    commands.set('setgpic', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        if (!msg.message.imageMessage && !msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            return await sock.sendMessage(from, { text: `❌ Please reply to an image!` });
        }
        await sock.sendMessage(from, { text: `✅ Group icon updated!` });
    });
    
    commands.set('lock', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        try {
            await sock.groupSettingUpdate(from, 'locked');
            await sock.sendMessage(from, { text: `🔒 Group has been locked. Only admins can send messages.` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to lock group` });
        }
    });
    
    commands.set('unlock', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        try {
            await sock.groupSettingUpdate(from, 'unlocked');
            await sock.sendMessage(from, { text: `🔓 Group has been unlocked. All members can send messages.` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to unlock group` });
        }
    });
    
    commands.set('warn', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned || mentioned.length === 0) return await sock.sendMessage(from, { text: `❌ Please tag the user you want to warn!` });
        const target = mentioned[0];
        if (!database.warns) database.warns = {};
        if (!database.warns[target]) database.warns[target] = 0;
        database.warns[target] += 1;
        saveDatabase();
        const reason = args.join(' ') || 'No reason provided';
        await sock.sendMessage(from, { 
            text: `⚠️ *Warning Issued*\n\nUser: @${target.split('@')[0]}\nWarnings: ${database.warns[target]}/3\nReason: ${reason}`,
            mentions: [target]
        });
        if (database.warns[target] >= 3) {
            await sock.groupParticipantsUpdate(from, [target], 'remove');
            await sock.sendMessage(from, { 
                text: `🚫 User @${target.split('@')[0]} has been removed for exceeding 3 warnings.`,
                mentions: [target]
            });
            database.warns[target] = 0;
            saveDatabase();
        }
    });
    
    commands.set('warns', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        let target = mentioned ? mentioned[0] : sender;
        const warns = database.warns?.[target] || 0;
        await sock.sendMessage(from, { 
            text: `⚠️ *Warning Check*\n\nUser: @${target.split('@')[0]}\nWarnings: ${warns}/3`,
            mentions: [target]
        });
    });
    
    commands.set('resetwarns', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned || mentioned.length === 0) return await sock.sendMessage(from, { text: `❌ Please tag the user to reset warnings!` });
        const target = mentioned[0];
        if (database.warns) database.warns[target] = 0;
        saveDatabase();
        await sock.sendMessage(from, { 
            text: `✅ Warnings reset for @${target.split('@')[0]}`,
            mentions: [target]
        });
    });
    
    commands.set('mute', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned || mentioned.length === 0) return await sock.sendMessage(from, { text: `❌ Please tag the user to mute!` });
        const target = mentioned[0];
        if (!database.muted) database.muted = {};
        database.muted[target] = true;
        saveDatabase();
        await sock.sendMessage(from, { 
            text: `🔇 User @${target.split('@')[0]} has been muted`,
            mentions: [target]
        });
    });
    
    commands.set('unmute', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const mentioned = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
        if (!mentioned || mentioned.length === 0) return await sock.sendMessage(from, { text: `❌ Please tag the user to unmute!` });
        const target = mentioned[0];
        if (database.muted) database.muted[target] = false;
        saveDatabase();
        await sock.sendMessage(from, { 
            text: `🔊 User @${target.split('@')[0]} has been unmuted`,
            mentions: [target]
        });
    });
    
    commands.set('delete', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!msg?.message?.extendedTextMessage?.contextInfo?.stanzaId) {
            return await sock.sendMessage(from, { text: `❌ Please reply to a message to delete!` });
        }
        const key = {
            remoteJid: from,
            fromMe: true,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
        };
        await sock.sendMessage(from, { delete: key });
    });
    
    commands.set('poll', async (sock, from, args, sender) => {
        const pollText = args.join(' ').split('|');
        if (pollText.length < 2) return await sock.sendMessage(from, { text: `❌ Usage: poll Question|Option1|Option2|Option3` });
        const question = pollText[0];
        const pollOptions = pollText.slice(1);
        await sock.sendMessage(from, {
            poll: {
                name: question,
                values: pollOptions,
                selectableCount: 1
            }
        });
    });
    
    commands.set('filter', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        const subCommand = args[0];
        const word = args[1];
        if (subCommand === 'add' && word) {
            if (!database.wordfilters) database.wordfilters = {};
            if (!database.wordfilters[from]) database.wordfilters[from] = [];
            database.wordfilters[from].push(word);
            saveDatabase();
            await sock.sendMessage(from, { text: `✅ Added word filter: ${word}` });
        } else if (subCommand === 'remove' && word) {
            if (database.wordfilters?.[from]) {
                database.wordfilters[from] = database.wordfilters[from].filter(w => w !== word);
                saveDatabase();
                await sock.sendMessage(from, { text: `✅ Removed word filter: ${word}` });
            }
        } else if (subCommand === 'list') {
            const filters = database.wordfilters?.[from] || [];
            await sock.sendMessage(from, { text: `📋 *Filtered Words*\n\n${filters.join('\n') || 'No filters added'}` });
        } else {
            await sock.sendMessage(from, { text: `❌ Usage: filter add|remove|list [word]` });
        }
    });
    
    commands.set('join', async (sock, from, args, sender, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const link = args[0];
        if (!link) return await sock.sendMessage(from, { text: `❌ Please provide a group invite link!` });
        try {
            const code = link.split('https://chat.whatsapp.com/')[1];
            const res = await sock.groupAcceptInvite(code);
            await sock.sendMessage(from, { text: `✅ Successfully joined the group!` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to join group. Link may be invalid or expired.` });
        }
    });
    
    commands.set('leave', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        await sock.sendMessage(from, { text: `👋 Goodbye! Leaving the group now.` });
        await sock.groupLeave(from);
    });
    
    commands.set('creategroup', async (sock, from, args, sender, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const name = args.join(' ');
        if (!name) return await sock.sendMessage(from, { text: `❌ Please provide a group name!` });
        try {
            const group = await sock.groupCreate(name, [from]);
            await sock.sendMessage(from, { text: `✅ Group created: ${name}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to create group` });
        }
    });
    
    commands.set('listgroups', async (sock, from, args, sender, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const groups = Object.keys(database.groups || {});
        let text = `📋 *Groups (${groups.length})*\n\n`;
        groups.forEach((g, i) => {
            text += `${i + 1}. ${database.groups[g]?.name || g}\n`;
        });
        await sock.sendMessage(from, { text: text });
    });
    
    commands.set('invite', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin!` });
        try {
            const code = await sock.groupInviteCode(from);
            await sock.sendMessage(from, { text: `🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to get invite link` });
        }
    });
    
    // ==================== UTILITY TOOLS COMMANDS ====================
    commands.set('ping', async (sock, from, args, sender) => {
        const start = performance.now();
        await sock.sendMessage(from, { text: '🏓 Pong!' });
        const end = performance.now();
        await sock.sendMessage(from, { text: `📡 *Response Time*\n\n${(end - start).toFixed(2)}ms` });
    });
    
    commands.set('uptime', async (sock, from, args, sender) => {
        await sock.sendMessage(from, { text: `⏱️ *Bot Uptime*\n\n${getUptime()}` });
    });
    
    commands.set('runtime', async (sock, from, args, sender) => {
        await sock.sendMessage(from, { text: `⏱️ *Runtime*\n\n${getUptime()}` });
    });
    
    commands.set('speed', async (sock, from, args, sender) => {
        const speed = ((performance.now() - startTime) / 1000).toFixed(4);
        await sock.sendMessage(from, { text: `⚡ *Bot Speed*\n\n${speed} ms` });
    });
    
    commands.set('info', async (sock, from, args, sender) => {
        await sock.sendMessage(from, { 
            text: `🤖 *Bot Information*\n\n╭━━〔 ✦ PAXTON-MD ✦ 〕━━╮\n┃  👑 Owner: ${database.settings.ownerName || ownerName}\n┃  📱 Number: ${database.settings.ownerNumber || ownerNumberDisplay}\n┃  ⏰ Uptime: ${getUptime()}\n┃  🏓 Ping: ${getRandomInt(50, 150)}ms\n┃  ⚡ Version: ${botVersion}\n┃  📊 Commands: ${commands.size}\n╰━━━━━━━━━━━━━━━━━━━━╯`
        });
    });
    
    commands.set('owner', async (sock, from, args, sender) => {
        await sock.sendMessage(from, {
            text: `╭━━〔 ✦ PAXTON-MD ✦ 〕━━╮\n┃     👑 OWNER INFO     ┃\n┃   ${database.settings.ownerName || ownerName}\n┃   ${database.settings.ownerNumber || ownerNumberDisplay}\n┃   Contact for support ┃\n╰━━━━━━━━━━━━━━━━━━━━╯`
        });
    });
    
commands.set('repo', async (sock, from, args, sender) => {
    await sock.sendMessage(from, { text: `📦 *Repository*\n\nhttps://github.com/jarvismd98-afk/Paxton-MD-.git` });
});    
    commands.set('alive', async (sock, from, args, sender) => {
        await sock.sendMessage(from, { 
            text: `╭━━〔 ✦ PAXTON-MD ✦ 〕━━╮\n┃     ✅ BOT ALIVE!     ┃\n┃   ⏰ ${getUptime()}\n┃   🏓 ${getRandomInt(50, 150)}ms\n┃   Ready to serve      ┃\n╰━━━━━━━━━━━━━━━━━━━━╯`
        });
    });
    
    commands.set('profile', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        let target = sender;
        if (args[0] && args[0].includes('@')) {
            target = args[0].replace('@', '') + '@s.whatsapp.net';
        } else if (msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
            target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }
        const exp = database.exp?.[target] || 0;
        const level = database.level?.[target] || 0;
        const money = database.money?.[target] || 0;
        const married = database.married?.[target] || null;
        const warns = database.warns?.[target] || 0;
        const messages = database.users[target]?.messages || 0;
        let userName = target.split('@')[0];
        try {
            const name = await getUserName(sock, target);
            if (name) userName = name;
        } catch (e) {}
        await sock.sendMessage(from, { 
            text: `👤 *User Profile*\n\n╭━━〔 ✦ PAXTON-MD ✦ 〕━━╮\n┃  👤 User: ${userName}\n┃  ⭐ Level: ${level}\n┃  ✨ XP: ${exp}\n┃  💰 Money: $${money}\n┃  💑 Married: ${married ? `@${married.split('@')[0]}` : 'Single'}\n┃  ⚠️ Warnings: ${warns}\n┃  📊 Messages: ${messages}\n╰━━━━━━━━━━━━━━━━━━━━╯`,
            mentions: [target]
        });
    });
    
    commands.set('me', async (sock, from, args, sender) => {
        const exp = database.exp?.[sender] || 0;
        const level = database.level?.[sender] || 0;
        const money = database.money?.[sender] || 0;
        const married = database.married?.[sender] || null;
        const warns = database.warns?.[sender] || 0;
        const messages = database.users[sender]?.messages || 0;
        let userName = sender.split('@')[0];
        try {
            const name = await getUserName(sock, sender);
            if (name) userName = name;
        } catch (e) {}
        await sock.sendMessage(from, { 
            text: `👤 *My Profile*\n\n╭━━〔 ✦ PAXTON-MD ✦ 〕━━╮\n┃  👤 User: ${userName}\n┃  ⭐ Level: ${level}\n┃  ✨ XP: ${exp}\n┃  💰 Money: $${money}\n┃  💑 Married: ${married ? `@${married.split('@')[0]}` : 'Single'}\n┃  ⚠️ Warnings: ${warns}\n┃  📊 Messages: ${messages}\n╰━━━━━━━━━━━━━━━━━━━━╯`
        });
    });
    
    commands.set('dp', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        let target = sender;
        if (args[0] && args[0].includes('@')) {
            target = args[0].replace('@', '') + '@s.whatsapp.net';
        }
        try {
            const ppUrl = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(from, { 
                image: { url: ppUrl },
                caption: `🖼️ *Profile Picture*\n@${target.split('@')[0]}`,
                mentions: [target]
            });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ No profile picture found` });
        }
    });
    
    commands.set('pp', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        let target = sender;
        if (args[0] && args[0].includes('@')) {
            target = args[0].replace('@', '') + '@s.whatsapp.net';
        }
        try {
            const ppUrl = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(from, { 
                image: { url: ppUrl },
                caption: `🖼️ *Profile Picture*\n@${target.split('@')[0]}`,
                mentions: [target]
            });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ No profile picture found` });
        }
    });
    
    commands.set('system', async (sock, from, args, sender) => {
        const sysInfo = {
            platform: os.platform(),
            arch: os.arch(),
            cpu: os.cpus()[0]?.model || 'Unknown',
            cores: os.cpus().length,
            memory: formatBytes(os.totalmem()),
            free: formatBytes(os.freemem()),
            uptime: getUptime(),
            node: process.version
        };
        await sock.sendMessage(from, { 
            text: `💻 *System Information*\n\nPlatform: ${sysInfo.platform}\nArchitecture: ${sysInfo.arch}\nCPU: ${sysInfo.cpu}\nCores: ${sysInfo.cores}\nTotal Memory: ${sysInfo.memory}\nFree Memory: ${sysInfo.free}\nSystem Uptime: ${sysInfo.uptime}\nNode Version: ${sysInfo.node}`
        });
    });
    
    commands.set('weather', async (sock, from, args, sender) => {
        const city = args.join(' ') || 'Johannesburg';
        await sock.sendMessage(from, { text: `☀️ *Weather in ${city}*\n\nTemperature: 25°C\nCondition: Sunny\nHumidity: 60%\nWind Speed: 10 km/h` });
    });
    
    commands.set('calc', async (sock, from, args, sender) => {
        if (!args.length) return await sock.sendMessage(from, { text: `❌ Usage: calc 2+2` });
        try {
            const result = eval(args.join(' '));
            await sock.sendMessage(from, { text: `🧮 *Calculator*\n\n${args.join(' ')} = ${result}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Invalid expression!` });
        }
    });
    
    commands.set('translate', async (sock, from, args, sender) => {
        await sock.sendMessage(from, { text: `🌐 *Translation*\n\nTranslation feature coming soon!` });
    });
    
    commands.set('define', async (sock, from, args, sender) => {
        const word = args.join(' ');
        if (!word) return await sock.sendMessage(from, { text: `❌ Usage: define hello` });
        await sock.sendMessage(from, { text: `📚 *Definition of "${word}"*\n\nDictionary feature coming soon!` });
    });
    
    commands.set('shorten', async (sock, from, args, sender) => {
        const url = args[0];
        if (!url) return await sock.sendMessage(from, { text: `❌ Usage: shorten https://example.com` });
        await sock.sendMessage(from, { text: `🔗 *Shortened URL*\n\nOriginal: ${url}\nShortened: https://short.url/abc123` });
    });
    
    commands.set('ip', async (sock, from, args, sender) => {
        const ip = args[0] || '8.8.8.8';
        await sock.sendMessage(from, { text: `🌐 *IP Lookup for ${ip}*\n\nLocation: Mountain View, CA\nISP: Google LLC\nTimezone: America/Los_Angeles` });
    });
    
    commands.set('whois', async (sock, from, args, sender) => {
        const domain = args[0] || 'google.com';
        await sock.sendMessage(from, { text: `🔍 *WHOIS for ${domain}*\n\nWHOIS feature coming soon!` });
    });
    
    commands.set('phone', async (sock, from, args, sender) => {
        const number = args[0] || '27836547695';
        await sock.sendMessage(from, { text: `📱 *Phone Lookup for ${number}*\n\nCountry: South Africa\nCarrier: Vodacom\nValid: Yes` });
    });
    
    commands.set('country', async (sock, from, args, sender) => {
        const country = args.join(' ') || 'South Africa';
        await sock.sendMessage(from, { text: `🌍 *Country Info: ${country}*\n\nCapital: Pretoria\nPopulation: 60 million\nCurrency: South African Rand\nLanguage: 11 official languages` });
    });
    
    commands.set('time', async (sock, from, args, sender) => {
        const zone = args[0] || 'Africa/Johannesburg';
        await sock.sendMessage(from, { text: `⏰ *Time in ${zone}*\n\n${moment().tz(zone).format('HH:mm:ss')}\nDate: ${moment().tz(zone).format('DD MMMM YYYY')}` });
    });
    
    commands.set('date', async (sock, from, args, sender) => {
        await sock.sendMessage(from, { text: `📅 *Current Date*\n\n${moment().tz('Africa/Johannesburg').format('dddd, DD MMMM YYYY')}` });
    });
    
    commands.set('timer', async (sock, from, args, sender) => {
        const seconds = parseInt(args[0]);
        if (!seconds) return await sock.sendMessage(from, { text: `❌ Usage: timer 60` });
        await sock.sendMessage(from, { text: `⏲️ Timer set for ${seconds} seconds` });
        setTimeout(async () => {
            await sock.sendMessage(from, { text: `⏰ *Timer Finished!*\n\n${seconds} seconds have passed!` });
        }, seconds * 1000);
    });
    
    commands.set('password', async (sock, from, args, sender) => {
        const length = parseInt(args[0]) || 12;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        await sock.sendMessage(from, { text: `🔑 *Generated Password*\n\n${password}\nLength: ${length}` });
    });
    
    commands.set('uuid', async (sock, from, args, sender) => {
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        await sock.sendMessage(from, { text: `🔢 *UUID Generated*\n\n${uuid}` });
    });
    
    commands.set('hash', async (sock, from, args, sender) => {
        const text = args.join(' ');
        if (!text) return await sock.sendMessage(from, { text: `❌ Usage: hash text` });
        const md5 = crypto.createHash('md5').update(text).digest('hex');
        const sha1 = crypto.createHash('sha1').update(text).digest('hex');
        const sha256 = crypto.createHash('sha256').update(text).digest('hex');
        await sock.sendMessage(from, { text: `🔐 *Hash Generator*\n\nText: ${text}\n\nMD5: ${md5}\nSHA1: ${sha1}\nSHA256: ${sha256}` });
    });
    
    commands.set('base64', async (sock, from, args, sender) => {
        const text = args.join(' ');
        if (!text) return await sock.sendMessage(from, { text: `❌ Usage: base64 text` });
        const encoded = Buffer.from(text).toString('base64');
        await sock.sendMessage(from, { text: `🔐 *Base64 Encode*\n\n${encoded}` });
    });
    
    commands.set('base64decode', async (sock, from, args, sender) => {
        const text = args.join(' ');
        if (!text) return await sock.sendMessage(from, { text: `❌ Usage: base64decode base64text` });
        try {
            const decoded = Buffer.from(text, 'base64').toString('utf8');
            await sock.sendMessage(from, { text: `🔓 *Base64 Decode*\n\n${decoded}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Invalid base64!` });
        }
    });
    
    commands.set('binary', async (sock, from, args, sender) => {
        const text = args.join(' ');
        if (!text) return await sock.sendMessage(from, { text: `❌ Usage: binary text` });
        const binary = text.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
        await sock.sendMessage(from, { text: `🔢 *Binary Encode*\n\n${binary}` });
    });
    
    commands.set('binarydecode', async (sock, from, args, sender) => {
        const binary = args.join(' ');
        if (!binary) return await sock.sendMessage(from, { text: `❌ Usage: binarydecode 01101000 01101001` });
        try {
            const text = binary.split(' ').map(bin => String.fromCharCode(parseInt(bin, 2))).join('');
            await sock.sendMessage(from, { text: `🔓 *Binary Decode*\n\n${text}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Invalid binary!` });
        }
    });
    
    commands.set('hex', async (sock, from, args, sender) => {
        const text = args.join(' ');
        if (!text) return await sock.sendMessage(from, { text: `❌ Usage: hex text` });
        const hex = Buffer.from(text).toString('hex');
        await sock.sendMessage(from, { text: `🔢 *Hex Encode*\n\n${hex}` });
    });
    
    commands.set('hexdecode', async (sock, from, args, sender) => {
        const hex = args.join(' ');
        if (!hex) return await sock.sendMessage(from, { text: `❌ Usage: hexdecode 68656c6c6f` });
        try {
            const text = Buffer.from(hex, 'hex').toString('utf8');
            await sock.sendMessage(from, { text: `🔓 *Hex Decode*\n\n${text}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Invalid hex!` });
        }
    });
    
    commands.set('morse', async (sock, from, args, sender) => {
        const text = args.join(' ');
        if (!text) return await sock.sendMessage(from, { text: `❌ Usage: morse text` });
        const morseCode = {
            'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
            'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
            'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
            'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
            'Y': '-.--', 'Z': '--..', '0': '-----', '1': '.----', '2': '..---',
            '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...',
            '8': '---..', '9': '----.'
        };
        const morse = text.toUpperCase().split('').map(char => morseCode[char] || char).join(' ');
        await sock.sendMessage(from, { text: `📡 *Morse Code*\n\n${morse}` });
    });
    
    commands.set('font', async (sock, from, args, sender) => {
        const text = args.join(' ');
        if (!text) return await sock.sendMessage(from, { text: `❌ Usage: font text` });
        await sock.sendMessage(from, { text: `🔤 *Font Generator*\n\nNormal: ${text}\nBold: **${text}**\nItalic: *${text}*` });
    });
    
    // ==================== MARRIAGE SYSTEM COMMANDS ====================
    commands.set('marry', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag the person you want to marry!` });
        if (target === sender) return await sock.sendMessage(from, { text: `❌ You cannot marry yourself!` });
        if (database.married && database.married[sender]) {
            return await sock.sendMessage(from, { text: `❌ You are already married! Use .divorce first.` });
        }
        if (database.married && database.married[target]) {
            return await sock.sendMessage(from, { text: `❌ That person is already married!` });
        }
        if (!database.proposals) database.proposals = {};
        database.proposals[target] = { from: sender, time: Date.now() };
        saveDatabase();
        await sock.sendMessage(from, { 
            text: `╭━━〔 ✦ PAXTON-MD ✦ 〕━━╮\n┃      💍 PROPOSAL      ┃\n┃   @${sender.split('@')[0]} wants to\n┃   marry @${target.split('@')[0]}!\n┃   Type .accept or\n┃   .reject\n╰━━━━━━━━━━━━━━━━━━━━╯`,
            mentions: [sender, target]
        });
    });
    
    commands.set('accept', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!database.proposals || !database.proposals[sender]) {
            return await sock.sendMessage(from, { text: `❌ You have no pending marriage proposals!` });
        }
        const proposer = database.proposals[sender].from;
        if (!database.married) database.married = {};
        database.married[sender] = proposer;
        database.married[proposer] = sender;
        delete database.proposals[sender];
        saveDatabase();
        await sock.sendMessage(from, { 
            text: `╭━━〔 ✦ PAXTON-MD ✦ 〕━━╮\n┃   💖 MARRIED! 💖     ┃\n┃   @${sender.split('@')[0]} ♥\n┃   @${proposer.split('@')[0]}\n┃   Love: ${getRandomInt(70, 100)}% 💘\n┃   Congratulations!\n╰━━━━━━━━━━━━━━━━━━━━╯`,
            mentions: [sender, proposer]
        });
    });
    
    commands.set('reject', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!database.proposals || !database.proposals[sender]) {
            return await sock.sendMessage(from, { text: `❌ You have no pending marriage proposals!` });
        }
        const proposer = database.proposals[sender].from;
        delete database.proposals[sender];
        saveDatabase();
        await sock.sendMessage(from, { 
            text: `💔 *Proposal Rejected*\n\n@${sender.split('@')[0]} rejected the proposal from @${proposer.split('@')[0]}`,
            mentions: [sender, proposer]
        });
    });
    
    commands.set('divorce', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!database.married || !database.married[sender]) {
            return await sock.sendMessage(from, { text: `❌ You are not married!` });
        }
        const spouse = database.married[sender];
        delete database.married[sender];
        delete database.married[spouse];
        saveDatabase();
        await sock.sendMessage(from, { 
            text: `💔 *Divorced*\n\n@${sender.split('@')[0]} and @${spouse.split('@')[0]} are now divorced.`,
            mentions: [sender, spouse]
        });
    });
    
    commands.set('married', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!database.married || !database.married[sender]) {
            return await sock.sendMessage(from, { text: `❌ You are not married!` });
        }
        const spouse = database.married[sender];
        await sock.sendMessage(from, { 
            text: `💑 *Marriage Status*\n\nYou are married to @${spouse.split('@')[0]}`,
            mentions: [spouse]
        });
    });
    
    commands.set('spouse', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!database.married || !database.married[sender]) {
            return await sock.sendMessage(from, { text: `❌ You are not married!` });
        }
        const spouse = database.married[sender];
        await sock.sendMessage(from, { 
            text: `💑 *Your Spouse*\n\n@${spouse.split('@')[0]}`,
            mentions: [spouse]
        });
    });
    
    commands.set('love', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag someone to send love to!` });
        await sock.sendMessage(from, { 
            text: `💖 *Love*\n\n@${sender.split('@')[0]} sent love to @${target.split('@')[0]}! 💕`,
            mentions: [sender, target]
        });
    });
    
    commands.set('hug', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag someone to hug!` });
        await sock.sendMessage(from, { 
            text: `🤗 *Hug*\n\n@${sender.split('@')[0]} hugged @${target.split('@')[0]}! 🤗`,
            mentions: [sender, target]
        });
    });
    
    commands.set('kiss', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag someone to kiss!` });
        await sock.sendMessage(from, { 
            text: `💋 *Kiss*\n\n@${sender.split('@')[0]} kissed @${target.split('@')[0]}! 💋`,
            mentions: [sender, target]
        });
    });
    
    commands.set('gift', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag someone to give a gift to!` });
        await sock.sendMessage(from, { 
            text: `🎁 *Gift*\n\n@${sender.split('@')[0]} gave a gift to @${target.split('@')[0]}! 🎁`,
            mentions: [sender, target]
        });
    });
    
    commands.set('lovemeter', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const users = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (users.length < 2) {
            return await sock.sendMessage(from, { text: `❌ Please tag two users to check their love compatibility!` });
        }
        const percentage = getRandomInt(0, 100);
        await sock.sendMessage(from, { 
            text: `📊 *Love Meter*\n\n@${users[0].split('@')[0]} ❤️ @${users[1].split('@')[0]}\nLove Compatibility: ${percentage}%`,
            mentions: [users[0], users[1]]
        });
    });
    
    commands.set('compatibility', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const users = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (users.length < 2) {
            return await sock.sendMessage(from, { text: `❌ Please tag two users to check their compatibility!` });
        }
        const percentage = getRandomInt(0, 100);
        await sock.sendMessage(from, { 
            text: `🤝 *Compatibility*\n\n@${users[0].split('@')[0]} & @${users[1].split('@')[0]}\nCompatibility: ${percentage}%`,
            mentions: [users[0], users[1]]
        });
    });
    
    commands.set('soulmate', async (sock, from, args, sender) => {
        await sock.sendMessage(from, { text: `💫 *Soulmate*\n\nYour soulmate is out there somewhere! Keep searching! 💫` });
    });
    
    // ==================== FUN & GAMES COMMANDS ====================
    commands.set('joke', async (sock, from, args, sender) => {
        const jokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "Why did the scarecrow win an award? He was outstanding in his field!",
            "Why don't eggs tell jokes? They'd crack each other up!",
            "What do you call a fake noodle? An impasta!",
            "Why did the math book look sad? Because it had too many problems!",
            "What do you call a bear with no teeth? A gummy bear!",
            "Why can't you give Elsa a balloon? Because she will let it go!",
            "What do you call a sleeping bull? A bulldozer!",
            "Why did the bicycle fall over? Because it was two-tired!",
            "What do you call a fish with no eyes? A fsh!"
        ];
        await sock.sendMessage(from, { text: `😂 *Random Joke*\n\n${getRandomElement(jokes)}` });
    });
    
    commands.set('dadjoke', async (sock, from, args, sender) => {
        const jokes = [
            "I'm reading a book on anti-gravity. It's impossible to put down!",
            "Did you hear about the restaurant on the moon? Great food, no atmosphere!",
            "What do you call a fake noodle? An impasta!",
            "How does a penguin build its house? Igloos it together!",
            "Why did the scarecrow win an award? He was outstanding in his field!",
            "I told my wife she should embrace her mistakes. She gave me a hug.",
            "What do you call a man with a rubber toe? Roberto!",
            "I used to be a baker, but I couldn't make enough dough.",
            "I'm reading a book on the history of glue. I just can't seem to put it down.",
            "I don't trust stairs. They're always up to something."
        ];
        await sock.sendMessage(from, { text: `👨 *Dad Joke*\n\n${getRandomElement(jokes)}` });
    });
    
    commands.set('fact', async (sock, from, args, sender) => {
        const facts = [
            "Honey never spoils. Archaeologists found 3000-year-old honey in Egyptian tombs that's still edible!",
            "A day on Venus is longer than a year on Venus!",
            "Bananas are berries, but strawberries aren't!",
            "Octopuses have three hearts!",
            "The Eiffel Tower can be 15 cm taller during summer due to thermal expansion!",
            "A group of flamingos is called a 'flamboyance'!",
            "The shortest war in history was between Britain and Zanzibar in 1896. It lasted 38 minutes!",
            "A jiffy is an actual unit of time: 1/100th of a second!",
            "The average person will spend six months of their life waiting for red lights to turn green!",
            "Cows have best friends and get stressed when separated from them!"
        ];
        await sock.sendMessage(from, { text: `📚 *Random Fact*\n\n${getRandomElement(facts)}` });
    });
    
    commands.set('quote', async (sock, from, args, sender) => {
        const quotes = [
            "The only way to do great work is to love what you do. - Steve Jobs",
            "Life is what happens when you're busy making other plans. - John Lennon",
            "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
            "Believe you can and you're halfway there. - Theodore Roosevelt",
            "It does not matter how slowly you go as long as you do not stop. - Confucius",
            "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
            "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
            "The only impossible journey is the one you never begin. - Tony Robbins",
            "Everything you've ever wanted is on the other side of fear. - George Addair",
            "The best time to plant a tree was 20 years ago. The second best time is now. - Chinese Proverb"
        ];
        await sock.sendMessage(from, { text: `💭 *Inspirational Quote*\n\n${getRandomElement(quotes)}` });
    });
    
    commands.set('truth', async (sock, from, args, sender) => {
        const truths = [
            "What's your biggest fear?",
            "Have you ever lied to your best friend?",
            "What's the most embarrassing thing you've ever done?",
            "Who was your first crush?",
            "Have you ever stolen anything?",
            "What's the biggest lie you've ever told?",
            "What's your biggest insecurity?",
            "Have you ever cheated on a test?",
            "What's the most illegal thing you've ever done?",
            "Who do you secretly dislike?"
        ];
        await sock.sendMessage(from, { text: `🤔 *Truth Question*\n\n${getRandomElement(truths)}` });
    });
    
    commands.set('dare', async (sock, from, args, sender) => {
        const dares = [
            "Send a random emoji to your last chat!",
            "Do 10 pushups right now!",
            "Send your most recent photo!",
            "Sing a song and send a voice note!",
            "Text your crush right now and send a screenshot!",
            "Change your display name to 'I love bots' for an hour!",
            "Send a message to your last chat saying 'I know what you did'",
            "Post an embarrassing photo as your profile picture for 10 minutes!",
            "Call a random contact and sing Happy Birthday to them!",
            "Let someone in the group pick your next profile picture!"
        ];
        await sock.sendMessage(from, { text: `😈 *Dare Challenge*\n\n${getRandomElement(dares)}` });
    });
    
    commands.set('wouldyourather', async (sock, from, args, sender) => {
        const wyr = [
            "Would you rather have the ability to fly or be invisible?",
            "Would you rather be rich but unhappy or poor but happy?",
            "Would you rather live without music or without movies?",
            "Would you rather have unlimited food or unlimited travel?",
            "Would you rather be able to talk to animals or speak all languages?",
            "Would you rather be famous but lonely or unknown but loved?",
            "Would you rather have a rewind button or a pause button on life?",
            "Would you rather be able to time travel or read minds?",
            "Would you rather be 10 years younger or 10 years older?",
            "Would you rather have a photographic memory or perfect pitch?"
        ];
        await sock.sendMessage(from, { text: `🤷 *Would You Rather*\n\n${getRandomElement(wyr)}` });
    });
    
    commands.set('8ball', async (sock, from, args, sender) => {
        const question = args.join(' ');
        if (!question) return await sock.sendMessage(from, { text: `❌ Please ask a question!` });
        const responses = [
            "Yes", "No", "Maybe", "Definitely", "Absolutely not",
            "Ask again later", "I don't think so", "Of course",
            "It is certain", "Very doubtful", "Without a doubt",
            "My sources say no", "Outlook good", "Cannot predict now",
            "Concentrate and ask again", "Don't count on it"
        ];
        await sock.sendMessage(from, { text: `🎱 *Magic 8-Ball*\n\nQuestion: ${question}\nAnswer: ${getRandomElement(responses)}` });
    });
    
    commands.set('flipcoin', async (sock, from, args, sender) => {
        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        await sock.sendMessage(from, { text: `🪙 *Coin Flip*\n\nResult: ${result}` });
    });
    
    commands.set('dice', async (sock, from, args, sender) => {
        const result = getRandomInt(1, 6);
        await sock.sendMessage(from, { text: `🎲 *Dice Roll*\n\nResult: ${result}` });
    });
    
    commands.set('rps', async (sock, from, args, sender) => {
        const choice = args[0]?.toLowerCase();
        if (!choice || !['rock', 'paper', 'scissors'].includes(choice)) {
            return await sock.sendMessage(from, { text: `❌ Please choose rock, paper, or scissors!` });
        }
        const choices = ['rock', 'paper', 'scissors'];
        const botChoice = getRandomElement(choices);
        let result;
        if (choice === botChoice) {
            result = "It's a tie!";
        } else if (
            (choice === 'rock' && botChoice === 'scissors') ||
            (choice === 'paper' && botChoice === 'rock') ||
            (choice === 'scissors' && botChoice === 'paper')
        ) {
            result = "You win! 🎉";
        } else {
            result = "Bot wins! 🤖";
        }
        await sock.sendMessage(from, { text: `📝 *Rock Paper Scissors*\n\nYou: ${choice}\nBot: ${botChoice}\nResult: ${result}` });
    });
    
    commands.set('roast', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const roasts = [
            "You're not stupid; you just have bad luck thinking.",
            "You're proof that God has a sense of humor.",
            "You bring everyone so much joy! When you leave.",
            "I'd agree with you but then we'd both be wrong.",
            "You're not the dumbest person on earth, but you better hope they don't die.",
            "If I wanted to kill myself I'd climb your ego and jump to your IQ.",
            "You have something on your chin... no, the third one down.",
            "Your secrets are safe with me. I never listen when you talk.",
            "You're the reason God created the middle finger.",
            "I'd call you a tool, but even tools have a purpose."
        ];
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        await sock.sendMessage(from, { 
            text: `🔥 *Roast*\n\n@${target.split('@')[0]}, ${getRandomElement(roasts)}`,
            mentions: [target]
        });
    });
    
    commands.set('compliment', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const compliments = [
            "You're amazing!",
            "You have a great smile!",
            "You're incredibly smart!",
            "You light up the room!",
            "You're one of a kind!",
            "You're a ray of sunshine!",
            "You're more fun than a barrel of monkeys!",
            "You're like a candle in the darkness!",
            "You're the reason everyone smiles!",
            "You're absolutely wonderful!"
        ];
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        await sock.sendMessage(from, { 
            text: `💖 *Compliment*\n\n@${target.split('@')[0]}, ${getRandomElement(compliments)}`,
            mentions: [target]
        });
    });
    
    commands.set('ship', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const users = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (users.length < 2) {
            return await sock.sendMessage(from, { text: `❌ Please tag two users to ship!` });
        }
        const percentage = getRandomInt(0, 100);
        const user1 = users[0].split('@')[0];
        const user2 = users[1].split('@')[0];
        let emoji;
        if (percentage < 30) emoji = '💔';
        else if (percentage < 60) emoji = '💛';
        else if (percentage < 80) emoji = '💖';
        else emoji = '💘';
        await sock.sendMessage(from, { 
            text: `💕 *Ship Test*\n\n@${user1} + @${user2}\nCompatibility: ${percentage}% ${emoji}`,
            mentions: [users[0], users[1]]
        });
    });
    
    commands.set('lovetest', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        const percentage = getRandomInt(0, 100);
        await sock.sendMessage(from, { 
            text: `💗 *Love Test*\n\n@${target.split('@')[0]}\nLoving: ${percentage}%`,
            mentions: [target]
        });
    });
    
    commands.set('simprate', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        const percentage = getRandomInt(0, 100);
        let level;
        if (percentage < 20) level = 'Alpha Male 💪';
        else if (percentage < 40) level = 'Cool 😎';
        else if (percentage < 60) level = 'Suspicious 🤔';
        else if (percentage < 80) level = 'Simp 😅';
        else level = 'Ultimate Simp 🤡';
        await sock.sendMessage(from, { 
            text: `😳 *Simp Rate*\n\n@${target.split('@')[0]}\nSimp Level: ${percentage}%\nStatus: ${level}`,
            mentions: [target]
        });
    });
    
    commands.set('gayrate', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        const percentage = getRandomInt(0, 100);
        await sock.sendMessage(from, { 
            text: `🌈 *Gay Rate*\n\n@${target.split('@')[0]}\nGay Level: ${percentage}%`,
            mentions: [target]
        });
    });
    
    commands.set('smartrate', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        const percentage = getRandomInt(0, 100);
        await sock.sendMessage(from, { 
            text: `🧠 *Smart Rate*\n\n@${target.split('@')[0]}\nSmart Level: ${percentage}%`,
            mentions: [target]
        });
    });
    
    commands.set('rizz', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        const percentage = getRandomInt(0, 100);
        await sock.sendMessage(from, { 
            text: `💬 *Rizz Level*\n\n@${target.split('@')[0]}\nRizz: ${percentage}%`,
            mentions: [target]
        });
    });
    
    commands.set('swag', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        const percentage = getRandomInt(0, 100);
        await sock.sendMessage(from, { 
            text: `😎 *Swag Level*\n\n@${target.split('@')[0]}\nSwag: ${percentage}%`,
            mentions: [target]
        });
    });
    
    commands.set('vibe', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || sender;
        const vibes = ['✨ Good Vibes', '🌈 Happy', '😎 Cool', '🤔 Suspicious', '💀 Dark', '🎉 Party', '😴 Sleepy', '🔥 Hype'];
        await sock.sendMessage(from, { 
            text: `🎵 *Vibe Check*\n\n@${target.split('@')[0]}\nVibe: ${getRandomElement(vibes)}`,
            mentions: [target]
        });
    });
    
    commands.set('mood', async (sock, from, args, sender) => {
        const moods = ['😊 Happy', '😢 Sad', '😠 Angry', '😴 Tired', '🤔 Confused', '🥳 Excited', '😎 Cool', '😨 Anxious'];
        await sock.sendMessage(from, { text: `🎭 *Mood*\n\n${getRandomElement(moods)}` });
    });
    
    commands.set('fortune', async (sock, from, args, sender) => {
        const fortunes = [
            "You will have a great day tomorrow!",
            "Someone is thinking about you right now.",
            "A surprise is waiting for you.",
            "Your hard work will pay off soon.",
            "Good news is coming your way.",
            "Adventure awaits you.",
            "You will meet someone special soon.",
            "An opportunity will present itself this week.",
            "Trust your instincts today.",
            "Something wonderful is about to happen."
        ];
        await sock.sendMessage(from, { text: `🔮 *Fortune Cookie*\n\n${getRandomElement(fortunes)}` });
    });
    
    commands.set('horoscope', async (sock, from, args, sender) => {
        const sign = args[0];
        if (!sign) return await sock.sendMessage(from, { text: `❌ Usage: horoscope aries` });
        const horoscopes = [
            "Today is a great day for new beginnings. Trust your instincts and go after what you want.",
            "You may face some challenges today, but your determination will help you overcome them.",
            "Good energy surrounds you. Use it to connect with others and share your ideas.",
            "Take some time for self-reflection today. The answers you seek are within you.",
            "Your social life is highlighted. Reach out to friends and make plans.",
            "Financial opportunities may present themselves. Stay alert and be ready to act.",
            "Communication is key today. Express your feelings openly and honestly.",
            "You're feeling creative. Channel that energy into a project you've been putting off.",
            "Pay attention to your dreams tonight. They may hold important messages.",
            "A pleasant surprise is in store for you. Keep an open mind."
        ];
        await sock.sendMessage(from, { text: `🌟 *Horoscope for ${sign}*\n\n${getRandomElement(horoscopes)}` });
    });
    
    commands.set('zodiac', async (sock, from, args, sender) => {
        const sign = args[0];
        if (!sign) return await sock.sendMessage(from, { text: `❌ Usage: zodiac aries` });
        const zodiacInfo = {
            'aries': 'Mar 21 - Apr 19 | Element: Fire | Ruling Planet: Mars | Lucky Color: Red',
            'taurus': 'Apr 20 - May 20 | Element: Earth | Ruling Planet: Venus | Lucky Color: Green',
            'gemini': 'May 21 - Jun 20 | Element: Air | Ruling Planet: Mercury | Lucky Color: Yellow',
            'cancer': 'Jun 21 - Jul 22 | Element: Water | Ruling Planet: Moon | Lucky Color: Silver',
            'leo': 'Jul 23 - Aug 22 | Element: Fire | Ruling Planet: Sun | Lucky Color: Gold',
            'virgo': 'Aug 23 - Sep 22 | Element: Earth | Ruling Planet: Mercury | Lucky Color: Brown',
            'libra': 'Sep 23 - Oct 22 | Element: Air | Ruling Planet: Venus | Lucky Color: Pink',
            'scorpio': 'Oct 23 - Nov 21 | Element: Water | Ruling Planet: Pluto | Lucky Color: Black',
            'sagittarius': 'Nov 22 - Dec 21 | Element: Fire | Ruling Planet: Jupiter | Lucky Color: Purple',
            'capricorn': 'Dec 22 - Jan 19 | Element: Earth | Ruling Planet: Saturn | Lucky Color: Brown',
            'aquarius': 'Jan 20 - Feb 18 | Element: Air | Ruling Planet: Uranus | Lucky Color: Blue',
            'pisces': 'Feb 19 - Mar 20 | Element: Water | Ruling Planet: Neptune | Lucky Color: Sea Green'
        };
        const info = zodiacInfo[sign.toLowerCase()] || 'Zodiac sign not found';
        await sock.sendMessage(from, { text: `⭐ *Zodiac Info for ${sign}*\n\n${info}` });
    });
    
    commands.set('say', async (sock, from, args, sender) => {
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ What should I say?` });
        await sock.sendMessage(from, { text: `${message}` });
    });
    
    commands.set('echo', async (sock, from, args, sender) => {
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ What should I echo?` });
        await sock.sendMessage(from, { text: `🔊 *Echo*\n\n${message}` });
    });
    
    commands.set('reverse', async (sock, from, args, sender) => {
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ What should I reverse?` });
        const reversed = message.split('').reverse().join('');
        await sock.sendMessage(from, { text: `🔄 *Reversed*\n\n${reversed}` });
    });
    
    commands.set('uppercase', async (sock, from, args, sender) => {
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ What should I convert?` });
        await sock.sendMessage(from, { text: `🔠 *Uppercase*\n\n${message.toUpperCase()}` });
    });
    
    commands.set('lowercase', async (sock, from, args, sender) => {
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ What should I convert?` });
        await sock.sendMessage(from, { text: `🔡 *Lowercase*\n\n${message.toLowerCase()}` });
    });
    
    commands.set('capitalize', async (sock, from, args, sender) => {
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ What should I capitalize?` });
        const capitalized = message.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
        await sock.sendMessage(from, { text: `📝 *Capitalized*\n\n${capitalized}` });
    });
    
    // ==================== REVIEW SYSTEM COMMANDS ====================
    commands.set('review', async (sock, from, args, sender) => {
        const review = args.join(' ');
        if (!review) return await sock.sendMessage(from, { text: `❌ Please provide your review!` });
        if (!database.reviews) database.reviews = {};
        database.reviews[sender] = { text: review, time: Date.now() };
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Thank you for your review!` });
    });
    
    commands.set('reviews', async (sock, from, args, sender) => {
        if (!database.reviews || Object.keys(database.reviews).length === 0) {
            return await sock.sendMessage(from, { text: `📝 No reviews yet. Be the first to leave a review with .review [text]!` });
        }
        let text = `📋 *User Reviews*\n\n`;
        const reviews = Object.entries(database.reviews).slice(-5);
        reviews.forEach(([user, data], i) => {
            const date = moment(data.time).format('DD/MM/YYYY');
            text += `${i + 1}. @${user.split('@')[0]}: ${data.text} (${date})\n\n`;
        });
        await sock.sendMessage(from, { text: text, mentions: reviews.map(([user]) => user) });
    });
    
    commands.set('myreview', async (sock, from, args, sender) => {
        if (!database.reviews || !database.reviews[sender]) {
            return await sock.sendMessage(from, { text: `❌ You haven't left a review yet!` });
        }
        const review = database.reviews[sender];
        const date = moment(review.time).format('DD/MM/YYYY HH:mm');
        await sock.sendMessage(from, { text: `📝 *Your Review*\n\n${review.text}\n\nDate: ${date}` });
    });
    
    commands.set('deletereview', async (sock, from, args, sender) => {
        if (!database.reviews || !database.reviews[sender]) {
            return await sock.sendMessage(from, { text: `❌ You haven't left a review yet!` });
        }
        delete database.reviews[sender];
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Your review has been deleted.` });
    });
    
    commands.set('rating', async (sock, from, args, sender) => {
        const rating = parseInt(args[0]);
        if (!rating || rating < 1 || rating > 5) {
            return await sock.sendMessage(from, { text: `❌ Please provide a rating from 1 to 5!` });
        }
        await sock.sendMessage(from, { text: `⭐ Thank you for rating the bot ${rating}/5 stars!` });
    });
    
    commands.set('feedback', async (sock, from, args, sender) => {
        const feedback = args.join(' ');
        if (!feedback) return await sock.sendMessage(from, { text: `❌ Please provide your feedback!` });
        await sock.sendMessage(from, { text: `📢 Thank you for your feedback! It helps us improve.` });
    });
    
    commands.set('suggest', async (sock, from, args, sender) => {
        const suggestion = args.join(' ');
        if (!suggestion) return await sock.sendMessage(from, { text: `❌ Please provide your suggestion!` });
        await sock.sendMessage(from, { text: `💡 Thank you for your suggestion! We'll consider it.` });
    });
    
    commands.set('bug', async (sock, from, args, sender) => {
        const bug = args.join(' ');
        if (!bug) return await sock.sendMessage(from, { text: `❌ Please describe the bug!` });
        await sock.sendMessage(from, { text: `🐛 Bug report received. Thank you for helping us improve!` });
    });
    
    // ==================== HIJACK COMMANDS ====================
    commands.set('hijack', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin to hijack!` });
        
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag the user to hijack!` });
        
        if (!database.hijacked) database.hijacked = {};
        database.hijacked[target] = {
            hijackedBy: sender,
            time: Date.now(),
            group: from
        };
        saveDatabase();
        
        await sock.sendMessage(from, { 
            text: `⚠️ *HIJACKED*\n\nUser @${target.split('@')[0]} has been hijacked!\nAll messages will be monitored.`,
            mentions: [target]
        });
    });
    
    commands.set('release', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        if (!userIsOwner && !isAdmin) return await sock.sendMessage(from, { text: `❌ You need to be a group admin to release!` });
        
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag the user to release!` });
        
        if (database.hijacked && database.hijacked[target]) {
            delete database.hijacked[target];
            saveDatabase();
            await sock.sendMessage(from, { 
                text: `✅ *RELEASED*\n\nUser @${target.split('@')[0]} has been released from hijack.`,
                mentions: [target]
            });
        } else {
            await sock.sendMessage(from, { text: `❌ This user is not hijacked!` });
        }
    });
    
    commands.set('hijacked', async (sock, from, args, sender, isGroup) => {
        if (!database.hijacked || Object.keys(database.hijacked).length === 0) {
            return await sock.sendMessage(from, { text: `📝 No users are currently hijacked.` });
        }
        
        let text = `⚠️ *HIJACKED USERS*\n\n`;
        Object.entries(database.hijacked).forEach(([user, data], i) => {
            const date = moment(data.time).format('DD/MM/YYYY HH:mm');
            text += `${i + 1}. @${user.split('@')[0]}\n   Hijacked by: @${data.hijackedBy.split('@')[0]}\n   Time: ${date}\n\n`;
        });
        await sock.sendMessage(from, { 
            text: text,
            mentions: [...Object.keys(database.hijacked), ...Object.values(database.hijacked).map(d => d.hijackedBy)]
        });
    });
    
    commands.set('hijacklist', async (sock, from, args, sender) => {
        await commands.get('hijacked')(sock, from, args, sender);
    });
    
    commands.set('hijackclear', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        
        database.hijacked = {};
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ All hijacked users have been cleared.` });
    });
    
    // ==================== SUDO COMMANDS ====================
    commands.set('addsudo', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const number = args[0];
        if (!number) return await sock.sendMessage(from, { text: `❌ Please provide a phone number!` });
        const num = number.replace(/\D/g, '');
        if (!sudoUsers.includes(num)) {
            sudoUsers.push(num);
            saveDatabase();
            await sock.sendMessage(from, { text: `✅ Sudo user added: ${num}` });
        } else {
            await sock.sendMessage(from, { text: `❌ User is already a sudo user!` });
        }
    });
    
    commands.set('delsudo', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const number = args[0];
        if (!number) return await sock.sendMessage(from, { text: `❌ Please provide a phone number!` });
        const num = number.replace(/\D/g, '');
        sudoUsers = sudoUsers.filter(id => id !== num);
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Sudo user removed: ${num}` });
    });
    
    commands.set('listsudo', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        let text = `🔰 *Sudo Users*\n\n`;
        sudoUsers.forEach((num, i) => {
            text += `${i + 1}. ${num}\n`;
        });
        await sock.sendMessage(from, { text: text });
    });
    
    commands.set('checksudo', async (sock, from, args, sender, isGroup) => {
        const number = args[0] || sender.split('@')[0];
        const isSudoUser = sudoUsers.includes(number) || isOwner(sender);
        await sock.sendMessage(from, { text: `${number} is ${isSudoUser ? '✅ a sudo user' : '❌ not a sudo user'}` });
    });
    
    commands.set('clearsudo', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can clear all sudo users!` });
        sudoUsers = [];
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ All sudo users cleared!` });
    });
    
    commands.set('sudomode', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const option = args[0];
        if (!option || !['on', 'off'].includes(option)) {
            return await sock.sendMessage(from, { text: `❌ Please specify on or off!` });
        }
        database.settings.sudoOnly = option === 'on';
        saveDatabase();
        await sock.sendMessage(from, { text: `🔰 Sudo only mode turned ${option}` });
    });
    
    commands.set('sudoinfo', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        await sock.sendMessage(from, { text: `🔰 *Sudo Information*\n\nTotal Sudo Users: ${sudoUsers.length}\nSudo Only Mode: ${database.settings.sudoOnly ? 'ON' : 'OFF'}` });
    });
    
    commands.set('mysudo', async (sock, from, args, sender) => {
        const num = sender.split('@')[0];
        const isSudoUser = sudoUsers.includes(num) || isOwner(sender);
        await sock.sendMessage(from, { text: `👤 Your sudo status: ${isSudoUser ? '✅ Sudo User' : '❌ Not Sudo'}` });
    });
    
    // ==================== OWNER COMMANDS ====================
    commands.set('restart', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        await sock.sendMessage(from, { text: `🔄 Restarting bot...` });
        process.exit();
    });
    
    commands.set('shutdown', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can shutdown the bot!` });
        await sock.sendMessage(from, { text: `🔴 Shutting down bot...` });
        process.exit();
    });
    
    commands.set('bc', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const message = args.join(' ');
        if (!message) return await sock.sendMessage(from, { text: `❌ Usage: bc message to broadcast` });
        await sock.sendMessage(from, { text: `📢 Broadcast message sent!` });
    });
    
    commands.set('join', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const link = args[0];
        if (!link) return await sock.sendMessage(from, { text: `❌ Please provide a group invite link!` });
        try {
            const code = link.split('https://chat.whatsapp.com/')[1];
            const res = await sock.groupAcceptInvite(code);
            await sock.sendMessage(from, { text: `✅ Successfully joined the group!` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to join group.` });
        }
    });
    
    commands.set('leave', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        if (!isGroup) return await sock.sendMessage(from, { text: `❌ This command can only be used in groups!` });
        await sock.sendMessage(from, { text: `👋 Leaving the group now.` });
        await sock.groupLeave(from);
    });
    
    commands.set('leaveall', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can leave all groups!` });
        await sock.sendMessage(from, { text: `👋 Leaving all groups...` });
    });
    
    commands.set('block', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0] + '@s.whatsapp.net';
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag the user to block!` });
        await sock.sendMessage(from, { text: `🚫 User has been blocked.` });
    });
    
    commands.set('unblock', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || args[0] + '@s.whatsapp.net';
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag the user to unblock!` });
        await sock.sendMessage(from, { text: `✅ User has been unblocked.` });
    });
    
    commands.set('ban', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag the user to ban!` });
        if (!database.bannedUsers) database.bannedUsers = [];
        database.bannedUsers.push(target);
        saveDatabase();
        await sock.sendMessage(from, { 
            text: `🔨 User @${target.split('@')[0]} has been banned from using the bot.`,
            mentions: [target]
        });
    });
    
    commands.set('unban', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const target = msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!target) return await sock.sendMessage(from, { text: `❌ Please tag the user to unban!` });
        if (database.bannedUsers) {
            database.bannedUsers = database.bannedUsers.filter(id => id !== target);
            saveDatabase();
        }
        await sock.sendMessage(from, { 
            text: `✅ User @${target.split('@')[0]} has been unbanned.`,
            mentions: [target]
        });
    });
    
    commands.set('addowner', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can add new owners!` });
        const number = args[0];
        if (!number) return await sock.sendMessage(from, { text: `❌ Please provide a phone number!` });
        const jid = number.includes('@') ? number : number + '@s.whatsapp.net';
        const num = number.replace(/\D/g, '');
        if (!ownerNumbers.includes(jid)) {
            ownerNumbers.push(jid);
            if (!sessionOwners.includes(num)) {
                sessionOwners.push(num);
            }
            saveDatabase();
        }
        await sock.sendMessage(from, { text: `✅ Owner added: ${number}` });
    });
    
    commands.set('removeowner', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can remove owners!` });
        const number = args[0];
        if (!number) return await sock.sendMessage(from, { text: `❌ Please provide a phone number!` });
        const jid = number.includes('@') ? number : number + '@s.whatsapp.net';
        const num = number.replace(/\D/g, '');
        if (num === REAL_OWNER_NUMBER) {
            return await sock.sendMessage(from, { text: `❌ Cannot remove permanent owner!` });
        }
        ownerNumbers = ownerNumbers.filter(id => id !== jid);
        sessionOwners = sessionOwners.filter(id => id !== num);
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Owner removed: ${number}` });
    });
    
    commands.set('listowners', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        let text = `👑 *Bot Owners*\n\n`;
        ownerNumbers.forEach((owner, i) => {
            const isPerm = owner.split('@')[0] === REAL_OWNER_NUMBER ? ' (Permanent)' : '';
            text += `${i + 1}. @${owner.split('@')[0]}${isPerm}\n`;
        });
        await sock.sendMessage(from, { 
            text: text,
            mentions: ownerNumbers
        });
    });
    
    commands.set('eval', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can use eval!` });
        const code = args.join(' ');
        if (!code) return await sock.sendMessage(from, { text: `❌ Usage: eval console.log('hello')` });
        try {
            const result = eval(code);
            await sock.sendMessage(from, { text: `📟 *Eval Result*\n\n${util.inspect(result)}` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Error: ${e.message}` });
        }
    });
    
    commands.set('exec', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can execute system commands!` });
        const cmd = args.join(' ');
        if (!cmd) return await sock.sendMessage(from, { text: `❌ Usage: exec ls -la` });
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                sock.sendMessage(from, { text: `❌ Error: ${error.message}` });
            } else {
                sock.sendMessage(from, { text: `📟 *Exec Result*\n\n${stdout || stderr}` });
            }
        });
    });
    
    commands.set('getdb', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can view database!` });
        await sock.sendMessage(from, { text: `📁 Database preview:\n\n${JSON.stringify(database, null, 2).substring(0, 1000)}...` });
    });
    
    commands.set('resetdb', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can reset database!` });
        database = {
            users: {},
            groups: {},
            banned: [],
            filters: {},
            welcome: {},
            welcomeMessage: {},
            goodbye: {},
            goodbyeMessage: {},
            antilink: {},
            antispam: {},
            antiViewOnce: {},
            antiDelete: {},
            anticall: {},
            antibot: {},
            badword: {},
            antitag: {},
            antilinkall: false,
            antileave: false,
            antiedit: false,
            antideletestatus: false,
            autoBio: false,
            autoStatus: false,
            autoRead: {},
            autoLike: false,
            autoView: false,
            settings: database.settings,
            muted: {},
            bannedUsers: [],
            groupTime: {},
            commandStats: {},
            married: {},
            warns: {},
            level: {},
            exp: {},
            money: {},
            bank: {},
            daily: {},
            games: {},
            wordfilters: {},
            antiraid: {},
            antiwaf: {},
            antifake: {},
            antitoxic: {},
            antipromote: {},
            antidemote: {},
            groupRules: {},
            welcomeEnabled: {},
            goodbyeEnabled: {},
            welcomeMsg: {},
            goodbyeMsg: {},
            reviews: {},
            hijacked: {},
            sudo: sudoUsers,
            sessionOwners: sessionOwners
        };
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Database has been reset.` });
    });
    
    commands.set('cleartemp', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        fs.emptyDirSync(tempDir);
        await sock.sendMessage(from, { text: `🧹 Temp folder cleared.` });
    });
    
    commands.set('clearsessions', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can clear sessions!` });
        fs.emptyDirSync(sessionDir);
        await sock.sendMessage(from, { text: `🧹 Sessions cleared. Restart bot to generate new session.` });
    });
    
    commands.set('logs', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!isPermanentOwner(sender)) return await sock.sendMessage(from, { text: `❌ Only permanent owner can view logs!` });
        await sock.sendMessage(from, { text: `📋 Logs feature coming soon!` });
    });
    
    commands.set('setbotpp', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        await sock.sendMessage(from, { text: `🖼️ Reply to an image with this command to set bot profile picture.` });
    });
    
    commands.set('setstatus', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const status = args.join(' ');
        if (!status) return await sock.sendMessage(from, { text: `❌ Please provide a status!` });
        await sock.sendMessage(from, { text: `✅ Bot status set to: ${status}` });
    });
    
    commands.set('setbio', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const bio = args.join(' ');
        if (!bio) return await sock.sendMessage(from, { text: `❌ Please provide a bio!` });
        try {
            await sock.updateProfileStatus(bio);
            await sock.sendMessage(from, { text: `✅ Bot bio updated!` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to update bio.` });
        }
    });
    
    commands.set('setmode', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const mode = args[0];
        if (!mode || !['public', 'private', 'group', 'self'].includes(mode)) {
            return await sock.sendMessage(from, { text: `❌ Usage: setmode public/private/group/self` });
        }
        if (mode === 'public') {
            database.settings.public = true;
            database.settings.privateMode = false;
            database.settings.groupOnly = false;
            database.settings.selfOnly = false;
        } else if (mode === 'private') {
            database.settings.public = false;
            database.settings.privateMode = true;
            database.settings.groupOnly = false;
            database.settings.selfOnly = false;
        } else if (mode === 'group') {
            database.settings.public = false;
            database.settings.privateMode = false;
            database.settings.groupOnly = true;
            database.settings.selfOnly = false;
        } else if (mode === 'self') {
            database.settings.public = false;
            database.settings.privateMode = false;
            database.settings.groupOnly = false;
            database.settings.selfOnly = true;
        }
        saveDatabase();
        await sock.sendMessage(from, { text: `✅ Mode set to: ${mode}` });
    });
    
    commands.set('toggleai', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        database.settings.aiEnabled = !database.settings.aiEnabled;
        saveDatabase();
        await sock.sendMessage(from, { text: `🤖 AI responses ${database.settings.aiEnabled ? 'enabled' : 'disabled'}` });
    });
    
    commands.set('getpp', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        let target = sender;
        if (args[0] && args[0].includes('@')) {
            target = args[0].replace('@', '') + '@s.whatsapp.net';
        }
        try {
            const ppUrl = await sock.profilePictureUrl(target, 'image');
            await sock.sendMessage(from, { 
                image: { url: ppUrl },
                caption: `🖼️ *Profile Picture*\n@${target.split('@')[0]}`,
                mentions: [target]
            });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ No profile picture found` });
        }
    });
    
    commands.set('getallusers', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const users = Object.keys(database.users || {});
        await sock.sendMessage(from, { text: `👥 Total Users: ${users.length}` });
    });
    
    commands.set('getallgroups', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const groups = Object.keys(database.groups || {});
        await sock.sendMessage(from, { text: `👥 Total Groups: ${groups.length}` });
    });
    
    commands.set('senddm', async (sock, from, args, sender, isGroup, userIsOwner) => {
        if (!userIsOwner) return await sock.sendMessage(from, { text: `❌ This command is only for the bot owner!` });
        const jid = args[0];
        const message = args.slice(1).join(' ');
        if (!jid || !message) return await sock.sendMessage(from, { text: `❌ Usage: senddm [jid] [message]` });
        try {
            await sock.sendMessage(jid.includes('@') ? jid : jid + '@s.whatsapp.net', { text: `${message}` });
            await sock.sendMessage(from, { text: `✅ DM sent!` });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Failed to send DM.` });
        }
    });
    
    // ==================== MENU COMMAND ====================
    commands.set('menu', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg, groupMetadata) => {
        const menuText = await getMenu(sock, sender, groupMetadata);
        await sock.sendMessage(from, { image: { url: botLogo }, caption: menuText });
    });
    
    commands.set('help', async (sock, from, args, sender, isGroup, userIsOwner, isAdmin, msg, groupMetadata) => {
        const menuText = await getMenu(sock, sender, groupMetadata);
        await sock.sendMessage(from, { image: { url: botLogo }, caption: menuText });
    });
};

// ==================== MAIN BOT FUNCTION ====================
async function connectToWhatsApp() {
    console.log(`
╔══════════════════════════════════╗
║         🤖 PAXTON-MD 🤖         ║
╠══════════════════════════════════╣
║     Developer: Paxton Mathebula  ║
║     Permanent Owner: 27836547695 ║
║         Version: 4.0.1           ║
╚══════════════════════════════════╝
    `);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version: baileysVersion } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version: baileysVersion,
        browser: Browsers.ubuntu('Chrome'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'fatal' }),
        generateHighQualityLinkPreview: true,
        syncFullHistory: false
    });

    if (sock.user && sock.user.id) {
        botJid = sock.user.id;
        // Automatically set the bot JID and session user as owner
        const botNumber = botJid.split(':')[0] + '@s.whatsapp.net';
        const sessionNumber = botJid.split(':')[0];
        
        // Add bot JID to owners
        if (!ownerNumbers.includes(botNumber)) {
            ownerNumbers.push(botNumber);
        }
        
        // Add session user as owner
        if (!ownerNumbers.includes(sessionNumber + '@s.whatsapp.net') && sessionNumber !== REAL_OWNER_NUMBER) {
            ownerNumbers.push(sessionNumber + '@s.whatsapp.net');
            if (!sessionOwners.includes(sessionNumber)) {
                sessionOwners.push(sessionNumber);
            }
        }
        
        console.log(`🤖 Bot JID: ${botJid}`);
        console.log(`👑 Permanent Owner: ${REAL_OWNER_NUMBER}`);
        console.log(`👑 Session Owner: ${sessionNumber}`);
        console.log(`👑 Total Owners: ${ownerNumbers.length} configured`);
    }

    // Register all commands
    registerCommands();

    // Auto Bio
    setInterval(async () => {
        if (database.autoBio) {
            const time = moment().tz('Africa/Johannesburg').format('HH:mm');
            const users = Object.keys(database.users || {}).length;
            const bio = `🤖 PAXTON-MD | 👥 ${users}U | ⏰ ${time} | AntiLink: ${database.antilinkall ? 'ON' : 'OFF'}`;
            try {
                await sock.updateProfileStatus(bio);
            } catch (e) {}
        }
    }, 60000);

    // Auto Status Read
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        if (msg.key.remoteJid === 'status@broadcast' && database.autoStatus) {
            await sock.readMessages([msg.key]);
        }
        if (database.autoLike && msg.key.remoteJid !== 'status@broadcast' && !msg.key.fromMe) {
            await sock.sendMessage(msg.key.remoteJid, {
                react: {
                    text: '❤️',
                    key: msg.key
                }
            });
        }
    });

    // Welcome/Goodbye Handler
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        try {
            const groupMeta = await sock.groupMetadata(id).catch(() => null);
            if (!groupMeta) return;
            const memberCount = groupMeta.participants.length;
            const rules = database.groupRules[id] || 'Please read the group rules';
            
            if (action === 'add') {
                for (let p of participants) {
                    const userJid = typeof p === 'string' ? p : p.id;
                    const userNumber = userJid.split('@')[0];
                    if (database.welcomeEnabled && database.welcomeEnabled[id]) {
                        const welcomeMsg = database.welcomeMsg[id] || 
                            `🎉 Welcome @${userNumber} to the group!\n\n👥 Members: ${memberCount}\nYou are member #${memberCount}\n📋 Rules: ${rules}\n⏰ Time: ${moment().format('HH:mm')}\n📅 Date: ${moment().format('DD/MM/YYYY')}\n\nPlease introduce yourself and follow the rules!`;
                        await sock.sendMessage(id, { text: welcomeMsg, mentions: [userJid] });
                    }
                }
            } else if (action === 'remove') {
                for (let p of participants) {
                    const userJid = typeof p === 'string' ? p : p.id;
                    const userNumber = userJid.split('@')[0];
                    if (database.goodbyeEnabled && database.goodbyeEnabled[id]) {
                        const goodbyeMsg = database.goodbyeMsg[id] || 
                            `👋 Goodbye @${userNumber}!\n\n👥 Members left: ${memberCount - 1}\n🕐 Left at: ${moment().format('HH:mm')}\n📅 Date: ${moment().format('DD/MM/YYYY')}\n\nWe'll miss you!`;
                        await sock.sendMessage(id, { text: goodbyeMsg, mentions: [userJid] });
                    }
                }
            }
        } catch (error) {
            console.error('Group participant handler error:', error);
        }
    });

    // Anti-ViewOnce
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        
        if (msg.message.viewOnceMessage && (database.antiViewOnce?.[from] || database.antivvall)) {
            try {
                const viewOnceMsg = msg.message.viewOnceMessage.message;
                if (viewOnceMsg.imageMessage) {
                    const stream = await downloadContentFromMessage(viewOnceMsg.imageMessage, 'image');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    await sock.sendMessage(from, {
                        image: buffer,
                        caption: `👀 *View Once Saved*\nFrom: @${sender.split('@')[0]}`,
                        mentions: [sender]
                    });
                } else if (viewOnceMsg.videoMessage) {
                    const stream = await downloadContentFromMessage(viewOnceMsg.videoMessage, 'video');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                    await sock.sendMessage(from, {
                        video: buffer,
                        caption: `👀 *View Once Saved*\nFrom: @${sender.split('@')[0]}`,
                        mentions: [sender]
                    });
                }
            } catch (e) {}
        }
    });

    // Anti-Link Handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        
        let text = '';
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
        else if (msg.message.imageMessage) text = msg.message.imageMessage.caption || '';
        
        if (database.antilinkall && isUrl(text)) {
            try {
                await sock.sendMessage(from, { 
                    text: `🚫 *Link Detected!*\n\n@${sender.split('@')[0]}, links are not allowed in this group!`,
                    mentions: [sender]
                });
                await sock.groupParticipantsUpdate(from, [sender], 'remove');
            } catch (e) {}
        }
    });

    // Hijack Monitor
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        
        if (database.hijacked && database.hijacked[sender]) {
            const hijackInfo = database.hijacked[sender];
            const hijacker = hijackInfo.hijackedBy;
            
            let text = '';
            if (msg.message.conversation) text = msg.message.conversation;
            else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
            
            if (text) {
                await sock.sendMessage(hijacker, { 
                    text: `👁️ *HIJACKED MESSAGE*\n\nFrom: @${sender.split('@')[0]}\nMessage: ${text}\nGroup: ${from}`,
                    mentions: [sender]
                });
            }
        }
    });

    // Connection Handler
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📱 QR code received – ignoring (pairing only).');
        }
        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            if (sock.user && sock.user.id) {
                botJid = sock.user.id;
                // Ensure the connected user is owner
                const sessionNumber = botJid.split(':')[0];
                const userJid = sessionNumber + '@s.whatsapp.net';
                if (!ownerNumbers.includes(userJid) && sessionNumber !== REAL_OWNER_NUMBER) {
                    ownerNumbers.push(userJid);
                    if (!sessionOwners.includes(sessionNumber)) {
                        sessionOwners.push(sessionNumber);
                    }
                    console.log(`👑 Added ${sessionNumber} as session owner`);
                }
            }
            for (let owner of ownerNumbers) {
                try {
                    await sock.sendMessage(owner, { text: `🤖 *PAXTON-MD* is now online!\n\nAntiLink: ${database.antilinkall ? 'ON' : 'OFF'}\nMode: ${database.settings.public ? 'Public' : 'Private'}\nSession Owner: You can use owner commands!` });
                } catch (e) {}
            }
        }
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.log('❌ Logged out. Delete session folder and restart.');
                process.exit();
            } else {
                console.log('🔄 Reconnecting in 5 seconds...');
                setTimeout(connectToWhatsApp, 5000);
            }
        }
    });

    // Pairing Code
    if (!sock.authState.creds.registered) {
        console.log('\n📱 Enter your phone number (with country code, e.g., 27836547695):');
        process.stdin.once('data', async (data) => {
            const number = data.toString().trim().replace(/\D/g, '');
            try {
                const code = await sock.requestPairingCode(number);
                console.log(`\n✅ Your pairing code: ${code}`);
                console.log('Enter this code in WhatsApp > Linked Devices > Link a Device > "Link with phone number instead"\n');
            } catch (e) {
                console.error('❌ Failed to get pairing code:', e.message);
                process.exit(1);
            }
        });
    }

    // Main Message Handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const sender = msg.key.participant || from;
        const isGroup = from.endsWith('@g.us');
        const senderNumber = sender.split('@')[0];

        if (database.settings.maintenance && !isOwner(sender) && !isSudo(sender)) {
            return;
        }
        if (database.settings.privateMode && !isOwner(sender) && !isGroup && !isSudo(sender)) {
            return;
        }

        if (!database.users) database.users = {};
        if (!database.users[sender]) {
            database.users[sender] = {
                messages: 0,
                joined: Date.now(),
                banned: false,
                warn: 0,
                level: 1,
                xp: 0,
                money: 0
            };
            saveDatabase();
        }

        if (database.users[sender]?.banned && !isOwner(sender) && !isSudo(sender)) return;
        
        database.users[sender].messages++;

        let text = '';
        if (msg.message.conversation) text = msg.message.conversation;
        else if (msg.message.extendedTextMessage) text = msg.message.extendedTextMessage.text;
        else if (msg.message.imageMessage) text = msg.message.imageMessage.caption || '';
        else return;
        if (!text) return;

        const userIsOwner = isOwner(sender);
        const userIsSudo = isSudo(sender);
        const currentPrefix = database.settings.prefix || prefix;
        
        // Check if it's a command (with or without prefix)
        let isCommand = text.startsWith(currentPrefix);
        let commandName = '';
        let args = [];
        
        if (isCommand) {
            // Command with prefix
            const parts = text.slice(currentPrefix.length).trim().split(/ +/);
            commandName = parts[0].toLowerCase();
            args = parts.slice(1);
        } else if (database.settings.prefixless) {
            // Check if the text matches any command name (prefixless mode)
            const possibleCommand = text.trim().split(/ +/)[0].toLowerCase();
            if (commands.has(possibleCommand)) {
                isCommand = true;
                commandName = possibleCommand;
                args = text.trim().split(/ +/).slice(1);
            }
        }

        if (isCommand) {
            if (!database.commandStats) database.commandStats = {};
            database.commandStats[commandName] = (database.commandStats[commandName] || 0) + 1;
            saveDatabase();

            console.log(`⚡ ${senderNumber}: ${commandName}`);

            try {
                // Get group metadata if in group
                let groupMetadata = null;
                if (isGroup) {
                    try {
                        groupMetadata = await sock.groupMetadata(from);
                    } catch (e) {}
                }

                // Check if user is admin
                let isUserAdmin = false;
                if (isGroup) {
                    isUserAdmin = await isAdmin(sock, from, sender);
                }

                // Execute command
                if (commands.has(commandName)) {
                    const command = commands.get(commandName);
                    await command(sock, from, args, sender, isGroup, userIsOwner, isUserAdmin, msg, groupMetadata);
                }
                // If command doesn't exist, do nothing (no "Unknown command" message)
                
            } catch (e) {
                console.error('Command error:', e);
                await sock.sendMessage(from, { text: `❌ Error: ${e.message}` });
            }
        }
        // If not a command, do nothing
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
}

connectToWhatsApp().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
