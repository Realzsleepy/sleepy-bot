require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// SESSION
app.use(session({
  secret: 'sleepy_secret',
  resave: false,
  saveUninitialized: false
}));

// PASSPORT
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// DISCORD STRATEGY
passport.use(new DiscordStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "https://sleepy-bot-wiia.onrender.com/auth/discord/callback",
  scope: ["identify"]
},
function(accessToken, refreshToken, profile, done) {
  process.nextTick(function() {
    return done(null, profile);
  });
}));

// HELPERS
const COMMANDS_PATH = path.join(__dirname, '../commands.json');

function getCommands() {
  return JSON.parse(fs.readFileSync(COMMANDS_PATH, 'utf8'));
}

function saveCommands(commands) {
  fs.writeFileSync(COMMANDS_PATH, JSON.stringify(commands, null, 2));
}

// ================= ROUTES =================

// HOME
app.get('/', (req, res) => {
  if (!req.user) {
    return res.send('<a href="/auth/discord">Login with Discord</a>');
  }

  res.send(`
    <h2>Welcome ${req.user.username}</h2>
    <a href="/create-command">Create Command</a><br>
    <a href="/commands">View Commands</a><br>
    <a href="/warns">View Warns</a><br><br>
    <a href="/logout">Logout</a>
  `);
});

// LOGIN
app.get('/auth/discord',
  passport.authenticate('discord', {
    scope: ['identify']
  })
);

app.get('/auth/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: '/'
  }),
  function(req, res) {
    res.redirect('/');
  }
);

// LOGOUT
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// CREATE COMMAND
app.get('/create-command', (req, res) => {
  if (!req.user) return res.redirect('/');

  res.send(`
    <h2>Create Command</h2>
    <form method="POST">
      Command name:<br>
      <input name="name" required><br><br>
      Response:<br>
      <input name="response" required><br><br>
      <button>Create</button>
    </form>
    <br><a href="/">Back</a>
  `);
});

app.post('/create-command', (req, res) => {
  if (!req.user) return res.redirect('/');

  const commands = getCommands();
  commands[req.body.name.toLowerCase()] = req.body.response;
  saveCommands(commands);

  res.redirect('/commands');
});

// LIST COMMANDS
app.get('/commands', (req, res) => {
  if (!req.user) return res.redirect('/');

  const commands = getCommands();
  let list = Object.keys(commands).map(cmd => `
    <li>
      <b>!${cmd}</b> — ${commands[cmd]}
      <form method="POST" action="/delete-command" style="display:inline">
        <input type="hidden" name="name" value="${cmd}">
        <button>Delete</button>
      </form>
    </li>
  `).join('');

  res.send(`
    <h2>Commands</h2>
    <ul>${list}</ul>
    <a href="/">Back</a>
  `);
});

// DELETE COMMAND
app.post('/delete-command', (req, res) => {
  const commands = getCommands();
  delete commands[req.body.name];
  saveCommands(commands);
  res.redirect('/commands');
});

// START
app.get('/warns', (req, res) => {
  if (!req.user) return res.redirect('/');

  const warns = JSON.parse(fs.readFileSync('../warns.json'));
  let html = '<h2>User Warns</h2><ul>';

  for (const userId in warns) {
    html += `<li><b>User ID:</b> ${userId}<ul>`;
    warns[userId].forEach(w =>
      html += `<li>${w.reason} — ${w.date}</li>`
    );
    html += '</ul></li>';
  }

  html += '</ul><a href="/">Back</a>';
  res.send(html);
});

app.listen(3000, () => {
  console.log('Website running at http://localhost:3000');
});
