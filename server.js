const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const db = new Database("mobsters.db");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  money INTEGER DEFAULT 5000,
  points INTEGER DEFAULT 0,
  bullets INTEGER DEFAULT 0,
  health INTEGER DEFAULT 100,
  rank TEXT DEFAULT 'Newbie'
);
`);

const page = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - InfamousMobsters</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#101820;color:#d7e0e8;font:14px Arial}
header{background:#172b3b;padding:15px;border-bottom:2px solid #34516a}
header h1{margin:0;color:#d9b56d;font-size:23px}
header p{margin:5px 0 0;color:#9aabb9}
a{color:#d9b56d;text-decoration:none}
a:hover{text-decoration:underline}
.layout{display:grid;grid-template-columns:180px minmax(0,1fr) 190px;gap:10px;padding:10px;max-width:1250px;margin:auto}
.panel{background:#192733;border:1px solid #344959;margin-bottom:10px}
.panel h3{margin:0;padding:9px;background:#263b4b;color:#e0bd79;font-size:14px}
.panel-content{padding:10px}
nav a{display:block;padding:8px;border-bottom:1px solid #2a3b48}
main{min-width:0}
input,button{padding:10px;margin:5px 0;background:#0e1922;border:1px solid #526879;color:#fff;width:100%}
button{background:#806238;border:0;cursor:pointer;font-weight:bold}
.stat{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a3b48}
.notice{padding:10px;background:#263b4b;margin:8px 0}
@media(max-width:700px){.layout{grid-template-columns:1fr}.layout aside:first-child{order:1}main{order:0}.layout aside:last-child{order:2}}
</style>
</head>
<body>
<header><h1>INFAMOUSMOBSTERS</h1><p>Build your name. Rule the streets.</p></header>
${body}
</body></html>`;

function requireLogin(req,res,next){
  if(!req.session.player) return res.redirect("/login");
  next();
}

app.get("/",(req,res)=>{
  if(!req.session.player) return res.redirect("/login");
  res.redirect("/game");
});

app.get("/register",(req,res)=>res.send(page("Register",`
<div class="layout"><main><section class="panel">
<h3>Create your account</h3><div class="panel-content">
<form method="post">
<input name="username" placeholder="Choose a username" required minlength="3" maxlength="20">
<input name="password" type="password" placeholder="Choose a password" required minlength="8">
<button>Create account</button></form>
<p>Already registered? <a href="/login">Log in</a></p>
</div></section></main></div>`)));

app.post("/register",async(req,res)=>{
  const username=String(req.body.username||"").trim();
  const password=String(req.body.password||"");
  if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)||password.length<8)
    return res.status(400).send("Use a 3–20 character username (letters, numbers or _) and a password of at least 8 characters. <a href='/register'>Try again</a>");
  try{
    const hash=await bcrypt.hash(password,10);
    const result=db.prepare("INSERT INTO players(username,password) VALUES(?,?)").run(username,hash);
    req.session.player=result.lastInsertRowid;
    res.redirect("/game");
  }catch(e){res.status(400).send("That username may already be taken. <a href='/register'>Try again</a>");}
});

app.get("/login",(req,res)=>res.send(page("Login",`
<div class="layout"><main><section class="panel">
<h3>Player Login</h3><div class="panel-content">
<form method="post">
<input name="username" placeholder="Username" required>
<input name="password" type="password" placeholder="Password" required>
<button>Log in</button></form>
<p>New here? <a href="/register">Create an account</a></p>
</div></section></main></div>`)));

app.post("/login",async(req,res)=>{
  const player=db.prepare("SELECT * FROM players WHERE username=?").get(String(req.body.username||"").trim());
  if(!player||!await bcrypt.compare(String(req.body.password||""),player.password))
    return res.status(401).send("Incorrect username or password. <a href='/login'>Try again</a>");
  req.session.player=player.id;
  res.redirect("/game");
});

app.get("/game",requireLogin,(req,res)=>{
  const p=db.prepare("SELECT * FROM players WHERE id=?").get(req.session.player);
  const links=["Game News","Profile","My Stats","My Perks","My Items","Notifications","Points","Buy Points","Crimes","GTA","Jail","Organised Crime","Missions","Bank","Bullets","Lottery","Hospital","Airport","Heist","Attempts","Kill"];
  const nav=links.map(x=>`<a href="/game?section=${encodeURIComponent(x)}">${x}</a>`).join("");
  const section=String(req.query.section||"Game News");
  const content=section==="Crimes"?`
<h3>Crimes</h3><div class="panel-content"><p>Choose a crime:</p><div class="notice">Street Robbery</div><div class="notice">Shop Robbery</div><div class="notice">Warehouse Robbery</div><p>Crime actions will be added next.</p></div>`:
  section==="GTA"?`<h3>GTA</h3><div class="panel-content"><div class="notice">Steal a Car</div><div class="notice">Steal</div><p>Car theft actions will be added next.</p></div>`:
  `<h3>${section.replace(/[&<>"]/g,"")}</h3><div class="panel-content"><p>Welcome to InfamousMobsters, ${p.username}.</p><p>Your criminal empire starts here.</p></div>`;
  res.send(page("Game",`
<div class="layout">
<aside><section class="panel"><h3>Navigation</h3><nav>${nav}</nav></section></aside>
<main><section class="panel">${content}</section><p><a href="/logout">Log out</a></p></main>
<aside>
<section class="panel"><h3>Player Stats</h3><div class="panel-content">
<div class="stat"><span>Money</span><b>£${p.money.toLocaleString("en-GB")}</b></div>
<div class="stat"><span>Points</span><b>${p.points}</b></div>
<div class="stat"><span>Bullets</span><b>${p.bullets}</b></div>
<div class="stat"><span>Gun</span><b>None</b></div>
<div class="stat"><span>Armour</span><b>None</b></div>
<div class="stat"><span>Location</span><b>Coventry</b></div>
<div class="stat"><span>Health</span><b>${p.health}%</b></div>
<div class="stat"><span>Gang</span><b>None</b></div>
<div class="stat"><span>Rank</span><b>${p.rank}</b></div>
</div></section></aside></div>`));
});

app.get("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/login")));

const port=process.env.PORT||3000;
app.listen(port,"0.0.0.0",()=>console.log("InfamousMobsters running on "+port));
