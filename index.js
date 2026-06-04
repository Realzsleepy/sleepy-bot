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
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
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
const SETTINGS_FILE = './settings.json';
const MODLOGS_FILE = './modlogs.json';

if (!fs.existsSync(MODLOGS_FILE))
  fs.writeFileSync(MODLOGS_FILE, '[]');

const loadModLogs = () =>
  JSON.parse(fs.readFileSync(MODLOGS_FILE));

const saveModLogs = d =>
  fs.writeFileSync(MODLOGS_FILE, JSON.stringify(d,null,2));

if (!fs.existsSync(SETTINGS_FILE))
  fs.writeFileSync(SETTINGS_FILE, '{}');

const loadSettings = () =>
  JSON.parse(fs.readFileSync(SETTINGS_FILE));

const saveSettings = d =>
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(d,null,2));

app.get('/settings', checkAuth, (req,res)=>{

  const settings = loadSettings();

  res.send(`
  <body style="background:#111827;color:white;font-family:Arial;padding:30px">

  <h1>Settings</h1>

  <form method="POST" action="/settings">

  Log Channel ID<br>
  <input name="logChannel"
  value="${settings.logChannel || ''}">

  <br><br>

  Anti Links

  <input type="checkbox"
  name="antiLinks"
  ${settings.antiLinks ? 'checked' : ''}>

  <br><br>

  Anti Spam

  <input type="checkbox"
  name="antiSpam"
  ${settings.antiSpam ? 'checked' : ''}>

  <br><br>

  <button>Save</button>

  </form>

  <br>

  <a href="/">Back</a>

  </body>
  `);
});

app.get('/settings', checkAuth, (req,res)=>{

  const settings = loadSettings();

  res.send(`
  <body style="
    background:#111827;
    color:white;
    font-family:Arial;
    padding:30px;
  ">

  <h1>⚙ AutoMod Settings</h1>

  <form method="POST" action="/settings">

    <h3>Log Channel ID</h3>

    <input
      name="logChannel"
      value="${settings.logChannel || ''}"
      style="width:300px">

    <br><br><hr><br>

    <label>
      <input
        type="checkbox"
        name="antiLinks"
        ${settings.antiLinks ? 'checked' : ''}>
      Anti Links
    </label>

    <br><br>

    <label>
      <input
        type="checkbox"
        name="antiSpam"
        ${settings.antiSpam ? 'checked' : ''}>
      Anti Spam
    </label>

    <br><br>

    <label>
      <input
        type="checkbox"
        name="capsFilter"
        ${settings.capsFilter ? 'checked' : ''}>
      Caps Filter
    </label>

    <br><br>

    <button>Save Settings</button>

  </form>

  <br>

  <a href="/">Back</a>

  </body>
  `);
});

// ================= LOG CHANNEL FUNCTION =================
async function logAction(guild, title, description) {

  const logs = loadModLogs();

  logs.unshift({
    title,
    description,
    guild: guild.name,
    date: new Date().toLocaleString()
  });

  saveModLogs(logs);

  const channelId = process.env.LOG_CHANNEL_ID;

  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);

  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('Orange')
    .setTimestamp();

  channel.send({
    embeds:[embed]
  }).catch(()=>{});
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

