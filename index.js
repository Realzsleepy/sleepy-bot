require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder
} = require('discord.js');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const app = express();
app.set('view engine', 'ejs');
app.set('views', './website/views');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('website/public'));

// ================= FILES =================
const COMMANDS_FILE = './commands.json';
const WARNS_FILE = './warns.json';

if (!fs.existsSync(COMMANDS_FILE)) fs.writeFileSync(COMMANDS_FILE, '{}');
if (!fs.existsSync(WARNS_FILE)) fs.writeFileSync(WARNS_FILE, '{}');

const loadCommands = () => JSON.parse(fs.readFileSync(COMMANDS_FILE));
const saveCommands = d => fs.writeFileSync(COMMANDS_FILE, JSON.stringify(d, null, 2));
const loadWarns = () => JSON.parse(fs.readFileSync(WARNS_FILE));
const saveWarns = d => fs.writeFileSync(WARNS_FILE, JSON.stringify(d, null, 2));

// ================= LOG CHANNEL FUNCTION =================
async function logAction(guild, title, description) {
  const channelId = process.env.LOG_CHANNEL_ID;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('Orange')
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
}

// ================= SLASH COMMANDS =================
async function registerCommands() {
  const custom = loadCommands();

  const base = [
    new SlashCommandBuilder().setName('warn').setDescription('Warn user')
      .addUserOption(o => o.setName('user').setRequired(true).setDescription('User'))
      .addStringOption(o => o.setName('reason').setRequired(true).setDescription('Reason')),

    new SlashCommandBuilder().setName('warncount').setDescription('Check warns')
      .addUserOption(o => o.setName('user').setRequired(true).setDescription('User')),

    new SlashCommandBuilder().setName('kick').setDescription('Kick user')
      .addUserOption(o => o.setName('user').setRequired(true).setDescription('User')),

    new SlashCommandBuilder().setName('ban').setDescription('Ban user')
      .addUserOption(o => o.setName('user').setRequired(true).setDescription('User')),

    new SlashCommandBuilder().setName('timeout').setDescription('Timeout user')
      .addUserOption(o => o.setName('user').setRequired(true).setDescription('User'))
      .addIntegerOption(o => o.setName('minutes').setRequired(true).setDescription('Minutes'))
  ];

  const customSlash = Object.keys(custom).map(name =>
    new SlashCommandBuilder().setName(name).setDescription('Custom command')
  );

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [...base, ...customSlash].map(c => c.toJSON()) });

  console.log('Slash commands registered');
}

// ================= BOT =================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const warns = loadWarns();
  const commands = loadCommands();
  const guildId = interaction.guildId;
  const guild = interaction.guild;

  if (commands[interaction.commandName])
    return interaction.reply(commands[interaction.commandName]);

  if (interaction.commandName === 'warn') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: 'No permission', ephemeral: true });

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    if (!warns[guildId]) warns[guildId] = {};
    if (!warns[guildId][user.id]) warns[guildId][user.id] = [];

    warns[guildId][user.id].push({ reason, date: new Date().toLocaleString() });
    saveWarns(warns);

    user.send(`⚠️ You were warned: ${reason}`).catch(() => {});
    interaction.reply(`Warned ${user.tag}`);

    logAction(guild, 'User Warned', `${user.tag} warned for: ${reason}`);
  }

  if (interaction.commandName === 'warncount') {
    const user = interaction.options.getUser('user');
    const userWarns = warns[guildId]?.[user.id] || [];
    if (!userWarns.length) return interaction.reply(`${user.tag} has no warns.`);
    interaction.reply(userWarns.map((w,i)=>`${i+1}. ${w.reason} (${w.date})`).join('\n'));
  }

  if (interaction.commandName === 'kick') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers))
      return interaction.reply({ content: 'No permission', ephemeral: true });

    const user = interaction.options.getUser('user');
    await guild.members.kick(user.id);
    interaction.reply('User kicked.');
    logAction(guild, 'User Kicked', user.tag);
  }

  if (interaction.commandName === 'ban') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
      return interaction.reply({ content: 'No permission', ephemeral: true });

    const user = interaction.options.getUser('user');
    await guild.members.ban(user.id);
    interaction.reply('User banned.');
    logAction(guild, 'User Banned', user.tag);
  }

  if (interaction.commandName === 'timeout') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers))
      return interaction.reply({ content: 'No permission', ephemeral: true });

    const user = interaction.options.getUser('user');
    const minutes = interaction.options.getInteger('minutes');
    const member = await guild.members.fetch(user.id);
    await member.timeout(minutes * 60000);

    interaction.reply(`User timed out for ${minutes} minutes.`);
    logAction(guild, 'User Timed Out', `${user.tag} for ${minutes} minutes`);
  }
});

client.once('ready', () => {
  console.log('Bot online');
  registerCommands();
});

client.login(process.env.TOKEN);

// ================= WEBSITE LOGIN =================
app.use(session({ secret: 'sleepy_secret', resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((o,d)=>d(null,o));

passport.use(new DiscordStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "https://sleepy-bot-wiia.onrender.com/auth/discord/callback",
  scope: ['identify']
}, (a,r,p,done)=>done(null,p)));

function checkAuth(req,res,next){ if(!req.user) return res.redirect('/login'); next(); }

app.get('/login', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord',{failureRedirect:'/'}),(req,res)=>res.redirect('/'));
app.get('/logout',(req,res)=>req.logout(()=>res.redirect('/')));

// ================= WEBSITE =================
app.get('/', (req, res) => {
  if (!req.user) {
    return res.send(`
      <body style="background:#111827;color:white;font-family:Arial;text-align:center;padding-top:100px;">
        <h1>Sleepy Bot Dashboard</h1>
        <a href="/auth/discord"
        style="background:#5865F2;padding:15px 25px;border-radius:10px;color:white;text-decoration:none;">
        Login with Discord
        </a>
      </body>
    `);
  }

  res.render('dashboard', {
    user: req.user
  });
});

// SEARCH WARNS
app.get('/warns', checkAuth, async (req,res)=>{
  const search = req.query.user;
  const warns = loadWarns();
  let html = '<link rel="stylesheet" href="/style.css"><h2>Warns</h2>';

  for(const guild in warns){
    for(const userId in warns[guild]){
      if(search && userId !== search) continue;
      const user = await client.users.fetch(userId).catch(()=>null);
      const tag = user ? user.tag : userId;

      html += `<h3>${tag}</h3><ul>`;
      warns[guild][userId].forEach((w,i)=>{
        html += `<li>${w.reason} (${w.date})
        <form method="POST" action="/delete-warn">
        <input type="hidden" name="guild" value="${guild}">
        <input type="hidden" name="user" value="${userId}">
        <input type="hidden" name="index" value="${i}">
        <button>Delete</button></form></li>`;
      });
      html+='</ul>';
    }
  }
  html+=`<form><input name="user" placeholder="Search by User ID"><button>Search</button></form>`;
  res.send(html+'<a href="/">Back</a>');
});

app.post('/delete-warn', checkAuth, (req,res)=>{
  const warns = loadWarns();
  warns[req.body.guild][req.body.user].splice(req.body.index,1);
  saveWarns(warns);
  res.redirect('/warns');
});

app.listen(3000,()=>console.log('Website running on port 3000'));