client.on('messageCreate', async message => {

  if(message.author.bot) return;
  if(!message.guild) return;

  const settings = loadSettings();

  // ANTI LINKS
  if(settings.antiLinks){

    const linkRegex = /(https?:\/\/|www\.)/i;

    if(linkRegex.test(message.content)){

      await message.delete().catch(()=>{});

      logAction(
        message.guild,
        'Anti Link',
        `${message.author.tag} posted a link`
      );

      return;
    }
  }

  // ANTI SPAM
  if(settings.antiSpam){

    if(message.content.length > 300){

      await message.delete().catch(()=>{});

      logAction(
        message.guild,
        'Anti Spam',
        `${message.author.tag} triggered spam filter`
      );

      return;
    }
  }

  // CAPS FILTER
  if(settings.capsFilter){

    const text =
      message.content.replace(/[^a-zA-Z]/g,'');

    if(text.length > 8){

      const caps =
        text.split('').filter(
          c => c === c.toUpperCase()
        ).length;

      const percent =
        (caps / text.length) * 100;

      if(percent > 70){

        await message.delete().catch(()=>{});

        logAction(
          message.guild,
          'Caps Filter',
          `${message.author.tag} used excessive caps`
        );

        return;
      }
    }
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

function checkAuth(req,res,next){
  if(!req.user) return res.redirect('/auth/discord');
  next();
}

app.get('/auth/discord', passport.authenticate('discord'));
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

  const commands = loadCommands();
const warns = loadWarns();

let warnCount = 0;

for (const guild in warns) {
  for (const user in warns[guild]) {
    warnCount += warns[guild][user].length;
  }
}

res.render('dashboard', {
  user: req.user,
  stats: {
    commands: Object.keys(commands).length,
    warns: warnCount,
    guilds: client.guilds.cache.size
  }
});
});

// SEARCH WARNS
app.get('/warns', checkAuth, async (req, res) => {
  username.toLowerCase().includes(
   search.toLowerCase()
  )

  let html = `
  <body style="background:#111827;color:white;font-family:Arial;padding:30px">
  <h1>Manage Warns</h1>
  `;

  for (const guildId in warns) {
    for (const userId in warns[guildId]) {

      const user = await client.users.fetch(userId).catch(() => null);
      const username = user ? user.username : userId;
      if(search){

  const searchText =
    search.toLowerCase();

  if(
    !username.toLowerCase().includes(searchText) &&
    !userId.includes(searchText)
  ){
    continue;
  }
}

      html += `
      <div style="
        background:#1f2937;
        padding:15px;
        margin-bottom:20px;
        border-radius:12px;
      ">
      <h2>${username}</h2>
      `;

      warns[guildId][userId].forEach((warn, index) => {
        html += `
        <div style="
          background:#374151;
          padding:10px;
          margin:10px 0;
          border-radius:8px;
        ">
          ${warn.reason}<br>
          <small>${warn.date}</small>

          <form method="POST" action="/delete-warn">
            <input type="hidden" name="guild" value="${guildId}">
            <input type="hidden" name="user" value="${userId}">
            <input type="hidden" name="index" value="${index}">
            <button>Delete Warn</button>
          </form>
        </div>
        `;
      });

      html += `</div>`;
    }
  }

  html += `<a href="/">Back to Dashboard</a></body>`;

  res.send(html);
  html += `
<form>
  <input
    name="user"
    placeholder="Username or User ID"
    value="${search}">
  <button>Search</button>
</form>

<br>

<a href="/">Back to Dashboard</a>
`;
});

app.post('/delete-warn', checkAuth, (req,res)=>{
  app.use(express.urlencoded({ extended: true }));
  const warns = loadWarns();
  warns[req.body.guild][req.body.user].splice(req.body.index,1);
  saveWarns(warns);
  res.redirect('/warns');
});

app.get('/commands', checkAuth, (req, res) => {

  const custom = loadCommands();

  const builtIn = [
    "warn",
    "warncount",
    "kick",
    "ban",
    "timeout"
  ];

  let html = `
  <body style="background:#111827;color:white;font-family:Arial;padding:30px">
  <h1>Commands</h1>

  <h2>Built-In Commands</h2>
  <ul>
  `;

  builtIn.forEach(cmd=>{
    html += `<li>/${cmd}</li>`;
  });

  html += `
  </ul>

  <h2>Custom Commands</h2>
  <ul>
  `;

  for(const cmd in custom){
    html += `
    <li>
      /${cmd} → ${custom[cmd]}
    </li>
    `;
  }

  html += `
  </ul>

  <h2>Create Custom Command</h2>

  <form method="POST" action="/create-command">
    <input name="name" placeholder="Command name" required>
    <br><br>
    <input name="response" placeholder="Response" required>
    <br><br>
    <button>Create Command</button>
  </form>

  <br>
  <a href="/">Back</a>
  </body>
  `;

  res.send(html);
});

app.post('/create-command', checkAuth, (req,res)=>{

  const commands = loadCommands();

  commands[req.body.name.toLowerCase()] =
    req.body.response;

  saveCommands(commands);

  registerCommands();

  res.redirect('/commands');
});

app.get('/moderation', checkAuth, (req,res)=>{

  res.send(`
  <body style="background:#111827;color:white;font-family:Arial;padding:30px">

  <h1>Moderation Panel</h1>

  <form method="POST" action="/kick-user">
    <input name="userid" placeholder="User ID">
    <button>Kick User</button>
  </form>

  <br>

  <form method="POST" action="/ban-user">
    <input name="userid" placeholder="User ID">
    <button>Ban User</button>
  </form>
  <form method="POST" action="/timeout-user">

  <input
  name="user"
  placeholder="Username">

  <input
  name="minutes"
  placeholder="Minutes"
  style="width:80px">

  <button>Timeout</button>

  </form>

  <br>

  <form method="POST" action="/timeout-user">
    <input name="userid" placeholder="User ID">
    <input name="minutes" placeholder="Minutes">
    <button>Timeout User</button>
  </form>

  <br>
  <a href="/">Back</a>

  </body>
  `);
});

app.get('/modlogs', checkAuth, (req,res)=>{

  const logs = loadModLogs();

  let html = `
  <body style="
  background:#111827;
  color:white;
  font-family:Arial;
  padding:30px">

  <h1>Mod Logs</h1>
  `;

  logs.forEach(log=>{

    html += `
    <div style="
      background:#1f2937;
      padding:15px;
      margin-bottom:15px;
      border-radius:10px;
    ">
      <h3>${log.title}</h3>
      <p>${log.description}</p>
      <small>${log.guild}</small><br>
      <small>${log.date}</small>
    </div>
    `;
  });

  html += `<a href="/">Back</a></body>`;

  res.send(html);
});

app.post('/timeout-user', checkAuth, async (req,res)=>{

  const guild =
    client.guilds.cache.first();

  const member =
    await guild.members.fetch(
      req.body.userId
    );

  const minutes =
    Number(req.body.minutes);

  await member.timeout(
    minutes * 60000
  );

  logAction(
    guild,
    'Dashboard Timeout',
    `${member.user.tag} (${minutes} minutes)`
  );

  res.redirect('/moderation');
});

app.listen(3000,()=>console.log('Website running on port 3000'));